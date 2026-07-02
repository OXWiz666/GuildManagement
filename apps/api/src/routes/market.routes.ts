import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import {
  createItemRequestSchema,
  reviewRequestSchema,
  legendaryPrioritySchema,
  reviewLegendarySchema,
  legendarySequenceSchema,
  prioritySequenceSchema,
  createDistributionSchema,
  marketRulesSchema,
  wishlistSchema,
} from "@guild/shared";
import type { ApiResponse } from "@guild/shared";
import { requireAuth } from "../middleware/auth";
import { requireGuildRole } from "../middleware/rbac";
import * as requests from "../services/requests.service";
import * as market from "../services/market.service";

const router: Router = Router();

function getClientInfo(req: Request) {
  return {
    ipAddress:
      (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
      req.ip ||
      req.socket.remoteAddress,
    userAgent: req.headers["user-agent"],
  };
}

const ok = (res: Response, data: unknown, status = 200) =>
  res.status(status).json({ success: true, data } satisfies ApiResponse);

// ═══════════════════════════════════════════════════
// REQUEST ITEM (reuses requests.service)
// ═══════════════════════════════════════════════════

// Create item request — any member
router.post(
  "/:guildId/requests",
  requireAuth,
  requireGuildRole("MEMBER"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params["guildId"] as string;
      const data = createItemRequestSchema.parse(req.body);
      const request = await requests.createItemRequest(guildId, req.user!.userId, data);
      ok(res, { request }, 201);
    } catch (error) {
      next(error);
    }
  },
);

// All requests (officer view) with filters
router.get(
  "/:guildId/requests",
  requireAuth,
  requireGuildRole("OFFICER"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params["guildId"] as string;
      const result = await requests.getGuildRequests(guildId, req.user!.userId, {
        status: req.query["status"] as string | undefined,
        type: req.query["type"] as string | undefined,
        page: req.query["page"] ? Number(req.query["page"]) : undefined,
        limit: req.query["limit"] ? Number(req.query["limit"]) : undefined,
      });
      ok(res, result);
    } catch (error) {
      next(error);
    }
  },
);

// My requests + quota (member self-view)
router.get(
  "/:guildId/requests/mine",
  requireAuth,
  requireGuildRole("MEMBER"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params["guildId"] as string;
      const page = req.query["page"] ? Number(req.query["page"]) : 1;
      const result = await requests.getMyRequests(guildId, req.user!.userId, page);
      ok(res, result);
    } catch (error) {
      next(error);
    }
  },
);

// Review (approve/decline/fulfill) — officer
router.patch(
  "/:guildId/requests/:id/review",
  requireAuth,
  requireGuildRole("OFFICER"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params["guildId"] as string;
      const id = req.params["id"] as string;
      const data = reviewRequestSchema.parse(req.body);
      const { ipAddress, userAgent } = getClientInfo(req);
      const result = await requests.reviewRequest(
        guildId,
        id,
        req.user!.userId,
        data.action,
        data.reviewNote,
        ipAddress,
        userAgent,
      );
      ok(res, result);
    } catch (error) {
      next(error);
    }
  },
);

// ═══════════════════════════════════════════════════
// LEGENDARY PRIORITY
// ═══════════════════════════════════════════════════

router.post(
  "/:guildId/legendary",
  requireAuth,
  requireGuildRole("MEMBER"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params["guildId"] as string;
      const data = legendaryPrioritySchema.parse(req.body);
      const request = await market.createLegendaryRequest(guildId, req.user!.userId, data);
      ok(res, { request }, 201);
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  "/:guildId/legendary",
  requireAuth,
  requireGuildRole("MEMBER"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params["guildId"] as string;
      const result = await market.getLegendaryRequests(guildId, req.user!.userId, {
        status: req.query["status"] as string | undefined,
        category: req.query["category"] as string | undefined,
      });
      ok(res, result);
    } catch (error) {
      next(error);
    }
  },
);

router.patch(
  "/:guildId/legendary/:id/review",
  requireAuth,
  requireGuildRole("OFFICER"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params["guildId"] as string;
      const id = req.params["id"] as string;
      const data = reviewLegendarySchema.parse(req.body);
      const request = await market.reviewLegendaryRequest(
        guildId,
        id,
        req.user!.userId,
        data.action,
        data.officerNote,
      );
      ok(res, { request });
    } catch (error) {
      next(error);
    }
  },
);

