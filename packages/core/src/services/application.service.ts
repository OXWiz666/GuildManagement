import { prisma } from "@guild/db";
import { JoinRequestStatus, GuildRole } from "@guild/db";
import { hasMinimumRole, type GuildRoleType } from "@guild/shared";
import { writeAuditLog } from "./audit.service";
import { saveEquipmentRows, type EquipmentItemInput } from "./equipment.service";
import { NotFoundError, ForbiddenError, BadRequestError } from "../utils/errors";
import * as crypto from "crypto";

// ─── Types ───────────────────────────────────────

export interface JoinRequestWithUser {
  id: string;
  guildId: string;
  userId: string;
  ign: string;
  cp: number;
  class: string;
  weapon: string;
  status: string;
  gearItems: unknown;
  createdAt: string;
  user: {
    id: string;
    displayName: string;
    email: string;
    avatarUrl: string | null;
  };
}

// Helper to get initials abbreviation from guild name
function getGuildAbbreviation(guildName: string): string {
  const initials = guildName
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .replace(/[^A-Za-z]/g, "")
    .toUpperCase();
  return initials.length >= 2 ? initials : guildName.substring(0, 3).replace(/[^A-Za-z]/g, "").toUpperCase();
}

// ─── Verify Invite Code ──────────────────────────

export async function verifyInviteCode(code: string) {
  const guild = await prisma.guild.findFirst({
    where: {
      inviteCode: {
        equals: code,
        mode: "insensitive", // case-insensitive verification
      },
      isActive: true,
    },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      avatarUrl: true,
    },
  });

  if (!guild) {
    throw new NotFoundError("Invalid or inactive guild invite code");
  }

  return guild;
}

// ─── Submit Join Request ─────────────────────────

export async function createJoinRequest(
  userId: string,
  inviteCode: string,
  ign: string,
  cp: number,
  classType: string,
  weapon: string,
  gearItems?: EquipmentItemInput[],
) {
  // Validate invite code
  const guild = await verifyInviteCode(inviteCode);

  // Check membership and existing request in parallel
  const [existingMembership, existingRequest] = await Promise.all([
    prisma.guildMember.findUnique({
      where: {
        userId_guildId: {
          userId,
          guildId: guild.id,
        },
      },
    }),
    prisma.guildJoinRequest.findUnique({
      where: {
        userId_guildId: {
          userId,
          guildId: guild.id,
        },
      },
    }),
  ]);

  if (existingMembership && existingMembership.isActive) {
    throw new BadRequestError("You are already a member of this guild");
  }

  if (existingRequest && existingRequest.status === JoinRequestStatus.PENDING) {
    throw new BadRequestError("You already have a pending application for this guild");
  }

  // Create or update request to PENDING
  const request = await prisma.guildJoinRequest.upsert({
    where: {
      userId_guildId: {
        userId,
        guildId: guild.id,
      },
    },
    update: {
      ign,
      cp,
      class: classType,
      weapon,
      status: JoinRequestStatus.PENDING,
      gearItems: gearItems && gearItems.length > 0 ? (gearItems as object) : undefined,
    },
    create: {
      userId,
      guildId: guild.id,
      ign,
      cp,
      class: classType,
      weapon,
      status: JoinRequestStatus.PENDING,
      gearItems: gearItems && gearItems.length > 0 ? (gearItems as object) : undefined,
    },
  });

  return {
    id: request.id,
    guildId: request.guildId,
    guildName: guild.name,
    status: request.status,
  };
}

// ─── Get User Pending Request ────────────────────

export async function getUserPendingRequest(userId: string) {
  const request = await prisma.guildJoinRequest.findFirst({
    where: {
      userId,
      status: JoinRequestStatus.PENDING,
    },
    include: {
      guild: {
        select: {
          name: true,
          avatarUrl: true,
        },
      },
    },
  });

  if (!request) return null;

  return {
    id: request.id,
    guildId: request.guildId,
    guildName: request.guild.name,
    guildAvatarUrl: request.guild.avatarUrl,
    ign: request.ign,
    cp: request.cp,
    class: request.class,
    weapon: request.weapon,
    status: request.status,
    gearItems: request.gearItems ?? null,
    createdAt: request.createdAt.toISOString(),
  };
}

// ─── Cancel Join Request ─────────────────────────

