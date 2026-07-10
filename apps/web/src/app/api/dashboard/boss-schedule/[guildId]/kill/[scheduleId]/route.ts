import type { NextRequest } from "next/server";
import { services, cache, broadcastToGuild, BadRequestError } from "@guild/core";
import { withApi, ok } from "@/server/respond";
import { requireAuth } from "@/server/guards";
import { getClientInfo, readJson } from "@/server/request";

export const runtime = "nodejs";

function invalidateBossScheduleCache(guildId: string | null | undefined) {
  return cache.invalidatePattern(guildId ? `boss-schedule:${guildId}:*` : `boss-schedule:*`);
}

export const PATCH = withApi(
  async (
    req: NextRequest,
    ctx: RouteContext<"/api/dashboard/boss-schedule/[guildId]/kill/[scheduleId]">,
  ) => {
    const user = requireAuth(req);
    const { guildId, scheduleId } = await ctx.params;
    const { killedAt, lootDrop, screenshotUrl } = await readJson<{
      killedAt: string;
      lootDrop?: string;
      screenshotUrl?: string;
    }>(req);

    if (!killedAt) throw new BadRequestError("Killed timestamp is required");

    const { ipAddress, userAgent } = getClientInfo(req);
    const { updatedEvent, nextSchedule, checkInSession } = await services.dashboard.logBossKill(
      guildId,
      scheduleId,
      killedAt,
      user.userId,
      lootDrop,
      screenshotUrl,
      ipAddress,
      userAgent,
    );

    await Promise.all([
      invalidateBossScheduleCache(updatedEvent.guildId || guildId),
      cache.invalidatePattern(`stats:${guildId}:*`),
      cache.invalidatePattern(`attendance:pending:${guildId}:*`),
      cache.invalidatePattern(`attendance:stats:${guildId}:*`),
    ]);

    if (checkInSession) {
      broadcastToGuild(guildId, "attendance_session_created", {
        ...checkInSession,
        expiresAt: checkInSession.expiresAt.toISOString(),
        createdAt: checkInSession.createdAt.toISOString(),
      });
    }

    const socketPayload = {
      ...updatedEvent,
      spawnTime: updatedEvent.spawnTime.toISOString(),
      killedAt: updatedEvent.killedAt ? updatedEvent.killedAt.toISOString() : null,
      createdAt: updatedEvent.createdAt.toISOString(),
    };
    broadcastToGuild(updatedEvent.guildId || guildId, "boss_rotation_updated", socketPayload);

    let serializedNextSchedule = null;
    if (nextSchedule) {
      serializedNextSchedule = {
        ...nextSchedule,
        spawnTime: nextSchedule.spawnTime.toISOString(),
        killedAt: null,
        createdAt: nextSchedule.createdAt.toISOString(),
      };
      broadcastToGuild(nextSchedule.guildId || guildId, "boss_rotation_updated", serializedNextSchedule);
    }

    return ok({ schedule: socketPayload, nextSchedule: serializedNextSchedule });
  },
);
