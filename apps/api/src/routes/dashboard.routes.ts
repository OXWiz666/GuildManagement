import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { requireAuth } from "../middleware/auth";
import { requireGuildRole } from "../middleware/rbac";
import * as dashboardService from "../services/dashboard.service";
import * as lootService from "../services/loot.service";
import type { ApiResponse } from "@guild/shared";
import { AttendanceType } from "@guild/db";
import { cache } from "../lib/cache";
import { broadcastToGuild } from "../lib/socket";
import { checkInLimiter } from "../middleware/rateLimiter";

const router: Router = Router();

// Helper to extract client details for audit logs
function getClientInfo(req: Request) {
  return {
    ipAddress:
      (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
      req.ip ||
      req.socket.remoteAddress,
    userAgent: req.headers["user-agent"],
  };
}

// ─── Attendance Endpoints ───────────────────────

// Start a check-in session. Requires auth. (Validates GL/Officer inside service)
router.post(
  "/attendance/session",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { guildId, title, type, minutes, bossScheduleId } = req.body as {
        guildId: string;
        title?: string;
        type: AttendanceType;
        minutes: number;
        bossScheduleId?: string;
      };

      if (!guildId || (!title && !bossScheduleId) || !type || !minutes || isNaN(Number(minutes))) {
        const response: ApiResponse = {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Missing or invalid session details",
          },
        };
        res.status(400).json(response);
        return;
      }

      const { ipAddress, userAgent } = getClientInfo(req);

      const session = await dashboardService.createAttendanceSession(
        guildId,
        title || "",
        type,
        Number(minutes),
        req.user!.userId,
        ipAddress,
        userAgent,
        bossScheduleId,
      );

      // Invalidate attendance and schedule in-memory caches
      await Promise.all([
        cache.invalidatePattern(`boss-schedule:${guildId}:*`),
        cache.invalidatePattern(`attendance:pending:${guildId}:*`),
        cache.invalidatePattern(`attendance:stats:${guildId}:*`),
        cache.invalidatePattern(`stats:${guildId}:*`),
      ]);

      // Serialize Date fields for socket transmission compatibility
      const socketPayload = {
        ...session,
        expiresAt: session.expiresAt.toISOString(),
        createdAt: session.createdAt.toISOString(),
      };
      broadcastToGuild(guildId, "attendance_session_created", socketPayload);

      const response: ApiResponse = {
        success: true,
        data: { session: socketPayload },
      };
      res.json(response);
    } catch (error) {
      next(error);
    }
  },
);

// Submit attendance code. Requires auth. Available to all.
router.post(
  "/attendance/check-in",
  requireAuth,
  checkInLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { code } = req.body as { code: string };

      if (!code) {
        const response: ApiResponse = {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Attendance code is required",
          },
        };
        res.status(400).json(response);
        return;
      }

      const result = await dashboardService.submitAttendanceCode(
        req.user!.userId,
        code,
      );

      // Invalidate attendance and schedule in-memory caches
      await Promise.all([
        cache.invalidatePattern(`boss-schedule:${result.guildId}:*`),
        cache.invalidatePattern(`attendance:pending:${result.guildId}:*`),
        cache.invalidatePattern(`attendance:stats:${result.guildId}:*`),
        cache.invalidatePattern(`stats:${result.guildId}:*`),
      ]);

      // Serialize Date fields for socket transmission compatibility
      const serializedRecord = {
        ...result.record,
        joinedAt: result.record.joinedAt.toISOString(),
      };
      
      broadcastToGuild(result.guildId, "attendance_record_created", {
        ...result,
        record: serializedRecord,
      });

      const response: ApiResponse = {
        success: true,
        data: {
          ...result,
          record: serializedRecord,
        },
      };
      res.json(response);
    } catch (error) {
      next(error);
    }
  },
);

