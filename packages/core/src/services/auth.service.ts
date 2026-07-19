import bcrypt from "bcryptjs";
import crypto from "crypto";
import { prisma } from "@guild/db";
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  hashToken,
  generateRandomToken,
  parseExpiryToMs,
} from "../utils/jwt";
import {
  UnauthorizedError,
  ConflictError,
  NotFoundError,
  BadRequestError,
} from "../utils/errors";
import { writeAuditLog } from "./audit.service";
import { createOrgForUser } from "./onboarding.service";
import { AUDIT_ACTIONS, type LeaderOnboardingInput } from "@guild/shared";
import { env } from "../config/env";
import { broadcastToGuild } from "../lib/socket";
import { cache as redisCache } from "../lib/redis";
import { cacheKeys } from "../lib/cache-keys";
import { publicUrl, uploadObject } from "../lib/supabaseStorage";
import type {
  AuthResponse,
  UserPublic,
  UserWithGuilds,
  SessionInfo,
  TokenPair,
  PaymentMethodEntry,
} from "@guild/shared";

// ─── Username ────────────────────────────────────

const USERNAME_PATTERN = /^[a-z][a-z0-9_]{2,19}$/;

async function invalidateDiscordActorCacheForUser(userId: string, discordIds: Array<string | null | undefined>) {
  const ids = [...new Set(discordIds.filter((value): value is string => Boolean(value)))];
  if (ids.length === 0) return;

  const memberships = await prisma.guildMember.findMany({
    where: { userId },
    select: { guildId: true },
  });
  if (memberships.length === 0) return;

  await redisCache.delMany(
    ids.flatMap((discordId) => memberships.map((member) => cacheKeys.discordActor(discordId, member.guildId))),
  );
}

function sanitizeUsernameBase(input: string): string {
  let base = input.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 16);
  if (!/^[a-z]/.test(base)) base = `u${base}`;
  return base.length >= 3 ? base : `${base}user`.slice(0, 16);
}

/**
 * Generate a unique, valid username from a starting point (usually the
 * display name) — used whenever a caller didn't supply one (OAuth sign-in,
 * legacy register route) or the one they chose collided.
 */
async function generateUniqueUsername(base: string): Promise<string> {
  const cleanBase = sanitizeUsernameBase(base);
  let candidate = cleanBase;
  let suffix = 0;
  // Bounded loop — collisions this deep are astronomically unlikely; bail to
  // a random suffix rather than looping forever.
  while (suffix < 50) {
    const existing = await prisma.user.findUnique({ where: { username: candidate }, select: { id: true } });
    if (!existing) return candidate;
    suffix += 1;
    candidate = `${cleanBase}${suffix}`.slice(0, 20);
  }
  return `${cleanBase}${crypto.randomBytes(3).toString("hex")}`.slice(0, 20);
}

/**
 * Check whether a username is available (valid format + not taken). Used by
 * the register form before signup so the user finds out immediately rather
 * than after their Supabase account is already created.
 */
export async function checkUsernameAvailable(rawUsername: string): Promise<{ available: boolean; reason?: string }> {
  const username = rawUsername.trim().toLowerCase();
  if (!USERNAME_PATTERN.test(username)) {
    return { available: false, reason: "Username must start with a letter and be 3-20 lowercase letters, numbers, or underscores" };
  }
  const existing = await prisma.user.findUnique({ where: { username }, select: { id: true } });
  return { available: !existing, reason: existing ? "That username is already taken" : undefined };
}

/**
 * Check whether an email already belongs to a *confirmed* account, using our
 * own DB as the source of truth instead of Supabase's signUp() response.
 * Supabase's anti-enumeration behavior (an empty `identities` array on the
 * returned user) is meant to signal "already registered", but re-signing-up
 * an already-confirmed email can still come back looking like a fresh,
 * pending signup client-side — leading a returning user to think they reset
 * their password when they didn't. The register form calls this first so
 * that case is caught deterministically before Supabase is ever involved.
 */
export async function checkEmailRegistered(rawEmail: string): Promise<{ registered: boolean }> {
  const email = rawEmail.trim().toLowerCase();
  const existing = await prisma.user.findUnique({
    where: { email },
    select: { emailVerifiedAt: true },
  });
  return { registered: Boolean(existing?.emailVerifiedAt) };
}

