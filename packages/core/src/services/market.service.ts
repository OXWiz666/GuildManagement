import { prisma, Prisma } from "@guild/db";
import { getGuildMemberByUser } from "./guild.service";

type DbClient = typeof prisma | Prisma.TransactionClient;
import { writeAuditLog } from "./audit.service";
import { createNotifications } from "./notification.service";
import { broadcastToGuild } from "../lib/socket";
import { cache as redisCache } from "../lib/redis";
import { cacheKeys, ttl as cacheTtl } from "../lib/cache-keys";
import { NotFoundError, ForbiddenError, BadRequestError } from "../utils/errors";
import {
  GUILD_ROLES,
  DEFAULT_MARKET_RULES,
  DISTRIBUTION_TIERS,
  CORE_SLOTS,
  NON_CORE_SLOTS,
  LEGENDARY_CATEGORIES,
  AUDIT_ACTIONS,
  WEAPON_TYPES,
  ARMOR_PIECES,
  ACCESSORY_PIECES,
  MATERIAL_TYPES,
  WEAPON_RARITIES,
  GEAR_RARITIES,
  ARMOR_TYPES,
  WISHLIST_LABELS,
  type MarketRules,
  type DistributionTier,
  type WishlistItem,
  type WishlistRarity,
  type ArmorType,
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
  AUDIT_ACTIONS.WISHLIST_ITEM_DISTRIBUTED,
  AUDIT_ACTIONS.WISHLIST_LOG_REQUESTED,
  AUDIT_ACTIONS.MOUNT_CATALOG_UPDATED,
  AUDIT_ACTIONS.MOUNT_DISTRIBUTED,
];

/** True when a query failed only because the mount tables haven't been migrated yet. */
export function isMissingMountTable(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "P2021";
}

/** Active mount catalog ids for a guild — used to keep MOUNT wishlist entries valid. */
async function activeMountIds(guildId: string): Promise<Set<string>> {
  // Mounts are optional until the 0005 migration + client regen land. A stale
  // running client won't have the model at all (prisma.guildMount === undefined).
  if (!prisma.guildMount) return new Set();
  try {
    const mounts = await prisma.guildMount.findMany({
      where: { guildId, isActive: true },
      select: { id: true },
    });
    return new Set(mounts.map((m) => m.id));
  } catch (err) {
    // Degrade gracefully until the 0005 mount migration is applied.
    if (isMissingMountTable(err)) return new Set();
    throw err;
  }
}

// Wished ARMOR/ACCESSORY keys can differ from the officer distribution slot keys.
const WISH_SLOT_ALIASES: Record<string, string> = { helmet: "headpiece", shoes: "boots" };

/** Candidate officer-form slot keys a wishlist item maps to (for auto-marking as distributed). */
function wishCandidateSlots(item: WishlistItem): string[] {
  switch (item.category) {
    case "WEAPON":
      return ["weapon"];
    case "ARMOR":
    case "ACCESSORY": {
      const alias = WISH_SLOT_ALIASES[item.key];
      return alias ? [item.key, alias] : [item.key];
    }
    case "LOGS":
      return ["logs", "itemLog"];
    case "TEMPORAL":
      return ["temporalPieces", "temporalPiece"];
    case "MATERIALS":
      return ["materials"];
    default:
      return []; // MOUNT is distributed via the mount flow, not the item form
  }
}

