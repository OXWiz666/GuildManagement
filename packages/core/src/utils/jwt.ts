import jwt from "jsonwebtoken";
import crypto from "crypto";
import { env } from "../config/env";
import type { JwtPayload } from "@guild/shared";

/**
 * Generate a short-lived access token (15 min by default).
 */
export function generateAccessToken(payload: {
  userId: string;
  email: string;
}): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRY as any,
  });
}

/**
 * Generate a long-lived refresh token (7 days by default).
 * Contains userId + familyId for rotation tracking.
 */
export function generateRefreshToken(payload: {
  userId: string;
  familyId: string;
}): string {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRY as any,
  });
}

/**
 * Verify and decode an access token.
 * Throws on invalid/expired tokens.
 */
export function verifyAccessToken(token: string): JwtPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as JwtPayload;
}

/**
 * Verify and decode a refresh token.
 * Returns userId and familyId.
 */
export function verifyRefreshToken(
  token: string,
): { userId: string; familyId: string } {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as {
    userId: string;
    familyId: string;
  };
}

/**
 * Hash a token with SHA-256 for secure database storage.
 * We never store raw tokens — only their hashes.
 */
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Generate a cryptographically secure random token.
 * Used for password reset tokens, etc.
 */
export function generateRandomToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Parse JWT expiry string to milliseconds.
 */
export function parseExpiryToMs(expiry: string): number {
  const match = expiry.match(/^(\d+)([smhd])$/);
  if (!match) throw new Error(`Invalid expiry format: ${expiry}`);

  const value = parseInt(match[1]!, 10);
  const unit = match[2]!;

  const multipliers: Record<string, number> = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };

  return value * (multipliers[unit] ?? 0);
}