/**
 * Resolve a login identifier (username or email) to the real email address
 * Supabase/the legacy login need. Anything containing "@" is treated as an
 * email as-is (no lookup — avoids a pointless query and false negatives for
 * an email that isn't a username-lookup hit). Returns null if a username
 * identifier doesn't match any account (caller shows a generic error —
 * never reveals whether the username specifically exists).
 */
export async function resolveLoginIdentifier(identifier: string): Promise<string | null> {
  const trimmed = identifier.trim();
  if (trimmed.includes("@")) return trimmed.toLowerCase();
  const user = await prisma.user.findUnique({
    where: { username: trimmed.toLowerCase() },
    select: { email: true },
  });
  return user?.email ?? null;
}

// ─── Registration ───────────────────────────────

export async function register(
  email: string,
  password: string,
  displayName: string,
  ipAddress?: string,
  userAgent?: string,
): Promise<AuthResponse> {
  // Check if email already exists
  const existingUser = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
  });

  if (existingUser) {
    throw new ConflictError("An account with this email already exists");
  }

  // Hash password with bcrypt
  const passwordHash = await bcrypt.hash(password, env.BCRYPT_ROUNDS);
  const username = await generateUniqueUsername(displayName);

  // Create user
  const user = await prisma.user.create({
    data: {
      email: email.toLowerCase(),
      username,
      passwordHash,
      displayName,
    },
  });

  // Generate token pair
  const tokens = await createTokenPair(
    user.id,
    user.email,
    ipAddress,
    userAgent,
  );

  // Create session and audit log in parallel (independent post-registration writes)
  await Promise.all([
    prisma.session.create({
      data: {
        userId: user.id,
        deviceInfo: userAgent ?? null,
        ipAddress: ipAddress ?? null,
      },
    }),
    writeAuditLog({
      actorId: user.id,
      action: AUDIT_ACTIONS.USER_REGISTERED,
      target: "User",
      targetId: user.id,
      detail: { email: user.email, displayName },
      ipAddress,
      userAgent,
    }),
  ]);

  return {
    user: toUserPublic(user),
    tokens,
  };
}

// ─── Login ──────────────────────────────────────

export async function login(
  email: string,
  password: string,
  ipAddress?: string,
  userAgent?: string,
): Promise<AuthResponse> {
  const resolvedEmail = await resolveLoginIdentifier(email);
  if (!resolvedEmail) {
    throw new UnauthorizedError("Invalid email or password");
  }

  // Find user
  const user = await prisma.user.findUnique({
    where: { email: resolvedEmail },
  });

  if (!user || !user.isActive) {
    throw new UnauthorizedError("Invalid email or password");
  }

  // Compare password with bcrypt
  const isValid = await bcrypt.compare(password, user.passwordHash);

  if (!isValid) {
    throw new UnauthorizedError("Invalid email or password");
  }

  // Checked only after a correct password (never before) so a wrong-password
  // guess can't be used to probe whether an account is verified.
  if (!user.emailVerifiedAt) {
    throw new UnauthorizedError("Please verify your email before logging in");
  }

  // Generate token pair
  const tokens = await createTokenPair(
    user.id,
    user.email,
    ipAddress,
    userAgent,
  );

  // Create session and audit log in parallel
  await Promise.all([
    prisma.session.create({
      data: {
        userId: user.id,
        deviceInfo: userAgent ?? null,
        ipAddress: ipAddress ?? null,
      },
    }),
    writeAuditLog({
      actorId: user.id,
      action: AUDIT_ACTIONS.USER_LOGIN,
      target: "User",
      targetId: user.id,
      ipAddress,
      userAgent,
    }),
  ]);

  return {
    user: toUserPublic(user),
    tokens,
  };
}

// ─── Supabase Session Syncing ───────────────────

