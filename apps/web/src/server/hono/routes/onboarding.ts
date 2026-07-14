import { Hono } from "hono";
import { services } from "@guild/core";
import { leaderOnboardingSchema } from "@guild/shared";
import type { AppEnv } from "../env";
import { ok } from "../respond";
import { getClientInfo } from "../request";
import { zBody } from "../validation";
import { requireAuth } from "../middleware/auth";

/**
 * Onboarding domain — Hono port of apps/web/src/app/api/onboarding. An
 * authenticated, unaffiliated user self-serves guild/faction creation; the
 * service enforces the unaffiliated-only guard.
 */
export const onboarding = new Hono<AppEnv>().post(
  "/create-org",
  requireAuth,
  zBody(leaderOnboardingSchema),
  async (c) => {
    const { ipAddress, userAgent } = getClientInfo(c);
    const result = await services.onboarding.createOrgSelfServe(c.get("user").userId, c.req.valid("json"), { ipAddress, userAgent });
    return ok(c, result);
  },
);
