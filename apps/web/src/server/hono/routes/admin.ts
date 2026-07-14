import { Hono } from "hono";
import { services } from "@guild/core";
import {
  couponSchema,
  paymentSchema,
  planSchema,
  planUpdateSchema,
  subscriptionCreateSchema,
  subscriptionActionSchema,
  guildModerationSchema,
  transferOwnershipSchema,
  userModerationSchema,
} from "@guild/shared";
import type { AppEnv } from "../env";
import { ok } from "../respond";
import { zBody } from "../validation";
import { requirePlatformAdmin } from "../middleware/auth";

/**
 * Platform admin domain — Hono port of apps/web/src/app/api/admin/**. Reads are
 * gated to SUPPORT (default `requirePlatformAdmin()`), mutations to ADMIN
 * (`requirePlatformAdmin("ADMIN")`). Authorization is platform-wide, not
 * per-guild.
 */
export const admin = new Hono<AppEnv>()
  // ─── Billing: coupons ────────────────────────────────────────
  .get("/billing/coupons", requirePlatformAdmin(), async (c) => {
    return ok(c, { coupons: await services.billing.listCoupons() });
  })
  .post("/billing/coupons", requirePlatformAdmin("ADMIN"), zBody(couponSchema), async (c) => {
    return ok(c, { coupon: await services.billing.createCoupon(c.get("user").userId, c.req.valid("json")) });
  })
  .delete("/billing/coupons/:id", requirePlatformAdmin("ADMIN"), async (c) => {
    return ok(c, await services.billing.deactivateCoupon(c.get("user").userId, c.req.param("id")));
  })

  // ─── Billing: overview ───────────────────────────────────────
  .get("/billing/overview", requirePlatformAdmin(), async (c) => {
    return ok(c, await services.billing.getBillingOverview());
  })

  // ─── Billing: payments ───────────────────────────────────────
  .get("/billing/payments", requirePlatformAdmin(), async (c) => {
    return ok(c, await services.billing.listPayments({
      status: c.req.query("status") || undefined,
      guildId: c.req.query("guildId") || undefined,
      page: c.req.query("page") ? parseInt(c.req.query("page")!, 10) : undefined,
    }));
  })
  .post("/billing/payments", requirePlatformAdmin("ADMIN"), zBody(paymentSchema), async (c) => {
    return ok(c, { payment: await services.billing.recordManualPayment(c.get("user").userId, c.req.valid("json")) });
  })
  .post("/billing/payments/:id/refund", requirePlatformAdmin("ADMIN"), async (c) => {
    return ok(c, { payment: await services.billing.refundPayment(c.get("user").userId, c.req.param("id")) });
  })

  // ─── Billing: plans ──────────────────────────────────────────
  .get("/billing/plans", requirePlatformAdmin(), async (c) => {
    return ok(c, { plans: await services.billing.listPlans() });
  })
  .post("/billing/plans", requirePlatformAdmin("ADMIN"), zBody(planSchema), async (c) => {
    return ok(c, { plan: await services.billing.createPlan(c.get("user").userId, c.req.valid("json")) });
  })
  .patch("/billing/plans/:id", requirePlatformAdmin("ADMIN"), zBody(planUpdateSchema), async (c) => {
    return ok(c, { plan: await services.billing.updatePlan(c.get("user").userId, c.req.param("id"), c.req.valid("json")) });
  })
  .delete("/billing/plans/:id", requirePlatformAdmin("ADMIN"), async (c) => {
    return ok(c, await services.billing.deactivatePlan(c.get("user").userId, c.req.param("id")));
  })

  // ─── Billing: subscriptions ──────────────────────────────────
  .get("/billing/subscriptions", requirePlatformAdmin(), async (c) => {
    return ok(c, await services.billing.listSubscriptions({
      status: c.req.query("status") || undefined,
      guildId: c.req.query("guildId") || undefined,
      page: c.req.query("page") ? parseInt(c.req.query("page")!, 10) : undefined,
    }));
  })
  .post("/billing/subscriptions", requirePlatformAdmin("ADMIN"), zBody(subscriptionCreateSchema), async (c) => {
    return ok(c, { subscription: await services.billing.createSubscription(c.get("user").userId, c.req.valid("json")) });
  })
  .post("/billing/subscriptions/:id/action", requirePlatformAdmin("ADMIN"), zBody(subscriptionActionSchema), async (c) => {
    return ok(c, { subscription: await services.billing.changeSubscriptionStatus(c.get("user").userId, c.req.param("id"), c.req.valid("json").action) });
  })

  // ─── Guilds ──────────────────────────────────────────────────
  .get("/guilds", requirePlatformAdmin(), async (c) => {
    return ok(c, await services.adminGuilds.listGuilds({
      search: c.req.query("search") || undefined,
      status: (c.req.query("status") as never) || undefined,
      page: c.req.query("page") ? parseInt(c.req.query("page")!, 10) : undefined,
    }));
  })
  .get("/guilds/:id", requirePlatformAdmin(), async (c) => {
    return ok(c, await services.adminGuilds.getGuildDetail(c.req.param("id")));
  })
  .post("/guilds/:id/moderate", requirePlatformAdmin("ADMIN"), zBody(guildModerationSchema), async (c) => {
    const data = c.req.valid("json");
    return ok(c, await services.adminGuilds.moderateGuild(c.get("user").userId, c.req.param("id"), data.action, data.reason));
  })
  .post("/guilds/:id/transfer-ownership", requirePlatformAdmin("ADMIN"), zBody(transferOwnershipSchema), async (c) => {
    return ok(c, await services.adminGuilds.transferGuildOwnership(c.get("user").userId, c.req.param("id"), c.req.valid("json").newMemberId));
  })

  // ─── Admin self ──────────────────────────────────────────────
  .get("/me", requirePlatformAdmin(), async (c) => {
    return ok(c, { platformAdmin: services.platform.toPlatformAdminPublic(c.get("admin")) });
  })

  // ─── Overview ────────────────────────────────────────────────
  .get("/overview", requirePlatformAdmin(), async (c) => {
    return ok(c, await services.platform.getPlatformOverview());
  })

  // ─── Users ───────────────────────────────────────────────────
  .get("/users", requirePlatformAdmin(), async (c) => {
    return ok(c, await services.adminUsers.listUsers({
      search: c.req.query("search") || undefined,
      status: (c.req.query("status") as never) || undefined,
      page: c.req.query("page") ? parseInt(c.req.query("page")!, 10) : undefined,
    }));
  })
  .get("/users/:id", requirePlatformAdmin(), async (c) => {
    return ok(c, await services.adminUsers.getUserDetail(c.req.param("id")));
  })
  .post("/users/:id/force-logout", requirePlatformAdmin("ADMIN"), async (c) => {
    return ok(c, await services.adminUsers.forceLogoutUser(c.get("user").userId, c.req.param("id")));
  })
  .post("/users/:id/moderate", requirePlatformAdmin("ADMIN"), zBody(userModerationSchema), async (c) => {
    const data = c.req.valid("json");
    return ok(c, await services.adminUsers.moderateUser(c.get("user").userId, c.req.param("id"), data.action, { days: data.days, reason: data.reason }));
  })
  .post("/users/:id/reset-password", requirePlatformAdmin("ADMIN"), async (c) => {
    return ok(c, await services.adminUsers.resetUserPassword(c.get("user").userId, c.req.param("id")));
  });