export async function supabaseSync(
  supabaseUser: {
    id: string;
    email: string;
    displayName: string;
    // Chosen at signup (Register form). Optional because OAuth sign-ins
    // (Discord) never go through that form — those get an auto-generated
    // username instead.
    username?: string | null;
    discord?: {
      id: string;
      username: string | null;
    } | null;
    // Set on the very first sign-up sync when the user chose a leader account
    // type. Ignored on every subsequent sync (the user already exists).
    onboarding?: LeaderOnboardingInput | null;
  },
  ipAddress?: string,
  userAgent?: string,
): Promise<AuthResponse> {
  // Discord OAuth should resolve to an already-linked ForgeKeep account even
  // when the Discord email differs from the account email the member originally
  // registered with. Fall back to email for password/email and unlinked OAuth.
  let user = supabaseUser.discord?.id
    ? await prisma.user.findUnique({ where: { discordId: supabaseUser.discord.id } })
    : null;
  user ??= await prisma.user.findUnique({
    where: { email: supabaseUser.email.toLowerCase() },
  });

  if (!user) {
    // Prefer the username chosen at registration; fall back to a generated
    // one if absent (OAuth) or it lost the race to someone else since the
    // client-side availability check.
    let username: string;
    const requested = supabaseUser.username?.trim().toLowerCase();
    if (requested && USERNAME_PATTERN.test(requested) && !(await prisma.user.findUnique({ where: { username: requested }, select: { id: true } }))) {
      username = requested;
    } else {
      username = await generateUniqueUsername(supabaseUser.displayName);
    }

    // Create new user using the Supabase ID to keep them aligned
    user = await prisma.user.create({
      data: {
        id: supabaseUser.id,
        email: supabaseUser.email.toLowerCase(),
        username,
        passwordHash: "", // Empty hash for Supabase users
        displayName: supabaseUser.displayName,
        discordId: supabaseUser.discord?.id ?? null,
        discordUsername: supabaseUser.discord?.username ?? null,
        discordLinkedAt: supabaseUser.discord?.id ? new Date() : null,
        // Supabase already gates this account behind its own confirmation
        // (email/OAuth) before a session can ever reach here, so it's
        // considered verified for our purposes too.
        emailVerifiedAt: new Date(),
      },
    });

    // Write registration audit log
    await writeAuditLog({
      actorId: user.id,
      action: AUDIT_ACTIONS.USER_REGISTERED,
      target: "User",
      targetId: user.id,
      detail: {
        email: user.email,
        displayName: user.displayName,
        provider: "supabase",
        discordLinked: Boolean(supabaseUser.discord?.id),
      },
      ipAddress,
      userAgent,
    });

    // Self-serve leader onboarding: create the guild/faction they chose at
    // signup. Runs only here (user was just created), so it happens exactly
    // once. Best-effort — never block account creation on org setup failure.
    if (supabaseUser.onboarding && supabaseUser.onboarding.accountType !== "MEMBER") {
      try {
        await createOrgForUser(
          { id: user.id, displayName: user.displayName },
          supabaseUser.onboarding,
          { ipAddress, userAgent },
        );
      } catch (err) {
        console.error("[onboarding] failed to create org for new leader:", err);
      }
    }
  } else {
    const updateData: {
      displayName?: string;
      discordId?: string | null;
      discordUsername?: string | null;
      discordLinkedAt?: Date | null;
    } = {};

    if (user.displayName !== supabaseUser.displayName) {
      updateData.displayName = supabaseUser.displayName;
    }

    if (supabaseUser.discord?.id) {
      const existingDiscordOwner = await prisma.user.findUnique({
        where: { discordId: supabaseUser.discord.id },
        select: { id: true },
      });
      if (existingDiscordOwner && existingDiscordOwner.id !== user.id) {
        throw new ConflictError("This Discord account is already linked to a different ForgeKeep account");
      }

      if (user.discordId && user.discordId !== supabaseUser.discord.id) {
        throw new ConflictError("This ForgeKeep account is already linked to a different Discord account");
      }

      if (user.discordId !== supabaseUser.discord.id || user.discordUsername !== supabaseUser.discord.username) {
        updateData.discordId = supabaseUser.discord.id;
        updateData.discordUsername = supabaseUser.discord.username;
        updateData.discordLinkedAt = user.discordLinkedAt ?? new Date();
      }
    }

    if (Object.keys(updateData).length > 0) {
      const previousDiscordId = user.discordId;
      user = await prisma.user.update({
        where: { id: user.id },
        data: updateData,
      });
      if ("discordId" in updateData) {
        await invalidateDiscordActorCacheForUser(user.id, [previousDiscordId, user.discordId]);
      }
    }
  }

  // Generate tokens for Express API
  const tokens = await createTokenPair(
    user.id,
    user.email,
    ipAddress,
    userAgent,
  );

  // Create session and audit log in parallel
  await Promise.all([
    prisma.session.create({
      data: {
        userId: user.id,
        deviceInfo: userAgent ?? null,
        ipAddress: ipAddress ?? null,
      },
    }),
    writeAuditLog({
      actorId: user.id,
      action: AUDIT_ACTIONS.USER_LOGIN,
      target: "User",
      targetId: user.id,
      ipAddress,
      userAgent,
    }),
  ]);

  return {
    user: toUserPublic(user),
    tokens,
  };
}

