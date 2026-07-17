import { prisma } from "@guild/db";
import { redisCache, cacheKeys, cacheTtl } from "@guild/core";
import type { GuildRoleType } from "@guild/shared";
import type { Actor } from "../types/command.js";

/**
 * Discord identity ↔ ForgeKeep account.
 *
 * This is the trust boundary for the whole bot: everything a Discord user is
 * allowed to do follows from the row this resolves.
 */
export class IdentityRepository {
  /**
   * Resolve a Discord user to their membership in one specific guild.
   *
   * Returns null when unlinked OR when linked but not a member of this guild —
   * the caller cannot distinguish, and shouldn't: "you have no rights here" is
   * the same answer either way, and not confirming membership to outsiders
   * avoids leaking roster information across servers.
   *
   * Cached for a deliberately SHORT TTL (30s). This value carries the member's
   * role, which an officer can change on the website at any moment — the bot
   * has no way to observe that, so the cache is guaranteed to be occasionally
   * stale. That's acceptable *only* because the cached role is used solely for
   * the friendly-error gate in middleware/permissions.ts: every @guild/core
   * service re-reads authorization from the database on each call. A stale role
   * therefore yields a briefly wrong error message, never elevated access.
   * Do not lengthen this TTL, and do not start trusting this role for
   * enforcement.
   *
   * Negative results are not cached: an unlinked user who just ran `!link`
   * must work on their very next command.
   */
  async resolveActor(discordId: string, guildId: string): Promise<Actor | null> {
    const key = cacheKeys.discordActor(discordId, guildId);

    const cached = await redisCache.get<Actor>(key);
    if (cached) return cached;

    const actor = await this.loadActor(discordId, guildId);
    if (actor) await redisCache.set(key, actor, cacheTtl.discordActor);

    return actor;
  }

  /** Uncached read — the source of truth for `resolveActor`. */
  private async loadActor(discordId: string, guildId: string): Promise<Actor | null> {
    const user = await prisma.user.findUnique({
      where: { discordId },
      select: {
        id: true,
        displayName: true,
        isActive: true,
        bannedAt: true,
        deletedAt: true,
        guildMembers: {
          where: { guildId, isActive: true },
          select: { id: true, role: true, ign: true },
          take: 1,
        },
      },
    });

    if (!user) return null;
    // Platform-level bans/deletions must apply in Discord too.
    if (!user.isActive || user.bannedAt || user.deletedAt) return null;

    const membership = user.guildMembers[0];
    if (!membership) return null;

    return {
      userId: user.id,
      displayName: user.displayName,
      discordId,
      memberId: membership.id,
      role: membership.role as GuildRoleType,
      ign: membership.ign,
    };
  }

  /** True when this Discord account is linked to any ForgeKeep user. */
  async isLinked(discordId: string): Promise<boolean> {
    const count = await prisma.user.count({ where: { discordId } });
    return count > 0;
  }

  /**
   * Resolve the linked ForgeKeep user WITHOUT a guild context.
   *
   * Only for bootstrap flows like `!bindguild`, which by definition run before
   * this Discord server has a guild to scope to. It deliberately returns no
   * role — there is no guild to have a role in — so callers must authorize
   * against a specific guild themselves before acting.
   */
  async resolveActorAnyGuild(
    discordId: string,
  ): Promise<{ userId: string; displayName: string } | null> {
    const user = await prisma.user.findUnique({
      where: { discordId },
      select: {
        id: true,
        displayName: true,
        isActive: true,
        bannedAt: true,
        deletedAt: true,
      },
    });

    if (!user || !user.isActive || user.bannedAt || user.deletedAt) return null;

    return { userId: user.id, displayName: user.displayName };
  }

