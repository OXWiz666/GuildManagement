import { Hono } from "hono";
import { services, cache, BadRequestError } from "@guild/core";
import {
  createInventoryItemSchema,
  updateInventoryItemSchema,
  recordAdditionSchema,
  adjustQuantitySchema,
  submitInventoryRequestSchema,
  reviewInventoryRequestSchema,
} from "@guild/shared";
import type { AppEnv } from "../env";
import { ok } from "../respond";
import { getClientInfo } from "../request";
import { zBody } from "../validation";
import { requireAuth } from "../middleware/auth";

/**
 * Faction Inventory domain (Factionwide System Phase 2) — mounted at
 * /faction/inventory. Same pattern as faction.ts: every route just
 * authenticates with `requireAuth`; the service layer
 * (requireFactionInventoryManager / requireGuildLeadershipOf) does the real
 * per-faction/per-guild authorization.
 */
export const factionInventory = new Hono<AppEnv>()
  // ─── Items ───────────────────────────────────────────────────
  .get("/items", requireAuth, async (c) => {
    const userId = c.get("user").userId;
    const cacheKey = `faction-inventory-items:${userId}`;
    const cached = await cache.get<unknown>(cacheKey);
    if (cached) return ok(c, { items: cached });
    const items = await services.factionInventory.listInventoryItems(userId);
    await cache.set(cacheKey, items, 20);
    return ok(c, { items });
  })
  .post("/items", requireAuth, zBody(createInventoryItemSchema), async (c) => {
    const { ipAddress, userAgent } = getClientInfo(c);
    const item = await services.factionInventory.createInventoryItem(c.get("user").userId, c.req.valid("json"), ipAddress, userAgent);
    await cache.invalidatePattern("faction-inventory-items:*");
    return ok(c, { item }, 201);
  })
  .patch("/items/:itemId", requireAuth, zBody(updateInventoryItemSchema), async (c) => {
    const { ipAddress, userAgent } = getClientInfo(c);
    const item = await services.factionInventory.updateInventoryItem(
      c.get("user").userId,
      c.req.param("itemId"),
      c.req.valid("json"),
      ipAddress,
      userAgent,
    );
    await cache.invalidatePattern("faction-inventory-items:*");
    return ok(c, { item });
  })

  // ─── Quantity-moving actions ────────────────────────────────────
  .post("/items/:itemId/addition", requireAuth, zBody(recordAdditionSchema), async (c) => {
    const { quantity, reason } = c.req.valid("json");
    const { ipAddress, userAgent } = getClientInfo(c);
    const result = await services.factionInventory.recordManualAddition(
      c.get("user").userId,
      c.req.param("itemId"),
      quantity,
      reason,
      ipAddress,
      userAgent,
    );
    await cache.invalidatePattern("faction-inventory-items:*");
    await cache.invalidatePattern("faction-inventory-transactions:*");
    return ok(c, result);
  })
  .post("/items/:itemId/contribution", requireAuth, zBody(recordAdditionSchema), async (c) => {
    const { quantity, reason, sourceGuildId } = c.req.valid("json");
    if (!sourceGuildId) {
      throw new BadRequestError("sourceGuildId is required for a guild contribution");
    }
    const { ipAddress, userAgent } = getClientInfo(c);
    const result = await services.factionInventory.recordGuildContribution(
      c.get("user").userId,
      c.req.param("itemId"),
      quantity,
      sourceGuildId,
      reason,
      ipAddress,
      userAgent,
    );
    await cache.invalidatePattern("faction-inventory-items:*");
    await cache.invalidatePattern("faction-inventory-transactions:*");
    return ok(c, result);
  })
  .post("/items/:itemId/adjust", requireAuth, zBody(adjustQuantitySchema), async (c) => {
    const { delta, reason } = c.req.valid("json");
    const { ipAddress, userAgent } = getClientInfo(c);
    const result = await services.factionInventory.adjustQuantity(
      c.get("user").userId,
      c.req.param("itemId"),
      delta,
      reason,
      ipAddress,
      userAgent,
    );
    await cache.invalidatePattern("faction-inventory-items:*");
    await cache.invalidatePattern("faction-inventory-transactions:*");
    return ok(c, result);
  })

  // ─── Transactions (ledger) ──────────────────────────────────────
  .get("/transactions", requireAuth, async (c) => {
    const userId = c.get("user").userId;
    const filters = {
      itemId: c.req.query("itemId") || undefined,
      transactionType: c.req.query("transactionType") || undefined,
      from: c.req.query("from") || undefined,
      to: c.req.query("to") || undefined,
      page: c.req.query("page") ? Number(c.req.query("page")) : undefined,
      pageSize: c.req.query("pageSize") ? Number(c.req.query("pageSize")) : undefined,
    };
    const cacheKey = `faction-inventory-transactions:${userId}:${JSON.stringify(filters)}`;
    const cached = await cache.get<unknown>(cacheKey);
    if (cached) return ok(c, cached);
    const result = await services.factionInventory.listInventoryTransactions(userId, filters);
    await cache.set(cacheKey, result, 15);
    return ok(c, result);
  })

  // ─── Requests (guild asking the faction pool for items) ─────────
  .get("/requests", requireAuth, async (c) => {
    const userId = c.get("user").userId;
    const mine = c.req.query("mine") === "true";
    const guildId = c.req.query("guildId") || undefined;
    const cacheKey = `faction-inventory-requests:${userId}:${mine}:${guildId ?? ""}`;
    const cached = await cache.get<unknown>(cacheKey);
    if (cached) return ok(c, { requests: cached });
    const requests = await services.factionInventory.listInventoryRequests(userId, { mine, guildId });
    await cache.set(cacheKey, requests, 15);
    return ok(c, { requests });
  })
  .post("/requests", requireAuth, zBody(submitInventoryRequestSchema), async (c) => {
    const { guildId, ...payload } = c.req.valid("json");
    const { ipAddress, userAgent } = getClientInfo(c);
    const request = await services.factionInventory.submitInventoryRequest(c.get("user").userId, guildId, payload, ipAddress, userAgent);
    await cache.invalidatePattern("faction-inventory-requests:*");
    return ok(c, { request }, 201);
  })
  .post("/requests/:id/review", requireAuth, zBody(reviewInventoryRequestSchema), async (c) => {
    const { action, approvalNotes } = c.req.valid("json");
    const { ipAddress, userAgent } = getClientInfo(c);
    const request = await services.factionInventory.reviewInventoryRequest(
      c.get("user").userId,
      c.req.param("id"),
      action,
      approvalNotes,
      ipAddress,
      userAgent,
    );
    await cache.invalidatePattern("faction-inventory-items:*");
    await cache.invalidatePattern("faction-inventory-requests:*");
    return ok(c, { request });
  })
  .post("/requests/:id/distribute", requireAuth, async (c) => {
    const { ipAddress, userAgent } = getClientInfo(c);
    const request = await services.factionInventory.distributeInventoryRequest(c.get("user").userId, c.req.param("id"), ipAddress, userAgent);
    await cache.invalidatePattern("faction-inventory-items:*");
    await cache.invalidatePattern("faction-inventory-requests:*");
    await cache.invalidatePattern("faction-inventory-transactions:*");
    return ok(c, { request });
  })
  .post("/requests/:id/cancel", requireAuth, async (c) => {
    const { ipAddress, userAgent } = getClientInfo(c);
    const request = await services.factionInventory.cancelInventoryRequest(c.get("user").userId, c.req.param("id"), ipAddress, userAgent);
    await cache.invalidatePattern("faction-inventory-requests:*");
    return ok(c, { request });
  });
