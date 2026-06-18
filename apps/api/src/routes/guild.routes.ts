import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { requireAuth } from "../middleware/auth";
import { requireGuildRole } from "../middleware/rbac";
import * as guildService from "../services/guild.service";
import * as applicationService from "../services/application.service";
import type { ApiResponse } from "@guild/shared";
import { GUILD_ROLES, type GuildRoleType } from "@guild/shared";
import { prisma } from "@guild/db";
import { broadcastToGuild } from "../lib/socket";
import { auditLogLimiter } from "../middleware/rateLimiter";

const router: Router = Router();

// ─── Helper to extract client info ──────────────
function getClientInfo(req: Request) {
  return {
    ipAddress:
      (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
      req.ip ||
      req.socket.remoteAddress,
    userAgent: req.headers["user-agent"],
  };
}

// ─── GET /:guildId/members ──────────────────────
// List all members of a guild. Requires authentication + guild membership.
router.get(
  "/:guildId/members",
  requireAuth,
  requireGuildRole("MEMBER"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params['guildId'] as string;
      const members = await guildService.getGuildMembers(guildId);

      const response: ApiResponse = {
        success: true,
        data: { members },
      };
      res.json(response);
    } catch (error) {
      next(error);
    }
  },
);

// ─── PATCH /:guildId/members/:memberId/role ─────
// Update a member's role. Only GUILD_LEADER can do this.
router.patch(
  "/:guildId/members/:memberId/role",
  requireAuth,
  requireGuildRole("GUILD_LEADER"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params['guildId'] as string;
      const memberId = req.params['memberId'] as string;
      const { role } = req.body as { role: string };

      // Validate role is a valid GuildRole
      if (!role || !GUILD_ROLES.includes(role as GuildRoleType)) {
        const response: ApiResponse = {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: `Invalid role. Must be one of: ${GUILD_ROLES.join(", ")}`,
          },
        };
        res.status(400).json(response);
        return;
      }

      const { ipAddress, userAgent } = getClientInfo(req);

      const updated = await guildService.updateMemberRole(
        guildId,
        memberId,
        role as GuildRoleType,
        req.user!.userId,
        ipAddress,
        userAgent,
      );

      broadcastToGuild(guildId, "member_role_updated", updated);

      const response: ApiResponse = {
        success: true,
        data: { member: updated },
      };
      res.json(response);
    } catch (error) {
      next(error);
    }
  },
);

// ─── GET /invite/:code ──────────────────────────
// Public lookup to verify a guild's invite code.
router.get(
  "/invite/:code",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const code = req.params['code'] as string;
      const guild = await applicationService.verifyInviteCode(code);
      const response: ApiResponse = {
        success: true,
        data: { guild },
      };
      res.json(response);
    } catch (error) {
      next(error);
    }
  },
);

// ─── POST /join ─────────────────────────────────
// Submit an application to join a guild.
router.post(
  "/join",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { inviteCode, ign, cp, class: classType, weapon } = req.body as {
        inviteCode: string;
        ign: string;
        cp: number;
        class: string;
        weapon: string;
      };

      const result = await applicationService.createJoinRequest(
        req.user!.userId,
        inviteCode,
        ign,
        Number(cp),
        classType,
        weapon,
      );

      const fullRequest = await prisma.guildJoinRequest.findUnique({
        where: { id: result.id },
        include: {
          user: {
            select: {
              id: true,
              displayName: true,
              email: true,
              avatarUrl: true,
            },
          },
        },
      });

      if (fullRequest) {
        const serializedRequest = {
          ...fullRequest,
          createdAt: fullRequest.createdAt.toISOString(),
        };
        broadcastToGuild(result.guildId, "join_request_created", serializedRequest);
      }

      const response: ApiResponse = {
        success: true,
        data: result,
      };
      res.json(response);
    } catch (error) {
      next(error);
    }
  },
);

// ─── GET /join-requests/pending ──────────────────
// Get current user's pending application.
router.get(
  "/join-requests/pending",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const request = await applicationService.getUserPendingRequest(req.user!.userId);
      const response: ApiResponse = {
        success: true,
        data: { request },
      };
      res.json(response);
    } catch (error) {
      next(error);
    }
  },
);

// ─── DELETE /join-requests/:requestId ────────────
// Cancel pending request of the current user.
router.delete(
  "/join-requests/:requestId",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const requestId = req.params['requestId'] as string;
      const result = await applicationService.cancelJoinRequest(req.user!.userId, requestId);

      broadcastToGuild(result.guildId, "join_request_cancelled", { requestId });

      const response: ApiResponse = {
        success: true,
        data: result,
      };
      res.json(response);
    } catch (error) {
      next(error);
    }
  },
);

