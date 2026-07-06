import { prisma } from "@guild/db";
import { getGuildMemberByUser } from "./guild.service";
import { writeAuditLog } from "./audit.service";
import { createNotifications } from "./notification.service";
import { broadcastToGuild } from "../lib/socket";
import { NotFoundError, ForbiddenError, BadRequestError } from "../utils/errors";
import {
  GUILD_ROLES,
  DEFAULT_MARKET_RULES,
  DISTRIBUTION_TIERS,
  CORE_SLOTS,
  NON_CORE_SLOTS,
  LEGENDARY_CATEGORIES,
  AUDIT_ACTIONS,
  type MarketRules,
  type DistributionTier,
} from "@guild/shared";

const OFFICER_ROLES = ["OFFICER", "GUILD_LEADER", "FACTION_LEADER", "ADMIN"];
// Roles that always receive the detailed "Core" distribution form
const CORE_FORM_ROLES = ["CORE_MEMBER", ...OFFICER_ROLES];

// All audit actions that belong to the Guild Market module (for the audit tab)
const MARKET_AUDIT_ACTIONS = [
  AUDIT_ACTIONS.ITEM_REQUEST_SUBMITTED,
  AUDIT_ACTIONS.ITEM_REQUEST_APPROVED,
  AUDIT_ACTIONS.ITEM_REQUEST_DECLINED,
  AUDIT_ACTIONS.ITEM_REQUEST_FULFILLED,
  AUDIT_ACTIONS.LEGENDARY_PRIORITY_SUBMITTED,
  AUDIT_ACTIONS.LEGENDARY_PRIORITY_APPROVED,
  AUDIT_ACTIONS.LEGENDARY_PRIORITY_REJECTED,
  AUDIT_ACTIONS.LEGENDARY_PRIORITY_COMPLETED,
  AUDIT_ACTIONS.ITEM_DISTRIBUTED,
  AUDIT_ACTIONS.DISTRIBUTION_LIMIT_OVERRIDDEN,
  AUDIT_ACTIONS.PRIORITY_SEQUENCE_CHANGED,
  AUDIT_ACTIONS.DISTRIBUTION_RULE_UPDATED,
];

// ─── Rules helpers ───────────────────────────────────────────────────

/** Deep-merge stored market rules over the spec defaults so missing keys are filled. */
export function mergeMarketRules(raw: unknown): MarketRules {
  const stored = (raw && typeof raw === "object" ? raw : {}) as Partial<MarketRules>;
  const limits = { ...DEFAULT_MARKET_RULES.limits } as MarketRules["limits"];
  if (stored.limits) {
    for (const tier of DISTRIBUTION_TIERS) {
      if (stored.limits[tier]) {
        limits[tier] = { ...DEFAULT_MARKET_RULES.limits[tier], ...stored.limits[tier] };
      }
    }
  }
  return {
    cpTiers: { ...DEFAULT_MARKET_RULES.cpTiers, ...(stored.cpTiers || {}) },
    limits,
    weights: { ...DEFAULT_MARKET_RULES.weights, ...(stored.weights || {}) },
  };
}

export async function getEffectiveMarketRules(guildId: string): Promise<MarketRules> {
  const settings = await prisma.guildSettings.findUnique({ where: { guildId } });
  return mergeMarketRules(settings?.marketRules);
}

/** Resolve a member's distribution tier: CORE by role, else ELITE/UPPER/LOWER by CP. */
export function resolveDistributionTier(
  member: { role: string; cp: number | null },
  rules: MarketRules,
): DistributionTier {
  if (CORE_FORM_ROLES.includes(member.role)) return "CORE";
  const cp = member.cp ?? 0;
  if (cp >= rules.cpTiers.eliteMinCp) return "ELITE";
  if (cp >= rules.cpTiers.upperMinCp) return "UPPER";
  return "LOWER";
}

// ─── Officer notification fan-out (shared with requests.service) ─────