// Get pending check-in requests. Requires auth. (Validates GL/Officer inside service)
router.get(
  "/attendance/pending/:guildId",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params['guildId'] as string;
      const cacheKey = `attendance:pending:${guildId}:user:${req.user!.userId}`;

      const cached = await cache.get<any>(cacheKey);
      if (cached) {
        return res.json({ success: true, data: cached });
      }

      const result = await dashboardService.getGuildPendingAttendance(
        guildId,
        req.user!.userId,
      );

      await cache.set(cacheKey, result, 15); // Cache for 15 seconds

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

// Confirm member check-in. Requires auth. (Validates GL/Officer inside service)
router.patch(
  "/attendance/confirm/:recordId",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const recordId = req.params['recordId'] as string;
      const { guildId } = req.body as { guildId: string };

      if (!guildId) {
        const response: ApiResponse = {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Guild ID is required",
          },
        };
        res.status(400).json(response);
        return;
      }

      const { ipAddress, userAgent } = getClientInfo(req);

      const result = await dashboardService.confirmAttendanceRecord(
        guildId,
        recordId,
        req.user!.userId,
        ipAddress,
        userAgent,
      );

      // Invalidate attendance and schedule in-memory caches
      await Promise.all([
        cache.invalidatePattern(`boss-schedule:${guildId}:*`),
        cache.invalidatePattern(`attendance:pending:${guildId}:*`),
        cache.invalidatePattern(`attendance:stats:${guildId}:*`),
        cache.invalidatePattern(`stats:${guildId}:*`),
      ]);

      // Serialize Date fields for socket transmission compatibility
      const serializedRecord = {
        ...result.record,
        joinedAt: result.record.joinedAt.toISOString(),
      };

      broadcastToGuild(guildId, "attendance_record_confirmed", {
        ...result,
        record: serializedRecord,
      });

      const response: ApiResponse = {
        success: true,
        data: {
          ...result,
          record: serializedRecord,
        },
      };
      res.json(response);
    } catch (error) {
      next(error);
    }
  },
);

// Get member attendance stats and alerts. Requires auth.
router.get(
  "/attendance/stats/:guildId",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params['guildId'] as string;
      const cacheKey = `attendance:stats:${guildId}:user:${req.user!.userId}`;

      const cached = await cache.get<any>(cacheKey);
      if (cached) {
        return res.json({ success: true, data: cached });
      }

      const stats = await dashboardService.getMemberAttendanceStats(
        guildId,
        req.user!.userId,
      );

      await cache.set(cacheKey, stats, 15); // Cache for 15 seconds

      const response: ApiResponse = {
        success: true,
        data: stats,
      };
      res.json(response);
    } catch (error) {
      next(error);
    }
  },
);

// Get dynamic dashboard stats. Requires auth.
router.get(
  "/stats/:guildId",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params['guildId'] as string;
      const cacheKey = `stats:${guildId}:user:${req.user!.userId}`;

      const cached = await cache.get<any>(cacheKey);
      if (cached) {
        return res.json({ success: true, data: cached });
      }

      const stats = await dashboardService.getDashboardSummary(
        guildId,
        req.user!.userId,
      );

      await cache.set(cacheKey, stats, 30); // Cache for 30 seconds

      const response: ApiResponse = {
        success: true,
        data: stats,
      };
      res.json(response);
    } catch (error) {
      next(error);
    }
  },
);

// ─── Boss Schedules Endpoints ────────────────────

// Get boss schedule list. Requires auth.
router.get(
  "/boss-schedule/:guildId",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params['guildId'] as string;
      const cacheKey = `boss-schedule:${guildId}:user:${req.user?.userId || "anonymous"}`;

      const cached = await cache.get<any>(cacheKey);
      if (cached) {
        return res.json({ success: true, data: cached });
      }

      const schedules = await dashboardService.getBossSchedules(guildId, req.user?.userId);
      const data = { schedules };

      await cache.set(cacheKey, data, 15); // Cache for 15 seconds

      const response: ApiResponse = {
        success: true,
        data,
      };
      res.json(response);
    } catch (error) {
      next(error);
    }
  },
);

