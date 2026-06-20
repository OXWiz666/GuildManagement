import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { requireAuth } from "../middleware/auth";
import * as factionService from "../services/faction.service";
import type { ApiResponse } from "@guild/shared";

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

router.get("/members", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const members = await factionService.getFactionMembers(req.user!.userId);
    const response: ApiResponse = { success: true, data: { members } };
    res.json(response);
  } catch (error) {
    next(error);
  }
});

router.get("/guilds/search", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = typeof req.query["q"] === "string" ? req.query["q"] : "";
    const guilds = await factionService.searchGuilds(req.user!.userId, query);
    const response: ApiResponse = { success: true, data: { guilds } };
    res.json(response);
  } catch (error) {
    next(error);
  }
});

router.post("/guilds/invite", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { ipAddress, userAgent } = getClientInfo(req);
    const result = await factionService.inviteGuild(
      req.user!.userId,
      req.body?.guildId,
      ipAddress,
      userAgent,
    );
    const response: ApiResponse = { success: true, data: result };
    res.json(response);
  } catch (error) {
    next(error);
  }
});

router.get("/announcements", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const announcements = await factionService.listAnnouncements(req.user!.userId);
    const response: ApiResponse = { success: true, data: { announcements } };
    res.json(response);
  } catch (error) {
    next(error);
  }
});

router.post("/announcements", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { ipAddress, userAgent } = getClientInfo(req);
    const announcement = await factionService.createAnnouncement(
      req.user!.userId,
      req.body,
      ipAddress,
      userAgent,
    );
    const response: ApiResponse = { success: true, data: { announcement } };
    res.json(response);
  } catch (error) {
    next(error);
  }
});

router.patch("/announcements/:announcementId", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { ipAddress, userAgent } = getClientInfo(req);
    const announcement = await factionService.updateAnnouncement(
      req.user!.userId,
      req.params["announcementId"] as string,
      req.body,
      ipAddress,
      userAgent,
    );
    const response: ApiResponse = { success: true, data: { announcement } };
    res.json(response);
  } catch (error) {
    next(error);
  }
});

router.delete("/announcements/:announcementId", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { ipAddress, userAgent } = getClientInfo(req);
    const data = await factionService.deleteAnnouncement(
      req.user!.userId,
      req.params["announcementId"] as string,
      ipAddress,
      userAgent,
    );
    const response: ApiResponse = { success: true, data };
    res.json(response);
  } catch (error) {
    next(error);
  }
});

router.get("/events", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const events = await factionService.listEvents(req.user!.userId);
    const response: ApiResponse = { success: true, data: { events } };
    res.json(response);
  } catch (error) {
    next(error);
  }
});

router.post("/events", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { ipAddress, userAgent } = getClientInfo(req);
    const event = await factionService.createEvent(
      req.user!.userId,
      req.body,
      ipAddress,
      userAgent,
    );
    const response: ApiResponse = { success: true, data: { event } };
    res.json(response);
  } catch (error) {
    next(error);
  }
});

router.patch("/events/:eventId", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { ipAddress, userAgent } = getClientInfo(req);
    const event = await factionService.updateEvent(
      req.user!.userId,
      req.params["eventId"] as string,
      req.body,
      ipAddress,
      userAgent,
    );
    const response: ApiResponse = { success: true, data: { event } };
    res.json(response);
  } catch (error) {
    next(error);
  }
});

router.delete("/events/:eventId", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { ipAddress, userAgent } = getClientInfo(req);
    const data = await factionService.deleteEvent(
      req.user!.userId,
      req.params["eventId"] as string,
      ipAddress,
      userAgent,
    );
    const response: ApiResponse = { success: true, data };
    res.json(response);
  } catch (error) {
    next(error);
  }
});

export default router;