export async function cancelJoinRequest(userId: string, requestId: string) {
  const request = await prisma.guildJoinRequest.findUnique({
    where: { id: requestId },
  });

  if (!request) {
    throw new NotFoundError("Application not found");
  }

  if (request.userId !== userId) {
    throw new ForbiddenError("You are not authorized to cancel this application");
  }

  if (request.status !== JoinRequestStatus.PENDING) {
    throw new BadRequestError("Only pending applications can be cancelled");
  }

  await prisma.guildJoinRequest.delete({
    where: { id: requestId },
  });

  return { success: true, guildId: request.guildId };
}

// ─── Get Guild Applications ──────────────────────

export async function getGuildApplications(
  guildId: string,
): Promise<JoinRequestWithUser[]> {
  const applications = await prisma.guildJoinRequest.findMany({
    where: {
      guildId,
      status: JoinRequestStatus.PENDING,
    },
    include: {
      user: {
        select: {
          id: true,
          displayName: true,
          email: true,
          avatarUrl: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  return applications.map((app) => ({
    id: app.id,
    guildId: app.guildId,
    userId: app.userId,
    ign: app.ign,
    cp: app.cp,
    class: app.class,
    weapon: app.weapon,
    status: app.status,
    gearItems: app.gearItems ?? null,
    createdAt: app.createdAt.toISOString(),
    user: app.user,
  }));
}

// ─── Generate Invite Code ────────────────────────

export async function generateGuildInviteCode(
  guildId: string,
  actorId: string,
  ipAddress?: string,
  userAgent?: string,
) {
  // Fetch membership and guild in parallel
  const [membership, guild] = await Promise.all([
    prisma.guildMember.findUnique({
      where: {
        userId_guildId: {
          userId: actorId,
          guildId,
        },
      },
    }),
    prisma.guild.findUnique({
      where: { id: guildId },
    }),
  ]);

  if (!membership || !membership.isActive || membership.role !== GuildRole.GUILD_LEADER) {
    throw new ForbiddenError("Only the Guild Leader can generate invite codes");
  }

  if (!guild) {
    throw new NotFoundError("Guild not found");
  }

  // Derive abbreviation from Guild Name
  const prefix = getGuildAbbreviation(guild.name);
  const randomSuffix = crypto.randomBytes(2).toString("hex").toUpperCase();
  const inviteCode = `${prefix}-JOIN-${randomSuffix}`;

  // Update guild with the new code
  const updatedGuild = await prisma.guild.update({
    where: { id: guildId },
    data: { inviteCode },
    select: { inviteCode: true },
  });

  // Log in audit trail
  await writeAuditLog({
    actorId,
    guildId,
    action: "GUILD_INVITE_GENERATED",
    target: "Guild",
    targetId: guildId,
    detail: { inviteCode },
    ipAddress,
    userAgent,
  });

  return updatedGuild;
}

// ─── Handle Application (Accept/Decline) ──────────

export async function handleApplicationAction(
  guildId: string,
  requestId: string,
  action: "ACCEPT" | "DECLINE",
  actorId: string,
  ipAddress?: string,
  userAgent?: string,
) {
  // Validate actor and fetch request in parallel
  const [actorMembership, request] = await Promise.all([
    prisma.guildMember.findUnique({
      where: {
        userId_guildId: {
          userId: actorId,
          guildId,
        },
      },
    }),
    prisma.guildJoinRequest.findUnique({
      where: { id: requestId },
      include: {
        user: {
          select: { id: true, displayName: true, email: true, avatarUrl: true, bannerUrl: true },
        },
        guild: {
          select: { name: true },
        },
      },
    }),
  ]);

  if (
    !actorMembership ||
    !actorMembership.isActive ||
    !hasMinimumRole(actorMembership.role as GuildRoleType, "OFFICER")
  ) {
    throw new ForbiddenError("Only Officers or the Guild Leader can accept or decline applications");
  }

  if (!request || request.guildId !== guildId) {
    throw new NotFoundError("Application request not found");
  }

  if (request.status !== JoinRequestStatus.PENDING) {
    throw new BadRequestError("This application has already been processed");
  }

  if (action === "DECLINE") {
    const updatedRequest = await prisma.guildJoinRequest.update({
      where: { id: requestId },
      data: { status: JoinRequestStatus.DECLINED },
    });

    await writeAuditLog({
      actorId,
      guildId,
      action: "MEMBER_APPLICATION_DECLINED",
      target: "GuildJoinRequest",
      targetId: requestId,
      detail: {
        applicantId: request.userId,
        applicantName: request.user.displayName,
      },
      ipAddress,
      userAgent,
    });

    return {
      success: true,
      status: updatedRequest.status,
      applicantId: request.userId,
      guildId,
      guildName: request.guild.name,
      member: null,
    };
  }

  // action === "ACCEPT"
  // Run interactive transaction for atomic safety
  const result = await prisma.$transaction(async (tx) => {
    // 1. Update Join Request status
    await tx.guildJoinRequest.update({
      where: { id: requestId },
      data: { status: JoinRequestStatus.ACCEPTED },
    });

    // 2. Reactivate former members instead of creating a duplicate row. The
    // unique (userId, guildId) constraint preserves history across leave/rejoin.
    const existingMember = await tx.guildMember.findUnique({
      where: { userId_guildId: { userId: request.userId, guildId } },
    });

    // 3. Generate dynamic Member Code (sequential suffix padded) only when a
    // returning member does not already have one.
    let memberCode = existingMember?.memberCode ?? null;
    if (!memberCode) {
      const currentMemberCount = await tx.guildMember.count({
        where: { guildId },
      });
      const prefix = getGuildAbbreviation(request.guild.name);
      let checkIndex = currentMemberCount + 1;
      memberCode = `${prefix}-${String(checkIndex).padStart(3, "0")}`;

      // Loop check for uniqueness constraint safety
      while (true) {
        const conflicting = await tx.guildMember.findUnique({
          where: { memberCode },
        });
        if (!conflicting) break;
        checkIndex++;
        memberCode = `${prefix}-${String(checkIndex).padStart(3, "0")}`;
      }
    }

    // 4. Create or reactivate actual GuildMember record.
    // Default Role = MEMBER, Default RankName = "Member"
    const newMember = existingMember
      ? await tx.guildMember.update({
          where: { id: existingMember.id },
          data: {
            role: GuildRole.MEMBER,
            rankName: "Member",
            customRoleId: null,
            ign: request.ign,
            cp: request.cp,
            class: request.class,
            weapon: request.weapon,
            memberCode,
            isActive: true,
          },
        })
      : await tx.guildMember.create({
          data: {
            userId: request.userId,
            guildId,
            role: GuildRole.MEMBER,
            rankName: "Member",
            ign: request.ign,
            cp: request.cp,
            class: request.class,
            weapon: request.weapon,
            memberCode,
            isActive: true,
          },
        });

    return { newMember, memberCode };
  });

  // Materialise any gear captured at apply time into the new member's profile.
  // Best-effort: never block acceptance if an icon is stale or storage hiccups.
  const gear = Array.isArray(request.gearItems)
    ? (request.gearItems as unknown as EquipmentItemInput[])
    : [];
  if (gear.length > 0) {
    try {
      await saveEquipmentRows(result.newMember.id, gear, null, false);
    } catch (err) {
      console.error("[application] failed to materialise gear on accept:", err);
    }
  }

  // Log acceptance in audit logs
  await writeAuditLog({
    actorId,
    guildId,
    action: "MEMBER_APPLICATION_ACCEPTED",
    target: "GuildMember",
    targetId: result.newMember.id,
    detail: {
      applicantId: request.userId,
      applicantName: request.user.displayName,
      ign: request.ign,
      memberCode: result.memberCode,
    },
    ipAddress,
    userAgent,
  });

  return {
    success: true,
    status: JoinRequestStatus.ACCEPTED,
    memberCode: result.memberCode,
    applicantId: request.userId,
    guildId,
    guildName: request.guild.name,
    member: {
      id: result.newMember.id,
      userId: result.newMember.userId,
      role: result.newMember.role,
      rankName: result.newMember.rankName,
      ign: result.newMember.ign,
      cp: result.newMember.cp,
      class: result.newMember.class,
      weapon: result.newMember.weapon,
      memberCode: result.newMember.memberCode,
      joinedAt: result.newMember.joinedAt.toISOString(),
      isActive: result.newMember.isActive,
      customRole: null,
      user: {
        id: request.user.id,
        displayName: request.user.displayName,
        email: request.user.email,
        avatarUrl: request.user.avatarUrl,
        bannerUrl: request.user.bannerUrl,
      },
    },
  };
}
