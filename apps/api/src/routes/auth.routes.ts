import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import {
  loginSchema,
  registerSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  updateUserSchema,
} from "@guild/shared";
import { requireAuth } from "../middleware/auth";
import { authLimiter } from "../middleware/rateLimiter";
import * as authService from "../services/auth.service";
import type { ApiResponse } from "@guild/shared";

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

// ─── POST /register ─────────────────────────────
router.post(
  "/register",
  authLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = registerSchema.parse(req.body);
      const { ipAddress, userAgent } = getClientInfo(req);

      const result = await authService.register(
        data.email,
        data.password,
        data.displayName,
        ipAddress,
        userAgent,
      );

      // Set refresh token as httpOnly cookie
      setRefreshCookie(res, result.tokens.refreshToken);

      const response: ApiResponse = {
        success: true,
        data: {
          user: result.user,
          accessToken: result.tokens.accessToken,
        },
      };

      res.status(201).json(response);
    } catch (error) {
      next(error);
    }
  },
);

// ─── POST /login ────────────────────────────────
router.post(
  "/login",
  authLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = loginSchema.parse(req.body);
      const { ipAddress, userAgent } = getClientInfo(req);

      const result = await authService.login(
        data.email,
        data.password,
        ipAddress,
        userAgent,
      );

      // Set refresh token as httpOnly cookie
      setRefreshCookie(res, result.tokens.refreshToken);

      const response: ApiResponse = {
        success: true,
        data: {
          user: result.user,
          accessToken: result.tokens.accessToken,
        },
      };

      res.json(response);
    } catch (error) {
      next(error);
    }
  },
);

// ─── POST /refresh ──────────────────────────────
router.post(
  "/refresh",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const refreshToken =
        req.cookies?.['refreshToken'] ||
        (req.body as Record<string, unknown>)?.[ 'refreshToken'];

      if (!refreshToken || typeof refreshToken !== "string") {
        res.status(401).json({
          success: false,
          error: { code: "UNAUTHORIZED", message: "No refresh token provided" },
        } satisfies ApiResponse);
        return;
      }

      const { ipAddress, userAgent } = getClientInfo(req);

      const tokens = await authService.refreshTokens(
        refreshToken,
        ipAddress,
        userAgent,
      );

      // Set new refresh token cookie
      setRefreshCookie(res, tokens.refreshToken);

      const response: ApiResponse = {
        success: true,
        data: { accessToken: tokens.accessToken },
      };

      res.json(response);
    } catch (error) {
      next(error);
    }
  },
);

// ─── POST /logout ───────────────────────────────
router.post(
  "/logout",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const refreshToken =
        req.cookies?.['refreshToken'] ||
        (req.body as Record<string, unknown>)?.[ 'refreshToken'];

      if (refreshToken && typeof refreshToken === "string") {
        const { ipAddress, userAgent } = getClientInfo(req);
        await authService.logout(
          refreshToken,
          req.user!.userId,
          ipAddress,
          userAgent,
        );
      }

      // Clear the refresh token cookie
      res.clearCookie("refreshToken", {
        httpOnly: true,
        secure: process.env['NODE_ENV'] === "production",
        sameSite: process.env['NODE_ENV'] === "production" ? "strict" : "lax",
        path: "/",
      });

      const response: ApiResponse = { success: true };
      res.json(response);
    } catch (error) {
      next(error);
    }
  },
);

// ─── POST /logout-all ───────────────────────────
router.post(
  "/logout-all",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { ipAddress, userAgent } = getClientInfo(req);
      await authService.logoutAllDevices(
        req.user!.userId,
        ipAddress,
        userAgent,
      );

      // Clear cookie
      res.clearCookie("refreshToken", {
        httpOnly: true,
        secure: process.env['NODE_ENV'] === "production",
        sameSite: process.env['NODE_ENV'] === "production" ? "strict" : "lax",
        path: "/",
      });

      const response: ApiResponse = { success: true };
      res.json(response);
    } catch (error) {
      next(error);
    }
  },
);

// ─── POST /forgot-password ──────────────────────
router.post(
  "/forgot-password",
  authLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = forgotPasswordSchema.parse(req.body);
      const { ipAddress, userAgent } = getClientInfo(req);

      await authService.forgotPassword(data.email, ipAddress, userAgent);

      // Always return success to prevent email enumeration
      const response: ApiResponse = {
        success: true,
        data: {
          message:
            "If an account with that email exists, a reset link has been sent.",
        },
      };
      res.json(response);
    } catch (error) {
      next(error);
    }
  },
);

// ─── POST /reset-password ───────────────────────
router.post(
  "/reset-password",
  authLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = resetPasswordSchema.parse(req.body);
      const { ipAddress, userAgent } = getClientInfo(req);

      await authService.resetPassword(
        data.token,
        data.password,
        ipAddress,
        userAgent,
      );

      const response: ApiResponse = {
        success: true,
        data: {
          message: "Password has been reset. Please log in with your new password.",
        },
      };
      res.json(response);
    } catch (error) {
      next(error);
    }
  },
);

// ─── GET /me ────────────────────────────────────
router.get(
  "/me",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = await authService.getCurrentUser(req.user!.userId);

      const response: ApiResponse = {
        success: true,
        data: { user },
      };
      res.json(response);
    } catch (error) {
      next(error);
    }
  },
);

// ─── PUT /me ────────────────────────────────────
router.put(
  "/me",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = updateUserSchema.parse(req.body);
      const user = await authService.updateUserProfile(
        req.user!.userId,
        data
      );

      const response: ApiResponse = {
        success: true,
        data: { user },
      };
      res.json(response);
    } catch (error) {
      next(error);
    }
  },
);

// ─── GET /sessions ──────────────────────────────
router.get(
  "/sessions",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { ipAddress } = getClientInfo(req);
      const sessions = await authService.getUserSessions(
        req.user!.userId,
        ipAddress,
      );

      const response: ApiResponse = {
        success: true,
        data: { sessions },
      };
      res.json(response);
    } catch (error) {
      next(error);
    }
  },
);

// ─── DELETE /sessions/:id ───────────────────────
router.delete(
  "/sessions/:id",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { ipAddress, userAgent } = getClientInfo(req);
      await authService.revokeSession(
        req.params['id'] as string,
        req.user!.userId,
        ipAddress,
        userAgent,
      );

      const response: ApiResponse = { success: true };
      res.json(response);
    } catch (error) {
      next(error);
    }
  },
);

// ─── Helper: Set refresh token cookie ───────────
function setRefreshCookie(res: Response, token: string): void {
  res.cookie("refreshToken", token, {
    httpOnly: true,
    secure: process.env['NODE_ENV'] === "production",
    sameSite: process.env['NODE_ENV'] === "production" ? "strict" : "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });
}

export default router;
