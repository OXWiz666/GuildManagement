import type { Context } from "hono";
import { getCookie, setCookie } from "hono/cookie";

const isProd = process.env.NODE_ENV === "production";

export const REFRESH_COOKIE = "refreshToken";
export const ACCESS_COOKIE = "accessToken";

const baseCookieOptions = {
  httpOnly: true,
  secure: isProd,
  sameSite: (isProd ? "Strict" : "Lax") as "Strict" | "Lax",
  path: "/",
};

/** Read the httpOnly refresh token from the request cookies. */
export function getRefreshToken(c: Context): string | undefined {
  return getCookie(c, REFRESH_COOKIE);
}

/** Set the 7-day httpOnly refresh cookie on the response. */
export function setRefreshCookie(c: Context, token: string): void {
  setCookie(c, REFRESH_COOKIE, token, { ...baseCookieOptions, maxAge: 7 * 24 * 60 * 60 });
}

/** Clear the refresh cookie (logout). */
export function clearRefreshCookie(c: Context): void {
  setCookie(c, REFRESH_COOKIE, "", { ...baseCookieOptions, maxAge: 0 });
}

export interface ClientInfo {
  ipAddress: string | undefined;
  userAgent: string | undefined;
}

/**
 * Parse a JSON request body, returning `{}` when the body is empty or invalid —
 * parity with the previous `readJson` helper (Express's `express.json()`
 * tolerated empty bodies). Used for endpoints that take an optional/absent body
 * or validate after merging in route params, where `zBody` doesn't fit.
 */
export async function readJson<T = Record<string, unknown>>(c: Context): Promise<T> {
  try {
    return (await c.req.json()) as T;
  } catch {
    return {} as T;
  }
}

/**
 * Extract client IP + user-agent for audit logging, mirroring the previous
 * `getClientInfo` helper. Behind Vercel/most proxies the client IP arrives in
 * `x-forwarded-for` (first hop); `x-real-ip` is a fallback.
 */
export function getClientInfo(c: Context): ClientInfo {
  const forwarded = c.req.header("x-forwarded-for");
  const ipAddress =
    forwarded?.split(",")[0]?.trim() || c.req.header("x-real-ip") || undefined;
  return {
    ipAddress,
    userAgent: c.req.header("user-agent") ?? undefined,
  };
}
