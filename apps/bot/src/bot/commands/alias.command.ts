import { PREDEFINED_BOSSES } from "@guild/shared";
import { redisCache, cacheKeys } from "@guild/core";
import type { Command, CommandContext } from "../../types/command.js";
import { brandedEmbed, clampDescription, successEmbed } from "../../embeds/builders.js";
import { BrandColor } from "../../embeds/theme.js";
import { UserFacingError } from "../../utils/errors.js";
import { OFFICER_MINIMUM } from "../../middleware/permissions.js";

/**
 * `!alias` — boss nicknames.
 *
 *   !alias                       → list this server's aliases
 *   !alias add baron Baron Baraudmore
 *   !alias remove baron
 *
 * Aliases are what make `!spawn BARON` work: the registry has no boss called
 * BARON, so a guild maps its own shorthand onto the real name. Resolution
 * (BossService.resolveBossName) prefers a server alias over a global one.
 *
 * Aliases can also be managed from the website (Guild Settings → Discord
 * Integration); both paths write the same rows.
 */
export const aliasCommand: Command = {
  name: "alias",
  aliases: ["aliases", "nickname"],
  description: "List, add or remove boss name aliases.",
  usage: "!alias [add <alias> <boss> | remove <alias>]",
  example: ["!alias", "!alias add baron Baron Baraudmore", "!alias remove baron"],
  category: "Configuration",
  requiresLink: true,
  // Listing is harmless, but the command as a whole writes guild-wide config.
  // The read path is gated the same way for one predictable rule rather than
  // a subcommand-by-subcommand surprise.
  minimumRole: OFFICER_MINIMUM,

  async execute(ctx: CommandContext): Promise<void> {
    const sub = (ctx.args[0] ?? "").toLowerCase();

    if (!sub || sub === "list") return listAliases(ctx);
    if (sub === "add" || sub === "set") return addAlias(ctx);
    if (sub === "remove" || sub === "rm" || sub === "delete") return removeAlias(ctx);

    throw new UserFacingError(
      `Unknown subcommand \`${sub}\`.`,
      "Use `!alias`, `!alias add <alias> <boss>`, or `!alias remove <alias>`.",
    );
  },
};

async function listAliases(ctx: CommandContext): Promise<void> {
  const rows = await ctx.services.repositories.alias.listForServer(ctx.server.discordServerId);

  if (rows.length === 0) {
    await ctx.message.reply({
      embeds: [
        brandedEmbed(BrandColor.BLUE)
          .setTitle("No boss aliases yet")
          .setDescription(
            "Add one with `!alias add baron Baron Baraudmore` — then `!spawn baron` works.",
          ),
      ],
    });
    return;
  }

  // Server-scoped aliases override globals, so label which is which rather than
  // showing a flat list that hides the precedence.
  const lines = rows
    .slice()
    .sort((a, b) => a.alias.localeCompare(b.alias))
    .map((row) => {
      const scope = row.discordServerId === null ? " *(global)*" : "";
      return `\`${row.alias}\` → **${row.bossName}**${scope}`;
    });

  await ctx.message.reply({
    embeds: [
      brandedEmbed(BrandColor.GOLD)
        .setTitle(`Boss Aliases — ${ctx.server.guildName}`)
        .setDescription(clampDescription(lines)),
    ],
  });
}

async function addAlias(ctx: CommandContext): Promise<void> {
  const actor = ctx.actor!;

  // `!alias add <alias> <boss name...>` — the alias is one word, the boss name
  // may have spaces ("Baron Baraudmore").
  const alias = (ctx.args[1] ?? "").trim().toLowerCase();
  const bossInput = ctx.args.slice(2).join(" ").trim();

  if (!alias || !bossInput) {
    throw new UserFacingError(
      "Need both an alias and a boss name.",
      "Example: `!alias add baron Baron Baraudmore`",
    );
  }

  if (!/^[a-z0-9_-]{2,32}$/.test(alias)) {
    throw new UserFacingError(
      `\`${alias}\` isn't a valid alias.`,
      "Use 2–32 characters: letters, numbers, hyphens or underscores (no spaces).",
    );
  }

  // The alias must point at a REAL registry boss. resolveBossName verifies
  // against the registry on every lookup, so an alias to an unknown name would
  // be stored and then silently never resolve.
  const boss = PREDEFINED_BOSSES.find((b) => b.name.toLowerCase() === bossInput.toLowerCase());
  if (!boss) {
    // Let the normal resolver produce the "did you mean" suggestions.
    const resolved = await ctx.services.boss.resolveBossName(bossInput, ctx.server.discordServerId);
    return finishAdd(ctx, alias, resolved, actor.userId);
  }

  // An alias that shadows a real boss name would break `!kill ego`.
  if (PREDEFINED_BOSSES.some((b) => b.name.toLowerCase() === alias)) {
    throw new UserFacingError(`\`${alias}\` is already a boss name.`);
  }

  return finishAdd(ctx, alias, boss.name, actor.userId);
}

async function finishAdd(
  ctx: CommandContext,
  alias: string,
  bossName: string,
  actorId: string,
): Promise<void> {
  await ctx.services.repositories.alias.upsert({
    discordServerId: ctx.server.discordServerId,
    alias,
    bossName,
    createdById: actorId,
  });

  // Aliases are cached on the resolve path — drop it so the very next
  // `!spawn baron` sees the new mapping instead of waiting out the TTL.
  await redisCache.del(cacheKeys.discordAliases(ctx.server.discordServerId));

  await ctx.message.reply({
    embeds: [
      successEmbed(
        "✅ Alias saved",
        `\`${alias}\` now means **${bossName}**.\nTry \`!spawn ${alias}\`.`,
      ),
    ],
  });
}

async function removeAlias(ctx: CommandContext): Promise<void> {
  const alias = (ctx.args[1] ?? "").trim().toLowerCase();

  if (!alias) {
    throw new UserFacingError("Which alias?", "Example: `!alias remove baron`");
  }

  const removed = await ctx.services.repositories.alias.remove(ctx.server.discordServerId, alias);

  if (!removed) {
    throw new UserFacingError(
      `No alias \`${alias}\` on this server.`,
      "Run `!alias` to see what's configured. Global aliases can't be removed per-server.",
    );
  }

  await redisCache.del(cacheKeys.discordAliases(ctx.server.discordServerId));

  await ctx.message.reply({
    embeds: [successEmbed("✅ Alias removed", `\`${alias}\` no longer maps to a boss.`)],
  });
}
