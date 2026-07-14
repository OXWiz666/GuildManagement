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