export async function notifyGuildOfficers(
  guildId: string,
  opts: { type: string; title: string; body: string; metadata?: Record<string, unknown> },
) {
  try {
    const officers = await prisma.guildMember.findMany({
      where: { guildId, isActive: true, role: { in: OFFICER_ROLES as never[] } },
      select: { userId: true },
    });
    if (officers.length === 0) return;
    await createNotifications(
      officers.map((o) => ({
        userId: o.userId,
        type: opts.type,
        title: opts.title,
        body: opts.body,
        metadata: opts.metadata,
      })),
    );
  } catch (err) {
    // Notifications must never break the originating action
    console.error("[market] notifyGuildOfficers failed:", err);
  }
}

// ─── Membership helpers ──────────────────────────────────────────────

async function requireActiveMember(guildId: string, userId: string) {
  // Cached membership read (shared `membership:*` key with the RBAC guard).
  const member = await getGuildMemberByUser(userId, guildId);
  if (!member || !member.isActive) {
    throw new ForbiddenError("You must be an active guild member");
  }
  return member;
}

async function requireOfficer(guildId: string, userId: string) {
  const member = await requireActiveMember(guildId, userId);
  if (!OFFICER_ROLES.includes(member.role)) {
    throw new ForbiddenError("Only officers and above can perform this action");
  }
  return member;
}

// ─── Legendary Priority ──────────────────────────────────────────────

export async function createLegendaryRequest(
  guildId: string,
  actorId: string,
  payload: { category: string; currentGear?: string; reason?: string },
) {
  const member = await requireActiveMember(guildId, actorId);

  if (!LEGENDARY_CATEGORIES.includes(payload.category as never)) {
    throw new BadRequestError("Invalid legendary category");
  }

  // One active (non-rejected) request per category per member
  const existing = await prisma.legendaryPriorityRequest.findFirst({
    where: {
      guildId,
      memberId: member.id,
      category: payload.category,
      status: { in: ["PENDING", "APPROVED"] },
    },
  });
  if (existing) {
    throw new BadRequestError("You already have an active priority request for this category");
  }

  const request = await prisma.legendaryPriorityRequest.create({
    data: {
      guildId,
      memberId: member.id,
      category: payload.category,
      currentGear: payload.currentGear?.trim() || null,
      reason: payload.reason?.trim() || null,
      status: "PENDING",
    },
    include: { member: { select: { ign: true, role: true, rankName: true } } },
  });

  await writeAuditLog({
    actorId,
    guildId,
    action: AUDIT_ACTIONS.LEGENDARY_PRIORITY_SUBMITTED,
    target: "LegendaryPriorityRequest",
    targetId: request.id,
    detail: { category: payload.category, ign: member.ign },
  });

  await notifyGuildOfficers(guildId, {
    type: "LEGENDARY_PRIORITY",
    title: "New legendary priority request",
    body: `${member.ign || "A member"} requested priority for ${payload.category}.`,
    metadata: { requestId: request.id, category: payload.category },
  });

  void broadcastToGuild(guildId, "legendary_priority_submitted", { id: request.id });
  return request;
}

export async function getLegendaryRequests(
  guildId: string,
  actorId: string,
  filters?: { status?: string; category?: string },
) {
  const member = await requireActiveMember(guildId, actorId);
  const isOfficer = OFFICER_ROLES.includes(member.role);

  const where: any = { guildId };
  if (!isOfficer) where.memberId = member.id; // members see only their own
  if (filters?.status) where.status = filters.status;
  if (filters?.category) where.category = filters.category;

  const requests = await prisma.legendaryPriorityRequest.findMany({
    where,
    include: {
      member: {
        include: { user: { select: { id: true, displayName: true, avatarUrl: true } } },
      },
    },
    orderBy: [{ prioritySeq: "asc" }, { createdAt: "desc" }],
  });

  return { requests, canManage: isOfficer };
}

