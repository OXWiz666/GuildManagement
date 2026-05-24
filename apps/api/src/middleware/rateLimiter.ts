import rateLimit from "express-rate-limit";

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
  max: 100,
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
