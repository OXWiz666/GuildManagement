import type { NotificationKind } from "../repositories/notification.repository.js";

/**
 * Dedupe key builders.
 *
 * Every key is built here so the claim side and any future inspection side
 * can't drift — the same reasoning as @guild/core's cacheKeys.
 *
 * The rules these keys encode:
 *
 * • A key must be STABLE across scheduler ticks for the same real-world event.
 *   The scheduler re-evaluates every 30s; if the key moved with the clock, the
 *   same spawn would be announced on every tick.
 *
 * • A key must CHANGE when the event genuinely recurs. Boss schedules are rows
 *   with their own ids, and a fresh spawn means a fresh row — so keying on the
 *   schedule id gives both properties for free.
 *
 * • Keys are scoped per Discord server: two servers watching the same faction
 *   boss must each get their own alert.
 */
export const dedupeKeys = {
  /**
   * 5-minute (or configured) warning before a spawn.
   * Keyed by schedule id — a rescheduled boss is a different row, so it
   * correctly re-warns; the same row never warns twice.
   */
  spawnWarning: (discordServerId: string, scheduleId: string): string =>
    `spawn-warning:${discordServerId}:${scheduleId}`,

  /** The boss is up now. */
  spawn: (discordServerId: string, scheduleId: string): string =>
    `spawn:${discordServerId}:${scheduleId}`,

  /**
   * A kill was logged.
   * Keyed by schedule id + killedAt epoch: correcting a kill time via
   * `!editkilltime` is a genuinely new fact worth re-announcing, and the
   * timestamp change is what makes the key change.
   */
  kill: (discordServerId: string, scheduleId: string, killedAtMs: number): string =>
    `kill:${discordServerId}:${scheduleId}:${killedAtMs}`,

  /**
   * Periodic guild CP report.
   * Keyed by the bucket the report covers, not "now" — so a restart mid-window
   * doesn't re-post the same report.
   */
  cpReport: (discordServerId: string, bucket: string): string =>
    `cp-report:${discordServerId}:${bucket}`,
} as const;

/** Kinds paired with their builders, for readable call sites. */
export const KIND: Record<string, NotificationKind> = {
  SPAWN_WARNING: "SPAWN_WARNING",
  SPAWN: "SPAWN",
  KILL: "KILL",
  CP_UPDATE: "CP_UPDATE",
  MAINTENANCE: "MAINTENANCE",
  ANNOUNCEMENT: "ANNOUNCEMENT",
};