export async function reviewLegendaryRequest(
  guildId: string,
  requestId: string,
  actorId: string,
  action: "APPROVED" | "REJECTED" | "COMPLETED",
  officerNote?: string,
) {
  await requireOfficer(guildId, actorId);

  const request = await prisma.legendaryPriorityRequest.findUnique({
    where: { id: requestId },
    include: { member: { select: { ign: true } } },
  });
  if (!request || request.guildId !== guildId) throw new NotFoundError("Request not found");

  if (action === "COMPLETED" && request.status !== "APPROVED") {
    throw new BadRequestError("Only approved requests can be completed");
  }
  if ((action === "APPROVED" || action === "REJECTED") && request.status !== "PENDING") {
    throw new BadRequestError("Request is no longer pending");
  }

  const updated = await prisma.legendaryPriorityRequest.update({
    where: { id: requestId },
    data: {
      status: action,
      officerNote: officerNote?.trim() || null,
      reviewedById: actorId,
      reviewedAt: new Date(),
      ...(action === "COMPLETED" ? { completedAt: new Date() } : {}),
    },
  });

  const actionMap = {
    APPROVED: AUDIT_ACTIONS.LEGENDARY_PRIORITY_APPROVED,
    REJECTED: AUDIT_ACTIONS.LEGENDARY_PRIORITY_REJECTED,
    COMPLETED: AUDIT_ACTIONS.LEGENDARY_PRIORITY_COMPLETED,
  } as const;
  await writeAuditLog({
    actorId,
    guildId,
    action: actionMap[action],
    target: "LegendaryPriorityRequest",
    targetId: requestId,
    detail: { category: request.category, ign: request.member.ign, officerNote },
  });

  void broadcastToGuild(guildId, "legendary_priority_updated", { id: requestId, status: action });
  return updated;
}

export async function setLegendarySequence(
  guildId: string,
  requestId: string,
  actorId: string,
  prioritySeq: number,
) {
  await requireOfficer(guildId, actorId);
  const request = await prisma.legendaryPriorityRequest.findUnique({ where: { id: requestId } });
  if (!request || request.guildId !== guildId) throw new NotFoundError("Request not found");

  const updated = await prisma.legendaryPriorityRequest.update({
    where: { id: requestId },
    data: { prioritySeq },
  });

  await writeAuditLog({
    actorId,
    guildId,
    action: AUDIT_ACTIONS.PRIORITY_SEQUENCE_CHANGED,
    target: "LegendaryPriorityRequest",
    targetId: requestId,
    detail: { oldSeq: request.prioritySeq, newSeq: prioritySeq },
  });

  void broadcastToGuild(guildId, "legendary_priority_updated", { id: requestId });
  return updated;
}

// ─── Item Distribution ───────────────────────────────────────────────

function dkpForMember(entries: Array<{ accountId: string; _sum: { amount: bigint | null } }>, userId: string) {
  const row = entries.find((e) => e.accountId === userId);
  return row ? Number(row._sum.amount || 0) : 0;
}