// ─── Token Refresh with Rotation ────────────────

export async function refreshTokens(
  rawRefreshToken: string,
  ipAddress?: string,
  userAgent?: string,
): Promise<TokenPair> {
  // Verify the JWT
  let decoded: { userId: string; familyId: string };
  try {
    decoded = verifyRefreshToken(rawRefreshToken);
  } catch {
    throw new UnauthorizedError("Invalid refresh token");
  }

  // Find the token in DB by its hash
  const tokenHash = hashToken(rawRefreshToken);
  const storedToken = await prisma.refreshToken.findUnique({
    where: { tokenHash },
  });

  // Token not found or already revoked → possible replay attack
  if (!storedToken) {
    // Check if this family has any tokens — if so, it was a replay
    const familyTokens = await prisma.refreshToken.findMany({
      where: { familyId: decoded.familyId },
    });

    if (familyTokens.length > 0) {
      // REPLAY ATTACK DETECTED — revoke entire family
      await prisma.refreshToken.updateMany({
        where: { familyId: decoded.familyId },
        data: { isRevoked: true },
      });

      await writeAuditLog({
        actorId: decoded.userId,
        action: AUDIT_ACTIONS.TOKEN_REPLAY_DETECTED,
        detail: { familyId: decoded.familyId },
        ipAddress,
        userAgent,
      });
    }

    throw new UnauthorizedError("Invalid refresh token — possible replay");
  }

  if (storedToken.isRevoked) {
    // Revoked token reuse — revoke entire family
    await prisma.refreshToken.updateMany({
      where: { familyId: storedToken.familyId },
      data: { isRevoked: true },
    });

    await writeAuditLog({
      actorId: decoded.userId,
      action: AUDIT_ACTIONS.TOKEN_REPLAY_DETECTED,
      detail: { familyId: storedToken.familyId, revokedTokenReuse: true },
      ipAddress,
      userAgent,
    });

    throw new UnauthorizedError("Refresh token has been revoked");
  }

  // Revoke the old token (rotation)
  await prisma.refreshToken.update({
    where: { id: storedToken.id },
    data: { isRevoked: true },
  });

  // Get user for access token payload
  const user = await prisma.user.findUnique({
    where: { id: decoded.userId },
  });

  if (!user || !user.isActive) {
    throw new UnauthorizedError("User account is inactive");
  }

  // Issue new pair with SAME family
  const newRefreshTokenStr = generateRefreshToken({
    userId: user.id,
    familyId: storedToken.familyId,
  });
  const newRefreshHash = hashToken(newRefreshTokenStr);
  const expiresAt = new Date(
    Date.now() + parseExpiryToMs(env.JWT_REFRESH_EXPIRY),
  );

  await prisma.refreshToken.create({
    data: {
      tokenHash: newRefreshHash,
      userId: user.id,
      familyId: storedToken.familyId,
      expiresAt,
      deviceInfo: userAgent ?? storedToken.deviceInfo,
      ipAddress: ipAddress ?? storedToken.ipAddress,
    },
  });

  const newAccessToken = generateAccessToken({
    userId: user.id,
    email: user.email,
  });

  // Silent refresh — omitted database logging for TOKEN_REFRESHED to prevent storage bloat

  return {
    accessToken: newAccessToken,
    refreshToken: newRefreshTokenStr,
  };
}

// ─── Logout ─────────────────────────────────────

export async function logout(
  rawRefreshToken: string,
  userId: string,
  ipAddress?: string,
  userAgent?: string,
): Promise<void> {
  const tokenHash = hashToken(rawRefreshToken);

  // Revoke the specific token
  const token = await prisma.refreshToken.findUnique({
    where: { tokenHash },
  });

  if (token) {
    // Revoke entire family for this token
    await prisma.refreshToken.updateMany({
      where: { familyId: token.familyId },
      data: { isRevoked: true },
    });
  }

  // Audit log
  await writeAuditLog({
    actorId: userId,
    action: AUDIT_ACTIONS.USER_LOGOUT,
    ipAddress,
    userAgent,
  });
}

