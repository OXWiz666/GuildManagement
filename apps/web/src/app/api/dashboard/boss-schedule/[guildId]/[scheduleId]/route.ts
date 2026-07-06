import type { NextRequest } from "next/server";
import { services, cache, broadcastToGuild } from "@guild/core";
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
    ctx: RouteContext<"/api/dashboard/boss-schedule/[guildId]/[scheduleId]">,
  ) => {
    const user = requireAuth(req);
    const { guildId, scheduleId } = await ctx.params;
    const payload = await readJson<{
      bossName?: string;
      bossImageUrl?: string;
      spawnTime?: string;
      location?: string;
      guildTurn?: string;
      guildTurnGuildId?: string | null;
      isFaction?: boolean;
    }>(req);

    const { ipAddress, userAgent } = getClientInfo(req);
    const schedule = await services.dashboard.updateBossSchedule(
      guildId,
      scheduleId,
      payload,
      user.userId,
      ipAddress,
      userAgent,
    );

    await Promise.all([
      invalidateBossScheduleCache(schedule.guildId || guildId),
      cache.invalidatePattern(`stats:${guildId}:*`),
    ]);

    const socketPayload = {
      ...schedule,
      spawnTime: schedule.spawnTime.toISOString(),
      killedAt: schedule.killedAt ? schedule.killedAt.toISOString() : null,
      createdAt: schedule.createdAt.toISOString(),
    };
    broadcastToGuild(schedule.guildId || guildId, "boss_rotation_updated", socketPayload);

    return ok({ schedule: socketPayload });
  },
);

export const DELETE = withApi(
  async (
    req: NextRequest,
    ctx: RouteContext<"/api/dashboard/boss-schedule/[guildId]/[scheduleId]">,
  ) => {
    const user = requireAuth(req);
    const { guildId, scheduleId } = await ctx.params;
    const { ipAddress, userAgent } = getClientInfo(req);

    const result = await services.dashboard.deleteBossSchedule(
      guildId,
      scheduleId,
      user.userId,
      ipAddress,
      userAgent,
    );

    await Promise.all([
      invalidateBossScheduleCache(guildId),
      cache.invalidatePattern(`stats:${guildId}:*`),
    ]);

    broadcastToGuild(guildId, "boss_schedule_deleted", { scheduleId });
    return ok(result);
  },
);