// ─── GET /:guildId/applications ──────────────────
// Get pending join applications for a guild. Requires OFFICER or higher.
router.get(
  "/:guildId/applications",
  requireAuth,
  requireGuildRole("OFFICER"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params['guildId'] as string;
      const applications = await applicationService.getGuildApplications(guildId);
      const response: ApiResponse = {
        success: true,
        data: { applications },
      };
      res.json(response);
    } catch (error) {
      next(error);
    }
  },
);

// ─── PATCH /:guildId/applications/:requestId ──────
// Process (Accept/Decline) a join request. Requires GUILD_LEADER.
router.patch(
  "/:guildId/applications/:requestId",
  requireAuth,
  requireGuildRole("GUILD_LEADER"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params['guildId'] as string;
      const requestId = req.params['requestId'] as string;
      const { action } = req.body as { action: "ACCEPT" | "DECLINE" };

      if (!action || (action !== "ACCEPT" && action !== "DECLINE")) {
        const response: ApiResponse = {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Action must be ACCEPT or DECLINE",
          },
        };
        res.status(400).json(response);
        return;
      }

      const { ipAddress, userAgent } = getClientInfo(req);

      const result = await applicationService.handleApplicationAction(
        guildId,
        requestId,
        action,
        req.user!.userId,
        ipAddress,
        userAgent,
      );

      broadcastToGuild(guildId, "join_request_processed", {
        requestId,
        action,
        memberCode: result.memberCode,
      });

      const response: ApiResponse = {
        success: true,
        data: result,
      };
      res.json(response);
    } catch (error) {
      next(error);
    }
  },
);

// ─── GET /:guildId/invite-code ──────────────────
// Get the current guild invite code. Requires OFFICER or higher.
router.get(
  "/:guildId/invite-code",
  requireAuth,
  requireGuildRole("OFFICER"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params['guildId'] as string;
      const inviteCode = await guildService.getGuildInviteCode(guildId);
      const response: ApiResponse = {
        success: true,
        data: { inviteCode },
      };
      res.json(response);
    } catch (error) {
      next(error);
    }
  },
);

// ─── POST /:guildId/invite-code ──────────────────
// Generate or regenerate guild invite code. Requires GUILD_LEADER.
router.post(
  "/:guildId/invite-code",
  requireAuth,
  requireGuildRole("GUILD_LEADER"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params['guildId'] as string;
      const { ipAddress, userAgent } = getClientInfo(req);

      const result = await applicationService.generateGuildInviteCode(
        guildId,
        req.user!.userId,
        ipAddress,
        userAgent,
      );

      broadcastToGuild(guildId, "invite_code_updated", {
        inviteCode: result.inviteCode,
      });

      const response: ApiResponse = {
        success: true,
        data: result,
      };
      res.json(response);
    } catch (error) {
      next(error);
    }
  },
);

// ─── GET /:guildId/settings ──────────────────────
router.get(
  "/:guildId/settings",
  requireAuth,
  requireGuildRole("MEMBER"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params['guildId'] as string;
      const settings = await guildService.getGuildSettings(guildId);

      const response: ApiResponse = {
        success: true,
        data: settings,
      };
      res.json(response);
    } catch (error) {
      next(error);
    }
  },
);

// ─── PATCH /:guildId/settings ────────────────────
router.patch(
  "/:guildId/settings",
  requireAuth,
  requireGuildRole("OFFICER"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params['guildId'] as string;
      const payload = req.body as {
        taxRatePercent?: number;
        attendancePoints?: number;
        bossKillPoints?: number;
        rankMultipliers?: Record<string, number>;
        activeShareModel?: string;
        currencyCode?: string;
        currencySymbol?: string;
        secondaryCurrencyCode?: string | null;
        secondaryCurrencySymbol?: string | null;
      };

      const { ipAddress, userAgent } = getClientInfo(req);

      const settings = await guildService.updateGuildSettings(
        guildId,
        payload,
        req.user!.userId,
        ipAddress,
        userAgent,
      );

      const response: ApiResponse = {
        success: true,
        data: settings,
      };
      res.json(response);
    } catch (error) {
      next(error);
    }
  },
);

