import { env } from "../config/env.js";
import type { ServiceContainer } from "../services/container.js";
import type { NotificationDispatcher } from "../notifications/dispatcher.js";
import { dedupeKeys } from "../notifications/dedupe.js";
import { spawnEmbed, spawnWarningEmbed } from "../embeds/notifications.js";
import { logger, errorFields } from "../utils/logger.js";

/**
 * Boss spawn notifications.
 *
 * Design: a polling tick rather than a timer per boss.
 *
 * A `setTimeout` per upcoming spawn sounds tighter, but it makes the bot's
 * memory the source of truth — a restart loses every pending timer, and a
 * kill logged on the *website* (which the bot never sees) leaves a stale timer
 * that fires for a boss that's already down. Re-reading the database every tick
 * means the bot is always working from current state, and the dedupe key makes
 * repeated evaluation harmless.
 *
 * The cost is up to one tick of latency (default 30s) on a warning. For a
 * 5-minute warning that's acceptable; the alternative trades correctness for
 * precision nobody asked for.
 */
export class BossScheduler {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private stopped = false;

  constructor(
    private readonly services: ServiceContainer,
    private readonly dispatcher: NotificationDispatcher,
  ) {}

  start(): void {
    if (this.timer) return;
    this.stopped = false;

    const intervalMs = env.SCHEDULER_INTERVAL_SECONDS * 1000;

    // `unref` so a pending tick never keeps the process alive during shutdown.
    this.timer = setInterval(() => void this.safeTick(), intervalMs);
    this.timer.unref();

    logger.info("Boss scheduler started", {
      intervalSeconds: env.SCHEDULER_INTERVAL_SECONDS,
      warningMinutes: env.SPAWN_WARNING_MINUTES,
    });

    // Run once immediately so a restart doesn't sit idle for a whole interval.
    void this.safeTick();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Tick wrapper: never throws, never overlaps.
   *
   * Overlap guard matters because a slow tick (many servers × Discord latency)
   * could otherwise be re-entered by the next interval, doubling DB load. Dedup
   * would still prevent double-sends, but the work would be wasted.
   */
  private async safeTick(): Promise<void> {
    if (this.running || this.stopped) return;
    this.running = true;

    const started = Date.now();
    try {
      const stats = await this.tick();
      if (stats.sent > 0) {
        logger.info("Scheduler tick", { ...stats, ms: Date.now() - started });
      } else {
        logger.debug("Scheduler tick", { ...stats, ms: Date.now() - started });
      }
    } catch (error) {
      // A scheduler that dies on one bad tick is worse than one that logs and
      // retries in 30s.
      logger.error("Scheduler tick failed", { ms: Date.now() - started, ...errorFields(error) });
    } finally {
      this.running = false;
    }
  }

  private async tick(): Promise<{ servers: number; warnings: number; spawns: number; sent: number }> {
    const servers = await this.services.repositories.discordServer.listNotifiable();

    let warnings = 0;
    let spawns = 0;
    let sent = 0;

    const now = new Date();
    const warningWindowMs = env.SPAWN_WARNING_MINUTES * 60 * 1000;

    for (const server of servers) {
      if (this.stopped) break;

      const upcoming = await this.services.boss.listUpcoming({ guildId: server.guildId, now });

      for (const spawn of upcoming) {
        const untilSpawn = spawn.nextSpawn.getTime() - now.getTime();

        // ─── Boss is live ───
        if (spawn.live) {
          const outcome = await this.dispatcher.dispatch({
            dedupeKey: dedupeKeys.spawn(server.discordServerId, spawn.scheduleId),
            kind: "SPAWN",
            discordServerId: server.discordServerId,
            guildId: server.guildId,
            channelId: server.channelId,
            embeds: [
              spawnEmbed({
                bossName: spawn.bossName,
                spawnTime: spawn.nextSpawn,
                location: spawn.location,
                guildTurn: spawn.guildTurn,
              }),
            ],
          });

          if (outcome === "sent") {
            spawns++;
            sent++;
          }
          continue;
        }

        // ─── Imminent-spawn warning ───
        // Lower bound of 0 so a boss already past its spawn time doesn't get a
        // "spawns in 5 min" alert — that case is handled by the live branch.
        if (untilSpawn > 0 && untilSpawn <= warningWindowMs) {
          const outcome = await this.dispatcher.dispatch({
            dedupeKey: dedupeKeys.spawnWarning(server.discordServerId, spawn.scheduleId),
            kind: "SPAWN_WARNING",
            discordServerId: server.discordServerId,
            guildId: server.guildId,
            channelId: server.channelId,
            embeds: [
              spawnWarningEmbed(
                {
                  bossName: spawn.bossName,
                  spawnTime: spawn.nextSpawn,
                  location: spawn.location,
                  guildTurn: spawn.guildTurn,
                },
                env.SPAWN_WARNING_MINUTES,
              ),
            ],
          });

          if (outcome === "sent") {
            warnings++;
            sent++;
          }
        }
      }
    }

    return { servers: servers.length, warnings, spawns, sent };
  }
}