/** True if a distribution's item map actually handed out something matching this wish. */
function distributionCoversWish(item: WishlistItem, dist: Record<string, unknown>): boolean {
  return wishCandidateSlots(item).some((slot) => {
    const v = dist[slot];
    if (typeof v === "number") return v > 0;
    if (typeof v === "string") return v.trim() !== "";
    return v === true;
  });
}

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

  await redisCache.del(cacheKeys.marketAuditPage1(guildId));
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

  const [target, rules] = await Promise.all([
    prisma.guildMember.findUnique({
      where: { id: payload.memberId },
      include: { user: { select: { displayName: true } } },
    }),
    getEffectiveMarketRules(guildId),
  ]);
  if (!target || target.guildId !== guildId || !target.isActive) {
    throw new NotFoundError("Target member not found in this guild");
  }

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

  // The distribution row and the wishlist auto-match flip must land together —
  // otherwise a failure between the two leaves the wishlist showing an item
  // as pending that was already handed out (or vice versa on retry).
  const { distribution, wishlistFulfillment } = await prisma.$transaction(async (tx) => {
    const created = await tx.itemDistribution.create({
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

    // Auto-match: flip any of the member's wished items that this distribution
    // covers to DISTRIBUTED so the wishlist master list reflects reality.
    const wishlistFulfillment = await markWishlistFulfilled(guildId, target, items, actorId, tx);

    return { distribution: created, wishlistFulfillment };
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
  if (wishlistFulfillment) {
    await writeAuditLog({
      actorId,
      guildId,
      action: AUDIT_ACTIONS.WISHLIST_ITEM_DISTRIBUTED,
      target: "GuildMember",
      targetId: target.id,
      detail: { ign: target.ign, items: wishlistFulfillment.fulfilled },
    });
    await redisCache.del(cacheKeys.marketWishlistMaster(guildId));
    void broadcastToGuild(guildId, "market_wishlist_updated", { memberId: target.id });
  }

  await redisCache.delMany([
    cacheKeys.marketDistributions(guildId),
    cacheKeys.marketAuditPage1(guildId),
  ]);
  void broadcastToGuild(guildId, "item_distributed", { id: distribution.id, memberId: target.id });
  return distribution;
}

/**
 * Flip a member's pending wishlist entries to DISTRIBUTED when a distribution
 * (item map) covers them. Only performs the write (via `db`, so it can share
 * a transaction with the caller's own write) — the caller is responsible for
 * the audit log / cache invalidation / broadcast side effects once the
 * transaction has actually committed.
 */
async function markWishlistFulfilled(
  guildId: string,
  target: { id: string; marketWishlist: unknown; role: string; cp: number | null; ign?: string | null },
  distItems: Record<string, number | boolean | string>,
  actorId: string,
  db: DbClient = prisma,
): Promise<{ fulfilled: string[] } | null> {
  const [rules, mountIds] = await Promise.all([getEffectiveMarketRules(guildId), activeMountIds(guildId)]);
  const tier = resolveDistributionTier(target, rules);
  const wishlist = normalizeWishlist(target.marketWishlist, rules, tier, mountIds);
  if (wishlist.length === 0) return null;

  const now = new Date().toISOString();
  const fulfilled: string[] = [];
  const next = wishlist.map((item) => {
    if (item.status !== "DISTRIBUTED" && distributionCoversWish(item, distItems)) {
      fulfilled.push(WISHLIST_LABELS[item.key] || item.label || item.key);
      return { ...item, status: "DISTRIBUTED" as const, fulfilledAt: now, fulfilledById: actorId };
    }
    return item;
  });
  if (fulfilled.length === 0) return null;

  await db.guildMember.update({
    where: { id: target.id },
    data: { marketWishlist: next as object },
  });
  return { fulfilled };
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
        // Most rendered fields (ign/class/cp/tier) are already snapshotted on
        // the distribution row itself — this relation only needs the *current*
        // rank label + avatar, not the full member row (skips `marketWishlist`
        // Json and other columns unused here).
        member: {
          select: {
            id: true,
            ign: true,
            role: true,
            rankName: true,
            user: { select: { displayName: true, avatarUrl: true } },
          },
        },
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

/** Per-tier caps for the quantity-based resources (logs / temporal / materials). */
function wishlistCaps(rules: MarketRules, tier: DistributionTier) {
  const limit = rules.limits[tier];
  return { logs: limit.logs, temporalPieces: limit.temporalPieces, materials: limit.materials };
}

/**
 * Validate a raw wishlist blob into clean `WishlistItem[]`, dropping anything that
 * doesn't fit the taxonomy. Quantities are clamped to the member's tier caps.
 * Legacy plain-string entries (old wishlist format) are silently dropped.
 */
export function normalizeWishlist(
  raw: unknown,
  rules: MarketRules,
  tier: DistributionTier,
  allowedMountIds?: Set<string>,
): WishlistItem[] {
  if (!Array.isArray(raw)) return [];
  const caps = wishlistCaps(rules, tier);
  const gearRarities = new Set<WishlistRarity>(GEAR_RARITIES);
  const weaponRarities = new Set<WishlistRarity>(WEAPON_RARITIES);
  const armorTypes = new Set<ArmorType>(ARMOR_TYPES);
  const out: WishlistItem[] = [];
  const seen = new Set<string>();

  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue; // drop legacy strings
    const e = entry as Partial<WishlistItem>;
    const category = e.category;
    const key = typeof e.key === "string" ? e.key : "";
    if (!key) continue;

    let item: WishlistItem | null = null;
    switch (category) {
      case "WEAPON":
        if (WEAPON_TYPES[key] && e.rarity && weaponRarities.has(e.rarity)) {
          item = { category, key, rarity: e.rarity };
        }
        break;
      case "ARMOR":
        if (ARMOR_PIECES[key] && e.rarity && gearRarities.has(e.rarity)) {
          const armorType = e.armorType && armorTypes.has(e.armorType) ? e.armorType : undefined;
          item = { category, key, rarity: e.rarity, ...(armorType ? { armorType } : {}) };
        }
        break;
      case "ACCESSORY":
        if (ACCESSORY_PIECES[key] && e.rarity && gearRarities.has(e.rarity)) {
          item = { category, key, rarity: e.rarity };
        }
        break;
      case "LOGS":
      case "TEMPORAL": {
        const expectedKey = category === "LOGS" ? "logs" : "temporalPieces";
        const cap = category === "LOGS" ? caps.logs : caps.temporalPieces;
        const qty = Math.floor(Number(e.quantity));
        if (key === expectedKey && qty > 0) {
          item = { category, key: expectedKey, quantity: Math.min(qty, Math.max(cap, 1)) };
        }
        break;
      }
      case "MATERIALS": {
        const qty = Math.floor(Number(e.quantity));
        if (MATERIAL_TYPES[key] && qty > 0) {
          item = { category, key, quantity: Math.min(qty, Math.max(caps.materials, 1)) };
        }
        break;
      }
      case "MOUNT": {
        // Keep the mount if it's still in the guild's active catalog. When the
        // catalog isn't available (allowedMountIds undefined) keep it as-is.
        if (!allowedMountIds || allowedMountIds.has(key)) {
          const label = typeof e.label === "string" ? e.label : undefined;
          item = { category, key, ...(label ? { label } : {}) };
        }
        break;
      }
    }

    if (!item) continue;
    // Carry over server-managed distribution status.
    item.status = e.status === "DISTRIBUTED" ? "DISTRIBUTED" : "PENDING";
    if (item.status === "DISTRIBUTED") {
      if (typeof e.fulfilledAt === "string") item.fulfilledAt = e.fulfilledAt;
      if (typeof e.fulfilledById === "string") item.fulfilledById = e.fulfilledById;
    }
    // De-dupe on category+key (keep first / highest-priority pick)
    const dedupe = `${item.category}:${item.key}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    out.push(item);
  }

  return out;
}

/** Summary counts for a member's wishlist, used by the table Status column + carousel. */
export function wishlistSummary(items: WishlistItem[]): { total: number; distributed: number } {
  return {
    total: items.length,
    distributed: items.filter((i) => i.status === "DISTRIBUTED").length,
  };
}

/** Member views their own wishlist + the taxonomy caps for their tier. */
export async function getMyWishlist(guildId: string, actorId: string) {
  // Per-user by definition ("mine") — actorId is already part of the key,
  // so there's no cross-viewer leak risk here the way there is elsewhere.
  return redisCache.getOrSet(cacheKeys.marketWishlistMine(guildId, actorId), cacheTtl.marketWishlistMine, async () => {
    const member = await requireActiveMember(guildId, actorId);
    const [rules, mountIds] = await Promise.all([getEffectiveMarketRules(guildId), activeMountIds(guildId)]);
    const tier = resolveDistributionTier(member, rules);
    const formType: "CORE" | "NON_CORE" = tier === "CORE" ? "CORE" : "NON_CORE";
    const items = normalizeWishlist(member.marketWishlist, rules, tier, mountIds);
    return { items, tier, formType, caps: wishlistCaps(rules, tier) };
  });
}

/** Member sets their own wishlist. Items are normalized + clamped to their tier. */
export async function setWishlist(guildId: string, actorId: string, items: WishlistItem[]) {
  const member = await requireActiveMember(guildId, actorId);
  const [rules, mountIds] = await Promise.all([getEffectiveMarketRules(guildId), activeMountIds(guildId)]);
  const tier = resolveDistributionTier(member, rules);

  // Preserve prior distribution status so a member re-saving can't reset a
  // fulfilled item back to pending.
  const prior = new Map(
    normalizeWishlist(member.marketWishlist, rules, tier, mountIds).map((i) => [`${i.category}:${i.key}`, i]),
  );
  const cleaned = normalizeWishlist(items, rules, tier, mountIds).map((i) => {
    const was = prior.get(`${i.category}:${i.key}`);
    if (was?.status === "DISTRIBUTED") {
      return { ...i, status: "DISTRIBUTED" as const, fulfilledAt: was.fulfilledAt, fulfilledById: was.fulfilledById };
    }
    return i;
  });

  await prisma.guildMember.update({
    where: { id: member.id },
    data: { marketWishlist: cleaned as object },
  });

  await redisCache.delMany([
    cacheKeys.marketWishlistMine(guildId, actorId),
    cacheKeys.marketWishlistMaster(guildId),
  ]);
  void broadcastToGuild(guildId, "market_wishlist_updated", { memberId: member.id });
  return { items: cleaned, tier, caps: wishlistCaps(rules, tier) };
}

// ─── Priority Queue (enhanced scoring) ───────────────────────────────

export async function getPriorityQueue(guildId: string, actorId: string) {
  await requireActiveMember(guildId, actorId);
  // Not viewer-specific — the whole ranked roster, same for everyone.
  return redisCache.getOrSet(cacheKeys.marketPriority(guildId), cacheTtl.marketPriority, () =>
    getPriorityQueueUncached(guildId),
  );
}

async function getPriorityQueueUncached(guildId: string) {
  const [rules, mountIds, members] = await Promise.all([
    getEffectiveMarketRules(guildId),
    activeMountIds(guildId),
    prisma.guildMember.findMany({
      where: { guildId, isActive: true },
      include: { user: { select: { id: true, displayName: true, avatarUrl: true } } },
    }),
  ]);
  const w = rules.weights;
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
      const memberTier = resolveDistributionTier(m, rules);
      const wishlist = normalizeWishlist(m.marketWishlist, rules, memberTier, mountIds);

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
        tier: memberTier,
        cp,
        dkp,
        attendance,
        bossParticipation,
        previousReceived,
        priorityScore,
        manualSeq: m.marketPrioritySeq,
        manualReason: m.marketPriorityReason,
        wishlist,
        wishlistSummary: wishlistSummary(wishlist),
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

  await redisCache.del(cacheKeys.marketPriority(guildId));
  void broadcastToGuild(guildId, "priority_sequence_changed", { memberId, prioritySeq });
  return updated;
}

// ─── Wishlist master list (officer view of every requested item) ─────

export interface WishlistMasterRow {
  memberId: string;
  userId: string;
  ign: string;
  role: string;
  tier: DistributionTier;
  item: WishlistItem;
  label: string;
  status: "PENDING" | "DISTRIBUTED";
  fulfilledAt: string | null;
}

export async function getWishlistMasterList(
  guildId: string,
  actorId: string,
  filters: { status?: "PENDING" | "DISTRIBUTED"; category?: string; memberId?: string; search?: string } = {},
): Promise<WishlistMasterRow[]> {
  await requireOfficer(guildId, actorId);

  // The filters below are applied in-memory on an otherwise unfiltered,
  // guild-wide row set — cache that unfiltered set (safe to share across
  // every officer regardless of which filters THEY passed) and filter/sort
  // per-request against it, instead of caching once per filter combination.
  const rows = await redisCache.getOrSet(
    cacheKeys.marketWishlistMaster(guildId),
    cacheTtl.marketWishlistMaster,
    () => getWishlistMasterRowsUncached(guildId),
  );

  let out = rows;
  if (filters.status) out = out.filter((r) => r.status === filters.status);
  if (filters.category) out = out.filter((r) => r.item.category === filters.category);
  if (filters.memberId) out = out.filter((r) => r.memberId === filters.memberId);
  if (filters.search?.trim()) {
    const s = filters.search.toLowerCase();
    out = out.filter((r) => r.ign.toLowerCase().includes(s) || r.label.toLowerCase().includes(s));
  }

  // Pending first, then by member IGN, then item label.
  return [...out].sort((a, b) => {
    if (a.status !== b.status) return a.status === "PENDING" ? -1 : 1;
    return a.ign.localeCompare(b.ign) || a.label.localeCompare(b.label);
  });
}

async function getWishlistMasterRowsUncached(guildId: string): Promise<WishlistMasterRow[]> {
  const [rules, mountIds, mounts, members] = await Promise.all([
    getEffectiveMarketRules(guildId),
    activeMountIds(guildId),
    prisma.guildMount
      ? prisma.guildMount
          .findMany({ where: { guildId }, select: { id: true, name: true } })
          .catch((err) => {
            if (isMissingMountTable(err)) return [] as { id: string; name: string }[];
            throw err;
          })
      : Promise.resolve([] as { id: string; name: string }[]),
    prisma.guildMember.findMany({
      where: { guildId, isActive: true },
      include: { user: { select: { displayName: true } } },
    }),
  ]);
  const mountNames = new Map(mounts.map((m) => [m.id, m.name]));

  const rows: WishlistMasterRow[] = [];
  for (const m of members) {
    const tier = resolveDistributionTier(m, rules);
    const items = normalizeWishlist(m.marketWishlist, rules, tier, mountIds);
    for (const item of items) {
      const label =
        item.category === "MOUNT"
          ? mountNames.get(item.key) || item.label || "Mount"
          : WISHLIST_LABELS[item.key] || item.key;
      rows.push({
        memberId: m.id,
        userId: m.userId,
        ign: m.ign || m.user.displayName,
        role: m.role,
        tier,
        item,
        label,
        status: item.status === "DISTRIBUTED" ? "DISTRIBUTED" : "PENDING",
        fulfilledAt: item.fulfilledAt || null,
      });
    }
  }

  return rows;
}

// ─── Notify members to submit a request ──────────────────────────────

export async function notifyMembersToRequest(
  guildId: string,
  actorId: string,
  payload: { itemLabel: string; itemRef?: string; memberIds?: string[]; message?: string },
) {
  const officer = await requireOfficer(guildId, actorId);

  const where: { guildId: string; isActive: boolean; id?: { in: string[] } } = { guildId, isActive: true };
  if (payload.memberIds && payload.memberIds.length > 0) {
    where.id = { in: payload.memberIds };
  }
  const recipients = await prisma.guildMember.findMany({ where, select: { userId: true } });
  // Don't notify the officer themselves unless explicitly targeted.
  const targets = recipients.filter((r) => payload.memberIds?.length || r.userId !== officer.userId);
  if (targets.length === 0) throw new BadRequestError("No members to notify");

  const body =
    payload.message?.trim() ||
    `Please submit your wishlist request for ${payload.itemLabel}.`;
  await createNotifications(
    targets.map((t) => ({
      userId: t.userId,
      type: "wishlist_request",
      title: `Request log: ${payload.itemLabel}`,
      body,
      metadata: { guildId, itemLabel: payload.itemLabel, itemRef: payload.itemRef },
    })),
  );

  await writeAuditLog({
    actorId,
    guildId,
    action: AUDIT_ACTIONS.WISHLIST_LOG_REQUESTED,
    target: "Guild",
    targetId: guildId,
    detail: { itemLabel: payload.itemLabel, itemRef: payload.itemRef, count: targets.length },
  });

  return { notified: targets.length };
}

// ─── Market Rules (Settings) ─────────────────────────────────────────

export async function getMarketRules(guildId: string, actorId: string) {
  await requireActiveMember(guildId, actorId);
  // Not viewer-specific — same rules for everyone in the guild.
  return redisCache.getOrSet(cacheKeys.marketRules(guildId), cacheTtl.marketRules, () =>
    getEffectiveMarketRules(guildId),
  );
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

  await redisCache.del(cacheKeys.marketRules(guildId));
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

  // Only the plain, unfiltered page-1 default view is cached (same
  // "invalidate just page 1" reasoning as boss rotation's audit log —
  // filtered/deeper pages go straight to the DB).
  if (page === 1 && !opts.action && take === 30) {
    return redisCache.getOrSet(cacheKeys.marketAuditPage1(guildId), cacheTtl.marketAudit, () =>
      getMarketAuditLogsUncached(guildId, page, take, opts.action),
    );
  }
  return getMarketAuditLogsUncached(guildId, page, take, opts.action);
}

async function getMarketAuditLogsUncached(guildId: string, page: number, take: number, action?: string) {
  const where: any = {
    guildId,
    action: action ? action : { in: MARKET_AUDIT_ACTIONS },
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
