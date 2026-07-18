import { prisma } from "@guild/db";
import { redisCache, cacheKeys, cacheTtl } from "@guild/core";
import type { ServerContext } from "../types/command.js";

export type ChannelPurpose = "NOTIFICATION" | "COMMAND" | "THREAD";

/**
 * Reads/writes the Discord↔ForgeKeep server binding.
 *
 * Kept behind a repository so services never talk to Prisma directly — that's
 * what makes the services unit-testable with a fake in place of a live DB.
 */
export class DiscordServerRepository {
  /**
   * Resolve the ForgeKeep guild bound to a Discord server, or null.
   *
   * Cached: this runs on EVERY prefix message in every bound server, and the
   * binding changes roughly never. Actively invalidated by `bind()`, so the TTL
   * is only a backstop.
   *
   * Negative results are NOT cached — an unbound server is the state a leader is
   * actively trying to fix with `!bindguild`, and making them wait out a TTL to
   * see it work would be its own bug.
   */
  async findByDiscordGuildId(discordGuildId: string): Promise<ServerContext | null> {
    const key = cacheKeys.discordServer(discordGuildId);

    const cached = await redisCache.get<ServerContext>(key);
    if (cached) return cached;

    const row = await prisma.discordServer.findUnique({
      where: { discordGuildId },
      select: {
        id: true,
        discordGuildId: true,
        guildId: true,
        timezone: true,
        isActive: true,
        guild: { select: { name: true, deletedAt: true, suspendedAt: true } },
      },
    });

    if (!row || !row.isActive) return null;
    // A suspended or soft-deleted guild must go dark in Discord too, otherwise
    // the bot becomes a way to keep using a guild the platform has cut off.
    if (row.guild.deletedAt || row.guild.suspendedAt) return null;

    const context: ServerContext = {
      discordServerId: row.id,
      discordGuildId: row.discordGuildId,
      guildId: row.guildId,
      guildName: row.guild.name,
      timezone: row.timezone,
    };

    await redisCache.set(key, context, cacheTtl.discordServer);
    return context;
  }

  async bind(params: {
    discordGuildId: string;
    guildId: string;
    linkedById: string;
    timezone?: string;
  }): Promise<void> {
    const { discordGuildId, guildId, linkedById, timezone } = params;

    await prisma.discordServer.upsert({
      where: { discordGuildId },
      create: {
        discordGuildId,
        guildId,
        linkedById,
        ...(timezone ? { timezone } : {}),
      },
      // Re-binding an existing Discord server points it at the new guild rather
      // than erroring — the unique constraint on discordGuildId means there is
      // only ever one binding, and leaders do re-point servers.
      update: {
        guildId,
        linkedById,
        isActive: true,
        ...(timezone ? { timezone } : {}),
      },
    });

    // Targeted invalidation — the binding is cached on the read path above, and
    // re-pointing a server must take effect immediately, not in 10 minutes.
    await redisCache.del(cacheKeys.discordServer(discordGuildId));
  }

  async setChannel(params: {
    discordServerId: string;
    purpose: ChannelPurpose;
    channelId: string;
    setById: string;
  }): Promise<void> {
    const { discordServerId, purpose, channelId, setById } = params;

    await prisma.discordChannel.upsert({
      where: { discordServerId_purpose: { discordServerId, purpose } },
      create: { discordServerId, purpose, channelId, setById },
      update: { channelId, setById },
    });
  }

  async getChannel(discordServerId: string, purpose: ChannelPurpose): Promise<string | null> {
    const row = await prisma.discordChannel.findUnique({
      where: { discordServerId_purpose: { discordServerId, purpose } },
      select: { channelId: true },
    });
    return row?.channelId ?? null;
  }

  /**
   * Every server with a notification channel — the scheduler's fan-out list.
   *
   * Deliberately uncached: the scheduler is the only caller, it runs on a
   * 30s tick, and caching would just add a staleness window to the path that
   * decides whether a guild gets alerts at all. Suspended/deleted guilds are
   * filtered here so they go dark in Discord too.
   */
  async listNotifiable(): Promise<
    Array<{
      discordServerId: string;
      guildId: string;
      guildName: string;
      timezone: string;
      channelId: string;
    }>
  > {
    const rows = await prisma.discordChannel.findMany({
      where: {
        purpose: "NOTIFICATION",
        discordServer: {
          isActive: true,
          guild: { deletedAt: null, suspendedAt: null },
        },
      },
      select: {
        channelId: true,
        discordServer: {
          select: {
            id: true,
            guildId: true,
            timezone: true,
            guild: { select: { name: true } },
          },
        },
      },
    });

    return rows.map((row) => ({
      discordServerId: row.discordServer.id,
      guildId: row.discordServer.guildId,
      guildName: row.discordServer.guild.name,
      timezone: row.discordServer.timezone,
      channelId: row.channelId,
    }));
  }
}
