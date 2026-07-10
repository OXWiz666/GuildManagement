import { prisma } from "@guild/db";
import { getGuildMemberByUser } from "./guild.service";
import { writeAuditLog } from "./audit.service";
import { createNotification } from "./notification.service";
import { broadcastToGuild } from "../lib/socket";
import { NotFoundError, ForbiddenError, BadRequestError } from "../utils/errors";
import { AUDIT_ACTIONS, hasMinimumRole, type GuildRoleType } from "@guild/shared";
import {
  getEffectiveMarketRules,
  resolveDistributionTier,
  normalizeWishlist,
  isMissingMountTable,
} from "./market.service";

// ─── Membership helpers ──────────────────────────────────────────────

async function requireRole(guildId: string, userId: string, minimum: GuildRoleType) {
  const member = await getGuildMemberByUser(userId, guildId);
  if (!member || !member.isActive) {
    throw new ForbiddenError("You must be an active guild member");
  }
  if (!hasMinimumRole(member.role as GuildRoleType, minimum)) {
    throw new ForbiddenError(`Only ${minimum} and above can perform this action`);
  }
  return member;
}

export interface MountCatalogEntry {
  id: string;
  name: string;
  iconUrl: string | null;
  maxSlots: number;
  isActive: boolean;
  distributed: number;
  remaining: number;
}

/** List the guild's mount catalog with consumed/remaining slot counts. */
export async function listMounts(guildId: string, actorId: string): Promise<MountCatalogEntry[]> {
  const member = await getGuildMemberByUser(actorId, guildId);
  if (!member || !member.isActive) {
    throw new ForbiddenError("You must be an active guild member");
  }

  // Degrade gracefully until the 0005 mount migration + client regen land.
  if (!prisma.guildMount || !prisma.mountDistribution) return [];
  let mounts, counts;
  try {
    [mounts, counts] = await Promise.all([
      prisma.guildMount.findMany({ where: { guildId }, orderBy: { createdAt: "asc" } }),
      prisma.mountDistribution.groupBy({ by: ["mountId"], where: { guildId }, _count: { _all: true } }),
    ]);
  } catch (err) {
    if (isMissingMountTable(err)) return [];
    throw err;
  }
  const countMap = new Map(counts.map((c) => [c.mountId, c._count._all]));

  return mounts.map((m) => {
    const distributed = countMap.get(m.id) || 0;
    return {
      id: m.id,
      name: m.name,
      iconUrl: m.iconUrl,
      maxSlots: m.maxSlots,
      isActive: m.isActive,
      distributed,
      remaining: Math.max(0, m.maxSlots - distributed),
    };
  });
}

/** Leader creates or updates a mount in the catalog. */
export async function upsertMount(
  guildId: string,
  actorId: string,
  payload: { id?: string; name: string; iconUrl?: string | null; maxSlots: number; isActive?: boolean },
) {
  await requireRole(guildId, actorId, "GUILD_LEADER");

  let mount;
  if (payload.id) {
    const existing = await prisma.guildMount.findUnique({ where: { id: payload.id } });
    if (!existing || existing.guildId !== guildId) throw new NotFoundError("Mount not found");
    mount = await prisma.guildMount.update({
      where: { id: payload.id },
      data: {
        name: payload.name,
        iconUrl: payload.iconUrl ?? null,
        maxSlots: payload.maxSlots,
        ...(payload.isActive === undefined ? {} : { isActive: payload.isActive }),
      },
    });
  } else {
    mount = await prisma.guildMount.create({
      data: {
        guildId,
        name: payload.name,
        iconUrl: payload.iconUrl ?? null,
        maxSlots: payload.maxSlots,
        isActive: payload.isActive ?? true,
        createdById: actorId,
      },
    });
  }

  await writeAuditLog({
    actorId,
    guildId,
    action: AUDIT_ACTIONS.MOUNT_CATALOG_UPDATED,
    target: "GuildMount",
    targetId: mount.id,
    detail: { name: mount.name, maxSlots: mount.maxSlots, created: !payload.id },
  });
  void broadcastToGuild(guildId, "mount_catalog_updated", { mountId: mount.id });
  return mount;
}

