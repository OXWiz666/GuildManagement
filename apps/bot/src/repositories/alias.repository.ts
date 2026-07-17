import { prisma } from "@guild/db";
import { redisCache, cacheKeys, cacheTtl } from "@guild/core";

export interface AliasRow {
  alias: string;
  bossName: string;
  /** Null = global alias, available in every server. */
  discordServerId: string | null;
}

export class AliasRepository {
  /**
   * All aliases visible to a server: its own plus the globals.
   *
   * Fetched as one list and resolved in the service, because a server-scoped
   * alias must win over a global with the same name — a precedence rule that's
   * clearer in code than in a SQL DISTINCT ON.
   */
  async listForServer(discordServerId: string): Promise<AliasRow[]> {
    return redisCache.getOrSet(
      cacheKeys.discordAliases(discordServerId),
      cacheTtl.discordAliases,
      () =>
        prisma.discordAlias.findMany({
          where: { OR: [{ discordServerId }, { discordServerId: null }] },
          select: { alias: true, bossName: true, discordServerId: true },
        }),
    );
  }

  async upsert(params: {
    discordServerId: string;
    alias: string;
    bossName: string;
    createdById: string;
  }): Promise<void> {
    const alias = params.alias.trim().toLowerCase();

    // The unique index is partial (WHERE discord_server_id IS NOT NULL), which
    // Prisma's `upsert` can't target — so this is an explicit find-then-write.
    const existing = await prisma.discordAlias.findFirst({
      where: { discordServerId: params.discordServerId, alias },
      select: { id: true },
    });

    if (existing) {
      await prisma.discordAlias.update({
        where: { id: existing.id },
        data: { bossName: params.bossName },
      });
      return;
    }

    await prisma.discordAlias.create({
      data: {
        discordServerId: params.discordServerId,
        alias,
        bossName: params.bossName,
        createdById: params.createdById,
      },
    });
  }

  async remove(discordServerId: string, alias: string): Promise<boolean> {
    const result = await prisma.discordAlias.deleteMany({
      where: { discordServerId, alias: alias.trim().toLowerCase() },
    });
    return result.count > 0;
  }
}
