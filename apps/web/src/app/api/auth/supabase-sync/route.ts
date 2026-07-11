import type { NextRequest } from "next/server";
import { services, env, BadRequestError, UnauthorizedError } from "@guild/core";
import { leaderOnboardingSchema } from "@guild/shared";
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
    user_metadata?: {
      display_name?: string;
      full_name?: string;
      username?: string;
      account_type?: string;
      guild_name?: string;
      faction_name?: string;
    };
  };

  if (!supabaseUser.id || !supabaseUser.email) {
    throw new BadRequestError("Invalid user data from Supabase");
  }

  const email = supabaseUser.email;
  const meta = supabaseUser.user_metadata ?? {};
  const displayName = meta.display_name || meta.full_name || email.split("@")[0]!;

  // Leader onboarding intent, stashed in user_metadata at signUp. Only honoured
  // on the first sync (auth.supabaseSync ignores it once the user exists). If it
  // fails validation we simply treat the account as a plain member.
  const onboarding = leaderOnboardingSchema.safeParse({
    accountType: meta.account_type,
    guildName: meta.guild_name,
    factionName: meta.faction_name,
  });

  const { ipAddress, userAgent } = getClientInfo(req);
  const result = await services.auth.supabaseSync(
    {
      id: supabaseUser.id,
      email,
      displayName,
      username: meta.username ?? null,
      onboarding: onboarding.success ? onboarding.data : null,
    },
    ipAddress,
    userAgent,
  );

  const res = ok({ user: result.user, accessToken: result.tokens.accessToken });
  setRefreshCookie(res, result.tokens.refreshToken);
  return res;
});