export async function createDistribution(
  guildId: string,
  actorId: string,
  payload: {
    memberId: string;
    formType: "CORE" | "NON_CORE";
    items: Record<string, number | boolean | string>;
    note?: string;
    overrideReason?: string;
  },
) {
  await requireOfficer(guildId, actorId);

  const target = await prisma.guildMember.findUnique({
    where: { id: payload.memberId },
    include: { user: { select: { displayName: true } } },
  });
  if (!target || target.guildId !== guildId || !target.isActive) {
    throw new NotFoundError("Target member not found in this guild");
  }

  const rules = await getEffectiveMarketRules(guildId);
  const tier = resolveDistributionTier(target, rules);

  // Keep only known slot keys for the chosen form
  const allowed = payload.formType === "CORE" ? CORE_SLOTS : NON_CORE_SLOTS;
  const items: Record<string, number | boolean | string> = {};
  for (const key of allowed) {
    if (payload.items[key] !== undefined && payload.items[key] !== "" && payload.items[key] !== false) {
      items[key] = payload.items[key]!;
    }
  }

  // Validate resource quantities against the tier's limits
  const limit = rules.limits[tier];
  const num = (v: unknown) => (typeof v === "number" ? v : Number(v) || 0);
  const requested = {
    logs: num(items["logs"]) || num(items["itemLog"]),
    temporalPieces: num(items["temporalPieces"]) || num(items["temporalPiece"]),
    materials: num(items["materials"]),
  };
  const breaches: string[] = [];
  if (requested.logs > limit.logs) breaches.push(`logs ${requested.logs} > ${limit.logs}`);
  if (requested.temporalPieces > limit.temporalPieces)
    breaches.push(`temporal pieces ${requested.temporalPieces} > ${limit.temporalPieces}`);
  if (requested.materials > limit.materials)
    breaches.push(`materials ${requested.materials} > ${limit.materials}`);

  const overridden = breaches.length > 0;
  if (overridden && !payload.overrideReason?.trim()) {
    throw new BadRequestError(
      `Distribution exceeds ${tier} limits (${breaches.join(", ")}). An override reason is required.`,
    );
  }

  // Snapshot of guild points (DKP) for the member
  const dkpRows = await prisma.ledgerEntry.groupBy({
    by: ["accountId"],
    where: { guildId, accountType: "MEMBER", entryType: "CREDIT", accountId: target.userId },
    _sum: { amount: true },
  });

  const distribution = await prisma.itemDistribution.create({
    data: {
      guildId,
      memberId: target.id,
      formType: payload.formType,
      rankTier: tier,
      ignSnapshot: target.ign || target.user.displayName,
      classSnapshot: target.class,
      cpSnapshot: target.cp,
      pointsSnapshot: dkpForMember(dkpRows, target.userId),
      prioritySeq: target.marketPrioritySeq,
      items,
      note: payload.note?.trim() || null,
      distributedById: actorId,
      overridden,
      overrideReason: overridden ? payload.overrideReason!.trim() : null,
    },
  });

  await writeAuditLog({
    actorId,
    guildId,
    action: AUDIT_ACTIONS.ITEM_DISTRIBUTED,
    target: "ItemDistribution",
    targetId: distribution.id,
    detail: { ign: distribution.ignSnapshot, tier, formType: payload.formType, items },
  });
  if (overridden) {
    await writeAuditLog({
      actorId,
      guildId,
      action: AUDIT_ACTIONS.DISTRIBUTION_LIMIT_OVERRIDDEN,
      target: "ItemDistribution",
      targetId: distribution.id,
      detail: { ign: distribution.ignSnapshot, tier, breaches, reason: payload.overrideReason },
    });
  }

  void broadcastToGuild(guildId, "item_distributed", { id: distribution.id, memberId: target.id });
  return distribution;
}

export async function getDistributions(
  guildId: string,
  actorId: string,
  opts: { mineOnly?: boolean; memberId?: string; tier?: string; from?: string; to?: string; page?: number; limit?: number },
) {
  const member = await requireActiveMember(guildId, actorId);
  const isOfficer = OFFICER_ROLES.includes(member.role);
  if (!opts.mineOnly && !isOfficer) {
    throw new ForbiddenError("Only officers can view all distributions");
  }

  const page = opts.page || 1;
  const take = Math.min(opts.limit || 30, 100);
  const where: any = { guildId };
  if (opts.mineOnly) where.memberId = member.id;
  else if (opts.memberId) where.memberId = opts.memberId;
  if (opts.tier) where.rankTier = opts.tier;
  if (opts.from || opts.to) {
    where.distributedAt = {
      ...(opts.from ? { gte: new Date(opts.from) } : {}),
      ...(opts.to ? { lte: new Date(opts.to) } : {}),
    };
  }

  const [distributions, total] = await Promise.all([
    prisma.itemDistribution.findMany({
      where,
      include: {
        member: { include: { user: { select: { displayName: true, avatarUrl: true } } } },
      },
      orderBy: { distributedAt: "desc" },
      skip: (page - 1) * take,
      take,
    }),
    prisma.itemDistribution.count({ where }),
  ]);

  return { distributions, pagination: { page, limit: take, total, totalPages: Math.ceil(total / take) } };
}

// ─── Member item wishlist ("choose what you want") ───────────────────

/** Member views their own wishlist + the slots available for their tier. */
export async function getMyWishlist(guildId: string, actorId: string) {
  const member = await requireActiveMember(guildId, actorId);
  const rules = await getEffectiveMarketRules(guildId);
  const tier = resolveDistributionTier(member, rules);
  const formType: "CORE" | "NON_CORE" = tier === "CORE" ? "CORE" : "NON_CORE";
  const slots = formType === "CORE" ? CORE_SLOTS : NON_CORE_SLOTS;
  const items = Array.isArray(member.marketWishlist) ? (member.marketWishlist as string[]) : [];
  return { items, tier, formType, slots };
}

