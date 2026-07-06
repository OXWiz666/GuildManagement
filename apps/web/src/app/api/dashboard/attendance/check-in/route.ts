import type { NextRequest } from "next/server";
import { services, cache, broadcastToGuild, BadRequestError } from "@guild/core";
import { withApi, ok } from "@/server/respond";
import { requireAuth } from "@/server/guards";
import { readJson } from "@/server/request";
import { attendanceSubmitLimit, checkInLimit } from "@/server/ratelimit";

export const runtime = "nodejs";

export const POST = withApi(async (req: NextRequest) => {
  const user = requireAuth(req);
  checkInLimit(req);
  attendanceSubmitLimit(req, user.userId);

  const { code } = await readJson<{ code?: string }>(req);
  if (!code) {
    throw new BadRequestError("Attendance code is required");
  }

  const result = await services.dashboard.submitAttendanceCode(user.userId, code);

  await Promise.all([
    cache.invalidatePattern(`boss-schedule:${result.guildId}:*`),
    cache.invalidatePattern(`attendance:pending:${result.guildId}:*`),
    cache.invalidatePattern(`attendance:stats:${result.guildId}:*`),
    cache.invalidatePattern(`stats:${result.guildId}:*`),
  ]);

  const serializedRecord = { ...result.record, joinedAt: result.record.joinedAt.toISOString() };
  const payload = { ...result, record: serializedRecord };
  broadcastToGuild(result.guildId, "attendance_record_created", payload);

  return ok(payload);
});