router.patch(
  "/:guildId/legendary/:id/sequence",
  requireAuth,
  requireGuildRole("OFFICER"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params["guildId"] as string;
      const id = req.params["id"] as string;
      const data = legendarySequenceSchema.parse(req.body);
      const request = await market.setLegendarySequence(guildId, id, req.user!.userId, data.prioritySeq);
      ok(res, { request });
    } catch (error) {
      next(error);
    }
  },
);

// ═══════════════════════════════════════════════════
// ITEM DISTRIBUTION & PRIORITY
// ═══════════════════════════════════════════════════

router.get(
  "/:guildId/priority",
  requireAuth,
  requireGuildRole("MEMBER"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params["guildId"] as string;
      const queue = await market.getPriorityQueue(guildId, req.user!.userId);
      ok(res, { queue });
    } catch (error) {
      next(error);
    }
  },
);

router.patch(
  "/:guildId/priority/:memberId",
  requireAuth,
  requireGuildRole("OFFICER"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params["guildId"] as string;
      const memberId = req.params["memberId"] as string;
      const data = prioritySequenceSchema.parse(req.body);
      const member = await market.overridePrioritySeq(
        guildId,
        memberId,
        req.user!.userId,
        data.prioritySeq,
        data.reason,
      );
      ok(res, { member });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/:guildId/distributions",
  requireAuth,
  requireGuildRole("OFFICER"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params["guildId"] as string;
      const data = createDistributionSchema.parse(req.body);
      const distribution = await market.createDistribution(guildId, req.user!.userId, data);
      ok(res, { distribution }, 201);
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  "/:guildId/distributions",
  requireAuth,
  requireGuildRole("MEMBER"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params["guildId"] as string;
      const result = await market.getDistributions(guildId, req.user!.userId, {
        mineOnly: req.query["mine"] === "true",
        memberId: req.query["memberId"] as string | undefined,
        tier: req.query["tier"] as string | undefined,
        from: req.query["from"] as string | undefined,
        to: req.query["to"] as string | undefined,
        page: req.query["page"] ? Number(req.query["page"]) : undefined,
        limit: req.query["limit"] ? Number(req.query["limit"]) : undefined,
      });
      ok(res, result);
    } catch (error) {
      next(error);
    }
  },
);

// ═══════════════════════════════════════════════════
// MEMBER WISHLIST ("choose what you want")
// ═══════════════════════════════════════════════════

router.get(
  "/:guildId/wishlist/mine",
  requireAuth,
  requireGuildRole("MEMBER"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params["guildId"] as string;
      const result = await market.getMyWishlist(guildId, req.user!.userId);
      ok(res, result);
    } catch (error) {
      next(error);
    }
  },
);

router.put(
  "/:guildId/wishlist",
  requireAuth,
  requireGuildRole("MEMBER"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params["guildId"] as string;
      const data = wishlistSchema.parse(req.body);
      const result = await market.setWishlist(guildId, req.user!.userId, data.items);
      ok(res, result);
    } catch (error) {
      next(error);
    }
  },
);

// ═══════════════════════════════════════════════════
// RULES (Settings) & AUDIT
// ═══════════════════════════════════════════════════

router.get(
  "/:guildId/rules",
  requireAuth,
  requireGuildRole("MEMBER"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params["guildId"] as string;
      const rules = await market.getMarketRules(guildId, req.user!.userId);
      ok(res, { rules });
    } catch (error) {
      next(error);
    }
  },
);

router.patch(
  "/:guildId/rules",
  requireAuth,
  requireGuildRole("GUILD_LEADER"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params["guildId"] as string;
      const data = marketRulesSchema.parse(req.body);
      const rules = await market.updateMarketRules(guildId, req.user!.userId, data as never);
      ok(res, { rules });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  "/:guildId/audit",
  requireAuth,
  requireGuildRole("OFFICER"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params["guildId"] as string;
      const result = await market.getMarketAuditLogs(guildId, req.user!.userId, {
        action: req.query["action"] as string | undefined,
        page: req.query["page"] ? Number(req.query["page"]) : undefined,
        limit: req.query["limit"] ? Number(req.query["limit"]) : undefined,
      });
      ok(res, result);
    } catch (error) {
      next(error);
    }
  },
);

export default router;