/** Member sets their own wishlist. Items are filtered to valid slots for their tier. */
export async function setWishlist(guildId: string, actorId: string, items: string[]) {
  const member = await requireActiveMember(guildId, actorId);
  const rules = await getEffectiveMarketRules(guildId);
  const tier = resolveDistributionTier(member, rules);
  const allowed = new Set<string>(tier === "CORE" ? CORE_SLOTS : NON_CORE_SLOTS);
  const cleaned = Array.from(new Set(items.filter((i) => allowed.has(i))));

  await prisma.guildMember.update({
    where: { id: member.id },
    data: { marketWishlist: cleaned },
  });

  void broadcastToGuild(guildId, "market_wishlist_updated", { memberId: member.id });
  return { items: cleaned, tier };
}

// ─── Priority Queue (enhanced scoring) ───────────────────────────────

export async function getPriorityQueue(guildId: string, actorId: string) {
  await requireActiveMember(guildId, actorId);
  const rules = await getEffectiveMarketRules(guildId);
  const w = rules.weights;

  const members = await prisma.guildMember.findMany({
    where: { guildId, isActive: true },
    include: { user: { select: { id: true, displayName: true, avatarUrl: true } } },
  });
  if (members.length === 0) return [];

  const userIds = members.map((m) => m.userId);
  const memberIds = members.map((m) => m.id);

  const [dkpRows, attendanceRows, bossRows, distRows, lastReqRows] = await Promise.all([
    prisma.ledgerEntry.groupBy({
      by: ["accountId"],
      where: { guildId, accountType: "MEMBER", entryType: "CREDIT", accountId: { in: userIds } },
      _sum: { amount: true },
    }),
    prisma.attendanceRecord.groupBy({
      by: ["userId"],
      where: { userId: { in: userIds }, status: "CONFIRMED", session: { guildId } },
      _count: { _all: true },
    }),
    prisma.attendanceRecord.groupBy({
      by: ["userId"],
      where: {
        userId: { in: userIds },
        status: "CONFIRMED",
        session: { guildId, bossScheduleId: { not: null } },
      },
      _count: { _all: true },
    }),
    prisma.itemDistribution.groupBy({
      by: ["memberId"],
      where: { guildId, memberId: { in: memberIds } },
      _count: { _all: true },
    }),
    prisma.itemRequest.groupBy({
      by: ["memberId"],
      where: { guildId, memberId: { in: memberIds }, type: "ITEM" },
      _max: { createdAt: true },
    }),
  ]);

  const dkpMap = new Map(dkpRows.map((r) => [r.accountId, Number(r._sum.amount || 0)]));
  const attMap = new Map(attendanceRows.map((r) => [r.userId, r._count._all]));
  const bossMap = new Map(bossRows.map((r) => [r.userId, r._count._all]));
  const distMap = new Map(distRows.map((r) => [r.memberId, r._count._all]));
  const lastReqMap = new Map(lastReqRows.map((r) => [r.memberId, r._max.createdAt?.getTime() || 0]));

  const maxRoleIdx = GUILD_ROLES.length - 1;
  const max = (vals: number[]) => Math.max(...vals, 1);
  const maxDkp = max([...dkpMap.values()]);
  const maxCp = max(members.map((m) => m.cp || 0));
  const maxAtt = max([...attMap.values()]);
  const maxBoss = max([...bossMap.values()]);
  const maxDist = max([...distMap.values()]);
  const now = Date.now();
  const RECENCY_WINDOW = 30 * 24 * 60 * 60 * 1000; // 30 days

  const ranked = members
    .map((m) => {
      const dkp = dkpMap.get(m.userId) || 0;
      const cp = m.cp || 0;
      const attendance = attMap.get(m.userId) || 0;
      const bossParticipation = bossMap.get(m.userId) || 0;
      const previousReceived = distMap.get(m.id) || 0;
      const lastReq = lastReqMap.get(m.id) || 0;
      const recency = lastReq ? Math.max(0, 1 - (now - lastReq) / RECENCY_WINDOW) : 0;
      const rankNorm = GUILD_ROLES.indexOf(m.role as never) / maxRoleIdx;

      const raw =
        w.rank * rankNorm +
        w.dkp * (dkp / maxDkp) +
        w.cp * (cp / maxCp) +
        w.attendance * (attendance / maxAtt) +
        w.bossParticipation * (bossParticipation / maxBoss) +
        w.previousReceived * (previousReceived / maxDist) +
        w.recency * recency;
      const priorityScore = Math.round(raw * 10000) / 100;

      return {
        memberId: m.id,
        userId: m.userId,
        ign: m.ign || m.user.displayName,
        displayName: m.user.displayName,
        avatarUrl: m.user.avatarUrl,
        role: m.role,
        rankName: m.rankName,
        tier: resolveDistributionTier(m, rules),
        cp,
        dkp,
        attendance,
        bossParticipation,
        previousReceived,
        priorityScore,
        manualSeq: m.marketPrioritySeq,
        manualReason: m.marketPriorityReason,
        wishlist: Array.isArray(m.marketWishlist) ? (m.marketWishlist as string[]) : [],
      };
    })
    .sort((a, b) => {
      // Manual overrides pinned first (ascending sequence), then by score
      if (a.manualSeq != null && b.manualSeq != null) return a.manualSeq - b.manualSeq;
      if (a.manualSeq != null) return -1;
      if (b.manualSeq != null) return 1;
      return b.priorityScore - a.priorityScore || b.dkp - a.dkp || b.cp - a.cp;
    })
    .map((m, idx) => ({ ...m, position: idx + 1 }));

  return ranked;
}

