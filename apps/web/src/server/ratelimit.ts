import type { NextRequest } from "next/server";
import { TooManyRequestsError } from "@guild/core";
import { getClientInfo } from "./request";

/**
 * In-memory fixed-window rate limiting — the Route Handler equivalent of the
 * Express `express-rate-limit` middleware. Note: counters live in the process,
 * so limits are per-instance (fine for single-instance / self-host, the same
 * tradeoff the in-memory `cache` already makes). For multi-instance serverless,
 * swap the store for a shared backend (e.g. Upstash) behind this same API.
 */
interface Bucket {
  count: number;
  resetAt: number;
}

const store = new Map<string, Bucket>();

function ipKey(req: NextRequest): string {
  return `ip:${getClientInfo(req).ipAddress ?? "unknown"}`;
}

function userOrIpKey(req: NextRequest, userId?: string): string {
  return userId ? `user:${userId}` : ipKey(req);
}

function enforce(
  bucketName: string,
  key: string,
  windowMs: number,
  max: number,
  message: string,
): void {
  const now = Date.now();
  const fullKey = `${bucketName}:${key}`;
  const existing = store.get(fullKey);

  if (!existing || existing.resetAt <= now) {
    store.set(fullKey, { count: 1, resetAt: now + windowMs });
    return;
  }

  existing.count += 1;
  if (existing.count > max) {
    throw new TooManyRequestsError(message);
  }
}

// ─── Named limiters (match the Express definitions) ──────────

/** Auth endpoints: 10 requests / 15 min / IP. */
export function authLimit(req: NextRequest): void {
  enforce(
    "auth",
    ipKey(req),
    15 * 60 * 1000,
    10,
    "Too many authentication attempts. Please try again later.",
  );
}

/** Attendance check-in (anti-brute-force): 5 requests / 5 min / IP. */
export function checkInLimit(req: NextRequest): void {
  enforce(
    "checkin",
    ipKey(req),
    5 * 60 * 1000,
    5,
    "Too many check-in attempts. Please try again later.",
  );
}

/** Audit logs (DB-intensive): 15 requests / min / IP. */
export function auditLogLimit(req: NextRequest): void {
  enforce(
    "audit",
    ipKey(req),
    60 * 1000,
    15,
    "Too many audit log requests. Please try again in a minute.",
  );
}

/** Dashboard reads: 60 requests / min / user. */
export function dashboardLimit(req: NextRequest, userId?: string): void {
  enforce(
    "dashboard",
    userOrIpKey(req, userId),
    60 * 1000,
    60,
    "Too many dashboard requests. Please slow down.",
  );
}

/** Search / lookup: 20 requests / min / user. */
export function searchLimit(req: NextRequest, userId?: string): void {
  enforce(
    "search",
    userOrIpKey(req, userId),
    60 * 1000,
    20,
    "Too many search requests. Please slow down.",
  );
}

/** Attendance submissions: 10 requests / min / user. */
export function attendanceSubmitLimit(req: NextRequest, userId?: string): void {
  enforce(
    "attendance",
    userOrIpKey(req, userId),
    60 * 1000,
    10,
    "Too many attendance submissions. Please wait a moment.",
  );
}
