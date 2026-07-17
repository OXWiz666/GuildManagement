import { Hono } from "hono";
import { services, cache, broadcastToGuild } from "@guild/core";
import {
  createItemRequestSchema,
  reviewRequestSchema,
  legendaryPrioritySchema,
  reviewLegendarySchema,
  legendarySequenceSchema,
  prioritySequenceSchema,
  createDistributionSchema,
  wishlistSchema,
  marketRulesSchema,
  notifyRequestSchema,
  mountCatalogSchema,
  distributeMountSchema,
  registerStorageInMarketSchema,
  markStorageSoldSchema,
  distributeStorageSchema,
  createAuctionSchema,
  placeBidSchema,
} from "@guild/shared";
import type { AppEnv } from "../env";
import { ok } from "../respond";
import { getClientInfo } from "../request";
import { zBody } from "../validation";
import { requireGuildRole } from "../middleware/auth";

/**
 * Guild Market domain — Hono port of apps/web/src/app/api/market/**. Each route
 * applies `requireGuildRole(role)` (which reads `:guildId`), validates the body
 * with `zBody`, delegates to `@guild/core` services, and returns the standard
 * `ok(...)` envelope. Business logic and validation schemas are unchanged.
 */
export const market = new Hono<AppEnv>()
  // ─── Item requests ───────────────────────────────────────────
  .post("/:guildId/requests", requireGuildRole("MEMBER"), zBody(createItemRequestSchema), async (c) => {
    const guildId = c.req.param("guildId");
    const user = c.get("user");
    const request = await services.requests.createItemRequest(guildId, user.userId, c.req.valid("json"));
    return ok(c, { request }, 201);
  })
  .get("/:guildId/requests", requireGuildRole("OFFICER"), async (c) => {
    const guildId = c.req.param("guildId");
    const user = c.get("user");
    const result = await services.requests.getGuildRequests(guildId, user.userId, {
      status: c.req.query("status") ?? undefined,
      type: c.req.query("type") ?? undefined,
      page: c.req.query("page") ? Number(c.req.query("page")) : undefined,
      limit: c.req.query("limit") ? Number(c.req.query("limit")) : undefined,
    });
    return ok(c, result);
  })
  .get("/:guildId/requests/mine", requireGuildRole("MEMBER"), async (c) => {
    const guildId = c.req.param("guildId");
    const user = c.get("user");
    const page = c.req.query("page") ? Number(c.req.query("page")) : 1;
    return ok(c, await services.requests.getMyRequests(guildId, user.userId, page));
  })
  .patch("/:guildId/requests/:id/review", requireGuildRole("OFFICER"), zBody(reviewRequestSchema), async (c) => {
    const guildId = c.req.param("guildId");
    const id = c.req.param("id");
    const user = c.get("user");
    const data = c.req.valid("json");
    const { ipAddress, userAgent } = getClientInfo(c);
    const result = await services.requests.reviewRequest(
      guildId, id, user.userId, data.action, data.reviewNote, ipAddress, userAgent,
    );
    return ok(c, result);
  })

  // ─── Legendary requests ──────────────────────────────────────
  .get("/:guildId/legendary", requireGuildRole("MEMBER"), async (c) => {
    const guildId = c.req.param("guildId");
    const user = c.get("user");
    const result = await services.market.getLegendaryRequests(guildId, user.userId, {
      status: c.req.query("status") ?? undefined,
      category: c.req.query("category") ?? undefined,
    });
    return ok(c, result);
  })
  .post("/:guildId/legendary", requireGuildRole("MEMBER"), zBody(legendaryPrioritySchema), async (c) => {
    const guildId = c.req.param("guildId");
    const user = c.get("user");
    const request = await services.market.createLegendaryRequest(guildId, user.userId, c.req.valid("json"));
    return ok(c, { request }, 201);
  })
  .patch("/:guildId/legendary/:id/review", requireGuildRole("OFFICER"), zBody(reviewLegendarySchema), async (c) => {
    const guildId = c.req.param("guildId");
    const id = c.req.param("id");
    const user = c.get("user");
    const data = c.req.valid("json");
    const request = await services.market.reviewLegendaryRequest(guildId, id, user.userId, data.action, data.officerNote);
    return ok(c, { request });
  })
  .patch("/:guildId/legendary/:id/sequence", requireGuildRole("OFFICER"), zBody(legendarySequenceSchema), async (c) => {
    const guildId = c.req.param("guildId");
    const id = c.req.param("id");
    const user = c.get("user");
    const request = await services.market.setLegendarySequence(guildId, id, user.userId, c.req.valid("json").prioritySeq);
    return ok(c, { request });
  })

  // ─── Priority queue ──────────────────────────────────────────
  .get("/:guildId/priority", requireGuildRole("MEMBER"), async (c) => {
    const guildId = c.req.param("guildId");
    const user = c.get("user");
    const queue = await services.market.getPriorityQueue(guildId, user.userId);
    return ok(c, { queue });
  })
  .patch("/:guildId/priority/:memberId", requireGuildRole("OFFICER"), zBody(prioritySequenceSchema), async (c) => {
    const guildId = c.req.param("guildId");
    const memberId = c.req.param("memberId");
    const user = c.get("user");
    const data = c.req.valid("json");
    const member = await services.market.overridePrioritySeq(guildId, memberId, user.userId, data.prioritySeq, data.reason);
    return ok(c, { member });
  })

  // ─── Distributions ───────────────────────────────────────────
  .post("/:guildId/distributions", requireGuildRole("OFFICER"), zBody(createDistributionSchema), async (c) => {
    const guildId = c.req.param("guildId");
    const user = c.get("user");
    const distribution = await services.market.createDistribution(guildId, user.userId, c.req.valid("json"));
    return ok(c, { distribution }, 201);
  })
  .get("/:guildId/distributions", requireGuildRole("MEMBER"), async (c) => {
    const guildId = c.req.param("guildId");
    const user = c.get("user");
    const result = await services.market.getDistributions(guildId, user.userId, {
      mineOnly: c.req.query("mine") === "true",
      memberId: c.req.query("memberId") ?? undefined,
      tier: c.req.query("tier") ?? undefined,
      from: c.req.query("from") ?? undefined,
      to: c.req.query("to") ?? undefined,
      page: c.req.query("page") ? Number(c.req.query("page")) : undefined,
      limit: c.req.query("limit") ? Number(c.req.query("limit")) : undefined,
    });
    return ok(c, result);
  })

  // ─── Wishlist ────────────────────────────────────────────────
  .get("/:guildId/wishlist/mine", requireGuildRole("MEMBER"), async (c) => {
    const guildId = c.req.param("guildId");
    const user = c.get("user");
    return ok(c, await services.market.getMyWishlist(guildId, user.userId));
  })
  .put("/:guildId/wishlist", requireGuildRole("MEMBER"), zBody(wishlistSchema), async (c) => {
    const guildId = c.req.param("guildId");
    const user = c.get("user");
    return ok(c, await services.market.setWishlist(guildId, user.userId, c.req.valid("json").items));
  })
  .get("/:guildId/wishlist/master", requireGuildRole("OFFICER"), async (c) => {
    const guildId = c.req.param("guildId");
    const user = c.get("user");
    const status = c.req.query("status");
    const category = c.req.query("category");
    const rows = await services.market.getWishlistMasterList(guildId, user.userId, {
      status: status === "PENDING" || status === "DISTRIBUTED" ? status : undefined,
      category: category ?? undefined,
      memberId: c.req.query("memberId") ?? undefined,
      search: c.req.query("search") ?? undefined,
    });
    return ok(c, { rows });
  })

  // ─── Rules ───────────────────────────────────────────────────
  .get("/:guildId/rules", requireGuildRole("MEMBER"), async (c) => {
    const guildId = c.req.param("guildId");
    const user = c.get("user");
    const cacheKey = `market-rules:${guildId}`;
    const cached = await cache.get<unknown>(cacheKey);
    if (cached) return ok(c, { rules: cached });
    const rules = await services.market.getMarketRules(guildId, user.userId);
    await cache.set(cacheKey, rules, 120);
    return ok(c, { rules });
  })
  .patch("/:guildId/rules", requireGuildRole("GUILD_LEADER"), zBody(marketRulesSchema), async (c) => {
    const guildId = c.req.param("guildId");
    const user = c.get("user");
    const rules = await services.market.updateMarketRules(guildId, user.userId, c.req.valid("json") as never);
    await cache.delete(`market-rules:${guildId}`);
    return ok(c, { rules });
  })

  // ─── Audit ───────────────────────────────────────────────────
  .get("/:guildId/audit", requireGuildRole("OFFICER"), async (c) => {
    const guildId = c.req.param("guildId");
    const user = c.get("user");
    const result = await services.market.getMarketAuditLogs(guildId, user.userId, {
      action: c.req.query("action") ?? undefined,
      page: c.req.query("page") ? Number(c.req.query("page")) : undefined,
      limit: c.req.query("limit") ? Number(c.req.query("limit")) : undefined,
    });
    return ok(c, result);
  })

  // ─── Notify to request ───────────────────────────────────────
  .post("/:guildId/notify-request", requireGuildRole("OFFICER"), zBody(notifyRequestSchema), async (c) => {
    const guildId = c.req.param("guildId");
    const user = c.get("user");
    return ok(c, await services.market.notifyMembersToRequest(guildId, user.userId, c.req.valid("json")));
  })

  // ─── Mounts catalog ──────────────────────────────────────────
  // Short TTL: distributing a mount changes slots-remaining shown in the list.
  .get("/:guildId/mounts", requireGuildRole("MEMBER"), async (c) => {
    const guildId = c.req.param("guildId");
    const user = c.get("user");
    const cacheKey = `market-mounts:${guildId}`;
    const cached = await cache.get<unknown>(cacheKey);
    if (cached) return ok(c, { mounts: cached });
    const mounts = await services.mounts.listMounts(guildId, user.userId);
    await cache.set(cacheKey, mounts, 20);
    return ok(c, { mounts });
  })
  .post("/:guildId/mounts", requireGuildRole("GUILD_LEADER"), zBody(mountCatalogSchema), async (c) => {
    const guildId = c.req.param("guildId");
    const user = c.get("user");
    const mount = await services.mounts.upsertMount(guildId, user.userId, c.req.valid("json"));
    await cache.delete(`market-mounts:${guildId}`);
    return ok(c, { mount }, 201);
  })
  .patch("/:guildId/mounts/:mountId", requireGuildRole("GUILD_LEADER"), zBody(mountCatalogSchema), async (c) => {
    const guildId = c.req.param("guildId");
    const mountId = c.req.param("mountId");
    const user = c.get("user");
    const mount = await services.mounts.upsertMount(guildId, user.userId, { ...c.req.valid("json"), id: mountId });
    await cache.delete(`market-mounts:${guildId}`);
    return ok(c, { mount });
  })
  .delete("/:guildId/mounts/:mountId", requireGuildRole("GUILD_LEADER"), async (c) => {
    const guildId = c.req.param("guildId");
    const mountId = c.req.param("mountId");
    const user = c.get("user");
    const result = await services.mounts.deleteMount(guildId, user.userId, mountId);
    await cache.delete(`market-mounts:${guildId}`);
    return ok(c, result);
  })
  .post("/:guildId/mounts/:mountId/distribute", requireGuildRole("OFFICER"), zBody(distributeMountSchema), async (c) => {
    const guildId = c.req.param("guildId");
    const mountId = c.req.param("mountId");
    const user = c.get("user");
    const record = await services.mounts.distributeMount(guildId, user.userId, { ...c.req.valid("json"), mountId });
    await cache.delete(`market-mounts:${guildId}`);
    return ok(c, { record }, 201);
  })

  // ─── Storage / vault ─────────────────────────────────────────
  .get("/:guildId/storage", requireGuildRole("MEMBER"), async (c) => {
    const guildId = c.req.param("guildId");
    const user = c.get("user");
    return ok(c, await services.storage.getStorage(guildId, user.userId));
  })
  .delete("/:guildId/storage/:id", requireGuildRole("OFFICER"), async (c) => {
    const guildId = c.req.param("guildId");
    const id = c.req.param("id");
    const user = c.get("user");
    return ok(c, await services.storage.removeStorageItem(guildId, id, user.userId));
  })
  .post("/:guildId/storage/:id/register", requireGuildRole("OFFICER"), zBody(registerStorageInMarketSchema), async (c) => {
    const guildId = c.req.param("guildId");
    const id = c.req.param("id");
    const user = c.get("user");
    const item = await services.storage.registerInMarket(guildId, id, user.userId, c.req.valid("json").price);
    return ok(c, { item });
  })
  .post("/:guildId/storage/:id/recall", requireGuildRole("OFFICER"), async (c) => {
    const guildId = c.req.param("guildId");
    const id = c.req.param("id");
    const user = c.get("user");
    const item = await services.storage.recallToStorage(guildId, id, user.userId);
    return ok(c, { item });
  })
  .post("/:guildId/storage/:id/sold", requireGuildRole("OFFICER"), zBody(markStorageSoldSchema), async (c) => {
    const guildId = c.req.param("guildId");
    const id = c.req.param("id");
    const user = c.get("user");
    const item = await services.storage.markStorageItemSold(guildId, id, user.userId, c.req.valid("json"));
    // markStorageItemSold also writes a LootSale row — bust the same caches
    // and fire the same event the direct "Record Sale" endpoints do, so the
    // Loot Sales registry picks it up immediately instead of waiting out the
    // 120s server cache.
    await Promise.all([
      cache.invalidatePattern(`loot:${guildId}:*`),
      cache.invalidatePattern(`accounting:${guildId}:*`),
      cache.invalidatePattern(`stats:${guildId}:*`),
    ]);
    broadcastToGuild(guildId, "loot_sale_recorded", { guildId, itemId: id });
    return ok(c, { item });
  })
  .post("/:guildId/storage/:id/distribute", requireGuildRole("OFFICER"), zBody(distributeStorageSchema), async (c) => {
    const guildId = c.req.param("guildId");
    const id = c.req.param("id");
    const user = c.get("user");
    return ok(c, await services.storage.distributeStorageItem(guildId, id, user.userId, c.req.valid("json")));
  })

  // ─── Auctions ────────────────────────────────────────────────
  .get("/:guildId/auctions", requireGuildRole("MEMBER"), async (c) => {
    const guildId = c.req.param("guildId");
    const membership = c.get("membership");
    const auctions = await services.auction.getActiveAuctions(guildId, membership.id);
    const canManage = ["GUILD_LEADER", "FACTION_LEADER", "ADMIN"].includes(membership.role);
    return ok(c, { auctions, canManage, myBidPoints: membership.bidPoints });
  })
  .post("/:guildId/auctions", requireGuildRole("GUILD_LEADER"), zBody(createAuctionSchema), async (c) => {
    const guildId = c.req.param("guildId");
    const user = c.get("user");
    const auction = await services.auction.createAuction(guildId, user.userId, c.req.valid("json"));
    return ok(c, { auction }, 201);
  })
  .get("/:guildId/auctions/history", requireGuildRole("MEMBER"), async (c) => {
    const guildId = c.req.param("guildId");
    const page = Number(c.req.query("page") ?? "1") || 1;
    return ok(c, await services.auction.getAuctionHistory(guildId, page));
  })
  .post("/:guildId/auctions/:id/bid", requireGuildRole("MEMBER"), zBody(placeBidSchema), async (c) => {
    const guildId = c.req.param("guildId");
    const id = c.req.param("id");
    const user = c.get("user");
    return ok(c, await services.auction.placeBid(guildId, id, user.userId, c.req.valid("json").bidAmount));
  })
  .post("/:guildId/auctions/:id/end", requireGuildRole("GUILD_LEADER"), async (c) => {
    const guildId = c.req.param("guildId");
    const id = c.req.param("id");
    const user = c.get("user");
    return ok(c, await services.auction.endAuction(guildId, id, user.userId));
  })
  .post("/:guildId/auctions/:id/cancel", requireGuildRole("GUILD_LEADER"), async (c) => {
    const guildId = c.req.param("guildId");
    const id = c.req.param("id");
    const user = c.get("user");
    return ok(c, await services.auction.cancelAuction(guildId, id, user.userId));
  });
