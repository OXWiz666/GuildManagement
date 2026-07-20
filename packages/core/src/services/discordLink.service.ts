import { randomInt } from "node:crypto";
import { prisma } from "@guild/db";
import { PREDEFINED_BOSSES } from "@guild/shared";
import { BadRequestError, ForbiddenError, NotFoundError } from "../utils/errors";
import { cache as redisCache } from "../lib/redis";
import { cacheKeys } from "../lib/cache-keys";

/**
 * Discord account linking — the website half of the flow.
 *
 * Lives in @guild/core rather than in the bot because both sides need the same
 * rules: the website mints codes here, the bot redeems them, and the TTL and
 * alphabet must agree. Splitting them across two packages is how they'd drift.
 */

/**
 * Code alphabet. Deliberately excludes 0/O/1/I/L — codes get read off one
 * screen and typed into another, and those glyphs are the classic misreads.
 */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 8;

export const LINK_CODE_TTL_MINUTES = 15;

/**
 * Cryptographically-random code.
 *
 * `randomInt` rather than `Math.random()`: a guessable code is a full account
 * takeover, since redeeming one binds a Discord account to a ForgeKeep user.
 * `randomInt` is also rejection-sampled, so there's no modulo bias.
 */
function generateCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += ALPHABET[randomInt(ALPHABET.length)];
  }
  return code;
}

export interface LinkCodeResult {
  code: string;
  expiresAt: Date;
}

/**
 * Mint a one-time link code for an authenticated user.
 *
 * Any outstanding codes for the user are invalidated first, so a user who
 * clicks "Link Discord" three times doesn't leave three live codes behind —
 * the newest is the only valid one.
 */
export async function createLinkCode(userId: string): Promise<LinkCodeResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, isActive: true, deletedAt: true, discordId: true },
  });

  if (!user || !user.isActive || user.deletedAt) {
    throw new NotFoundError("User not found");
  }
  if (user.discordId) {
    throw new BadRequestError(
      "This ForgeKeep account is already linked to Discord. Unlink it before linking a new Discord account.",
    );
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + LINK_CODE_TTL_MINUTES * 60 * 1000);

  return prisma.$transaction(async (tx) => {
    // Burn previous unconsumed codes.
    await tx.discordLinkCode.updateMany({
      where: { userId, consumedAt: null },
      data: { consumedAt: now },
    });

    // Retry on the astronomically unlikely collision rather than 500ing.
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = generateCode();
      const existing = await tx.discordLinkCode.findUnique({
        where: { code },
        select: { code: true },
      });
      if (existing) continue;

      await tx.discordLinkCode.create({ data: { code, userId, expiresAt } });
      return { code, expiresAt };
    }

    throw new Error("Could not generate a unique link code");
  });
}

export interface DiscordLinkStatus {
  linked: boolean;
  discordUsername: string | null;
  linkedAt: Date | null;
}

export async function getDiscordLinkStatus(userId: string): Promise<DiscordLinkStatus> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { discordId: true, discordUsername: true, discordLinkedAt: true },
  });

  if (!user) throw new NotFoundError("User not found");

  return {
    linked: user.discordId !== null,
    discordUsername: user.discordUsername,
    linkedAt: user.discordLinkedAt,
  };
}

/** Detach Discord from the account (website-side "Unlink" button). */
export async function unlinkDiscord(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { discordId: null, discordUsername: null, discordLinkedAt: null },
  });
}

// ═══════════════════════════════════════════════════
// GUILD-LEVEL DISCORD CONFIG
// The account link above is per-user; everything below is per-guild — which
// Discord server serves this guild, where its notifications go, and the boss
// nicknames its members type. Surfaced in Guild Settings → Discord Integration.
// ═══════════════════════════════════════════════════

const OFFICER_ROLES = ["OFFICER", "GUILD_LEADER", "FACTION_LEADER", "ADMIN"];
const LEADER_ROLES = ["GUILD_LEADER", "FACTION_LEADER", "ADMIN"];

/**
 * Authorize a guild-level Discord action.
 *
 * Returns the membership so callers can derive `canManage` from the same read
 * rather than querying twice.
 */
async function requireGuildMember(actorId: string, guildId: string) {
  const membership = await prisma.guildMember.findUnique({
    where: { userId_guildId: { userId: actorId, guildId } },
    select: { role: true, isActive: true },
  });

  if (!membership?.isActive) {
    throw new ForbiddenError("You are not a member of this guild");
  }

  return membership;
}

export interface GuildDiscordIntegration {
  server: {
    discordGuildId: string;
    timezone: string;
    linkedAt: Date;
    linkedByName: string | null;
  } | null;
  channels: Array<{ purpose: string; channelId: string }>;
  aliases: Array<{ id: string; alias: string; bossName: string }>;
  /** Whether the viewer may edit any of this. */
  canManage: boolean;
}

/**
 * Everything Guild Settings → Discord Integration needs, in one call.
 *
 * `server: null` means no Discord server is bound yet — the UI renders the
 * `!bindguild` instructions instead of a status panel. That's a normal state,
 * not an error.
 */
