import rateLimit from "express-rate-limit";
import type { Request } from "express";

/**
 * Key requests by authenticated user when available, falling back to IP for
 * anonymous traffic. This makes per-user quotas (dashboard, search, attendance)
 * fair behind shared NATs/proxies where many guild members share one IP.
 * These limiters are mounted after `requireAuth`, so the IP fallback is only a
 * defensive path.
 */
function userOrIpKey(req: Request): string {
  const userId = req.user?.userId;
  if (userId) return `user:${userId}`;
  return `ip:${req.ip ?? "unknown"}`;
}

const tooManyRequests = (message: string) => ({
  success: false as const,
  error: { code: "TOO_MANY_REQUESTS", message },
});

/**
 * Strict rate limiter for auth endpoints (login, register, password reset).
 * 10 requests per 15-minute window per IP.
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: {
    success: false,
    error: {
      code: "TOO_MANY_REQUESTS",
      message: "Too many authentication attempts. Please try again later.",
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Moderate rate limiter for general API endpoints.
 * 100 requests per minute per IP.
 */
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // requests
  message: {
    success: false,
    error: {
      code: "TOO_MANY_REQUESTS",
      message: "Too many requests. Please slow down.",
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Strict rate limiter for attendance check-in submissions.
 * Prevents brute-forcing check-in codes.
 * 5 requests per 5 minutes per IP.
 */
export const checkInLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 5,
  message: {
    success: false,
    error: {
      code: "TOO_MANY_REQUESTS",
      message: "Too many check-in attempts. Please try again later.",
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Limiter for database-intensive audit log requests.
 * Prevents log scraping/DoS.
 * 15 requests per minute per IP.
 */
export const auditLogLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 15,
  message: {
    success: false,
    error: {
      code: "TOO_MANY_REQUESTS",
      message: "Too many audit log requests. Please try again in a minute.",
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Dashboard read limiter — 60 requests/min/user.
 * Protects the high-traffic dashboard/stats endpoints when many guild members
 * refresh at once. Keyed per-user so one busy member can't starve others
 * sharing the same IP.
 */
export const dashboardLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  keyGenerator: userOrIpKey,
  message: tooManyRequests("Too many dashboard requests. Please slow down."),
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Search limiter — 20 requests/min/user.
 * Search/lookup endpoints are cheap individually but easy to hammer.
 */
export const searchLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  keyGenerator: userOrIpKey,
  message: tooManyRequests("Too many search requests. Please slow down."),
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Attendance submit limiter — 10 requests/min/user.
 * Complements `checkInLimiter` (which is IP-keyed and anti-brute-force) with a
 * per-user cap on legitimate check-in submissions.
 */
export const attendanceSubmitLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  keyGenerator: userOrIpKey,
  message: tooManyRequests("Too many attendance submissions. Please wait a moment."),
  standardHeaders: true,
  legacyHeaders: false,
});
