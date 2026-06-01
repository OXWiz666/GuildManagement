import { prisma } from "@guild/db";
import { writeAuditLog } from "./audit.service";
import { NotFoundError, ForbiddenError, BadRequestError } from "../utils/errors";

// Default per-rank item limits per reset cycle
const DEFAULT_ITEM_LIMITS: Record<string, number> = {
  CORE_MEMBER: 7,
  ELITE_MEMBER: 7,
  OFFICER: 5,
  GUILD_LEADER: 5,
  ALLIANCE_LEADER: 5,
  ADMIN: 5,
  MEMBER: 5,
};

// ─── Helper: Get member's active item request count this cycle ───────────────

async function getMemberActiveRequestCount(guildId: string, memberId: string) {
  const settings = await prisma.guildSettings.findUnique({ where: { guildId } });
  const resetCycle = settings?.pointsResetCycle || "MANUAL";

  let sinceDate: Date | undefined;
  if (resetCycle === "WEEKLY") {
    sinceDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  } else if (resetCycle === "MONTHLY") {
    sinceDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  }

  return prisma.itemRequest.count({
    where: {
      memberId,
      guildId,
      type: "ITEM",
      status: { not: "DECLINED" },
      ...(sinceDate ? { createdAt: { gte: sinceDate } } : {}),
    },
  });
}

// ─── Create Item Request (Member) ────────────────────────────────────────────

export async function createItemRequest(
  guildId: string,
  actorId: string,
  payload: {
    itemName: string;
    quantity?: number;
    itemCategory?: string;
    note?: string;
  },
) {
  const member = await prisma.guildMember.findUnique({
    where: { userId_guildId: { userId: actorId, guildId } },
  });

  if (!member || !member.isActive) {
    throw new ForbiddenError("You must be an active guild member to submit requests");
  }

  if (!payload.itemName?.trim()) throw new BadRequestError("Item name is required");

  // Enforce per-rank limits
  const settings = await prisma.guildSettings.findUnique({ where: { guildId } });
  const limits = (settings?.itemRequestLimits as Record<string, number>) || {};
  const limit = limits[member.role] ?? DEFAULT_ITEM_LIMITS[member.role] ?? 5;

  const activeCount = await getMemberActiveRequestCount(guildId, member.id);
  if (activeCount >= limit) {
    throw new BadRequestError(
      `You have reached your item request limit (${limit}) for this cycle. Current role: ${member.role}`
    );
  }

  const request = await prisma.itemRequest.create({
    data: {
      guildId,
      memberId: member.id,
      type: "ITEM",
      status: "PENDING",
      itemName: payload.itemName.trim(),
      quantity: payload.quantity || 1,
      itemCategory: payload.itemCategory || "OTHER",
      note: payload.note?.trim() || null,
    },
    include: {
      member: { select: { ign: true, role: true, rankName: true } },
    },
  });

  await writeAuditLog({
    actorId,
    guildId,
    action: "ITEM_REQUEST_SUBMITTED",
    target: "ItemRequest",
    targetId: request.id,
    detail: { itemName: payload.itemName, quantity: payload.quantity || 1, ign: member.ign },
  });

  return request;
}

// ─── Create Withdrawal Request (Member) ──────────────────────────────────────

export async function createWithdrawalRequest(
  guildId: string,
  actorId: string,
  payload: {
    withdrawalAmount: number;
    withdrawalCurrency: string;
    note?: string;
  },
) {
  const member = await prisma.guildMember.findUnique({
    where: { userId_guildId: { userId: actorId, guildId } },
  });

  if (!member || !member.isActive) {
    throw new ForbiddenError("You must be an active guild member to submit withdrawal requests");
  }

  if (!payload.withdrawalAmount || payload.withdrawalAmount <= 0) {
    throw new BadRequestError("Withdrawal amount must be positive");
  }

  if (!payload.withdrawalCurrency) {
    throw new BadRequestError("Currency is required");
  }

  // Check for existing pending withdrawal
  const existingPending = await prisma.itemRequest.findFirst({
    where: {
      memberId: member.id,
      guildId,
      type: "WITHDRAWAL",
      status: "PENDING",
    },
  });

  if (existingPending) {
    throw new BadRequestError("You already have a pending withdrawal request. Wait for it to be processed.");
  }

  const request = await prisma.itemRequest.create({
    data: {
      guildId,
      memberId: member.id,
      type: "WITHDRAWAL",
      status: "PENDING",
      withdrawalAmount: payload.withdrawalAmount,
      withdrawalCurrency: payload.withdrawalCurrency,
      note: payload.note?.trim() || null,
    },
    include: {
      member: { select: { ign: true, role: true } },
    },
  });

  await writeAuditLog({
    actorId,
    guildId,
    action: "WITHDRAWAL_REQUEST_SUBMITTED",
    target: "ItemRequest",
    targetId: request.id,
    detail: { amount: payload.withdrawalAmount, currency: payload.withdrawalCurrency, ign: member.ign },
  });

  return request;
}

