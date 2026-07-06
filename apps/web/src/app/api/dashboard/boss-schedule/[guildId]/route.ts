import type { NextRequest } from "next/server";
import { services, cache, broadcastToGuild, BadRequestError } from "@guild/core";
import { withApi, ok } from "@/server/respond";
import { requireAuth } from "@/server/guards";
import { dashboardLimit } from "@/server/ratelimit";
import { getClientInfo, readJson } from "@/server/request";

export const runtime = "nodejs";

function invalidateBossScheduleCache(guildId: string | null | undefined) {
  return cache.invalidatePattern(guildId ? `boss-schedule:${guildId}:*` : `boss-schedule:*`);
}

export const GET = withApi(
  async (req: NextRequest, ctx: RouteContext<"/api/dashboard/boss-schedule/[guildId]">) => {
    const user = requireAuth(req);
    dashboardLimit(req, user.userId);
    const { guildId } = await ctx.params;
    const cacheKey = `boss-schedule:${guildId}:user:${user.userId}`;

    const cached = await cache.get<unknown>(cacheKey);
    if (cached) return ok(cached);

    const schedules = await services.dashboard.getBossSchedules(guildId, user.userId);
    const data = { schedules };
    await cache.set(cacheKey, data, 15);
    return ok(data);
  },
);

export const POST = withApi(
  async (req: NextRequest, ctx: RouteContext<"/api/dashboard/boss-schedule/[guildId]">) => {
    const user = requireAuth(req);
    const { guildId } = await ctx.params;
    const { bossName, bossImageUrl, spawnTime, location, guildTurn, guildTurnGuildId, isFaction } =
      await readJson<{
        bossName: string;
        bossImageUrl?: string;
        spawnTime: string;
        location: string;
        guildTurn?: string;
        guildTurnGuildId?: string | null;
        isFaction?: boolean;
      }>(req);

    if (!bossName || !spawnTime || !location) {
      throw new BadRequestError("Missing boss name, spawn time, or location");
    }

    const { ipAddress, userAgent } = getClientInfo(req);
    // A faction-wide schedule has a null guildId.
    const targetGuildId = isFaction ? null : guildId;

    const schedule = await services.dashboard.createBossSchedule(
      targetGuildId,
      { bossName, bossImageUrl, spawnTime, location, guildTurn, guildTurnGuildId },
      user.userId,
      ipAddress,
      userAgent,
    );

    await Promise.all([
      invalidateBossScheduleCache(targetGuildId),
      cache.invalidatePattern(`stats:${targetGuildId || guildId}:*`),
    ]);

    const socketPayload = {
      ...schedule,
      spawnTime: schedule.spawnTime.toISOString(),
      killedAt: schedule.killedAt ? schedule.killedAt.toISOString() : null,
      createdAt: schedule.createdAt.toISOString(),
    };
    broadcastToGuild(targetGuildId, "boss_rotation_updated", socketPayload);

    return ok({ schedule: socketPayload });
  },
);