// Create boss schedule event. Requires auth. (Validates GL/Officer inside service)
router.post(
  "/boss-schedule/:guildId",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params['guildId'] as string;
      const { bossName, bossImageUrl, spawnTime, location, guildTurn, isFaction } = req.body as {
        bossName: string;
        bossImageUrl?: string;
        spawnTime: string;
        location: string;
        guildTurn?: string;
        isFaction?: boolean;
      };

      if (!bossName || !spawnTime || !location) {
        const response: ApiResponse = {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Missing boss name, spawn time, or location",
          },
        };
        res.status(400).json(response);
        return;
      }

      const { ipAddress, userAgent } = getClientInfo(req);

      // Faction-wide schedule sets guildId to null
      const targetGuildId = isFaction ? null : guildId;

      const schedule = await dashboardService.createBossSchedule(
        targetGuildId,
        { bossName, bossImageUrl, spawnTime, location, guildTurn },
        req.user!.userId,
        ipAddress,
        userAgent,
      );

      // Invalidate schedule and dashboard stats in-memory caches
      await Promise.all([
        cache.invalidatePattern(`boss-schedule:*`),
        cache.invalidatePattern(`stats:${targetGuildId || guildId}:*`),
      ]);

      // Serialize Date fields to ISO strings for socket transmission compatibility
      const socketPayload = {
        ...schedule,
        spawnTime: schedule.spawnTime.toISOString(),
        killedAt: schedule.killedAt ? schedule.killedAt.toISOString() : null,
        createdAt: schedule.createdAt.toISOString(),
      };

      broadcastToGuild(targetGuildId, "boss_rotation_updated", socketPayload);

      const response: ApiResponse = {
        success: true,
        data: { schedule: socketPayload },
      };
      res.json(response);
    } catch (error) {
      next(error);
    }
  },
);

// Log boss death. Requires auth. (Validates GL/Officer inside service)
router.patch(
  "/boss-schedule/:guildId/kill/:scheduleId",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params['guildId'] as string;
      const scheduleId = req.params['scheduleId'] as string;
      const { killedAt, lootDrop, screenshotUrl } = req.body as {
        killedAt: string;
        lootDrop?: string;
        screenshotUrl?: string;
      };

      if (!killedAt) {
        const response: ApiResponse = {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Killed timestamp is required",
          },
        };
        res.status(400).json(response);
        return;
      }

      const { ipAddress, userAgent } = getClientInfo(req);

      const { updatedEvent, nextSchedule } = await dashboardService.logBossKill(
        guildId,
        scheduleId,
        killedAt,
        req.user!.userId,
        lootDrop,
        screenshotUrl,
        ipAddress,
        userAgent,
      );

      // Invalidate schedule and stats in-memory caches
      await Promise.all([
        cache.invalidatePattern(`boss-schedule:*`),
        cache.invalidatePattern(`stats:${guildId}:*`),
      ]);

      // Serialize Date fields to ISO strings for socket transmission compatibility
      const socketPayload = {
        ...updatedEvent,
        spawnTime: updatedEvent.spawnTime.toISOString(),
        killedAt: updatedEvent.killedAt ? updatedEvent.killedAt.toISOString() : null,
        createdAt: updatedEvent.createdAt.toISOString(),
      };

      broadcastToGuild(updatedEvent.guildId || guildId, "boss_rotation_updated", socketPayload);

      let serializedNextSchedule = null;
      if (nextSchedule) {
        serializedNextSchedule = {
          ...nextSchedule,
          spawnTime: nextSchedule.spawnTime.toISOString(),
          killedAt: null,
          createdAt: nextSchedule.createdAt.toISOString(),
        };
        broadcastToGuild(null, "boss_rotation_updated", serializedNextSchedule);
      }

      const response: ApiResponse = {
        success: true,
        data: { 
          schedule: socketPayload,
          nextSchedule: serializedNextSchedule
        },
      };
      res.json(response);
    } catch (error) {
      next(error);
    }
  },
);

// Fetch boss registry
router.get(
  "/bosses",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const cacheKey = "bosses:registry";

      const cached = await cache.get<any>(cacheKey);
      if (cached) {
        return res.json({ success: true, data: cached });
      }

      const bosses = await dashboardService.getBosses();
      const data = { bosses };

      await cache.set(cacheKey, data, 300); // Cache for 5 minutes

      const response: ApiResponse = {
        success: true,
        data,
      };
      res.json(response);
    } catch (error) {
      next(error);
    }
  },
);