// ─── Get All Requests (Officer/Leader view) ───────────────────────────────────

export async function getGuildRequests(
  guildId: string,
  actorId: string,
  filters?: {
    status?: string;
    type?: string;
    page?: number;
    limit?: number;
  },
) {
  const member = await prisma.guildMember.findUnique({
    where: { userId_guildId: { userId: actorId, guildId } },
  });

  const isOfficer = member && ["OFFICER", "GUILD_LEADER", "ALLIANCE_LEADER", "ADMIN"].includes(member.role);
  if (!member || !member.isActive || !isOfficer) {
    throw new ForbiddenError("Only officers and above can view all requests");
  }

  const page = filters?.page || 1;
  const limit = filters?.limit || 25;
  const skip = (page - 1) * limit;

  const where: any = { guildId };
  if (filters?.status) where.status = filters.status;
  if (filters?.type) where.type = filters.type;

  const [requests, total] = await Promise.all([
    prisma.itemRequest.findMany({
      where,
      include: {
        member: {
          include: {
            user: { select: { id: true, displayName: true, email: true, avatarUrl: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.itemRequest.count({ where }),
  ]);

  return {
    requests,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

// ─── Get My Requests (Member self-view) ───────────────────────────────────────

export async function getMyRequests(guildId: string, actorId: string, page = 1, limit = 20) {
  const member = await prisma.guildMember.findUnique({
    where: { userId_guildId: { userId: actorId, guildId } },
  });

  if (!member || !member.isActive) throw new ForbiddenError("Not a member of this guild");

  const skip = (page - 1) * limit;
  const [requests, total] = await Promise.all([
    prisma.itemRequest.findMany({
      where: { guildId, memberId: member.id },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.itemRequest.count({ where: { guildId, memberId: member.id } }),
  ]);

  // Also return remaining request quota
  const settings = await prisma.guildSettings.findUnique({ where: { guildId } });
  const limits = (settings?.itemRequestLimits as Record<string, number>) || {};
  const itemLimit = limits[member.role] ?? DEFAULT_ITEM_LIMITS[member.role] ?? 5;
  const usedCount = await getMemberActiveRequestCount(guildId, member.id);

  return {
    requests,
    quota: { used: usedCount, limit: itemLimit, remaining: Math.max(0, itemLimit - usedCount) },
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

// ─── Review Request (Leader/Officer actions) ──────────────────────────────────

export async function reviewRequest(
  guildId: string,
  requestId: string,
  actorId: string,
  action: "APPROVED" | "DECLINED" | "FULFILLED",
  reviewNote?: string,
  ipAddress?: string,
  userAgent?: string,
) {
  const actor = await prisma.guildMember.findUnique({
    where: { userId_guildId: { userId: actorId, guildId } },
  });

  const allowedRoles = action === "FULFILLED"
    ? ["GUILD_LEADER", "ALLIANCE_LEADER", "ADMIN"]
    : ["OFFICER", "GUILD_LEADER", "ALLIANCE_LEADER", "ADMIN"];

  if (!actor || !actor.isActive || !allowedRoles.includes(actor.role)) {
    throw new ForbiddenError(`Only ${allowedRoles.join("/")} can ${action.toLowerCase()} requests`);
  }

  const request = await prisma.itemRequest.findUnique({
    where: { id: requestId },
    include: { member: { select: { ign: true } } },
  });

  if (!request || request.guildId !== guildId) throw new NotFoundError("Request not found");
  if (request.status !== "PENDING" && action !== "FULFILLED") {
    throw new BadRequestError("Request is no longer pending");
  }
  if (action === "FULFILLED" && request.status !== "APPROVED") {
    throw new BadRequestError("Only approved requests can be marked as fulfilled");
  }

  const updated = await prisma.itemRequest.update({
    where: { id: requestId },
    data: {
      status: action,
      reviewNote: reviewNote?.trim() || null,
      reviewedById: actorId,
      reviewedAt: new Date(),
      ...(action === "FULFILLED" ? { fulfilledAt: new Date() } : {}),
    },
  });

  const auditActionMap: Record<"APPROVED" | "DECLINED" | "FULFILLED", string> = {
    APPROVED: "ITEM_REQUEST_APPROVED",
    DECLINED: "ITEM_REQUEST_DECLINED",
    FULFILLED: "ITEM_REQUEST_FULFILLED",
  };

  await writeAuditLog({
    actorId,
    guildId,
    action: auditActionMap[action],
    target: "ItemRequest",
    targetId: requestId,
    detail: {
      type: request.type,
      itemName: request.itemName,
      ign: request.member.ign,
      withdrawalAmount: request.withdrawalAmount,
      withdrawalCurrency: request.withdrawalCurrency,
      reviewNote,
    },
    ipAddress,
    userAgent,
  });

  return { success: true, request: updated };
}

// ─── Officer Notification: Available Item ─────────────────────────────────────

export async function notifyItemAvailable(
  guildId: string,
  actorId: string,
  payload: {
    itemName: string;
    itemCategory?: string;
    note?: string;
  },
  ipAddress?: string,
  userAgent?: string,
) {
  const actor = await prisma.guildMember.findUnique({
    where: { userId_guildId: { userId: actorId, guildId } },
  });

  if (!actor || !actor.isActive || !["OFFICER", "GUILD_LEADER", "ALLIANCE_LEADER", "ADMIN"].includes(actor.role)) {
    throw new ForbiddenError("Only officers and above can post item availability notices");
  }

  // Write to audit log — this serves as the notification record
  await writeAuditLog({
    actorId,
    guildId,
    action: "ITEM_AVAILABLE_NOTICE",
    target: "Notification",
    detail: {
      itemName: payload.itemName,
      itemCategory: payload.itemCategory || "OTHER",
      note: payload.note,
      officerIgn: actor.ign,
    },
    ipAddress,
    userAgent,
  });

  return {
    success: true,
    message: `Posted availability notice for "${payload.itemName}" to all guild members`,
  };
}

// ─── Priority Queue: Ranked distribution order ────────────────────────────────

export async function getPriorityQueue(guildId: string, actorId: string) {
  // Verify membership
  const actor = await prisma.guildMember.findUnique({
    where: { userId_guildId: { userId: actorId, guildId } },
  });
  if (!actor || !actor.isActive) throw new ForbiddenError("Not a member of this guild");

  // Get all active members with their DKP from ledger
  const members = await prisma.guildMember.findMany({
    where: { guildId, isActive: true },
    include: {
      user: { select: { id: true, displayName: true, avatarUrl: true } },
    },
    orderBy: [{ cp: "desc" }],
  });

  // Get DKP (ledger sum) for all members
  const dkpData = await prisma.ledgerEntry.groupBy({
    by: ["accountId"],
    where: {
      guildId,
      accountType: "MEMBER",
      entryType: "CREDIT",
    },
    _sum: { amount: true },
  });

  const dkpMap = new Map<string, number>();
  dkpData.forEach((d) => {
    dkpMap.set(d.accountId, Number(d._sum.amount || 0));
  });

  // Find max CP for normalization
  const maxCp = Math.max(...members.map((m) => m.cp || 0), 1);

  // Calculate priority score: 70% DKP (normalized) + 30% CP (normalized)
  const maxDkp = Math.max(...members.map((m) => dkpMap.get(m.userId) || 0), 1);

  const ranked = members
    .map((m) => {
      const dkp = dkpMap.get(m.userId) || 0;
      const cp = m.cp || 0;
      const dkpNorm = dkp / maxDkp;
      const cpNorm = cp / maxCp;
      const priorityScore = Math.round((dkpNorm * 0.7 + cpNorm * 0.3) * 10000) / 100; // 0–100

      return {
        memberId: m.id,
        userId: m.userId,
        ign: m.ign || m.user.displayName,
        displayName: m.user.displayName,
        avatarUrl: m.user.avatarUrl,
        role: m.role,
        rankName: m.rankName,
        cp,
        dkp,
        bidPoints: m.bidPoints,
        priorityScore,
      };
    })
    .sort((a, b) => b.priorityScore - a.priorityScore || b.dkp - a.dkp || b.cp - a.cp)
    .map((m, idx) => ({ ...m, position: idx + 1 }));

  return ranked;
}