export async function logoutAllDevices(
  userId: string,
  ipAddress?: string,
  userAgent?: string,
): Promise<void> {
  // All three operations are independent — run in parallel
  await Promise.all([
    prisma.refreshToken.updateMany({
      where: { userId },
      data: { isRevoked: true },
    }),
    prisma.session.deleteMany({
      where: { userId },
    }),
    writeAuditLog({
      actorId: userId,
      action: AUDIT_ACTIONS.USER_LOGOUT_ALL,
      ipAddress,
      userAgent,
    }),
  ]);
}

// ─── Password Recovery ──────────────────────────

export async function forgotPassword(
  email: string,
  ipAddress?: string,
  userAgent?: string,
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
  });

  // Always return success to prevent email enumeration
  if (!user) return;

  // Generate reset token
  const rawToken = generateRandomToken();
  const tokenHashValue = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  // Invalidate any existing reset tokens
  await prisma.passwordResetToken.updateMany({
    where: { userId: user.id, usedAt: null },
    data: { usedAt: new Date() },
  });

  // Store new reset token
  await prisma.passwordResetToken.create({
    data: {
      tokenHash: tokenHashValue,
      userId: user.id,
      expiresAt,
    },
  });

  // TODO: Send email with reset link containing rawToken
  // For now, log it in development
  if (env.NODE_ENV === "development") {
    console.log(`\n📧 Password reset token for ${email}: ${rawToken}\n`);
  }

  // Audit log
  await writeAuditLog({
    actorId: user.id,
    action: AUDIT_ACTIONS.PASSWORD_RESET_REQUESTED,
    ipAddress,
    userAgent,
  });
}

export async function resetPassword(
  rawToken: string,
  newPassword: string,
  ipAddress?: string,
  userAgent?: string,
): Promise<void> {
  const tokenHashValue = hashToken(rawToken);

  const resetToken = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: tokenHashValue },
  });

  if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date()) {
    throw new UnauthorizedError("Invalid or expired reset token");
  }

  // Hash new password
  const passwordHash = await bcrypt.hash(newPassword, env.BCRYPT_ROUNDS);

  // Update password and mark token as used in a transaction
  await prisma.$transaction([
    prisma.user.update({
      where: { id: resetToken.userId },
      data: { passwordHash },
    }),
    prisma.passwordResetToken.update({
      where: { id: resetToken.id },
      data: { usedAt: new Date() },
    }),
    // Revoke all refresh tokens — force re-login on all devices
    prisma.refreshToken.updateMany({
      where: { userId: resetToken.userId },
      data: { isRevoked: true },
    }),
  ]);

  // Audit log
  await writeAuditLog({
    actorId: resetToken.userId,
    action: AUDIT_ACTIONS.PASSWORD_RESET_COMPLETED,
    ipAddress,
    userAgent,
  });
}

// ─── User Profile ───────────────────────────────

export async function getCurrentUser(
  userId: string,
): Promise<UserWithGuilds> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      guildMembers: {
        where: { isActive: true },
        include: {
          guild: {
            select: {
              id: true,
              name: true,
              slug: true,
              avatarUrl: true,
              faction: { select: { id: true, name: true } },
            },
          },
        },
      },
      platformAdmin: { select: { role: true, isActive: true } },
    },
  });

  if (!user) {
    throw new NotFoundError("User not found");
  }

  return {
    ...toUserPublic(user),
    guilds: user.guildMembers.map((m) => ({
      guildId: m.guild.id,
      guildName: m.guild.name,
      guildSlug: m.guild.slug,
      guildAvatarUrl: m.guild.avatarUrl,
      factionId: m.guild.faction?.id ?? null,
      factionName: m.guild.faction?.name ?? null,
      role: m.role,
      rankName: m.rankName,
      joinedAt: m.joinedAt.toISOString(),
    })),
    platformRole: user.platformAdmin?.isActive ? user.platformAdmin.role : null,
  };
}

// ─── Sessions ───────────────────────────────────

export async function getUserSessions(
  userId: string,
  currentSessionIp?: string,
): Promise<SessionInfo[]> {
  const sessions = await prisma.session.findMany({
    where: { userId },
    orderBy: { lastActive: "desc" },
  });

  return sessions.map((s) => ({
    id: s.id,
    deviceInfo: s.deviceInfo,
    ipAddress: s.ipAddress,
    lastActive: s.lastActive.toISOString(),
    createdAt: s.createdAt.toISOString(),
    isCurrent: s.ipAddress === currentSessionIp,
  }));
}