// Edit boss schedule event
router.patch(
  "/boss-schedule/:guildId/:scheduleId",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params['guildId'] as string;
      const scheduleId = req.params['scheduleId'] as string;
      const payload = req.body as {
        bossName?: string;
        bossImageUrl?: string;
        spawnTime?: string;
        location?: string;
        guildTurn?: string;
        isFaction?: boolean;
      };

      const { ipAddress, userAgent } = getClientInfo(req);

      const schedule = await dashboardService.updateBossSchedule(
        guildId,
        scheduleId,
        payload,
        req.user!.userId,
        ipAddress,
        userAgent,
      );

      // Invalidate schedule and stats in-memory caches
      await Promise.all([
        cache.invalidatePattern(`boss-schedule:*`),
        cache.invalidatePattern(`stats:${guildId}:*`),
      ]);

      // Serialize Date fields to ISO strings for socket transmission compatibility
      const socketPayload = {
        ...schedule,
        spawnTime: schedule.spawnTime.toISOString(),
        killedAt: schedule.killedAt ? schedule.killedAt.toISOString() : null,
        createdAt: schedule.createdAt.toISOString(),
      };

      broadcastToGuild(schedule.guildId || guildId, "boss_rotation_updated", socketPayload);

      const response: ApiResponse = {
        success: true,
        data: { schedule: socketPayload },
      };
      res.json(response);
    } catch (error) {
      next(error);
    }
  },
);

// Delete boss schedule event
router.delete(
  "/boss-schedule/:guildId/:scheduleId",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params['guildId'] as string;
      const scheduleId = req.params['scheduleId'] as string;

      const { ipAddress, userAgent } = getClientInfo(req);

      const result = await dashboardService.deleteBossSchedule(
        guildId,
        scheduleId,
        req.user!.userId,
        ipAddress,
        userAgent,
      );

      // Invalidate schedule and stats in-memory caches
      await Promise.all([
        cache.invalidatePattern(`boss-schedule:*`),
        cache.invalidatePattern(`stats:${guildId}:*`),
      ]);

      broadcastToGuild(guildId, "boss_schedule_deleted", { scheduleId });

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

// Edit attendance session
router.patch(
  "/attendance/session/:guildId/:sessionId",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params['guildId'] as string;
      const sessionId = req.params['sessionId'] as string;
      const payload = req.body as {
        title?: string;
        expiresAt?: string;
        isActive?: boolean;
      };

      const { ipAddress, userAgent } = getClientInfo(req);

      const session = await dashboardService.updateAttendanceSession(
        guildId,
        sessionId,
        payload,
        req.user!.userId,
        ipAddress,
        userAgent,
      );

      // Invalidate attendance and schedule in-memory caches
      await Promise.all([
        cache.invalidatePattern(`boss-schedule:${guildId}:*`),
        cache.invalidatePattern(`attendance:pending:${guildId}:*`),
        cache.invalidatePattern(`attendance:stats:${guildId}:*`),
        cache.invalidatePattern(`stats:${guildId}:*`),
      ]);

      // Serialize Date fields for socket transmission compatibility
      const socketPayload = {
        ...session,
        expiresAt: session.expiresAt.toISOString(),
        createdAt: session.createdAt.toISOString(),
      };
      broadcastToGuild(guildId, "attendance_session_updated", socketPayload);

      const response: ApiResponse = {
        success: true,
        data: { session: socketPayload },
      };
      res.json(response);
    } catch (error) {
      next(error);
    }
  },
);

