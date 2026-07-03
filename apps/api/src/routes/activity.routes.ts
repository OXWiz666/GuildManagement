import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { requireAuth } from "../middleware/auth";
import * as activityService from "../services/activity.service";
import type { ApiResponse } from "@guild/shared";
import { broadcastToGuild } from "../lib/socket";
import { dashboardLimiter } from "../middleware/rateLimiter";

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

// List all activities for a guild
router.get(
  "/:guildId",
  requireAuth,
  dashboardLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params["guildId"] as string;
      const data = await activityService.listActivities(guildId, req.user!.userId);
      const response: ApiResponse = { success: true, data };
      res.json(response);
    } catch (error) {
      next(error);
    }
  },
);

// Create a new activity (officer+)
router.post(
  "/:guildId",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params["guildId"] as string;
      const { ipAddress, userAgent } = getClientInfo(req);
      const data = await activityService.createActivity(guildId, req.user!.userId, req.body, ipAddress, userAgent);
      broadcastToGuild(guildId, "guild_activity_updated", { guildId });
      const response: ApiResponse = { success: true, data };
      res.json(response);
    } catch (error) {
      next(error);
    }
  },
);

// Update an activity (officer+)
router.patch(
  "/:guildId/:activityId",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params["guildId"] as string;
      const activityId = req.params["activityId"] as string;
      const { ipAddress, userAgent } = getClientInfo(req);
      const data = await activityService.updateActivity(guildId, req.user!.userId, activityId, req.body, ipAddress, userAgent);
      broadcastToGuild(guildId, "guild_activity_updated", { guildId });
      const response: ApiResponse = { success: true, data };
      res.json(response);
    } catch (error) {
      next(error);
    }
  },
);

// Delete an activity (officer+)
router.delete(
  "/:guildId/:activityId",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params["guildId"] as string;
      const activityId = req.params["activityId"] as string;
      const { ipAddress, userAgent } = getClientInfo(req);
      const data = await activityService.deleteActivity(guildId, req.user!.userId, activityId, ipAddress, userAgent);
      broadcastToGuild(guildId, "guild_activity_updated", { guildId });
      const response: ApiResponse = { success: true, data };
      res.json(response);
    } catch (error) {
      next(error);
    }
  },
);

// Member check-in / cancel check-in
router.post(
  "/:guildId/:activityId/check-in",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params["guildId"] as string;
      const activityId = req.params["activityId"] as string;
      const attending = req.body?.attending !== false; // default: check in
      const data = await activityService.setCheckIn(guildId, req.user!.userId, activityId, attending);
      broadcastToGuild(guildId, "guild_activity_updated", { guildId });
      const response: ApiResponse = { success: true, data };
      res.json(response);
    } catch (error) {
      next(error);
    }
  },
);

// Officer confirms / unconfirms an attendee
router.post(
  "/:guildId/:activityId/attendees/:userId/confirm",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params["guildId"] as string;
      const activityId = req.params["activityId"] as string;
      const userId = req.params["userId"] as string;
      const confirmed = req.body?.confirmed !== false; // default: confirm
      const data = await activityService.setAttendeeConfirmation(guildId, req.user!.userId, activityId, userId, confirmed);
      broadcastToGuild(guildId, "guild_activity_updated", { guildId });
      const response: ApiResponse = { success: true, data };
      res.json(response);
    } catch (error) {
      next(error);
    }
  },
);

export default router;
