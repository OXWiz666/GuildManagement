import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { requireAuth } from "../middleware/auth";
import { requireGuildRole } from "../middleware/rbac";
import * as dashboardService from "../services/dashboard.service";
import type { ApiResponse } from "@guild/shared";
import { AttendanceType } from "@guild/db";

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

      const response: ApiResponse = {
        success: true,
        data: { session },
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

// Get pending check-in requests. Requires auth. (Validates GL/Officer inside service)
router.get(
  "/attendance/pending/:guildId",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params['guildId'] as string;
      const result = await dashboardService.getGuildPendingAttendance(
        guildId,
        req.user!.userId,
      );

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

// Get member attendance stats and alerts. Requires auth.
router.get(
  "/attendance/stats/:guildId",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params['guildId'] as string;
      const stats = await dashboardService.getMemberAttendanceStats(
        guildId,
        req.user!.userId,
      );

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
      const schedules = await dashboardService.getBossSchedules(guildId);

      const response: ApiResponse = {
        success: true,
        data: { schedules },
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

      const response: ApiResponse = {
        success: true,
        data: { schedule },
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

      const result = await dashboardService.logBossKill(
        guildId,
        scheduleId,
        killedAt,
        req.user!.userId,
        lootDrop,
        screenshotUrl,
        ipAddress,
        userAgent,
      );

      const response: ApiResponse = {
        success: true,
        data: { schedule: result },
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
      const bosses = await dashboardService.getBosses();
      const response: ApiResponse = {
        success: true,
        data: { bosses },
      };
      res.json(response);
    } catch (error) {
      next(error);
    }
  },
);

export default router;