export async function getGuildDiscordIntegration(
  guildId: string,
  actorId: string,
): Promise<GuildDiscordIntegration> {
  const membership = await requireGuildMember(actorId, guildId);

  const server = await prisma.discordServer.findFirst({
    where: { guildId, isActive: true },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      discordGuildId: true,
      timezone: true,
      createdAt: true,
      linkedBy: { select: { displayName: true } },
      channels: { select: { purpose: true, channelId: true } },
    },
  });

  // Aliases scoped to this guild's Discord server, plus the globals every
  // server inherits — the same set the bot resolves against, so the UI can't
  // disagree with what `!kill baron` actually does.
  const aliases = await prisma.discordAlias.findMany({
    where: server
      ? { OR: [{ discordServerId: server.id }, { discordServerId: null }] }
      : { discordServerId: null },
    select: { id: true, alias: true, bossName: true },
    orderBy: { alias: "asc" },
  });

  return {
    server: server
      ? {
          discordGuildId: server.discordGuildId,
          timezone: server.timezone,
          linkedAt: server.createdAt,
          linkedByName: server.linkedBy?.displayName ?? null,
        }
      : null,
    channels: server?.channels ?? [],
    aliases,
    canManage: OFFICER_ROLES.includes(membership.role),
  };
}

/**
 * Add or update a boss alias (e.g. "baron" → "Baron Baraudmore").
 *
 * The target MUST be a real registry boss: an alias pointing at a name the boss
 * registry doesn't know is silently dead — `resolveBossName` verifies against
 * the registry and would reject it — so failing loudly here beats storing a row
 * that never resolves.
 */
export async function addBossAlias(
  guildId: string,
  actorId: string,
  aliasInput: string,
  bossNameInput: string,
): Promise<{ id: string; alias: string; bossName: string }> {
  const membership = await requireGuildMember(actorId, guildId);
  if (!OFFICER_ROLES.includes(membership.role)) {
    throw new ForbiddenError("Only Officers and Leaders can manage boss aliases");
  }

  const alias = aliasInput.trim().toLowerCase();
  if (!/^[a-z0-9 _-]{2,32}$/.test(alias)) {
    throw new BadRequestError(
      "An alias must be 2–32 characters: letters, numbers, spaces, hyphens or underscores",
    );
  }

  const boss = PREDEFINED_BOSSES.find(
    (b) => b.name.toLowerCase() === bossNameInput.trim().toLowerCase(),
  );
  if (!boss) {
    throw new BadRequestError(`"${bossNameInput}" is not a boss in the registry`);
  }

  // An alias that collides with a real boss name would shadow it — `!kill ego`
  // must always mean Ego.
  if (PREDEFINED_BOSSES.some((b) => b.name.toLowerCase() === alias)) {
    throw new BadRequestError(`"${alias}" is already a boss name`);
  }

  const server = await prisma.discordServer.findFirst({
    where: { guildId, isActive: true },
    orderBy: { updatedAt: "desc" },
    select: { id: true },
  });
  if (!server) {
    throw new BadRequestError(
      "No Discord server is bound to this guild yet — run !bindguild in Discord first",
    );
  }

  // The unique index is partial (WHERE discord_server_id IS NOT NULL), which
  // Prisma's `upsert` can't target, so this is an explicit find-then-write.
  const existing = await prisma.discordAlias.findFirst({
    where: { discordServerId: server.id, alias },
    select: { id: true },
  });

  const row = existing
    ? await prisma.discordAlias.update({
        where: { id: existing.id },
        data: { bossName: boss.name },
        select: { id: true, alias: true, bossName: true },
      })
    : await prisma.discordAlias.create({
        data: {
          discordServerId: server.id,
          alias,
          bossName: boss.name,
          createdById: actorId,
        },
        select: { id: true, alias: true, bossName: true },
      });

  await redisCache.del(cacheKeys.discordAliases(server.id));

  return row;
}

/**
 * Remove a guild's boss alias.
 *
 * Scoped to this guild's own server row: a global alias (discordServerId null)
 * is shared across every server and must not be deletable by one guild.
 */
export async function removeBossAlias(
  guildId: string,
  actorId: string,
  aliasId: string,
): Promise<void> {
  const membership = await requireGuildMember(actorId, guildId);
  if (!OFFICER_ROLES.includes(membership.role)) {
    throw new ForbiddenError("Only Officers and Leaders can manage boss aliases");
  }

  const server = await prisma.discordServer.findFirst({
    where: { guildId, isActive: true },
    orderBy: { updatedAt: "desc" },
    select: { id: true },
  });
  if (!server) throw new NotFoundError("No Discord server is bound to this guild");

  const result = await prisma.discordAlias.deleteMany({
    where: { id: aliasId, discordServerId: server.id },
  });

  if (result.count === 0) {
    throw new NotFoundError("Alias not found for this guild");
  }

  await redisCache.del(cacheKeys.discordAliases(server.id));
}

/**
 * Unbind the Discord server from this guild.
 *
 * Leader-only: this cuts the entire server off from the guild's data, and every
 * member's commands stop working. Soft (`isActive: false`) rather than a delete,
 * so the channel/alias config survives a re-bind.
 */
export async function unbindDiscordServer(guildId: string, actorId: string): Promise<void> {
  const membership = await requireGuildMember(actorId, guildId);
  if (!LEADER_ROLES.includes(membership.role)) {
    throw new ForbiddenError("Only a Guild Leader can unbind the Discord server");
  }

  const servers = await prisma.discordServer.findMany({
    where: { guildId, isActive: true },
    select: { discordGuildId: true },
  });

  await prisma.discordServer.updateMany({
    where: { guildId, isActive: true },
    data: { isActive: false },
  });

  await redisCache.delMany(servers.map((server) => cacheKeys.discordServer(server.discordGuildId)));
}