export async function revokeSession(
  sessionId: string,
  userId: string,
  ipAddress?: string,
  userAgent?: string,
): Promise<void> {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
  });

  if (!session || session.userId !== userId) {
    throw new NotFoundError("Session not found");
  }

  await prisma.session.delete({
    where: { id: sessionId },
  });

  await writeAuditLog({
    actorId: userId,
    action: AUDIT_ACTIONS.SESSION_REVOKED,
    detail: { sessionId, deviceInfo: session.deviceInfo },
    ipAddress,
    userAgent,
  });
}

// ─── Helpers ────────────────────────────────────

async function createTokenPair(
  userId: string,
  email: string,
  ipAddress?: string,
  userAgent?: string,
): Promise<TokenPair> {
  const familyId = crypto.randomUUID();

  const accessToken = generateAccessToken({ userId, email });
  const refreshToken = generateRefreshToken({ userId, familyId });
  const refreshHash = hashToken(refreshToken);

  const expiresAt = new Date(
    Date.now() + parseExpiryToMs(env.JWT_REFRESH_EXPIRY),
  );

  // Store refresh token hash in DB
  await prisma.refreshToken.create({
    data: {
      tokenHash: refreshHash,
      userId,
      familyId,
      expiresAt,
      deviceInfo: userAgent ?? null,
      ipAddress: ipAddress ?? null,
    },
  });

  return { accessToken, refreshToken };
}

export async function updateUserProfile(
  userId: string,
  data: {
    displayName?: string;
    email?: string;
    password?: string;
  }
) {
  // if email is changing, check if unique
  if (data.email) {
    const existing = await prisma.user.findFirst({
      where: {
        email: data.email.toLowerCase(),
        NOT: { id: userId }
      }
    });
    if (existing) {
      throw new ConflictError("An account with this email already exists");
    }
  }

  const updateData: any = {};
  if (data.displayName !== undefined) updateData.displayName = data.displayName;
  if (data.email !== undefined) updateData.email = data.email.toLowerCase();

  if (data.password) {
    updateData.passwordHash = await bcrypt.hash(data.password, env.BCRYPT_ROUNDS);
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: updateData
  });

  return toUserPublic(user);
}

/** Notifies every guild a user belongs to that their profile card changed,
 *  so open rosters refresh live instead of waiting for staleTime to lapse. */
async function broadcastProfileUpdated(userId: string) {
  const memberships = await prisma.guildMember.findMany({ where: { userId }, select: { guildId: true } });
  await Promise.all(memberships.map((m) => broadcastToGuild(m.guildId, "member_profile_updated", { userId })));
}

const PROFILE_IMAGE_BUCKET = "ProfileImages";
const PROFILE_IMAGE_MAX_BYTES = 8 * 1024 * 1024;
const IMAGE_MIME_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
};

function decodeImageDataUrl(dataUrl: string): { buffer: Buffer; mime: string; ext: string } {
  const match = /^data:(image\/[a-zA-Z+]+);base64,(.+)$/.exec(dataUrl);
  if (!match) throw new BadRequestError("Invalid image data");
  const mime = match[1]!;
  const ext = IMAGE_MIME_EXT[mime];
  if (!ext) throw new BadRequestError("Unsupported image type");
  const buffer = Buffer.from(match[2]!, "base64");
  if (buffer.length === 0) throw new BadRequestError("Empty image");
  if (buffer.length > PROFILE_IMAGE_MAX_BYTES) throw new BadRequestError("Image exceeds 8MB");
  return { buffer, mime, ext };
}

/** Uploads a new avatar image and updates it everywhere the user is shown. */
export async function updateAvatar(userId: string, dataUrl: string) {
  const { buffer, mime, ext } = decodeImageDataUrl(dataUrl);
  const path = `avatars/${userId}-${Date.now()}.${ext}`;
  const uploaded = await uploadObject(PROFILE_IMAGE_BUCKET, path, buffer, mime);
  if (!uploaded) throw new BadRequestError("Failed to upload avatar");

  const avatarUrl = publicUrl(PROFILE_IMAGE_BUCKET, path);
  const user = await prisma.user.update({ where: { id: userId }, data: { avatarUrl } });
  await broadcastProfileUpdated(userId);
  return toUserPublic(user);
}

