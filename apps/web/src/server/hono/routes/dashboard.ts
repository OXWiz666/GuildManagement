import { Hono } from "hono";
import {
  services,
  cache,
  broadcastToGuild,
  broadcastToFaction,
  BadRequestError,
} from "@guild/core";
import type { AttendanceType } from "@guild/db";
import type { AppEnv } from "../env";
import { ok } from "../respond";
import { getClientInfo, readJson } from "../request";
import { requireAuth, requireGuildRole } from "../middleware/auth";
import { dashboardLimit, checkInLimit, attendanceSubmitLimit } from "../middleware/ratelimit";

function invalidateBossScheduleCache(guildId: string | null | undefined) {
  return cache.invalidatePattern(guildId ? `boss-schedule:${guildId}:*` : `boss-schedule:*`);
}

/**
 * Dashboard domain — Hono port of apps/web/src/app/api/dashboard/**. Routes are
 * `requireAuth` (the dashboard service authorizes per-guild) except boss-schedule
 * commitments, which use `requireGuildRole`. Cache invalidation, socket
 * broadcasts, and Date/BigInt serialization are preserved exactly.
 */
export const dashboard = new Hono<AppEnv>()
  // ═══ Accounting ═════════════════════════════════════════════
  .get("/accounting/:guildId", requireAuth, async (c) => {
    const user = c.get("user");
    dashboardLimit(c, user.userId);
    const guildId = c.req.param("guildId");
    const page = c.req.query("page") ? parseInt(c.req.query("page")!, 10) : 1;
    const limit = c.req.query("limit") ? parseInt(c.req.query("limit")!, 10) : 25;
    const cacheKey = `accounting:${guildId}:p${page}:l${limit}`;
    const cached = await cache.get<unknown>(cacheKey);
    if (cached) return ok(c, cached);
    const data = await services.dashboard.getAccountingDashboard(guildId, user.userId, page, limit);
    await cache.set(cacheKey, data, 60);
    return ok(c, data);
  })
  .post("/accounting/adjustment/:guildId", requireAuth, async (c) => {
    const user = c.get("user");
    const guildId = c.req.param("guildId");
    const payload = await readJson<{
      accountId: string;
      accountType: "MEMBER" | "GUILD_FUND" | "TAX";
      entryType: "CREDIT" | "DEBIT";
      amount: number;
      currency: string;
      description: string;
    }>(c);
    if (!payload.accountId || !payload.accountType || !payload.entryType || !payload.amount || !payload.currency || !payload.description) {
      throw new BadRequestError("Missing dynamic transaction details");
    }
    const { ipAddress, userAgent } = getClientInfo(c);
    const entry = await services.dashboard.createTreasuryAdjustment(guildId, payload, user.userId, ipAddress, userAgent);
    await Promise.all([
      cache.invalidatePattern(`accounting:${guildId}:*`),
      cache.invalidatePattern(`stats:${guildId}:*`),
    ]);
    const socketPayload = { ...entry, amount: entry.amount.toString(), createdAt: entry.createdAt.toISOString() };
    broadcastToGuild(guildId, "treasury_adjusted", socketPayload);
    return ok(c, { entry: socketPayload });
  })

  // ═══ Attendance ═════════════════════════════════════════════
  .post("/attendance/check-in/boss/:bossScheduleId", requireAuth, async (c) => {
    const user = c.get("user");
    checkInLimit(c);
    attendanceSubmitLimit(c, user.userId);
    const bossScheduleId = c.req.param("bossScheduleId");
    const { guildId } = await readJson<{ guildId?: string }>(c);
    if (!guildId) throw new BadRequestError("guildId is required");
    const result = await services.dashboard.checkInToBoss(user.userId, guildId, bossScheduleId);
    await Promise.all([
      cache.invalidatePattern(`boss-schedule:${result.guildId}:*`),
      cache.invalidatePattern(`attendance:pending:${result.guildId}:*`),
      cache.invalidatePattern(`attendance:stats:${result.guildId}:*`),
    ]);
    const serializedRecord = { ...result.record, joinedAt: result.record.joinedAt.toISOString() };
    const payload = { ...result, record: serializedRecord };
    broadcastToGuild(result.guildId, "attendance_record_created", payload);
    return ok(c, payload);
  })
  .post("/attendance/check-in", requireAuth, async (c) => {
    const user = c.get("user");
    checkInLimit(c);
    attendanceSubmitLimit(c, user.userId);
    const { code } = await readJson<{ code?: string }>(c);
    if (!code) throw new BadRequestError("Attendance code is required");
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
    return ok(c, payload);
  })
  .patch("/attendance/confirm/:recordId", requireAuth, async (c) => {
    const user = c.get("user");
    const recordId = c.req.param("recordId");
    const { guildId } = await readJson<{ guildId?: string }>(c);
    if (!guildId) throw new BadRequestError("Guild ID is required");
    const { ipAddress, userAgent } = getClientInfo(c);
    const result = await services.dashboard.confirmAttendanceRecord(guildId, recordId, user.userId, ipAddress, userAgent);
    await Promise.all([
      cache.invalidatePattern(`boss-schedule:${guildId}:*`),
      cache.invalidatePattern(`attendance:pending:${guildId}:*`),
      cache.invalidatePattern(`attendance:stats:${guildId}:*`),
      cache.invalidatePattern(`stats:${guildId}:*`),
    ]);
    const serializedRecord = { ...result.record, joinedAt: result.record.joinedAt.toISOString() };
    const payload = { ...result, record: serializedRecord };
    broadcastToGuild(guildId, "attendance_record_confirmed", payload);
    return ok(c, payload);
  })
  .post("/attendance/mark-present", requireAuth, async (c) => {
    const user = c.get("user");
    const { guildId, sessionId, userId } = await readJson<{ guildId?: string; sessionId?: string; userId?: string }>(c);
    if (!guildId || !sessionId || !userId) throw new BadRequestError("guildId, sessionId, and userId are required");
    const { ipAddress, userAgent } = getClientInfo(c);
    const result = await services.dashboard.markMemberPresent(guildId, sessionId, userId, user.userId, ipAddress, userAgent);
    await Promise.all([
      cache.invalidatePattern(`boss-schedule:${guildId}:*`),
      cache.invalidatePattern(`attendance:pending:${guildId}:*`),
      cache.invalidatePattern(`attendance:sessions:${guildId}*`),
      cache.invalidatePattern(`attendance:stats:${guildId}:*`),
      cache.invalidatePattern(`stats:${guildId}:*`),
    ]);
    const serializedRecord = { ...result.record, joinedAt: result.record.joinedAt.toISOString() };
    const payload = { ...result, record: serializedRecord };
    broadcastToGuild(guildId, "attendance_record_confirmed", payload);
    return ok(c, payload);
  })
  .get("/attendance/pending/:guildId", requireAuth, async (c) => {
    const user = c.get("user");
    const guildId = c.req.param("guildId");
    const cacheKey = `attendance:pending:${guildId}:user:${user.userId}`;
    const cached = await cache.get<unknown>(cacheKey);
    if (cached) return ok(c, cached);
    const result = await services.dashboard.getGuildPendingAttendance(guildId, user.userId);
    await cache.set(cacheKey, result, 15);
    return ok(c, result);
  })
  .post("/attendance/revoke/:recordId", requireAuth, async (c) => {
    const user = c.get("user");
    const recordId = c.req.param("recordId");
    const { guildId } = await readJson<{ guildId?: string }>(c);
    if (!guildId) throw new BadRequestError("guildId is required");
    const { ipAddress, userAgent } = getClientInfo(c);
    const result = await services.dashboard.revokeMemberAttendance(guildId, recordId, user.userId, ipAddress, userAgent);
    await Promise.all([
      cache.invalidatePattern(`boss-schedule:${guildId}:*`),
      cache.invalidatePattern(`attendance:pending:${guildId}:*`),
      cache.invalidatePattern(`attendance:sessions:${guildId}*`),
      cache.invalidatePattern(`attendance:stats:${guildId}:*`),
      cache.invalidatePattern(`stats:${guildId}:*`),
    ]);
    broadcastToGuild(guildId, "attendance_record_revoked", { recordId });
    return ok(c, result);
  })
  .post("/attendance/session/:guildId/:sessionId/reopen", requireAuth, async (c) => {
    const user = c.get("user");
    const guildId = c.req.param("guildId");
    const sessionId = c.req.param("sessionId");
    const { minutes } = await readJson<{ minutes?: number }>(c);
    const { ipAddress, userAgent } = getClientInfo(c);
    const session = await services.dashboard.reopenAttendanceSession(guildId, sessionId, user.userId, minutes && minutes > 0 ? minutes : 30, ipAddress, userAgent);
    await Promise.all([
      cache.invalidatePattern(`boss-schedule:${guildId}:*`),
      cache.invalidatePattern(`attendance:pending:${guildId}:*`),
      cache.invalidatePattern(`attendance:sessions:${guildId}*`),
      cache.invalidatePattern(`attendance:stats:${guildId}:*`),
      cache.invalidatePattern(`stats:${guildId}:*`),
    ]);
    const socketPayload = { ...session, expiresAt: session.expiresAt.toISOString(), createdAt: session.createdAt.toISOString() };
    broadcastToGuild(guildId, "attendance_session_updated", socketPayload);
    return ok(c, { session: socketPayload });
  })
  .get("/attendance/session/:guildId/:sessionId", requireAuth, async (c) => {
    const user = c.get("user");
    const detail = await services.dashboard.getAttendanceSessionDetail(c.req.param("guildId"), c.req.param("sessionId"), user.userId);
    return ok(c, detail);
  })
  .patch("/attendance/session/:guildId/:sessionId", requireAuth, async (c) => {
    const user = c.get("user");
    const guildId = c.req.param("guildId");
    const sessionId = c.req.param("sessionId");
    const payload = await readJson<{ title?: string; expiresAt?: string; isActive?: boolean }>(c);
    const { ipAddress, userAgent } = getClientInfo(c);
    const session = await services.dashboard.updateAttendanceSession(guildId, sessionId, payload, user.userId, ipAddress, userAgent);
    await Promise.all([
      cache.invalidatePattern(`boss-schedule:${guildId}:*`),
      cache.invalidatePattern(`attendance:pending:${guildId}:*`),
      cache.invalidatePattern(`attendance:stats:${guildId}:*`),
      cache.invalidatePattern(`stats:${guildId}:*`),
    ]);
    const socketPayload = { ...session, expiresAt: session.expiresAt.toISOString(), createdAt: session.createdAt.toISOString() };
    broadcastToGuild(guildId, "attendance_session_updated", socketPayload);
    return ok(c, { session: socketPayload });
  })
  .delete("/attendance/session/:guildId/:sessionId", requireAuth, async (c) => {
    const user = c.get("user");
    const guildId = c.req.param("guildId");
    const sessionId = c.req.param("sessionId");
    const { ipAddress, userAgent } = getClientInfo(c);
    const result = await services.dashboard.deleteAttendanceSession(guildId, sessionId, user.userId, ipAddress, userAgent);
    await Promise.all([
      cache.invalidatePattern(`boss-schedule:${guildId}:*`),
      cache.invalidatePattern(`attendance:pending:${guildId}:*`),
      cache.invalidatePattern(`attendance:stats:${guildId}:*`),
      cache.invalidatePattern(`stats:${guildId}:*`),
    ]);
    broadcastToGuild(guildId, "attendance_session_deleted", { sessionId });
    return ok(c, result);
  })
  .post("/attendance/session", requireAuth, async (c) => {
    const user = c.get("user");
    const { guildId, title, type, minutes, bossScheduleId } = await readJson<{
      guildId: string; title?: string; type: AttendanceType; minutes: number; bossScheduleId?: string;
    }>(c);
    if (!guildId || (!title && !bossScheduleId) || !type || !minutes || isNaN(Number(minutes))) {
      throw new BadRequestError("Missing or invalid session details");
    }
    const { ipAddress, userAgent } = getClientInfo(c);
    const session = await services.dashboard.createAttendanceSession(guildId, title || "", type, Number(minutes), user.userId, ipAddress, userAgent, bossScheduleId);
    await Promise.all([
      cache.invalidatePattern(`boss-schedule:${guildId}:*`),
      cache.invalidatePattern(`attendance:pending:${guildId}:*`),
      cache.invalidatePattern(`attendance:stats:${guildId}:*`),
      cache.invalidatePattern(`stats:${guildId}:*`),
    ]);
    const socketPayload = { ...session, expiresAt: session.expiresAt.toISOString(), createdAt: session.createdAt.toISOString() };
    broadcastToGuild(guildId, "attendance_session_created", socketPayload);
    return ok(c, { session: socketPayload });
  })
  .get("/attendance/sessions/:guildId", requireAuth, async (c) => {
    const user = c.get("user");
    const guildId = c.req.param("guildId");
    const cacheKey = `attendance:sessions:${guildId}`;
    const cached = await cache.get<unknown>(cacheKey);
    if (cached) return ok(c, cached);
    const sessions = await services.dashboard.listAttendanceSessions(guildId, user.userId);
    await cache.set(cacheKey, sessions, 15);
    return ok(c, sessions);
  })
  .get("/attendance/stats/:guildId", requireAuth, async (c) => {
    const user = c.get("user");
    const guildId = c.req.param("guildId");
    const cacheKey = `attendance:stats:${guildId}:user:${user.userId}`;
    const cached = await cache.get<unknown>(cacheKey);
    if (cached) return ok(c, cached);
    const stats = await services.dashboard.getMemberAttendanceStats(guildId, user.userId);
    await cache.set(cacheKey, stats, 15);
    return ok(c, stats);
  })

  // ═══ Boss rotation ══════════════════════════════════════════
  // Static 2nd-segment routes are registered before the `:ref` routes; Hono
  // gives static segments precedence, and the `:ref` routes are 3-segment.
  .get("/boss-rotation/:guildId/boss-drops", requireAuth, async (c) => {
    const user = c.get("user");
    const bossName = c.req.query("bossName") ?? "";
    return ok(c, await services.dashboard.getBossDropsForBoss(user.userId, c.req.param("guildId"), bossName));
  })
  .get("/boss-rotation/:guildId/killed-history", requireAuth, async (c) => {
    const user = c.get("user");
    const month = c.req.query("month") ?? undefined;
    return ok(c, await services.dashboard.getBossKilledHistory(c.req.param("guildId"), user.userId, month));
  })
  .get("/boss-rotation/:guildId/low-rotation", requireAuth, async (c) => {
    const user = c.get("user");
    dashboardLimit(c, user.userId);
    return ok(c, await services.dashboard.getLowBossRotation(c.req.param("guildId"), user.userId));
  })
  .put("/boss-rotation/:guildId/low-rotation", requireAuth, async (c) => {
    const user = c.get("user");
    const guildId = c.req.param("guildId");
    const payload = await readJson<{ mode?: string; lowBossNames?: string[]; weekly?: Record<string, string>; daysPatch?: Record<string, string | null> }>(c);
    const { ipAddress, userAgent } = getClientInfo(c);
    const data = await services.dashboard.updateLowBossRotation(guildId, user.userId, payload, ipAddress, userAgent);
    broadcastToFaction(data.factionId, "boss_rotation_updated", data);
    return ok(c, data);
  })
  .post("/boss-rotation/:guildId/maintenance-reset", requireAuth, async (c) => {
    const user = c.get("user");
    const guildId = c.req.param("guildId");
    const { maintenanceEndTime } = await readJson<{ maintenanceEndTime: string }>(c);
    if (!maintenanceEndTime) throw new BadRequestError("Maintenance end time is required");
    const { ipAddress, userAgent } = getClientInfo(c);
    const data = await services.dashboard.maintenanceResetBossTimers(guildId, user.userId, maintenanceEndTime, ipAddress, userAgent);
    await Promise.all([cache.invalidatePattern(`boss-schedule:*`), cache.invalidatePattern(`stats:${guildId}:*`)]);
    broadcastToFaction(data.factionId, "boss_rotation_updated", data);
    broadcastToGuild(guildId, "boss_rotation_updated", data);
    return ok(c, data);
  })
  .get("/boss-rotation/:guildId/master-list", requireAuth, async (c) => {
    const user = c.get("user");
    dashboardLimit(c, user.userId);
    return ok(c, await services.dashboard.getBossMasterList(c.req.param("guildId"), user.userId));
  })
  .put("/boss-rotation/:guildId/master-list", requireAuth, async (c) => {
    const user = c.get("user");
    const guildId = c.req.param("guildId");
    const { entries } = await readJson<{ entries: Array<{ bossName: string; participantGuildIds: string[] }> }>(c);
    const { ipAddress, userAgent } = getClientInfo(c);
    const data = await services.dashboard.updateBossMasterList(guildId, user.userId, entries, ipAddress, userAgent);
    await cache.invalidatePattern(`boss-schedule:*`);
    broadcastToFaction(data.factionId, "boss_rotation_updated", data);
    return ok(c, data);
  })
  .post("/boss-rotation/:guildId/reset", requireAuth, async (c) => {
    const user = c.get("user");
    const guildId = c.req.param("guildId");
    const { ipAddress, userAgent } = getClientInfo(c);
    const data = await services.dashboard.resetAllBossTimers(guildId, user.userId, ipAddress, userAgent);
    await Promise.all([cache.invalidatePattern(`boss-schedule:*`), cache.invalidatePattern(`stats:${guildId}:*`)]);
    broadcastToFaction(data.factionId, "boss_rotation_updated", data);
    broadcastToGuild(guildId, "boss_rotation_updated", data);
    return ok(c, data);
  })
  .post("/boss-rotation/:guildId/boss/:bossName/killed", requireAuth, async (c) => {
    const user = c.get("user");
    const guildId = c.req.param("guildId");
    const bossName = decodeURIComponent(c.req.param("bossName"));
    const { killedAt, takenGuildId, drops } = await readJson<{ killedAt: string; takenGuildId: string; drops?: Array<{ bucket: string; path: string; quantity?: number }> }>(c);
    if (!killedAt) throw new BadRequestError("Killed timestamp is required");
    if (!takenGuildId) throw new BadRequestError("Taking guild is required");
    const { ipAddress, userAgent } = getClientInfo(c);
    const data = await services.dashboard.markBossRotationKilledByName(guildId, bossName, killedAt, takenGuildId, user.userId, ipAddress, userAgent, drops);
    await Promise.all([cache.invalidatePattern(`boss-schedule:*`), cache.invalidatePattern(`stats:${guildId}:*`)]);
    broadcastToFaction(data.factionId, "boss_rotation_updated", data);
    broadcastToGuild(guildId, "boss_rotation_updated", data);
    return ok(c, data);
  })
  .post("/boss-rotation/:guildId/:ref/killed", requireAuth, async (c) => {
    const user = c.get("user");
    const guildId = c.req.param("guildId");
    const scheduleId = c.req.param("ref");
    const { killedAt, takenGuildId, drops } = await readJson<{ killedAt: string; takenGuildId: string; drops?: Array<{ bucket: string; path: string; quantity?: number }> }>(c);
    if (!killedAt) throw new BadRequestError("Killed timestamp is required");
    if (!takenGuildId) throw new BadRequestError("Taking guild is required");
    const { ipAddress, userAgent } = getClientInfo(c);
    const data = await services.dashboard.markBossRotationKilled(guildId, scheduleId, killedAt, takenGuildId, user.userId, ipAddress, userAgent, drops);
    await Promise.all([cache.invalidatePattern(`boss-schedule:*`), cache.invalidatePattern(`stats:${guildId}:*`)]);
    broadcastToFaction(data.factionId, "boss_rotation_updated", data);
    broadcastToGuild(guildId, "boss_rotation_updated", data);
    return ok(c, data);
  })
  .post("/boss-rotation/:guildId/:ref/queue", requireAuth, async (c) => {
    const user = c.get("user");
    const guildId = c.req.param("guildId");
    const bossName = decodeURIComponent(c.req.param("ref"));
    const { queueGuildIds } = await readJson<{ queueGuildIds: string[] }>(c);
    const { ipAddress, userAgent } = getClientInfo(c);
    const data = await services.dashboard.updateBossRotationQueue(guildId, bossName, queueGuildIds, user.userId, ipAddress, userAgent);
    await cache.invalidatePattern(`boss-schedule:*`);
    broadcastToFaction(data.factionId, "boss_rotation_updated", data);
    return ok(c, data);
  })
  .get("/boss-rotation/:guildId", requireAuth, async (c) => {
    const user = c.get("user");
    dashboardLimit(c, user.userId);
    return ok(c, await services.dashboard.getBossRotation(c.req.param("guildId"), user.userId));
  })

  // ═══ Boss schedule ══════════════════════════════════════════
  .post("/boss-schedule/:guildId/commitments/batch", requireGuildRole("MEMBER"), async (c) => {
    const user = c.get("user");
    const { scheduleIds } = await readJson<{ scheduleIds: string[] }>(c);
    const result = await services.bossCommitment.getBossCommitmentsBatch(
      c.req.param("guildId"),
      user.userId,
      Array.isArray(scheduleIds) ? scheduleIds : [],
    );
    return ok(c, result);
  })
  .get("/boss-schedule/:guildId/:scheduleId/commitments", requireGuildRole("MEMBER"), async (c) => {
    const user = c.get("user");
    const result = await services.bossCommitment.getBossCommitments(c.req.param("guildId"), user.userId, c.req.param("scheduleId"));
    return ok(c, result);
  })
  .post("/boss-schedule/:guildId/:scheduleId/commitments", requireGuildRole("MEMBER"), async (c) => {
    const user = c.get("user");
    const { committing } = await readJson<{ committing: boolean }>(c);
    const result = await services.bossCommitment.setBossCommitment(c.req.param("guildId"), user.userId, c.req.param("scheduleId"), !!committing);
    return ok(c, result);
  })
  .patch("/boss-schedule/:guildId/kill/:scheduleId", requireAuth, async (c) => {
    const user = c.get("user");
    const guildId = c.req.param("guildId");
    const scheduleId = c.req.param("scheduleId");
    const { killedAt, lootDrop, screenshotUrl } = await readJson<{ killedAt: string; lootDrop?: string; screenshotUrl?: string }>(c);
    if (!killedAt) throw new BadRequestError("Killed timestamp is required");
    const { ipAddress, userAgent } = getClientInfo(c);
    const { updatedEvent, nextSchedule, checkInSession } = await services.dashboard.logBossKill(guildId, scheduleId, killedAt, user.userId, lootDrop, screenshotUrl, ipAddress, userAgent);
    await Promise.all([
      invalidateBossScheduleCache(updatedEvent.guildId || guildId),
      cache.invalidatePattern(`stats:${guildId}:*`),
      cache.invalidatePattern(`attendance:pending:${guildId}:*`),
      cache.invalidatePattern(`attendance:stats:${guildId}:*`),
    ]);
    if (checkInSession) {
      broadcastToGuild(guildId, "attendance_session_created", { ...checkInSession, expiresAt: checkInSession.expiresAt.toISOString(), createdAt: checkInSession.createdAt.toISOString() });
    }
    const socketPayload = { ...updatedEvent, spawnTime: updatedEvent.spawnTime.toISOString(), killedAt: updatedEvent.killedAt ? updatedEvent.killedAt.toISOString() : null, createdAt: updatedEvent.createdAt.toISOString() };
    broadcastToGuild(updatedEvent.guildId || guildId, "boss_rotation_updated", socketPayload);
    let serializedNextSchedule = null;
    if (nextSchedule) {
      serializedNextSchedule = { ...nextSchedule, spawnTime: nextSchedule.spawnTime.toISOString(), killedAt: null, createdAt: nextSchedule.createdAt.toISOString() };
      broadcastToGuild(nextSchedule.guildId || guildId, "boss_rotation_updated", serializedNextSchedule);
    }
    return ok(c, { schedule: socketPayload, nextSchedule: serializedNextSchedule });
  })
  .patch("/boss-schedule/:guildId/:scheduleId", requireAuth, async (c) => {
    const user = c.get("user");
    const guildId = c.req.param("guildId");
    const scheduleId = c.req.param("scheduleId");
    const payload = await readJson<{ bossName?: string; bossImageUrl?: string; spawnTime?: string; location?: string; guildTurn?: string; guildTurnGuildId?: string | null; isFaction?: boolean }>(c);
    const { ipAddress, userAgent } = getClientInfo(c);
    const schedule = await services.dashboard.updateBossSchedule(guildId, scheduleId, payload, user.userId, ipAddress, userAgent);
    await Promise.all([invalidateBossScheduleCache(schedule.guildId || guildId), cache.invalidatePattern(`stats:${guildId}:*`)]);
    const socketPayload = { ...schedule, spawnTime: schedule.spawnTime.toISOString(), killedAt: schedule.killedAt ? schedule.killedAt.toISOString() : null, createdAt: schedule.createdAt.toISOString() };
    broadcastToGuild(schedule.guildId || guildId, "boss_rotation_updated", socketPayload);
    return ok(c, { schedule: socketPayload });
  })
  .delete("/boss-schedule/:guildId/:scheduleId", requireAuth, async (c) => {
    const user = c.get("user");
    const guildId = c.req.param("guildId");
    const scheduleId = c.req.param("scheduleId");
    const { ipAddress, userAgent } = getClientInfo(c);
    const result = await services.dashboard.deleteBossSchedule(guildId, scheduleId, user.userId, ipAddress, userAgent);
    await Promise.all([invalidateBossScheduleCache(guildId), cache.invalidatePattern(`stats:${guildId}:*`)]);
    broadcastToGuild(guildId, "boss_schedule_deleted", { scheduleId });
    return ok(c, result);
  })
  .get("/boss-schedule/:guildId", requireAuth, async (c) => {
    const user = c.get("user");
    dashboardLimit(c, user.userId);
    const guildId = c.req.param("guildId");
    const cacheKey = `boss-schedule:${guildId}:user:${user.userId}`;
    const cached = await cache.get<unknown>(cacheKey);
    if (cached) return ok(c, cached);
    const schedules = await services.dashboard.getBossSchedules(guildId, user.userId);
    const data = { schedules };
    await cache.set(cacheKey, data, 15);
    return ok(c, data);
  })
  .post("/boss-schedule/:guildId", requireAuth, async (c) => {
    const user = c.get("user");
    const guildId = c.req.param("guildId");
    const { bossName, bossImageUrl, spawnTime, location, guildTurn, guildTurnGuildId, isFaction } = await readJson<{
      bossName: string; bossImageUrl?: string; spawnTime: string; location: string; guildTurn?: string; guildTurnGuildId?: string | null; isFaction?: boolean;
    }>(c);
    if (!bossName || !spawnTime || !location) throw new BadRequestError("Missing boss name, spawn time, or location");
    const { ipAddress, userAgent } = getClientInfo(c);
    const targetGuildId = isFaction ? null : guildId;
    const schedule = await services.dashboard.createBossSchedule(targetGuildId, { bossName, bossImageUrl, spawnTime, location, guildTurn, guildTurnGuildId }, user.userId, ipAddress, userAgent);
    await Promise.all([invalidateBossScheduleCache(targetGuildId), cache.invalidatePattern(`stats:${targetGuildId || guildId}:*`)]);
    const socketPayload = { ...schedule, spawnTime: schedule.spawnTime.toISOString(), killedAt: schedule.killedAt ? schedule.killedAt.toISOString() : null, createdAt: schedule.createdAt.toISOString() };
    broadcastToGuild(targetGuildId, "boss_rotation_updated", socketPayload);
    return ok(c, { schedule: socketPayload });
  })

  // ═══ Bosses registry ════════════════════════════════════════
  .get("/bosses", requireAuth, async (c) => {
    const cacheKey = "bosses:registry";
    const cached = await cache.get<unknown>(cacheKey);
    if (cached) return ok(c, cached);
    const bosses = await services.dashboard.getBosses();
    const data = { bosses };
    await cache.set(cacheKey, data, 300);
    return ok(c, data);
  })

  // ═══ Loot sale ══════════════════════════════════════════════
  .get("/loot-sale/:guildId/attendees/:bossScheduleId", requireAuth, async (c) => {
    const guildId = c.req.param("guildId");
    const bossScheduleId = c.req.param("bossScheduleId");
    const map = await services.loot.getConfirmedAttendeesForSchedules(guildId, [bossScheduleId]);
    const attendees = map.get(bossScheduleId) ?? [];
    return ok(c, { attendees });
  })
  .post("/loot-sale/:guildId/batch", requireAuth, async (c) => {
    const user = c.get("user");
    const guildId = c.req.param("guildId");
    const { category, bossScheduleId, currency, soldDate, items } = await readJson<{
      category: string; bossScheduleId?: string | null; currency: string; soldDate?: string; items: Array<{ itemName: string; saleValue: number }>;
    }>(c);
    if (!category || !currency || !Array.isArray(items) || items.length === 0) throw new BadRequestError("Missing category, currency, or loot items");
    const normalizedItems = items.map((item) => ({ itemName: (item.itemName || "").trim(), saleValue: Number(item.saleValue) }));
    const invalid = normalizedItems.some((item) => !item.itemName || isNaN(item.saleValue) || item.saleValue <= 0);
    if (invalid) throw new BadRequestError("Each loot item needs a name and a positive sale value");
    const sales = await services.loot.createLootSaleBatch({
      guildId,
      bossScheduleId: bossScheduleId || null,
      category,
      currency,
      creatorId: user.userId,
      soldAt: soldDate ? new Date(soldDate) : null,
      items: normalizedItems.map((item) => ({ itemName: item.itemName, saleValue: BigInt(Math.round(item.saleValue * 100)) })),
    });
    await Promise.all([
      cache.invalidatePattern(`accounting:${guildId}:*`),
      cache.invalidatePattern(`stats:${guildId}:*`),
      cache.invalidatePattern(`loot:${guildId}:*`),
    ]);
    broadcastToGuild(guildId, "loot_sale_recorded", { batch: true, count: sales.length, bossScheduleId: bossScheduleId || null });
    return ok(c, { count: sales.length });
  })
  .post("/loot-sale/:guildId", requireAuth, async (c) => {
    const user = c.get("user");
    const guildId = c.req.param("guildId");
    const { itemName, category, bossScheduleId, saleValue, currency } = await readJson<{
      itemName: string; category: string; bossScheduleId?: string | null; saleValue: number; currency: string;
    }>(c);
    if (!itemName || !category || !saleValue || isNaN(Number(saleValue))) throw new BadRequestError("Missing item name, category, or invalid sale value");
    const centsValue = BigInt(Math.round(saleValue * 100));
    const sale = await services.loot.createLootSale({ guildId, bossScheduleId, itemName, category, saleValue: centsValue, currency, creatorId: user.userId });
    await Promise.all([
      cache.invalidatePattern(`accounting:${guildId}:*`),
      cache.invalidatePattern(`stats:${guildId}:*`),
      cache.invalidatePattern(`loot:${guildId}:*`),
    ]);
    const socketPayload = { ...sale, saleValue: sale.saleValue.toString(), taxAmount: sale.taxAmount.toString(), netProfit: sale.netProfit.toString(), createdAt: sale.createdAt.toISOString() };
    broadcastToGuild(guildId, "loot_sale_recorded", socketPayload);
    return ok(c, { sale: socketPayload });
  })
  .get("/loot-sale/:guildId", requireAuth, async (c) => {
    const guildId = c.req.param("guildId");
    const cacheKey = `loot:${guildId}:sales`;
    const cached = await cache.get<unknown>(cacheKey);
    if (cached) return ok(c, cached);
    const sales = await services.loot.getLootSales(guildId);
    const data = { sales };
    await cache.set(cacheKey, data, 120);
    return ok(c, data);
  })

  // ═══ Stats ══════════════════════════════════════════════════
  .get("/stats/:guildId", requireAuth, async (c) => {
    const user = c.get("user");
    dashboardLimit(c, user.userId);
    const guildId = c.req.param("guildId");
    const cacheKey = `stats:${guildId}:user:${user.userId}`;
    const cached = await cache.get<unknown>(cacheKey);
    if (cached) return ok(c, cached);
    const stats = await services.dashboard.getDashboardSummary(guildId, user.userId);
    await cache.set(cacheKey, stats, 30);
    return ok(c, stats);
  });
