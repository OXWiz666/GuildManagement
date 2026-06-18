import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { requireAuth } from "../middleware/auth";
import * as notificationService from "../services/notification.service";
import type { ApiResponse } from "@guild/shared";

const router: Router = Router();

router.get(
  "/",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const limit = req.query["limit"] ? Number(req.query["limit"]) : 20;
      const data = await notificationService.getNotifications(req.user!.userId, limit);
      const response: ApiResponse = { success: true, data };
      res.json(response);
    } catch (error) {
      next(error);
    }
  },
);

router.patch(
  "/read-all",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await notificationService.markAllNotificationsRead(req.user!.userId);
      const response: ApiResponse = { success: true, data };
      res.json(response);
    } catch (error) {
      next(error);
    }
  },
);

router.patch(
  "/:notificationId/read",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const notificationId = req.params["notificationId"] as string;
      const notification = await notificationService.markNotificationRead(
        req.user!.userId,
        notificationId,
      );
      const response: ApiResponse = { success: true, data: { notification } };
      res.json(response);
    } catch (error) {
      next(error);
    }
  },
);

export default router;
