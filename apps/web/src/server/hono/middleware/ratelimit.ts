import type { Context } from "hono";
import { TooManyRequestsError } from "@guild/core";
import { getClientInfo } from "../request";

/**
 * In-memory fixed-window rate limiting — Hono port of apps/web/src/server/
 * ratelimit.ts. Called imperatively inside handlers (e.g. `dashboardLimit(c,
 * userId)`), matching the previous call sites. Counters are per-process, so
 * limits are per-instance (same tradeoff as the in-memory `cache`); swap the
 * store for a shared backend (e.g. Upstash) for multi-instance serverless.
 */
interface Bucket {
  count: number;
  resetAt: number;
}

const store = new Map<string, Bucket>();

function ipKey(c: Context): string {
  return `ip:${getClientInfo(c).ipAddress ?? "unknown"}`;
}

function userOrIpKey(c: Context, userId?: string): string {
  return userId ? `user:${userId}` : ipKey(c);
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

/** Auth endpoints: 10 requests / 15 min / IP. */
export function authLimit(c: Context): void {
  enforce("auth", ipKey(c), 15 * 60 * 1000, 10, "Too many authentication attempts. Please try again later.");
}

/** Attendance check-in (anti-brute-force): 5 requests / 5 min / IP. */
export function checkInLimit(c: Context): void {
  enforce("checkin", ipKey(c), 5 * 60 * 1000, 5, "Too many check-in attempts. Please try again later.");
}

/** Audit logs (DB-intensive): 15 requests / min / IP. */
export function auditLogLimit(c: Context): void {
  enforce("audit", ipKey(c), 60 * 1000, 15, "Too many audit log requests. Please try again in a minute.");
}

/** Dashboard reads: 60 requests / min / user. */
export function dashboardLimit(c: Context, userId?: string): void {
  enforce("dashboard", userOrIpKey(c, userId), 60 * 1000, 60, "Too many dashboard requests. Please slow down.");
}

/** Search / lookup: 20 requests / min / user. */
export function searchLimit(c: Context, userId?: string): void {
  enforce("search", userOrIpKey(c, userId), 60 * 1000, 20, "Too many search requests. Please slow down.");
}

/** Attendance submissions: 10 requests / min / user. */
export function attendanceSubmitLimit(c: Context, userId?: string): void {
  enforce("attendance", userOrIpKey(c, userId), 60 * 1000, 10, "Too many attendance submissions. Please wait a moment.");
}
