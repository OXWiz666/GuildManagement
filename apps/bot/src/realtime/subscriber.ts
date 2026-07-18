import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";
import { env as coreEnv } from "@guild/core";
import type { ServiceContainer } from "../services/container.js";
import { logger, errorFields } from "../utils/logger.js";

/**
 * Supabase Realtime subscriber — the "website updates ⇒ bot updates" half.
 *
 * The bot already sees website *data* changes for free, because both share one
 * database and the bot reads it live. What it CAN'T see is when something it
 * has cached changed underneath it. That's what this is for: realtime is used
 * strictly as a **cache-invalidation signal**, never as a data source.
 *
 * That distinction matters. If a payload were treated as data, a dropped or
 * out-of-order message would leave the bot silently wrong. Treating it as "go
 * re-read the database" makes a lost message merely a delay — the cache TTL is
 * still the backstop, and correctness never depends on delivery.
 *
 * Topics mirror what the website's clients already subscribe to
 * (`guild-{guildId}`, see @guild/core lib/socket.ts `broadcastToGuild`), so
 * this adds no new server-side concept.
 */
export class RealtimeSubscriber {
  private client: SupabaseClient | null = null;
  private readonly channels = new Map<string, RealtimeChannel>();
  private refreshTimer: NodeJS.Timeout | null = null;
  private stopped = false;

  constructor(private readonly services: ServiceContainer) {}

  async start(): Promise<void> {
    this.stopped = false;

    this.client = createClient(coreEnv.SUPABASE_URL, coreEnv.SUPABASE_KEY, {
      auth: { persistSession: false },
      // The bot is one process watching a handful of guilds; the default of 10
      // events/sec is ample and keeps it a well-behaved client.
      realtime: { params: { eventsPerSecond: 10 } },
    });

    await this.syncSubscriptions();

    // Re-sync periodically so a guild bound *after* startup gets subscribed
    // without a restart. Cheap: one query, and subscribing is idempotent here.
    this.refreshTimer = setInterval(() => void this.safeSync(), 5 * 60 * 1000);
    this.refreshTimer.unref();
  }

  async stop(): Promise<void> {
    this.stopped = true;

    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }

    for (const channel of this.channels.values()) {
      await channel.unsubscribe().catch(() => {
        // Already gone.
      });
    }
    this.channels.clear();

    // Close the websocket so it can't keep the event loop alive at shutdown.
    if (this.client) {
      await this.client.removeAllChannels().catch(() => {});
      this.client = null;
    }
  }

  private async safeSync(): Promise<void> {
    try {
      await this.syncSubscriptions();
    } catch (error) {
      logger.error("Realtime subscription sync failed", errorFields(error));
    }
  }

  /** Subscribe to every bound guild's topic; drop channels for unbound ones. */
  private async syncSubscriptions(): Promise<void> {
    if (!this.client || this.stopped) return;

    const servers = await this.services.repositories.discordServer.listNotifiable();
    const wanted = new Set(servers.map((server) => server.guildId));

    for (const guildId of wanted) {
      if (this.channels.has(guildId)) continue;
      this.subscribe(guildId);
    }

    // A guild that's been unbound (or had its notification channel removed)
    // shouldn't keep an open socket channel.
    for (const [guildId, channel] of this.channels) {
      if (wanted.has(guildId)) continue;
      await channel.unsubscribe().catch(() => {});
      this.channels.delete(guildId);
    }
  }

  private subscribe(guildId: string): void {
    if (!this.client) return;

    const topic = `guild-${guildId}`;
    const channel = this.client.channel(topic);

    // ─── Role changed on the website ───
    // The one that genuinely matters: the bot caches (discordId, guildId) →
    // role for 30s to keep its permission gate fast, and this is the only way
    // it learns a promotion/demotion happened elsewhere.
    channel.on("broadcast", { event: "member_role_updated" }, (message) => {
      const userId = extractUserId(message["payload"]);
      if (!userId) return;

      void this.services.repositories.identity
        .invalidateActorByUserId(userId, guildId)
        .then(() => logger.debug("Actor cache invalidated by realtime", { guildId, userId }))
        .catch((error: unknown) =>
          logger.warn("Realtime actor invalidation failed", { guildId, ...errorFields(error) }),
        );
    });

    // ─── Profile changed (IGN / class / CP edited on the site) ───
    channel.on("broadcast", { event: "member_profile_updated" }, (message) => {
      const userId = extractUserId(message["payload"]);
      if (!userId) return;

      void this.services.repositories.identity
        .invalidateActorByUserId(userId, guildId)
        .catch((error: unknown) =>
          logger.warn("Realtime actor invalidation failed", { guildId, ...errorFields(error) }),
        );

      // A class edit changes the OCR candidate list.
      void this.services.cpScan.invalidateClassCandidates(guildId).catch(() => {});
    });

    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        logger.info("Realtime subscribed", { topic });
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        // supabase-js reconnects on its own; log rather than tear down. Even if
        // it never recovers, cache TTLs still bound the staleness — this layer
        // is an optimization, not a correctness dependency.
        logger.warn("Realtime channel degraded", { topic, status });
      }
    });

    this.channels.set(guildId, channel);
  }
}

/**
 * Pull a userId out of an untrusted broadcast payload.
 *
 * Realtime payloads arrive over the network and are typed `any` by the SDK —
 * validate rather than trust. Anything unexpected yields null and the event is
 * ignored, which at worst means the cache expires on its TTL instead.
 */
function extractUserId(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) return null;
  const value = (payload as Record<string, unknown>)["userId"];
  return typeof value === "string" && value.length > 0 ? value : null;
}