/** Leader removes a mount from the catalog. */
export async function deleteMount(guildId: string, actorId: string, mountId: string) {
  await requireRole(guildId, actorId, "GUILD_LEADER");
  const existing = await prisma.guildMount.findUnique({ where: { id: mountId } });
  if (!existing || existing.guildId !== guildId) throw new NotFoundError("Mount not found");

  await prisma.guildMount.delete({ where: { id: mountId } });
  await writeAuditLog({
    actorId,
    guildId,
    action: AUDIT_ACTIONS.MOUNT_CATALOG_UPDATED,
    target: "GuildMount",
    targetId: mountId,
    detail: { name: existing.name, deleted: true },
  });
  void broadcastToGuild(guildId, "mount_catalog_updated", { mountId });
  return { deleted: true };
}

/** Officer distributes a mount to a member — consumes a slot and marks the wish fulfilled. */
export async function distributeMount(
  guildId: string,
  actorId: string,
  payload: { mountId: string; memberId: string; note?: string },
) {
  await requireRole(guildId, actorId, "OFFICER");

  const [mount, target] = await Promise.all([
    prisma.guildMount.findUnique({ where: { id: payload.mountId } }),
    prisma.guildMember.findUnique({
      where: { id: payload.memberId },
      include: { user: { select: { displayName: true } } },
    }),
  ]);
  if (!mount || mount.guildId !== guildId) throw new NotFoundError("Mount not found");
  if (!mount.isActive) throw new BadRequestError("This mount is not available");
  if (!target || target.guildId !== guildId || !target.isActive) {
    throw new NotFoundError("Target member not found in this guild");
  }

  const distributedCount = await prisma.mountDistribution.count({
    where: { guildId, mountId: mount.id },
  });
  if (distributedCount >= mount.maxSlots) {
    throw new BadRequestError(`All ${mount.maxSlots} slot(s) for ${mount.name} have been distributed`);
  }

  const ign = target.ign || target.user.displayName;
  const record = await prisma.mountDistribution.create({
    data: {
      guildId,
      mountId: mount.id,
      memberId: target.id,
      ignSnapshot: ign,
      mountNameSnapshot: mount.name,
      note: payload.note?.trim() || null,
      distributedById: actorId,
    },
  });

  // Flip the member's wished mount (if any) to DISTRIBUTED.
  const rules = await getEffectiveMarketRules(guildId);
  const tier = resolveDistributionTier(target, rules);
  const wishlist = normalizeWishlist(target.marketWishlist, rules, tier);
  let changed = false;
  const nextWishlist = wishlist.map((item) => {
    if (item.category === "MOUNT" && item.key === mount.id && item.status !== "DISTRIBUTED") {
      changed = true;
      return {
        ...item,
        status: "DISTRIBUTED" as const,
        fulfilledAt: new Date().toISOString(),
        fulfilledById: actorId,
      };
    }
    return item;
  });
  if (changed) {
    await prisma.guildMember.update({
      where: { id: target.id },
      data: { marketWishlist: nextWishlist as object },
    });
  }

  await writeAuditLog({
    actorId,
    guildId,
    action: AUDIT_ACTIONS.MOUNT_DISTRIBUTED,
    target: "MountDistribution",
    targetId: record.id,
    detail: { mountName: mount.name, ign },
  });

  await createNotification({
    userId: target.userId,
    type: "mount_distributed",
    title: "Mount received",
    body: `You were awarded the ${mount.name} mount.`,
    metadata: { guildId, mountId: mount.id },
  });

  void broadcastToGuild(guildId, "mount_distributed", { mountId: mount.id, memberId: target.id });
  void broadcastToGuild(guildId, "market_wishlist_updated", { memberId: target.id });
  return record;
}
