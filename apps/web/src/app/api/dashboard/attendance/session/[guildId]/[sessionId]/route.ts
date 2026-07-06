import type { NextRequest } from "next/server";
import { services, cache, broadcastToGuild } from "@guild/core";
import { withApi, ok } from "@/server/respond";
import { requireAuth } from "@/server/guards";
import { getClientInfo, readJson } from "@/server/request";

export const runtime = "nodejs";

async function invalidateAttendanceCaches(guildId: string) {
  await Promise.all([
    cache.invalidatePattern(`boss-schedule:${guildId}:*`),
    cache.invalidatePattern(`attendance:pending:${guildId}:*`),
    cache.invalidatePattern(`attendance:stats:${guildId}:*`),
    cache.invalidatePattern(`stats:${guildId}:*`),
  ]);
}

export const PATCH = withApi(
  async (
    req: NextRequest,
    ctx: RouteContext<"/api/dashboard/attendance/session/[guildId]/[sessionId]">,
  ) => {
    const user = requireAuth(req);
    const { guildId, sessionId } = await ctx.params;
    const payload = await readJson<{ title?: string; expiresAt?: string; isActive?: boolean }>(req);
    const { ipAddress, userAgent } = getClientInfo(req);

    const session = await services.dashboard.updateAttendanceSession(
      guildId,
      sessionId,
      payload,
      user.userId,
      ipAddress,
      userAgent,
    );

    await invalidateAttendanceCaches(guildId);

    const socketPayload = {
      ...session,
      expiresAt: session.expiresAt.toISOString(),
      createdAt: session.createdAt.toISOString(),
    };
    broadcastToGuild(guildId, "attendance_session_updated", socketPayload);

    return ok({ session: socketPayload });
  },
);

export const DELETE = withApi(
  async (
    req: NextRequest,
    ctx: RouteContext<"/api/dashboard/attendance/session/[guildId]/[sessionId]">,
  ) => {
    const user = requireAuth(req);
    const { guildId, sessionId } = await ctx.params;
    const { ipAddress, userAgent } = getClientInfo(req);

    const result = await services.dashboard.deleteAttendanceSession(
      guildId,
      sessionId,
      user.userId,
      ipAddress,
      userAgent,
    );

    await invalidateAttendanceCaches(guildId);
    broadcastToGuild(guildId, "attendance_session_deleted", { sessionId });

    return ok(result);
  },
);
