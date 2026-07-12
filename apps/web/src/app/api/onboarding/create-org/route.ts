import type { NextRequest } from "next/server";
import { services } from "@guild/core";
import { leaderOnboardingSchema } from "@guild/shared";
import { withApi, ok } from "@/server/respond";
import { requireAuth } from "@/server/guards";
import { getClientInfo, readJson } from "@/server/request";

export const runtime = "nodejs";

// Self-serve org creation from the in-app onboarding screen. An authenticated,
// unaffiliated user chooses "Create a Guild" or "Create a Faction"; the service
// validates the payload and enforces the unaffiliated-only guard.
export const POST = withApi(async (req: NextRequest) => {
  const user = requireAuth(req);
  const input = leaderOnboardingSchema.parse(await readJson(req));
  const { ipAddress, userAgent } = getClientInfo(req);
  const result = await services.onboarding.createOrgSelfServe(user.userId, input, {
    ipAddress,
    userAgent,
  });
  return ok(result);
});