// Delete attendance session
router.delete(
  "/attendance/session/:guildId/:sessionId",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params['guildId'] as string;
      const sessionId = req.params['sessionId'] as string;

      const { ipAddress, userAgent } = getClientInfo(req);

      const result = await dashboardService.deleteAttendanceSession(
        guildId,
        sessionId,
        req.user!.userId,
        ipAddress,
        userAgent,
      );

      // Invalidate attendance and schedule in-memory caches
      await Promise.all([
        cache.invalidatePattern(`boss-schedule:${guildId}:*`),
        cache.invalidatePattern(`attendance:pending:${guildId}:*`),
        cache.invalidatePattern(`attendance:stats:${guildId}:*`),
        cache.invalidatePattern(`stats:${guildId}:*`),
      ]);

      broadcastToGuild(guildId, "attendance_session_deleted", { sessionId });

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

// ─── Loot Sales Endpoints ────────────────────────

// Record a new loot sale and split proceeds
router.post(
  "/loot-sale/:guildId",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params['guildId'] as string;
      const { itemName, category, bossScheduleId, saleValue, currency } = req.body as {
        itemName: string;
        category: string;
        bossScheduleId?: string | null;
        saleValue: number; // in floating decimal standard format (e.g. 100.00)
        currency: string;
      };

      if (!itemName || !category || !saleValue || isNaN(Number(saleValue))) {
        const response: ApiResponse = {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Missing item name, category, or invalid sale value",
          },
        };
        res.status(400).json(response);
        return;
      }

      const centsValue = BigInt(Math.round(saleValue * 100));

      const sale = await lootService.createLootSale({
        guildId,
        bossScheduleId,
        itemName,
        category,
        saleValue: centsValue,
        currency,
        creatorId: req.user!.userId,
      });

      // Invalidate caches concurrently
      await Promise.all([
        cache.invalidatePattern(`accounting:${guildId}:*`),
        cache.invalidatePattern(`stats:${guildId}:*`),
        cache.invalidatePattern(`loot:${guildId}:*`),
      ]);

      // Serialize Date and BigInt fields for socket transmission compatibility
      const socketPayload = {
        ...sale,
        saleValue: sale.saleValue.toString(),
        taxAmount: sale.taxAmount.toString(),
        netProfit: sale.netProfit.toString(),
        createdAt: sale.createdAt.toISOString(),
      };
      
      broadcastToGuild(guildId, "loot_sale_recorded", socketPayload);

      const response: ApiResponse = {
        success: true,
        data: { sale: socketPayload },
      };
      res.json(response);
    } catch (error) {
      next(error);
    }
  },
);

// Get sold items list
router.get(
  "/loot-sale/:guildId",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params['guildId'] as string;
      const cacheKey = `loot:${guildId}:sales`;

      const cached = await cache.get<any>(cacheKey);
      if (cached) {
        return res.json({ success: true, data: cached });
      }

      const sales = await lootService.getLootSales(guildId);
      const data = { sales };

      await cache.set(cacheKey, data, 120); // Cache for 2 minutes

      const response: ApiResponse = {
        success: true,
        data,
      };
      res.json(response);
    } catch (error) {
      next(error);
    }
  },
);

// ─── Accounting Endpoints ────────────────────────

// Get ledger treasury accounting stats & balances
router.get(
  "/accounting/:guildId",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params['guildId'] as string;
      const page = req.query['page'] ? parseInt(req.query['page'] as string, 10) : 1;
      const limit = req.query['limit'] ? parseInt(req.query['limit'] as string, 10) : 25;
      
      const cacheKey = `accounting:${guildId}:p${page}:l${limit}`;

      const cached = await cache.get<any>(cacheKey);
      if (cached) {
        return res.json({ success: true, data: cached });
      }

      const data = await dashboardService.getAccountingDashboard(guildId, req.user!.userId, page, limit);

      await cache.set(cacheKey, data, 60); // Cache for 60 seconds

      const response: ApiResponse = {
        success: true,
        data,
      };
      res.json(response);
    } catch (error) {
      next(error);
    }
  },
);

// Record manual treasury debit/credit adjustment
router.post(
  "/accounting/adjustment/:guildId",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params['guildId'] as string;
      const payload = req.body as {
        accountId: string;
        accountType: "MEMBER" | "GUILD_FUND" | "TAX";
        entryType: "CREDIT" | "DEBIT";
        amount: number;
        currency: string;
        description: string;
      };

      if (!payload.accountId || !payload.accountType || !payload.entryType || !payload.amount || !payload.currency || !payload.description) {
        const response: ApiResponse = {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Missing dynamic transaction details",
          },
        };
        res.status(400).json(response);
        return;
      }

      const { ipAddress, userAgent } = getClientInfo(req);

      const entry = await dashboardService.createTreasuryAdjustment(
        guildId,
        payload,
        req.user!.userId,
        ipAddress,
        userAgent,
      );

      // Invalidate caches concurrently
      await Promise.all([
        cache.invalidatePattern(`accounting:${guildId}:*`),
        cache.invalidatePattern(`stats:${guildId}:*`),
      ]);

      // Serialize Date and BigInt fields for socket transmission compatibility
      const socketPayload = {
        ...entry,
        amount: entry.amount.toString(),
        createdAt: entry.createdAt.toISOString(),
      };

      broadcastToGuild(guildId, "treasury_adjusted", socketPayload);

      const response: ApiResponse = {
        success: true,
        data: { entry: socketPayload },
      };
      res.json(response);
    } catch (error) {
      next(error);
    }
  },
);

export default router;

