import crypto from "crypto";
import { prisma, GuildRole } from "@guild/db";
import {
  AUDIT_ACTIONS,
  DEFAULT_MARKET_RULES,
  leaderOnboardingSchema,
  slugify,
  type LeaderOnboardingInput,
} from "@guild/shared";
import { writeAuditLog } from "./audit.service";

// ─── Leader Onboarding ───────────────────────────
// Self-serve org creation. Runs once, right after a User row is first created
// (see auth.supabaseSync). GUILD_LEADER → a guild they lead. FACTION_LEADER →
// a faction (a group of guilds) plus its first guild.

// Default guild settings for a freshly created guild — mirrors the seed.
const DEFAULT_RANK_MULTIPLIERS = {
  GUILD_LEADER: 2.0,
  OFFICER: 1.5,
  CORE_MEMBER: 1.2,
  ELITE_MEMBER: 1.1,
  MEMBER: 1.0,
} as const;

// Uppercase initials of a name (min 2 chars), used for invite/member codes.
function abbreviate(name: string): string {
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .replace(/[^A-Za-z]/g, "")
    .toUpperCase();
  if (initials.length >= 2) return initials;
  return name.substring(0, 3).replace(/[^A-Za-z]/g, "").toUpperCase() || "GLD";
}

// Slugify a name and guarantee uniqueness against a table via `exists`.
async function uniqueSlug(
  name: string,
  exists: (slug: string) => Promise<boolean>,
): Promise<string> {
  const base = slugify(name) || "guild";
  if (!(await exists(base))) return base;
  // Collisions are rare; a short random suffix avoids an unbounded loop.
  for (let i = 0; i < 5; i++) {
    const candidate = `${base}-${crypto.randomBytes(2).toString("hex")}`;
    if (!(await exists(candidate))) return candidate;
  }
  return `${base}-${crypto.randomUUID().slice(0, 8)}`;
}

export interface CreatedOrg {
  guildId: string;
  guildSlug: string;
  factionId: string | null;
}

/**
 * Create the org a new leader chose at signup. Idempotency is the caller's
 * responsibility — invoke this only when the user has no guild membership yet
 * (i.e. immediately after their User row is created).
 */
export async function createOrgForUser(
  user: { id: string; displayName: string },
  rawInput: LeaderOnboardingInput,
  ctx?: { ipAddress?: string; userAgent?: string },
): Promise<CreatedOrg | null> {
  const input = leaderOnboardingSchema.parse(rawInput);
  if (input.accountType === "MEMBER") return null;

  const isFaction = input.accountType === "FACTION_LEADER";

  const prefix = abbreviate(input.guildName);
  const inviteCode = `${prefix}-JOIN-${crypto.randomBytes(2).toString("hex").toUpperCase()}`;
  const memberCode = `${prefix}-001`;

  const result = await prisma.$transaction(async (tx) => {
    // Faction first (if applicable) so the guild can reference it.
    let factionId: string | null = null;
    if (isFaction && input.factionName) {
      const factionSlug = await uniqueSlug(
        input.factionName,
        async (s) => !!(await tx.faction.findUnique({ where: { slug: s }, select: { id: true } })),
      );
      const factionInviteCode = `${abbreviate(input.factionName)}-FAC-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
      const faction = await tx.faction.create({
        data: {
          name: input.factionName,
          slug: factionSlug,
          leaderUserId: user.id,
          inviteCode: factionInviteCode,
        },
      });
      factionId = faction.id;
    }

    const guildSlug = await uniqueSlug(
      input.guildName,
      async (s) => !!(await tx.guild.findUnique({ where: { slug: s }, select: { id: true } })),
    );

    const guild = await tx.guild.create({
      data: {
        name: input.guildName,
        slug: guildSlug,
        inviteCode,
        factionId,
        settings: {
          create: {
            rankMultipliers: DEFAULT_RANK_MULTIPLIERS,
            marketRules: DEFAULT_MARKET_RULES,
            activeShareModel: "EQUAL",
          },
        },
      },
    });

    // The registrant is the leader of the guild they just created.
    const role = isFaction ? GuildRole.FACTION_LEADER : GuildRole.GUILD_LEADER;
    const rankName = isFaction ? "Faction Leader" : "Guild Leader";
    await tx.guildMember.create({
      data: {
        userId: user.id,
        guildId: guild.id,
        role,
        rankName,
        memberCode,
        isActive: true,
      },
    });

    return { guildId: guild.id, guildSlug, factionId };
  });

  // Audit trail — outside the transaction, best-effort.
  if (result.factionId) {
    await writeAuditLog({
      actorId: user.id,
      action: AUDIT_ACTIONS.FACTION_CREATED,
      target: "Faction",
      targetId: result.factionId,
      detail: { name: input.factionName, firstGuildId: result.guildId },
      ipAddress: ctx?.ipAddress,
      userAgent: ctx?.userAgent,
    });
  }
  await writeAuditLog({
    actorId: user.id,
    guildId: result.guildId,
    action: AUDIT_ACTIONS.GUILD_CREATED,
    target: "Guild",
    targetId: result.guildId,
    detail: {
      name: input.guildName,
      accountType: input.accountType,
      factionId: result.factionId,
    },
    ipAddress: ctx?.ipAddress,
    userAgent: ctx?.userAgent,
  });

  return result;
}
