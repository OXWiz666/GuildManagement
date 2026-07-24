import { prisma, Prisma } from "@guild/db";
import { redisCache, cacheKeys, cacheTtl } from "@guild/core";
import type { ServerContext } from "../types/command.js";
import { DiscordPingRoleStorageError } from "../utils/errors.js";

export type ChannelPurpose = "NOTIFICATION" | "COMMAND" | "THREAD";

let pingRoleColumnAvailable: boolean | null = null;

function isMissingPingRoleColumnError(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code === "P2022") return true;
  return error.code === "P2010" && error.meta?.["code"] === "42703";
}

async function hasPingRoleColumn(): Promise<boolean> {
  if (pingRoleColumnAvailable !== null) return pingRoleColumnAvailable;

  const rows = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'discord_servers'
        AND column_name = 'ping_role_id'
    ) AS "exists"
  `;

  pingRoleColumnAvailable = rows[0]?.exists ?? false;
  return pingRoleColumnAvailable;
}

async function getPingRoleId(discordServerId: string): Promise<string | null> {
  if (!(await hasPingRoleColumn())) return null;

  let rows: Array<{ pingRoleId: string | null }>;
  try {
    rows = await prisma.$queryRaw<Array<{ pingRoleId: string | null }>>`
      SELECT ping_role_id AS "pingRoleId"
      FROM "discord_servers"
      WHERE id = ${discordServerId}
      LIMIT 1
    `;
  } catch (error) {
    if (isMissingPingRoleColumnError(error)) {
      pingRoleColumnAvailable = false;
      return null;
    }
    throw error;
  }

  return rows[0]?.pingRoleId ?? null;
}

async function getPingRoleIdMap(discordServerIds: string[]): Promise<Map<string, string | null>> {
  if (discordServerIds.length === 0 || !(await hasPingRoleColumn())) return new Map();

  let rows: Array<{ id: string; pingRoleId: string | null }>;
  try {
    rows = await prisma.$queryRaw<Array<{ id: string; pingRoleId: string | null }>>`
      SELECT id, ping_role_id AS "pingRoleId"
      FROM "discord_servers"
      WHERE id IN (${Prisma.join(discordServerIds)})
    `;
  } catch (error) {
    if (isMissingPingRoleColumnError(error)) {
      pingRoleColumnAvailable = false;
      return new Map();
    }
    throw error;
  }

  return new Map(rows.map((row) => [row.id, row.pingRoleId]));
}

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

    return this.findByDiscordGuildIdUncached(discordGuildId);
  }

  /**
   * Source-of-truth binding read. Used by the normal cache miss path and as a
   * defensive retry when a command is about to tell users the server is
   * unbound. That retry matters in production where a stale cache or transient
   * read hiccup would otherwise produce a false "run !bindguild" warning.
   */
  async findByDiscordGuildIdUncached(discordGuildId: string): Promise<ServerContext | null> {
    const key = cacheKeys.discordServer(discordGuildId);

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
      pingRoleId: await getPingRoleId(row.id),
    };

    await redisCache.set(key, context, cacheTtl.discordServer);
    return context;
  }

  async refreshByDiscordGuildId(discordGuildId: string): Promise<ServerContext | null> {
    await redisCache.del(cacheKeys.discordServer(discordGuildId));
    return this.findByDiscordGuildIdUncached(discordGuildId);
  }

  async bind(params: {
    discordGuildId: string;
    guildId: string;
    linkedById: string;
    timezone?: string;
  }): Promise<void> {
    const { discordGuildId, guildId, linkedById, timezone } = params;

    const previousGuildServers = await prisma.discordServer.findMany({
      where: { guildId, isActive: true, NOT: { discordGuildId } },
      select: { discordGuildId: true },
    });

    // One ForgeKeep guild may have only one active Discord server. Rebinding a
    // guild from a new server retires the old active server before this one is
    // activated. The DB partial unique index is the final concurrency guard.
    await prisma.discordServer.updateMany({
      where: { guildId, isActive: true, NOT: { discordGuildId } },
      data: { isActive: false },
    });

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
    await redisCache.delMany([
      cacheKeys.discordServer(discordGuildId),
      ...previousGuildServers.map((server) => cacheKeys.discordServer(server.discordGuildId)),
    ]);
  }

  async unbind(discordGuildId: string): Promise<{ guildName: string } | null> {
    const row = await prisma.discordServer.findUnique({
      where: { discordGuildId },
      select: {
        id: true,
        isActive: true,
        guild: { select: { name: true } },
      },
    });

    if (!row || !row.isActive) return null;

    await prisma.discordServer.update({
      where: { id: row.id },
      data: { isActive: false },
    });

    await redisCache.del(cacheKeys.discordServer(discordGuildId));
    return { guildName: row.guild.name };
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

  async setPingRole(params: {
    discordServerId: string;
    roleId: string | null;
  }): Promise<void> {
    if (!(await hasPingRoleColumn())) {
      throw new DiscordPingRoleStorageError();
    }

    let row: { discordGuildId: string };
    try {
      row = await prisma.discordServer.update({
        where: { id: params.discordServerId },
        data: { pingRoleId: params.roleId },
        select: { discordGuildId: true },
      });
    } catch (error) {
      if (isMissingPingRoleColumnError(error)) {
        pingRoleColumnAvailable = false;
        throw new DiscordPingRoleStorageError();
      }
      throw error;
    }

    await redisCache.del(cacheKeys.discordServer(row.discordGuildId));
  }

  /**
   * Remove a channel purpose binding (e.g. lift `!cmdhere`'s restriction).
   * Returns whether a row actually existed to clear, so the calling command
   * can tell "removed" apart from "there was nothing set" instead of always
   * reporting success.
   */
  async clearChannel(discordServerId: string, purpose: ChannelPurpose): Promise<boolean> {
    const result = await prisma.discordChannel.deleteMany({
      where: { discordServerId, purpose },
    });
    return result.count > 0;
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
      pingRoleId: string | null;
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

    const pingRoleIds = await getPingRoleIdMap(rows.map((row) => row.discordServer.id));

    return rows.map((row) => ({
      discordServerId: row.discordServer.id,
      guildId: row.discordServer.guildId,
      guildName: row.discordServer.guild.name,
      timezone: row.discordServer.timezone,
      channelId: row.channelId,
      pingRoleId: pingRoleIds.get(row.discordServer.id) ?? null,
    }));
  }
}