export async function overridePrioritySeq(
  guildId: string,
  memberId: string,
  actorId: string,
  prioritySeq: number | null,
  reason: string,
) {
  await requireOfficer(guildId, actorId);
  const target = await prisma.guildMember.findUnique({ where: { id: memberId } });
  if (!target || target.guildId !== guildId) throw new NotFoundError("Member not found");

  const updated = await prisma.guildMember.update({
    where: { id: memberId },
    data: { marketPrioritySeq: prioritySeq, marketPriorityReason: prioritySeq == null ? null : reason },
  });

  await writeAuditLog({
    actorId,
    guildId,
    action: AUDIT_ACTIONS.PRIORITY_SEQUENCE_CHANGED,
    target: "GuildMember",
    targetId: memberId,
    detail: { ign: target.ign, oldSeq: target.marketPrioritySeq, newSeq: prioritySeq, reason },
  });

  void broadcastToGuild(guildId, "priority_sequence_changed", { memberId, prioritySeq });
  return updated;
}

// ─── Market Rules (Settings) ─────────────────────────────────────────

export async function getMarketRules(guildId: string, actorId: string) {
  await requireActiveMember(guildId, actorId);
  return getEffectiveMarketRules(guildId);
}

export async function updateMarketRules(guildId: string, actorId: string, rules: MarketRules) {
  await requireActiveMember(guildId, actorId); // route already gates to GUILD_LEADER
  const merged = mergeMarketRules(rules);

  await prisma.guildSettings.upsert({
    where: { guildId },
    create: { guildId, marketRules: merged as object },
    update: { marketRules: merged as object },
  });

  await writeAuditLog({
    actorId,
    guildId,
    action: AUDIT_ACTIONS.DISTRIBUTION_RULE_UPDATED,
    target: "GuildSettings",
    targetId: guildId,
    detail: { rules: merged },
  });

  void broadcastToGuild(guildId, "market_rules_updated", { guildId });
  return merged;
}

// ─── Market Audit Logs ───────────────────────────────────────────────

export async function getMarketAuditLogs(
  guildId: string,
  actorId: string,
  opts: { action?: string; page?: number; limit?: number },
) {
  await requireOfficer(guildId, actorId);
  const page = opts.page || 1;
  const take = Math.min(opts.limit || 30, 100);
  const where: any = {
    guildId,
    action: opts.action ? opts.action : { in: MARKET_AUDIT_ACTIONS },
  };

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: { actor: { select: { id: true, displayName: true, avatarUrl: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * take,
      take,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return { logs, pagination: { page, limit: take, total, totalPages: Math.ceil(total / take) } };
}
