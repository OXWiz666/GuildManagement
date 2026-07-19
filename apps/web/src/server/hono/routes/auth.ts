import { Hono } from "hono";
import { services, env, BadRequestError, UnauthorizedError } from "@guild/core";
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  resolveIdentifierSchema,
  updateUserSchema,
  updateCharacterProfileSchema,
  combatPowerSchema,
  uploadProfileImageSchema,
  addPaymentMethodSchema,
  leaderOnboardingSchema,
} from "@guild/shared";
import type { AppEnv } from "../env";
import { ok, okEmpty } from "../respond";
import { getClientInfo, readJson, getRefreshToken, setRefreshCookie, clearRefreshCookie } from "../request";
import { zBody } from "../validation";
import { requireAuth } from "../middleware/auth";
import { authLimit, lookupLimit } from "../middleware/ratelimit";

/**
 * Auth domain — Hono port of apps/web/src/app/api/auth/**. Preserves the
 * rate-limited public endpoints, the httpOnly refresh-cookie set/clear on
 * login/register/refresh/logout, and the Supabase-token sync flow.
 */
export const auth = new Hono<AppEnv>()
  // ─── Public availability / lookup ────────────────────────────
  .get("/email-registered", async (c) => {
    lookupLimit(c);
    const email = c.req.query("email");
    if (!email) throw new BadRequestError("email is required");
    return ok(c, await services.auth.checkEmailRegistered(email));
  })
  .get("/username-available", async (c) => {
    lookupLimit(c);
    const username = c.req.query("username");
    if (!username) throw new BadRequestError("username is required");
    return ok(c, await services.auth.checkUsernameAvailable(username));
  })
  .post("/resolve-identifier", zBody(resolveIdentifierSchema), async (c) => {
    authLimit(c);
    const email = await services.auth.resolveLoginIdentifier(c.req.valid("json").identifier);
    return ok(c, { email });
  })

  // ─── Password reset ──────────────────────────────────────────
  .post("/forgot-password", zBody(forgotPasswordSchema), async (c) => {
    authLimit(c);
    const { ipAddress, userAgent } = getClientInfo(c);
    await services.auth.forgotPassword(c.req.valid("json").email, ipAddress, userAgent);
    return ok(c, { message: "If an account with that email exists, a reset link has been sent." });
  })
  .post("/reset-password", zBody(resetPasswordSchema), async (c) => {
    authLimit(c);
    const data = c.req.valid("json");
    const { ipAddress, userAgent } = getClientInfo(c);
    await services.auth.resetPassword(data.token, data.password, ipAddress, userAgent);
    return ok(c, { message: "Password has been reset. Please log in with your new password." });
  })

  // ─── Login / register / refresh / logout (cookie-bearing) ────
  .post("/login", zBody(loginSchema), async (c) => {
    authLimit(c);
    const data = c.req.valid("json");
    const { ipAddress, userAgent } = getClientInfo(c);
    const result = await services.auth.login(data.email, data.password, ipAddress, userAgent);
    setRefreshCookie(c, result.tokens.refreshToken);
    return ok(c, { user: result.user, accessToken: result.tokens.accessToken });
  })
  .post("/register", zBody(registerSchema), async (c) => {
    authLimit(c);
    const data = c.req.valid("json");
    const { ipAddress, userAgent } = getClientInfo(c);
    const result = await services.auth.register(data.email, data.password, data.displayName, ipAddress, userAgent);
    setRefreshCookie(c, result.tokens.refreshToken);
    return ok(c, { user: result.user, accessToken: result.tokens.accessToken }, 201);
  })
  .post("/refresh", async (c) => {
    const body = await readJson<{ refreshToken?: string }>(c);
    const refreshToken = getRefreshToken(c) || body.refreshToken;
    if (!refreshToken || typeof refreshToken !== "string") {
      throw new UnauthorizedError("No refresh token provided");
    }
    const { ipAddress, userAgent } = getClientInfo(c);
    const tokens = await services.auth.refreshTokens(refreshToken, ipAddress, userAgent);
    setRefreshCookie(c, tokens.refreshToken);
    return ok(c, { accessToken: tokens.accessToken });
  })
  .post("/logout", requireAuth, async (c) => {
    const user = c.get("user");
    const body = await readJson<{ refreshToken?: string }>(c);
    const refreshToken = getRefreshToken(c) || body.refreshToken;
    if (refreshToken && typeof refreshToken === "string") {
      const { ipAddress, userAgent } = getClientInfo(c);
      await services.auth.logout(refreshToken, user.userId, ipAddress, userAgent);
    }
    clearRefreshCookie(c);
    return okEmpty(c);
  })
  .post("/logout-all", requireAuth, async (c) => {
    const user = c.get("user");
    const { ipAddress, userAgent } = getClientInfo(c);
    await services.auth.logoutAllDevices(user.userId, ipAddress, userAgent);
    clearRefreshCookie(c);
    return okEmpty(c);
  })

  // ─── Supabase token sync ─────────────────────────────────────
  .post("/supabase-sync", async (c) => {
    authLimit(c);
    const { token } = await readJson<{ token?: unknown }>(c);
    if (!token || typeof token !== "string") {
      throw new BadRequestError("Token is required");
    }

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

    const onboarding = leaderOnboardingSchema.safeParse({
      accountType: meta.account_type,
      guildName: meta.guild_name,
      factionName: meta.faction_name,
    });

    const { ipAddress, userAgent } = getClientInfo(c);
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

    setRefreshCookie(c, result.tokens.refreshToken);
    return ok(c, { user: result.user, accessToken: result.tokens.accessToken });
  })

  // ─── Current user profile ────────────────────────────────────
  .get("/me", requireAuth, async (c) => {
    return ok(c, { user: await services.auth.getCurrentUser(c.get("user").userId) });
  })
  .put("/me", requireAuth, zBody(updateUserSchema), async (c) => {
    const me = await services.auth.updateUserProfile(c.get("user").userId, c.req.valid("json"));
    return ok(c, { user: me });
  })
  .put("/me/avatar", requireAuth, zBody(uploadProfileImageSchema), async (c) => {
    const me = await services.auth.updateAvatar(c.get("user").userId, c.req.valid("json").dataUrl);
    return ok(c, { user: me });
  })
  .put("/me/banner", requireAuth, zBody(uploadProfileImageSchema), async (c) => {
    const me = await services.auth.updateBanner(c.get("user").userId, c.req.valid("json").dataUrl);
    return ok(c, { user: me });
  })
  .put("/me/character", requireAuth, zBody(updateCharacterProfileSchema), async (c) => {
    const me = await services.auth.updateCharacterProfile(c.get("user").userId, c.req.valid("json"));
    return ok(c, { user: me });
  })
  .put("/me/cp", requireAuth, zBody(combatPowerSchema), async (c) => {
    const me = await services.auth.updateCharacterProfile(c.get("user").userId, { cp: c.req.valid("json").cp });
    return ok(c, { cp: me.cp });
  })
  .post("/me/payment-methods", requireAuth, zBody(addPaymentMethodSchema), async (c) => {
    const method = await services.auth.addPaymentMethod(c.get("user").userId, c.req.valid("json"));
    return ok(c, { method }, 201);
  })
  .delete("/me/payment-methods/:methodId", requireAuth, async (c) => {
    return ok(c, await services.auth.removePaymentMethod(c.get("user").userId, c.req.param("methodId")));
  })

  // ─── Sessions ────────────────────────────────────────────────
  .get("/sessions", requireAuth, async (c) => {
    const { ipAddress } = getClientInfo(c);
    const sessions = await services.auth.getUserSessions(c.get("user").userId, ipAddress);
    return ok(c, { sessions });
  })
  .delete("/sessions/:id", requireAuth, async (c) => {
    const { ipAddress, userAgent } = getClientInfo(c);
    await services.auth.revokeSession(c.req.param("id"), c.get("user").userId, ipAddress, userAgent);
    return okEmpty(c);
  });
