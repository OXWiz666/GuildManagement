import { env } from "../config/env.js";
import type { ServiceContainer } from "../services/container.js";
import type { NotificationDispatcher } from "../notifications/dispatcher.js";
import { dedupeKeys } from "../notifications/dedupe.js";
import { cpReportEmbed } from "../embeds/notifications.js";
import { logger, errorFields } from "../utils/logger.js";

/**
 * Periodic guild CP statistics + historical snapshots.
 *
 * Runs on the same polling principle as the boss scheduler, but on a much
 * coarser bucket. The dedupe key is derived from the time BUCKET the report
 * covers, not from "now" — so restarting the bot four times in an hour still
 * produces exactly one report per window, and a missed window is simply picked
 * up on the next tick rather than skipped forever.
 */
export class CpMonitor {
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

    // Check every 5 minutes; the bucket check inside decides whether there's
    // anything to do. Cheap — one query per notifiable server, and only when a
    // new bucket opens.
    const CHECK_INTERVAL_MS = 5 * 60 * 1000;

    this.timer = setInterval(() => void this.safeTick(), CHECK_INTERVAL_MS);
    this.timer.unref();

    logger.info("CP monitor started", { everyHours: env.CP_REPORT_INTERVAL_HOURS });

    void this.safeTick();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async safeTick(): Promise<void> {
    if (this.running || this.stopped) return;
    this.running = true;

    try {
      await this.tick();
    } catch (error) {
      logger.error("CP monitor tick failed", errorFields(error));
    } finally {
      this.running = false;
    }
  }

  /**
   * Bucket id for the current window, e.g. "2026-07-17-2" for the 3rd 8-hour
   * window of that day. Stable within the window — that's what makes the dedupe
   * key idempotent across ticks and restarts.
   */
  private currentBucket(now: Date): string {
    const hours = env.CP_REPORT_INTERVAL_HOURS;
    const date = now.toISOString().slice(0, 10);
    const bucket = Math.floor(now.getUTCHours() / hours);
    return `${date}-${bucket}`;
  }

  private async tick(): Promise<void> {
    const servers = await this.services.repositories.discordServer.listNotifiable();
    if (servers.length === 0) return;

    const now = new Date();
    const bucket = this.currentBucket(now);

    for (const server of servers) {
      if (this.stopped) break;

      const stats = await this.services.cp.guildStats(server.guildId, now);

      // Nothing to report for a guild where nobody has set CP.
      if (stats.counted === 0) continue;

      const outcome = await this.dispatcher.dispatch({
        dedupeKey: dedupeKeys.cpReport(server.discordServerId, bucket),
        kind: "CP_UPDATE",
        discordServerId: server.discordServerId,
        guildId: server.guildId,
        channelId: server.channelId,
        embeds: [
          cpReportEmbed({
            guildName: server.guildName,
            highest: stats.highest,
            lowest: stats.lowest,
            average: stats.average,
            total: stats.total,
            counted: stats.counted,
            weeklyGrowth: stats.weeklyGrowth,
            monthlyGrowth: stats.monthlyGrowth,
          }),
        ],
      });

      // Only snapshot when we actually posted a report for this bucket —
      // `dispatch` returning "duplicate" means another tick already did both,
      // and writing a snapshot per tick would pollute the history table.
      if (outcome === "sent") {
        await this.services.cp
          .writeSnapshot(server.guildId)
          .catch((error: unknown) =>
            logger.error("CP snapshot failed", { guildId: server.guildId, ...errorFields(error) }),
          );
      }
    }
  }
}