// ─── GET /:guildId/audit-logs ───────────────────
// Returns paginated audit logs for a guild. Optional filters support advanced history features.
router.get(
  "/:guildId/audit-logs",
  requireAuth,
  requireGuildRole("MEMBER"),
  auditLogLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params['guildId'] as string;
      const filter = req.query['filter'] as string | undefined; // e.g., "boss", "items", "member-items", "currency"
      const page = req.query['page'] ? parseInt(req.query['page'] as string, 10) : 1;
      const limit = req.query['limit'] ? parseInt(req.query['limit'] as string, 10) : 30;
      const skip = (page - 1) * limit;

      // ──────────────────────────────────────────
      // BRANCH 1: ITEMS DISTRIBUTED (filter === "items")
      // ──────────────────────────────────────────
      if (filter === "items") {
        // Fetch fulfilled item requests
        const itemRequests = await prisma.itemRequest.findMany({
          where: {
            guildId,
            type: "ITEM",
            status: "FULFILLED",
          },
          include: {
            member: {
              include: {
                user: {
                  select: { id: true, displayName: true, avatarUrl: true }
                }
              }
            }
          },
          orderBy: { updatedAt: "desc" },
        });

        // Fetch completed auctions won by members
        const auctions = await prisma.auctionItem.findMany({
          where: {
            guildId,
            status: "ENDED",
            winnerId: { not: null },
          },
          include: {
            bids: {
              orderBy: { bidAmount: "desc" },
              take: 1,
              include: {
                member: {
                  include: {
                    user: {
                      select: { id: true, displayName: true, avatarUrl: true }
                    }
                  }
                }
              }
            }
          },
          orderBy: { endsAt: "desc" },
        });

        // Merge them into a unified audit format
        const itemsList = [
          ...itemRequests.map(r => ({
            id: r.id,
            action: "ITEM_REQUEST_FULFILLED",
            target: "ItemRequest",
            targetId: r.id,
            detail: {
              itemName: r.itemName,
              quantity: r.quantity,
              category: r.itemCategory,
              recipientName: r.member.ign || r.member.user.displayName,
              recipientId: r.member.userId,
            },
            createdAt: r.updatedAt.toISOString(),
            actor: {
              id: r.reviewedById || "system",
              displayName: "Guild Officer",
              avatarUrl: null,
            }
          })),
          ...auctions.map(a => {
            const winningBid = a.bids[0];
            const winner = winningBid?.member;
            return {
              id: a.id,
              action: "AUCTION_WON",
              target: "AuctionItem",
              targetId: a.id,
              detail: {
                itemName: a.itemName,
                quantity: 1,
                category: a.category,
                recipientName: winner ? (winner.ign || winner.user.displayName) : "Unknown Member",
                recipientId: winner ? winner.userId : null,
                bidAmount: a.currentBid,
              },
              createdAt: a.endsAt.toISOString(),
              actor: {
                id: a.creatorId,
                displayName: "Auction System",
                avatarUrl: null,
              }
            };
          })
        ];

        // Sort items by date desc
        itemsList.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        const total = itemsList.length;
        const paginated = itemsList.slice(skip, skip + limit);

        const response: ApiResponse = {
          success: true,
          data: {
            logs: paginated,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
          }
        };
        res.json(response);
        return;
      }

      // ──────────────────────────────────────────
      // BRANCH 2: ITEMS RECEIVED BY SPECIFIC MEMBER (filter === "member-items")
      // ──────────────────────────────────────────
      if (filter === "member-items") {
        const memberId = req.query['memberId'] as string | undefined;
        if (!memberId) {
          const response: ApiResponse = {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "memberId query parameter is required for member-items filter",
            }
          };
          res.status(400).json(response);
          return;
        }

        // Fetch fulfilled item requests for member
        const itemRequests = await prisma.itemRequest.findMany({
          where: {
            guildId,
            memberId,
            type: "ITEM",
            status: "FULFILLED",
          },
          include: {
            member: {
              include: {
                user: {
                  select: { id: true, displayName: true, avatarUrl: true }
                }
              }
            }
          },
          orderBy: { updatedAt: "desc" },
        });

        // Fetch completed auctions won by this member
        const auctions = await prisma.auctionItem.findMany({
          where: {
            guildId,
            status: "ENDED",
            winnerId: memberId,
          },
          include: {
            bids: {
              orderBy: { bidAmount: "desc" },
              take: 1,
              include: {
                member: {
                  include: {
                    user: {
                      select: { id: true, displayName: true, avatarUrl: true }
                    }
                  }
                }
              }
            }
          },
          orderBy: { endsAt: "desc" },
        });

        // Merge them
        const itemsList = [
          ...itemRequests.map(r => ({
            id: r.id,
            action: "ITEM_REQUEST_FULFILLED",
            target: "ItemRequest",
            targetId: r.id,
            detail: {
              itemName: r.itemName,
              quantity: r.quantity,
              category: r.itemCategory,
              recipientName: r.member.ign || r.member.user.displayName,
              recipientId: r.member.userId,
            },
            createdAt: r.updatedAt.toISOString(),
            actor: {
              id: r.reviewedById || "system",
              displayName: "Guild Officer",
              avatarUrl: null,
            }
          })),
          ...auctions.map(a => {
            const winningBid = a.bids[0];
            const winner = winningBid?.member;
            return {
              id: a.id,
              action: "AUCTION_WON",
              target: "AuctionItem",
              targetId: a.id,
              detail: {
                itemName: a.itemName,
                quantity: 1,
                category: a.category,
                recipientName: winner ? (winner.ign || winner.user.displayName) : "Unknown Member",
                recipientId: winner ? winner.userId : null,
                bidAmount: a.currentBid,
              },
              createdAt: a.endsAt.toISOString(),
              actor: {
                id: a.creatorId,
                displayName: "Auction System",
                avatarUrl: null,
              }
            };
          })
        ];

        // Sort items by date desc
        itemsList.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        const total = itemsList.length;
        const paginated = itemsList.slice(skip, skip + limit);

        const response: ApiResponse = {
          success: true,
          data: {
            logs: paginated,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
          }
        };
        res.json(response);
        return;
      }

      // ──────────────────────────────────────────
      // BRANCH 3: PHP/DIAMOND DISTRIBUTIONS (filter === "currency")
      // ──────────────────────────────────────────
      if (filter === "currency") {
        const ledger = await prisma.ledgerEntry.findMany({
          where: {
            guildId,
            currency: { in: ["PHP", "DIAMOND"] },
            accountType: "MEMBER",
          },
          include: {
            actor: {
              select: { id: true, displayName: true, avatarUrl: true }
            }
          },
          orderBy: { createdAt: "desc" },
        });

        // Map to an AuditLog format
        const distributions = ledger.map(entry => {
          return {
            id: entry.id,
            action: entry.entryType === "CREDIT" ? "CURRENCY_DISTRIBUTION" : "CURRENCY_PAYOUT",
            target: "LedgerEntry",
            targetId: entry.id,
            detail: {
              amount: Number(entry.amount) / 100,
              currency: entry.currency,
              entryType: entry.entryType,
              referenceType: entry.referenceType,
              description: entry.description,
              recipientId: entry.accountId,
            },
            createdAt: entry.createdAt.toISOString(),
            actor: {
              id: entry.actor.id,
              displayName: entry.actor.displayName,
              avatarUrl: entry.actor.avatarUrl,
            }
          };
        });

        // Enrich recipient display names
        const recipientIds = Array.from(new Set(distributions.map(d => d.detail.recipientId)));
        const membersList = await prisma.guildMember.findMany({
          where: { userId: { in: recipientIds }, guildId },
          include: {
            user: {
              select: { displayName: true }
            }
          }
        });
        const memberMap = new Map(membersList.map(m => [m.userId, m.ign || m.user.displayName]));

        const enrichedDistributions = distributions.map(d => {
          const recipientName = memberMap.get(d.detail.recipientId) || "Unknown Member";
          return {
            ...d,
            detail: {
              ...d.detail,
              recipientName,
            }
          };
        });

        const total = enrichedDistributions.length;
        const paginated = enrichedDistributions.slice(skip, skip + limit);

        const response: ApiResponse = {
          success: true,
          data: {
            logs: paginated,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
          }
        };
        res.json(response);
        return;
      }

      // ──────────────────────────────────────────
      // BRANCH 4: STANDARD GUILD ACTIONS (default / boss / general logs)
      // ──────────────────────────────────────────
      let actionFilter: Record<string, unknown> | undefined;
      if (filter === "boss-rotation") {
        actionFilter = {
          in: [
            "BOSS_ROTATION_QUEUE_UPDATED",
            "BOSS_ROTATION_KILLED",
          ],
        };
      } else if (filter === "boss") {
        actionFilter = {
          in: [
            "BOSS_EVENT_SCHEDULED",
            "BOSS_KILLED_LOGGED",
            "BOSS_EVENT_UPDATED",
            "BOSS_EVENT_DELETED",
            "BOSS_KILL_RECORDED",
            "BOSS_ROTATION_QUEUE_UPDATED",
            "BOSS_ROTATION_KILLED",
          ],
        };
      }

      const [logs, total] = await Promise.all([
        prisma.auditLog.findMany({
          where: {
            guildId,
            ...(actionFilter ? { action: actionFilter } : {}),
          },
          include: {
            actor: {
              select: {
                id: true,
                displayName: true,
                avatarUrl: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
          skip,
          take: limit,
        }),
        prisma.auditLog.count({
          where: {
            guildId,
            ...(actionFilter ? { action: actionFilter } : {}),
          },
        }),
      ]);

      const response: ApiResponse = {
        success: true,
        data: {
          logs: logs.map((log) => ({
            id: log.id,
            action: log.action,
            target: log.target,
            targetId: log.targetId,
            detail: log.detail,
            createdAt: log.createdAt.toISOString(),
            actor: {
              id: log.actor.id,
              displayName: log.actor.displayName,
              avatarUrl: log.actor.avatarUrl,
            },
          })),
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      };
      res.json(response);
    } catch (error) {
      next(error);
    }
  },
);

export default router;
