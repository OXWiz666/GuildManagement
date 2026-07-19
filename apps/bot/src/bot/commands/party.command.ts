import { ROLE_DISPLAY_NAMES, getBossImageUrl, type GuildRoleType } from "@guild/shared";
import type { Command, CommandContext } from "../../types/command.js";
import { brandedEmbed, clampDescription, formatNumber } from "../../embeds/builders.js";
import { BrandColor } from "../../embeds/theme.js";
import { discordTimestamp } from "../../utils/time.js";
import { UserFacingError } from "../../utils/errors.js";
import { OFFICER_MINIMUM } from "../../middleware/permissions.js";

/**
 * `!party [boss]` — who has committed to an upcoming fight.
 *
 * Backed by BossCommitment, the pre-fight headcount the website already
 * collects on Boss Rotation cards. There is no separate "party" entity in
 * ForgeKeep; commitments are the closest real concept, and reusing them means
 * Discord and the site show the same roster instead of two rival answers.
 */
export const partyCommand: Command = {
  name: "party",
  aliases: ["roster", "committed", "commits"],
  description: "Show members committed to the next boss fight.",
  usage: "!party [boss]",
  category: "Bosses",
  requiresLink: true,
  minimumRole: OFFICER_MINIMUM,

  async execute(ctx: CommandContext): Promise<void> {
    const filter = ctx.rest.trim();

    const bossName = filter
      ? await ctx.services.boss.resolveBossName(filter, ctx.server.discordServerId)
      : undefined;

    const spawns = await ctx.services.boss.listUpcoming({
      guildId: ctx.server.guildId,
      ...(bossName ? { bossName } : {}),
    });

    // Default to the soonest upcoming fight — the one people are actually
    // organizing for. listUpcoming already sorts by spawn time.
    const target = spawns[0];

    if (!target) {
      throw new UserFacingError(
        bossName ? `**${bossName}** has no upcoming spawn.` : "No upcoming spawns to commit to.",
        "Log a kill with `!kill <boss>` to start a timer.",
      );
    }

    const members = await ctx.services.boss.listParty(target.scheduleId);

    const embed = brandedEmbed(members.length > 0 ? BrandColor.GOLD : BrandColor.BLUE)
      .setTitle(`🛡 Party — ${target.bossName}`)
      .setThumbnail(getBossImageUrl(target.bossName))
      .addFields(
        {
          name: target.live ? "Status" : "Spawns",
          value: target.live ? "**LIVE NOW**" : discordTimestamp(target.nextSpawn, "R"),
          inline: true,
        },
        { name: "Committed", value: `**${members.length}**`, inline: true },
        { name: "Guild Turn", value: target.guildTurn ?? "Unassigned", inline: true },
      );

    if (members.length === 0) {
      embed.setDescription(
        "Nobody has committed yet. Members can commit from the **Boss Rotation** page on ForgeKeep.",
      );
      await ctx.message.reply({ embeds: [embed] });
      return;
    }

    // Sort by CP so leaders read the strongest committed players first;
    // members with no CP set sort last rather than as zero.
    const sorted = [...members].sort((a, b) => (b.cp ?? -1) - (a.cp ?? -1));

    const lines = sorted.map((member, index) => {
      const name = member.ign ?? member.displayName;
      const role = ROLE_DISPLAY_NAMES[member.role as GuildRoleType] ?? member.role;
      const cp = member.cp === null ? "—" : formatNumber(member.cp);
      return `\`${String(index + 1).padStart(2, " ")}.\` **${name}** · ${cp} CP · ${role}`;
    });

    const totalCp = sorted.reduce((sum, m) => sum + (m.cp ?? 0), 0);

    embed
      .setDescription(clampDescription(lines))
      .addFields({ name: "Combined CP", value: `**${formatNumber(totalCp)}**`, inline: true });

    await ctx.message.reply({ embeds: [embed] });
  },
};
