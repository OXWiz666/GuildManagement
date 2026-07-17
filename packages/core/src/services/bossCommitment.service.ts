import { prisma } from "@guild/db";
import { getGuildMemberByUser } from "./guild.service";
import { broadcastToGuild } from "../lib/socket";
import { ForbiddenError, NotFoundError } from "../utils/errors";

const MEMBER_SELECT = {
  id: true,
  ign: true,
  role: true,
  rankName: true,
  userId: true,
} as const;

async function requireActiveMember(guildId: string, actorId: string) {
  const member = await getGuildMemberByUser(actorId, guildId);
  if (!member || !member.isActive) {
    throw new ForbiddenError("You must be an active guild member");
  }
  return member;
}

/** Headcount + roster for a specific boss spawn, scoped to the caller's own
 *  guild — a shared faction-wide schedule row still shows only this guild's
 *  committed members, matching how the rest of the dashboard is guild-scoped. */
export async function getBossCommitments(guildId: string, actorId: string, scheduleId: string) {
  await requireActiveMember(guildId, actorId);

  const schedule = await prisma.bossSchedule.findUnique({ where: { id: scheduleId } });
  if (!schedule) throw new NotFoundError("Boss schedule not found");

  const rows = await prisma.bossCommitment.findMany({
    where: { guildId, scheduleId },
    include: { member: { select: MEMBER_SELECT } },
    orderBy: { createdAt: "asc" },
  });

  return {
    count: rows.length,
    committed: rows.some((r) => r.member.userId === actorId),
    members: rows.map((r) => ({
      id: r.member.id,
      ign: r.member.ign,
      role: r.member.role,
      rankName: r.member.rankName,
    })),
  };
}

/** Same shape as `getBossCommitments`, for many schedules in one round trip —
 *  used by the boss-rotation grid, which otherwise fires one request per
 *  visible card. Skips the per-schedule existence check `getBossCommitments`
 *  does (a stale/foreign scheduleId just comes back with the zero-state
 *  instead of a 404, which is fine for a bulk read). */
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

  const rows = await prisma.bossCommitment.findMany({
    where: { guildId, scheduleId: { in: scheduleIds } },
    include: { member: { select: MEMBER_SELECT } },
    orderBy: { createdAt: "asc" },
  });

  for (const row of rows) {
    const bucket = result[row.scheduleId];
    if (!bucket) continue;
    bucket.count += 1;
    if (row.member.userId === actorId) bucket.committed = true;
    bucket.members.push({
      id: row.member.id,
      ign: row.member.ign,
      role: row.member.role,
      rankName: row.member.rankName,
    });
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
  void broadcastToGuild(guildId, "boss_commitment_updated", { scheduleId, count });
  return { committed: committing, count };
}
