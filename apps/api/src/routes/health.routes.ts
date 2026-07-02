import { Router } from "express";
import type { Request, Response } from "express";
import { getCacheStats } from "../lib/cache";

const router: Router = Router();

router.get("/", (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      status: "ok",
      timestamp: new Date().toISOString(),
      version: "0.0.1",
      service: "guild-management-api",
      uptimeSeconds: Math.round(process.uptime()),
      cache: getCacheStats(),
    },
  });
});

export default router;
