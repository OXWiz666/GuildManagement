import type { NextRequest } from "next/server";
import { services, env, BadRequestError, UnauthorizedError } from "@guild/core";
import { withApi, ok } from "@/server/respond";
import { getClientInfo, readJson, setRefreshCookie } from "@/server/request";
import { authLimit } from "@/server/ratelimit";

export const runtime = "nodejs";

export const POST = withApi(async (req: NextRequest) => {
  authLimit(req);
  const { token } = await readJson<{ token?: unknown }>(req);
  if (!token || typeof token !== "string") {
    throw new BadRequestError("Token is required");
  }

  // Verify the Supabase-issued token against Supabase's user endpoint.
  const supaRes = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: env.SUPABASE_KEY },
  });

  if (!supaRes.ok) {
    throw new UnauthorizedError("Invalid Supabase token");
  }

  const supabaseUser = (await supaRes.json()) as {
    id?: string;
    email?: string;
    user_metadata?: { display_name?: string; full_name?: string };
  };

  if (!supabaseUser.id || !supabaseUser.email) {
    throw new BadRequestError("Invalid user data from Supabase");
  }

  const email = supabaseUser.email;
  const displayName =
    supabaseUser.user_metadata?.display_name ||
    supabaseUser.user_metadata?.full_name ||
    email.split("@")[0]!;

  const { ipAddress, userAgent } = getClientInfo(req);
  const result = await services.auth.supabaseSync(
    { id: supabaseUser.id, email, displayName },
    ipAddress,
    userAgent,
  );

  const res = ok({ user: result.user, accessToken: result.tokens.accessToken });
  setRefreshCookie(res, result.tokens.refreshToken);
  return res;
});