/** Uploads a new profile banner image and updates it everywhere the user is shown. */
export async function updateBanner(userId: string, dataUrl: string) {
  const { buffer, mime, ext } = decodeImageDataUrl(dataUrl);
  const path = `banners/${userId}-${Date.now()}.${ext}`;
  const uploaded = await uploadObject(PROFILE_IMAGE_BUCKET, path, buffer, mime);
  if (!uploaded) throw new BadRequestError("Failed to upload banner");

  const bannerUrl = publicUrl(PROFILE_IMAGE_BUCKET, path);
  const user = await prisma.user.update({ where: { id: userId }, data: { bannerUrl } });
  await broadcastProfileUpdated(userId);
  return toUserPublic(user);
}

/**
 * Update character-profile fields (IGN / Combat Power / Class / Weapon)
 * everywhere they're shown. These are character-wide stats, so we set them on
 * the user profile AND sync every guild membership in one transaction
 * (rosters, market, faction all read the GuildMember-level copies).
 */
export async function updateCharacterProfile(
  userId: string,
  data: { ign?: string | null; cp?: number | null; class?: string | null; weapon?: string | null },
) {
  const updateData: any = {};
  if (data.ign !== undefined) updateData.ign = data.ign;
  if (data.cp !== undefined) updateData.cp = data.cp;
  if (data.class !== undefined) updateData.class = data.class;
  if (data.weapon !== undefined) updateData.weapon = data.weapon;

  // CP has no dedicated history table — the Members tab's "CP Growth" stat is
  // derived entirely from this audit trail, so it only needs the value right
  // before the change, not a diff of every field.
  const previousUser =
    data.cp !== undefined ? await prisma.user.findUnique({ where: { id: userId }, select: { cp: true } }) : null;

  const [user] = await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: updateData }),
    prisma.guildMember.updateMany({ where: { userId }, data: updateData }),
  ]);

  if (data.cp !== undefined && previousUser && previousUser.cp !== data.cp) {
    const memberships = await prisma.guildMember.findMany({
      where: { userId, isActive: true },
      select: { guildId: true },
    });
    await Promise.all(
      memberships.map((membership) =>
        writeAuditLog({
          actorId: userId,
          guildId: membership.guildId,
          action: "MEMBER_CP_UPDATED",
          target: "GuildMember",
          targetId: userId,
          detail: { oldCp: previousUser.cp, newCp: data.cp },
        }),
      ),
    );
  }

  await broadcastProfileUpdated(userId);
  return toUserPublic(user);
}

function toUserPublic(user: any): UserPublic {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    bannerUrl: user.bannerUrl,
    createdAt: user.createdAt.toISOString(),
    ign: user.ign,
    cp: user.cp,
    class: user.class,
    weapon: user.weapon,
    paymentMethods: Array.isArray(user.paymentMethods) ? user.paymentMethods : [],
  };
}

// ─── Payment methods (member profile QR codes) ──────────────────────

const MAX_PAYMENT_METHODS = 6;

export async function addPaymentMethod(
  userId: string,
  data: { method: string; label?: string; qrDataUrl: string },
): Promise<PaymentMethodEntry> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { paymentMethods: true } });
  if (!user) throw new NotFoundError("User not found");

  const current = Array.isArray(user.paymentMethods) ? (user.paymentMethods as unknown as PaymentMethodEntry[]) : [];
  if (current.length >= MAX_PAYMENT_METHODS) {
    throw new BadRequestError(`You can only save up to ${MAX_PAYMENT_METHODS} payment methods`);
  }

  const entry: PaymentMethodEntry = {
    id: crypto.randomUUID(),
    method: data.method,
    label: data.label?.trim() || null,
    qrUrl: data.qrDataUrl,
    updatedAt: new Date().toISOString(),
  };
  const next = [...current, entry];
  await prisma.user.update({ where: { id: userId }, data: { paymentMethods: next as object } });
  return entry;
}

export async function removePaymentMethod(userId: string, methodId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { paymentMethods: true } });
  if (!user) throw new NotFoundError("User not found");

  const current = Array.isArray(user.paymentMethods) ? (user.paymentMethods as unknown as PaymentMethodEntry[]) : [];
  const next = current.filter((m) => m.id !== methodId);
  if (next.length === current.length) throw new NotFoundError("Payment method not found");

  await prisma.user.update({ where: { id: userId }, data: { paymentMethods: next as object } });
  return { deleted: true };
}
