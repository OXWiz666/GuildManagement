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
import type {
  AuthResponse,
  UserPublic,
  UserWithGuilds,
  SessionInfo,
  TokenPair,
  PaymentMethodEntry,
} from "@guild/shared";

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

  // Create user
  const user = await prisma.user.create({
    data: {
      email: email.toLowerCase(),
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
  // Find user
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
  });

  if (!user || !user.isActive) {
    throw new UnauthorizedError("Invalid email or password");
  }

  // Compare password with bcrypt
  const isValid = await bcrypt.compare(password, user.passwordHash);

  if (!isValid) {
    throw new UnauthorizedError("Invalid email or password");
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
    // Set on the very first sign-up sync when the user chose a leader account
    // type. Ignored on every subsequent sync (the user already exists).
    onboarding?: LeaderOnboardingInput | null;
  },
  ipAddress?: string,
  userAgent?: string,
): Promise<AuthResponse> {
  // Find user by email
  let user = await prisma.user.findUnique({
    where: { email: supabaseUser.email.toLowerCase() },
  });

  if (!user) {
    // Create new user using the Supabase ID to keep them aligned
    user = await prisma.user.create({
      data: {
        id: supabaseUser.id,
        email: supabaseUser.email.toLowerCase(),
        passwordHash: "", // Empty hash for Supabase users
        displayName: supabaseUser.displayName,
      },
    });

    // Write registration audit log
    await writeAuditLog({
      actorId: user.id,
      action: AUDIT_ACTIONS.USER_REGISTERED,
      target: "User",
      targetId: user.id,
      detail: { email: user.email, displayName: user.displayName, provider: "supabase" },
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
    // Optionally update display name if it changed
    if (user.displayName !== supabaseUser.displayName) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { displayName: supabaseUser.displayName },
      });
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
    avatarUrl?: string | null;
    password?: string;
    ign?: string | null;
    cp?: number | null;
    class?: string | null;
    weapon?: string | null;
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
  if (data.avatarUrl !== undefined) updateData.avatarUrl = data.avatarUrl;
  if (data.ign !== undefined) updateData.ign = data.ign;
  if (data.cp !== undefined) updateData.cp = data.cp;
  if (data.class !== undefined) updateData.class = data.class;
  if (data.weapon !== undefined) updateData.weapon = data.weapon;

  if (data.password) {
    updateData.passwordHash = await bcrypt.hash(data.password, env.BCRYPT_ROUNDS);
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: updateData
  });

  return toUserPublic(user);
}

/**
 * Update the member's Combat Power everywhere it's shown. CP is a character-wide
 * stat, so we set it on the user profile AND sync every guild membership in one
 * transaction (rosters, market, faction all read GuildMember.cp).
 */
export async function updateCombatPower(userId: string, cp: number) {
  const [user] = await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { cp } }),
    prisma.guildMember.updateMany({ where: { userId }, data: { cp } }),
  ]);
  return { cp: user.cp };
}

function toUserPublic(user: any): UserPublic {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
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
