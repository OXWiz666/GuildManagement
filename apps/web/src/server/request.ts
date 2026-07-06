import { NextResponse, type NextRequest } from "next/server";

const isProd = process.env.NODE_ENV === "production";

export const REFRESH_COOKIE = "refreshToken";
export const ACCESS_COOKIE = "accessToken";

export interface ClientInfo {
  ipAddress: string | undefined;
  userAgent: string | undefined;
}

/**
 * Extract client IP + user-agent for audit logging, mirroring the Express
 * `getClientInfo` helper. Behind Vercel/most proxies the client IP arrives in
 * `x-forwarded-for` (first hop); `x-real-ip` is a fallback.
 */
export function getClientInfo(req: NextRequest): ClientInfo {
  const forwarded = req.headers.get("x-forwarded-for");
  const ipAddress =
    forwarded?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    undefined;
  return {
    ipAddress,
    userAgent: req.headers.get("user-agent") ?? undefined,
  };
}

/** Read the httpOnly refresh token from the request cookies (or body fallback). */
export function getRefreshToken(req: NextRequest): string | undefined {
  return req.cookies.get(REFRESH_COOKIE)?.value;
}

/**
 * Parse a JSON request body, returning `{}` when the body is empty or invalid.
 * Express's `express.json()` tolerated empty bodies; `req.json()` throws, so
 * this keeps parity for endpoints that accept an optional/absent body.
 */
export async function readJson<T = Record<string, unknown>>(req: NextRequest): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    return {} as T;
  }
}

const baseCookieOptions = {
  httpOnly: true,
  secure: isProd,
  sameSite: isProd ? ("strict" as const) : ("lax" as const),
  path: "/",
};

/** Set the 7-day httpOnly refresh cookie on a response (parity with auth.routes). */
export function setRefreshCookie(res: NextResponse, token: string): NextResponse {
  res.cookies.set(REFRESH_COOKIE, token, {
    ...baseCookieOptions,
    maxAge: 7 * 24 * 60 * 60, // 7 days (seconds)
  });
  return res;
}

/** Clear the refresh cookie (logout). */
export function clearRefreshCookie(res: NextResponse): NextResponse {
  res.cookies.set(REFRESH_COOKIE, "", { ...baseCookieOptions, maxAge: 0 });
  return res;
}
