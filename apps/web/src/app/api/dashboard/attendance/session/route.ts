import type { NextRequest } from "next/server";
import { services, cache, broadcastToGuild, BadRequestError } from "@guild/core";
import type { AttendanceType } from "@guild/db";
import { withApi, ok } from "@/server/respond";
import { requireAuth } from "@/server/guards";
import { getClientInfo, readJson } from "@/server/request";

export const runtime = "nodejs";

export const POST = withApi(async (req: NextRequest) => {
  const user = requireAuth(req);
  const { guildId, title, type, minutes, bossScheduleId } = await readJson<{
    guildId: string;
    title?: string;
    type: AttendanceType;
    minutes: number;
    bossScheduleId?: string;
  }>(req);

  if (!guildId || (!title && !bossScheduleId) || !type || !minutes || isNaN(Number(minutes))) {
    throw new BadRequestError("Missing or invalid session details");
  }

  const { ipAddress, userAgent } = getClientInfo(req);
  const session = await services.dashboard.createAttendanceSession(
    guildId,
    title || "",
    type,
    Number(minutes),
    user.userId,
    ipAddress,
    userAgent,
    bossScheduleId,
  );

  await Promise.all([
    cache.invalidatePattern(`boss-schedule:${guildId}:*`),
    cache.invalidatePattern(`attendance:pending:${guildId}:*`),
    cache.invalidatePattern(`attendance:stats:${guildId}:*`),
    cache.invalidatePattern(`stats:${guildId}:*`),
  ]);

  const socketPayload = {
    ...session,
    expiresAt: session.expiresAt.toISOString(),
    createdAt: session.createdAt.toISOString(),
  };
  broadcastToGuild(guildId, "attendance_session_created", socketPayload);

  return ok({ session: socketPayload });
});
