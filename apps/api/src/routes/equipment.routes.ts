import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { uploadScreenshotSchema, confirmEquipmentSchema } from "@guild/shared";
import type { ApiResponse } from "@guild/shared";
import { requireAuth } from "../middleware/auth";
import { requireGuildRole } from "../middleware/rbac";
import * as equipment from "../services/equipment.service";

const router: Router = Router();

const ok = (res: Response, data: unknown, status = 200) =>
  res.status(status).json({ success: true, data } satisfies ApiResponse);

// ─── Icon catalog (shared across guilds; no guild context needed) ────
router.get(
  "/catalog",
  requireAuth,
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const catalog = await equipment.getCatalog();
      ok(res, catalog);
    } catch (error) {
      next(error);
    }
  },
);

// ─── My saved equipment ──────────────────────────────────────────────
router.get(
  "/:guildId/mine",
  requireAuth,
  requireGuildRole("MEMBER"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params["guildId"] as string;
      const result = await equipment.getMyEquipment(guildId, req.user!.userId);
      ok(res, result);
    } catch (error) {
      next(error);
    }
  },
);

// ─── Upload source screenshot (base64) ───────────────────────────────
router.post(
  "/:guildId/screenshot",
  requireAuth,
  requireGuildRole("MEMBER"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = uploadScreenshotSchema.parse({ ...req.body, guildId: req.params["guildId"] });
      const result = await equipment.uploadScreenshot(data.guildId, req.user!.userId, data.dataUrl);
      ok(res, result, 201);
    } catch (error) {
      next(error);
    }
  },
);

// ─── Confirm & save detected equipment ───────────────────────────────
router.post(
  "/:guildId/confirm",
  requireAuth,
  requireGuildRole("MEMBER"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = confirmEquipmentSchema.parse({ ...req.body, guildId: req.params["guildId"] });
      const result = await equipment.confirmEquipment(
        data.guildId,
        req.user!.userId,
        data.items,
        data.sourceScreenshotPath,
      );
      ok(res, result, 201);
    } catch (error) {
      next(error);
    }
  },
);

export default router;
