import type { NextRequest } from "next/server";
import { services, cache, broadcastToGuild, BadRequestError } from "@guild/core";
import { withApi, ok } from "@/server/respond";
import { requireAuth } from "@/server/guards";
import { getClientInfo, readJson } from "@/server/request";

export const runtime = "nodejs";

export const PATCH = withApi(
  async (req: NextRequest, ctx: RouteContext<"/api/dashboard/attendance/confirm/[recordId]">) => {
    const user = requireAuth(req);
    const { recordId } = await ctx.params;
    const { guildId } = await readJson<{ guildId?: string }>(req);
    if (!guildId) {
      throw new BadRequestError("Guild ID is required");
    }

    const { ipAddress, userAgent } = getClientInfo(req);
    const result = await services.dashboard.confirmAttendanceRecord(
      guildId,
      recordId,
      user.userId,
      ipAddress,
      userAgent,
    );

    await Promise.all([
      cache.invalidatePattern(`boss-schedule:${guildId}:*`),
      cache.invalidatePattern(`attendance:pending:${guildId}:*`),
      cache.invalidatePattern(`attendance:stats:${guildId}:*`),
      cache.invalidatePattern(`stats:${guildId}:*`),
    ]);

    const serializedRecord = { ...result.record, joinedAt: result.record.joinedAt.toISOString() };
    const payload = { ...result, record: serializedRecord };
    broadcastToGuild(guildId, "attendance_record_confirmed", payload);

    return ok(payload);
  },
);