  /**
   * Redeem a one-time link code.
   *
   * The whole exchange is one transaction with a conditional update: the code
   * is marked consumed and the Discord id written together, so two concurrent
   * `!link` attempts with the same code cannot both succeed.
   */
  async redeemLinkCode(params: {
    code: string;
    discordId: string;
    discordUsername: string;
    now?: Date;
  }): Promise<
    | { ok: true; userId: string; displayName: string }
    | { ok: false; reason: "NOT_FOUND" | "EXPIRED" | "CONSUMED" | "DISCORD_TAKEN" }
  > {
    const { code, discordId, discordUsername } = params;
    const now = params.now ?? new Date();

    return prisma.$transaction(async (tx) => {
      const row = await tx.discordLinkCode.findUnique({
        where: { code },
        select: { code: true, userId: true, expiresAt: true, consumedAt: true },
      });

      if (!row) return { ok: false, reason: "NOT_FOUND" as const };
      if (row.consumedAt) return { ok: false, reason: "CONSUMED" as const };
      if (row.expiresAt.getTime() <= now.getTime()) return { ok: false, reason: "EXPIRED" as const };

      // Is this Discord account already attached to a *different* ForgeKeep user?
      const existing = await tx.user.findUnique({
        where: { discordId },
        select: { id: true },
      });
      if (existing && existing.id !== row.userId) {
        return { ok: false, reason: "DISCORD_TAKEN" as const };
      }

      // Conditional consume: only flips if still unconsumed. `updateMany`
      // returns a count, so a lost race is detectable rather than silent.
      const consumed = await tx.discordLinkCode.updateMany({
        where: { code, consumedAt: null },
        data: { consumedAt: now, consumedByDiscordId: discordId },
      });
      if (consumed.count === 0) return { ok: false, reason: "CONSUMED" as const };

      const user = await tx.user.update({
        where: { id: row.userId },
        data: { discordId, discordUsername, discordLinkedAt: now },
        select: { id: true, displayName: true },
      });

      return { ok: true as const, userId: user.id, displayName: user.displayName };
    });
  }

  /**
   * Detach Discord from a ForgeKeep account (`!unlink`).
   *
   * Invalidation here is mandatory, not an optimization. The actor cache is
   * keyed by (discordId, guildId) — if user A unlinks Discord id D and user B
   * then links the SAME id, a surviving cache entry would resolve B's messages
   * to A's account and role. TTL alone would leave a 30s window for exactly
   * that, so the memberships are read before the clear and their keys dropped
   * after it.
   */
  async unlink(discordId: string): Promise<boolean> {
    // Read memberships first — after the update there's no discordId to find
    // them by.
    const user = await prisma.user.findUnique({
      where: { discordId },
      select: { guildMembers: { select: { guildId: true } } },
    });

    const result = await prisma.user.updateMany({
      where: { discordId },
      data: { discordId: null, discordUsername: null, discordLinkedAt: null },
    });

    if (result.count === 0) return false;

    // Bounded: a user belongs to a handful of guilds, so this names every key
    // exactly rather than scanning the keyspace (see lib/redis.ts).
    const keys = (user?.guildMembers ?? []).map((m) =>
      cacheKeys.discordActor(discordId, m.guildId),
    );
    if (keys.length > 0) await redisCache.delMany(keys);

    return true;
  }

  /**
   * Drop cached actors for a Discord id across the given guilds.
   * Used after a link so the very next command sees the new identity.
   */
  async invalidateActor(discordId: string, guildIds: string[]): Promise<void> {
    if (guildIds.length === 0) return;
    await redisCache.delMany(guildIds.map((id) => cacheKeys.discordActor(discordId, id)));
  }

  /**
   * Drop a cached actor by ForgeKeep user id.
   *
   * The realtime subscriber only learns `userId` from a broadcast, but the
   * cache is keyed by `discordId` — so this resolves one to the other. Costs a
   * lookup per event, which is fine: role changes are rare, and the alternative
   * is serving a stale role until the TTL lapses.
   *
   * A user with no linked Discord account is a no-op, not an error — most
   * members on most guilds.
   */
  async invalidateActorByUserId(userId: string, guildId: string): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { discordId: true },
    });

    if (!user?.discordId) return;

    await redisCache.del(cacheKeys.discordActor(user.discordId, guildId));
  }
}
