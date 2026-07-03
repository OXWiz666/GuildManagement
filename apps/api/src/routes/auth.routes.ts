import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import {
  loginSchema,
  registerSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  updateUserSchema,
  combatPowerSchema,
} from "@guild/shared";
import { requireAuth } from "../middleware/auth";
import { authLimiter } from "../middleware/rateLimiter";
import * as authService from "../services/auth.service";
import { env } from "../config/env";
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

// ─── POST /supabase-sync ────────────────────────
router.post(
  "/supabase-sync",
  authLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { token } = req.body as { token?: unknown };
      if (!token || typeof token !== "string") {
        res.status(400).json({
          success: false,
          error: { code: "BAD_REQUEST", message: "Token is required" },
        } satisfies ApiResponse);
        return;
      }

      // Verify token with Supabase API
      const response = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: env.SUPABASE_KEY,
        },
      });

      if (!response.ok) {
        res.status(401).json({
          success: false,
          error: { code: "UNAUTHORIZED", message: "Invalid Supabase token" },
        } satisfies ApiResponse);
        return;
      }

      const supabaseUser = (await response.json()) as {
        id: string;
        email: string;
        user_metadata?: {
          display_name?: string;
          full_name?: string;
        };
      };

      if (!supabaseUser.id || !supabaseUser.email) {
        res.status(400).json({
          success: false,
          error: { code: "BAD_REQUEST", message: "Invalid user data from Supabase" },
        } satisfies ApiResponse);
        return;
      }

      const email = supabaseUser.email;
      const id = supabaseUser.id;
      const displayName =
        supabaseUser.user_metadata?.display_name ||
        supabaseUser.user_metadata?.full_name ||
        email.split("@")[0];

      const { ipAddress, userAgent } = getClientInfo(req);

      const result = await authService.supabaseSync(
        { id: id as string, email: email as string, displayName: displayName as string },
        ipAddress,
        userAgent,
      );

      // Set refresh token as httpOnly cookie
      setRefreshCookie(res, result.tokens.refreshToken);

      const responseBody: ApiResponse = {
        success: true,
        data: {
          user: result.user,
          accessToken: result.tokens.accessToken,
        },
      };

      res.json(responseBody);
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

// ─── PUT /me/cp ─────────────────────────────────
// Update Combat Power (e.g. from the screenshot scanner). Syncs the profile and
// every guild membership.
router.put(
  "/me/cp",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { cp } = combatPowerSchema.parse(req.body);
      const result = await authService.updateCombatPower(req.user!.userId, cp);

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
