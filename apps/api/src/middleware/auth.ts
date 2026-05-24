import type { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../utils/jwt";
import { UnauthorizedError } from "../utils/errors";
import type { JwtPayload } from "@guild/shared";

// Extend Express Request to include authenticated user
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

/**
 * Middleware that requires a valid JWT access token.
 * Extracts token from Authorization header or httpOnly cookie.
 * Attaches decoded payload to req.user.
 */
export function requireAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  try {
    const token = extractToken(req);

    if (!token) {
      throw new UnauthorizedError("No authentication token provided");
    }

    const payload = verifyAccessToken(token);
    req.user = payload;
    next();
  } catch (error: unknown) {
    if (error instanceof UnauthorizedError) {
      next(error);
      return;
    }

    // JWT-specific errors
    const err = error as { name?: string };
    if (err.name === "TokenExpiredError") {
      next(new UnauthorizedError("Access token expired"));
      return;
    }
    if (err.name === "JsonWebTokenError") {
      next(new UnauthorizedError("Invalid access token"));
      return;
    }

    next(new UnauthorizedError("Authentication failed"));
  }
}

/**
 * Extract JWT from Authorization header (Bearer) or cookie.
 */
function extractToken(req: Request): string | null {
  // 1. Try Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }

  // 2. Try httpOnly cookie
  const cookieToken = req.cookies?.['accessToken'] as string | undefined;
  if (cookieToken) {
    return cookieToken;
  }

  return null;
}
