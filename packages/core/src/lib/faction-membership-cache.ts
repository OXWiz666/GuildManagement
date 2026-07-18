import { prisma } from "@guild/db";
import { cache } from "./cache";

const NS = "fk";
const TTL_SECONDS = 15;

/**
 * Shared, short-TTL cache for a user's active guild memberships — the
 * auth-resolution query every Factionwide read/write in faction.service.ts
 * and factionAudit.service.ts pays first. Embeds `guild.faction` so callers
 * that need the faction row (e.g. updateFactionProfile's "before" snapshot)
 * get it from this one cached query instead of a second round trip.
 *
 * Staleness tradeoff: a role change, guild join/leave, or faction-guild
 * change can lag up to TTL_SECONDS here. This widens, but does not
 * introduce, an accepted staleness window — `/faction/overview` and
 * `/faction/members` already cache their derived `canManage`/roster output
 * for a comparable TTL with no invalidation (see faction.ts).
 */
export async function getCachedActiveMemberships(userId: string) {
  return cache.getOrSet(`${NS}:user:memberships:${userId}`, TTL_SECONDS, () =>
    prisma.guildMember.findMany({
      where: { userId, isActive: true },
      select: {
        id: true,
        guildId: true,
        role: true,
        guild: {
          select: {
            factionId: true,
            faction: {
              select: {
                id: true,
                name: true,
                slug: true,
                description: true,
                avatarUrl: true,
                bannerUrl: true,
                code: true,
                server: true,
                region: true,
                game: true,
                status: true,
                createdAt: true,
              },
            },
          },
        },
      },
    }),
  );
}

export type CachedActiveMembership = Awaited<ReturnType<typeof getCachedActiveMemberships>>[number];
