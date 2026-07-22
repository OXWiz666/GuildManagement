import { prisma } from "@guild/db";
import { getGuildMemberByUser } from "./guild.service";
import { broadcastToGuild } from "../lib/socket";
import { cache as redisCache } from "../lib/redis";
import { cacheKeys, ttl as cacheTtl } from "../lib/cache-keys";
import { ForbiddenError, NotFoundError } from "../utils/errors";

const MEMBER_SELECT = {
  id: true,
  ign: true,
  role: true,
  rankName: true,
  userId: true,
} as const;

type CommitmentMember = { id: string; ign: string | null; role: string; rankName: string | null; userId: string };

async function requireActiveMember(guildId: string, actorId: string) {
  const member = await getGuildMemberByUser(actorId, guildId);
  if (!member || !member.isActive) {
    throw new ForbiddenError("You must be an active guild member");
  }
  return member;
}

function toCommitmentMember(row: { member: CommitmentMember }): CommitmentMember {
  return {
    id: row.member.id,
    ign: row.member.ign,
    role: row.member.role,
    rankName: row.member.rankName,
    userId: row.member.userId,
  };
}

/** Shared (not viewer-specific) committed-member rows for one schedule —
 * cached, since `!spawn`/the boss-rotation grid re-reads this far more often
 * than members actually commit. `getBossCommitments`/`getBossCommitmentsBatch`
 * derive their per-viewer `committed` flag from this at request time, never
 * baking one viewer's flag into the shared cache entry. */
async function getBossCommitmentRows(guildId: string, scheduleId: string): Promise<CommitmentMember[]> {
  return redisCache.getOrSet(cacheKeys.bossCommitments(guildId, scheduleId), cacheTtl.bossCommitments, async () => {
    const rows = await prisma.bossCommitment.findMany({
      where: { guildId, scheduleId },
      include: { member: { select: MEMBER_SELECT } },
      orderBy: { createdAt: "asc" },
    });
    return rows.map(toCommitmentMember);
  });
}

/** Headcount + roster for a specific boss spawn, scoped to the caller's own
 *  guild — a shared faction-wide schedule row still shows only this guild's
 *  committed members, matching how the rest of the dashboard is guild-scoped. */
export async function getBossCommitments(guildId: string, actorId: string, scheduleId: string) {
  await requireActiveMember(guildId, actorId);

  const schedule = await prisma.bossSchedule.findUnique({ where: { id: scheduleId } });
  if (!schedule) throw new NotFoundError("Boss schedule not found");

  const members = await getBossCommitmentRows(guildId, scheduleId);

  return {
    count: members.length,
    committed: members.some((m) => m.userId === actorId),
    members: members.map(({ id, ign, role, rankName }) => ({ id, ign, role, rankName })),
  };
}

/** Same shape as `getBossCommitments`, for many schedules in one round trip —
 *  used by the boss-rotation grid, which otherwise fires one request per
 *  visible card. Skips the per-schedule existence check `getBossCommitments`
 *  does (a stale/foreign scheduleId just comes back with the zero-state
 *  instead of a 404, which is fine for a bulk read). Cache-misses across the
 *  batch are still fetched in a single query — only the already-cached
 *  schedules skip the DB entirely, so this never regresses to one query per
 *  card even on a cold cache. */
export async function getBossCommitmentsBatch(
  guildId: string,
  actorId: string,
  scheduleIds: string[],
): Promise<Record<string, { count: number; committed: boolean; members: Array<{ id: string; ign: string | null; role: string; rankName: string | null }> }>> {
  await requireActiveMember(guildId, actorId);

  const result: Record<string, { count: number; committed: boolean; members: Array<{ id: string; ign: string | null; role: string; rankName: string | null }> }> = {};
  for (const id of scheduleIds) {
    result[id] = { count: 0, committed: false, members: [] };
  }
  if (scheduleIds.length === 0) return result;

  const byScheduleId = new Map<string, CommitmentMember[]>();
  const cachedEntries = await Promise.all(
    scheduleIds.map(async (id) => [id, await redisCache.get<CommitmentMember[]>(cacheKeys.bossCommitments(guildId, id))] as const),
  );
  const missingIds: string[] = [];
  for (const [id, cached] of cachedEntries) {
    if (cached) byScheduleId.set(id, cached);
    else missingIds.push(id);
  }

  if (missingIds.length > 0) {
    const rows = await prisma.bossCommitment.findMany({
      where: { guildId, scheduleId: { in: missingIds } },
      include: { member: { select: MEMBER_SELECT } },
      orderBy: { createdAt: "asc" },
    });
    const grouped = new Map<string, CommitmentMember[]>();
    for (const id of missingIds) grouped.set(id, []);
    for (const row of rows) {
      grouped.get(row.scheduleId)?.push(toCommitmentMember(row));
    }
    await Promise.all(
      [...grouped.entries()].map(([id, members]) => {
        byScheduleId.set(id, members);
        return redisCache.set(cacheKeys.bossCommitments(guildId, id), members, cacheTtl.bossCommitments);
      }),
    );
  }

  for (const [scheduleId, members] of byScheduleId) {
    result[scheduleId] = {
      count: members.length,
      committed: members.some((m) => m.userId === actorId),
      members: members.map(({ id, ign, role, rankName }) => ({ id, ign, role, rankName })),
    };
  }

  return result;
}

/** Toggle the caller's own commitment for a specific boss spawn. Idempotent —
 *  committing twice is a no-op, uncommitting when not committed is a no-op. */
export async function setBossCommitment(
  guildId: string,
  actorId: string,
  scheduleId: string,
  committing: boolean,
) {
  const member = await requireActiveMember(guildId, actorId);

  const schedule = await prisma.bossSchedule.findUnique({ where: { id: scheduleId } });
  if (!schedule) throw new NotFoundError("Boss schedule not found");

  if (committing) {
    await prisma.bossCommitment.upsert({
      where: { scheduleId_memberId: { scheduleId, memberId: member.id } },
      create: { guildId, scheduleId, memberId: member.id },
      update: {},
    });
  } else {
    await prisma.bossCommitment.deleteMany({ where: { scheduleId, memberId: member.id } });
  }

  const count = await prisma.bossCommitment.count({ where: { guildId, scheduleId } });
  await redisCache.del(cacheKeys.bossCommitments(guildId, scheduleId));
  void broadcastToGuild(guildId, "boss_commitment_updated", { scheduleId, count });
  return { committed: committing, count };
}
