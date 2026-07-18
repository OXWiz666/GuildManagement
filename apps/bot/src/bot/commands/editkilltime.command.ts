import { getBossImageUrl } from "@guild/shared";
import type { Command, CommandContext } from "../../types/command.js";
import { brandedEmbed } from "../../embeds/builders.js";
import { killEmbed } from "../../embeds/notifications.js";
import { BrandColor } from "../../embeds/theme.js";
import { dedupeKeys } from "../../notifications/dedupe.js";
import { discordTimestamp, resolveWallClock } from "../../utils/time.js";
import { UserFacingError } from "../../utils/errors.js";
import { OFFICER_MINIMUM } from "../../middleware/permissions.js";

/**
 * `!editkilltime <boss> <HH:MM>` — correct a mis-logged kill time.
 *
 * The everyday case: someone logs the kill twenty minutes late, so every
 * downstream timer is twenty minutes wrong for the whole faction.
 *
 * Delegates to @guild/core's `editBossKillTime`, which restates only what
 * derives from the timestamp (killedAt, the rotation pointer's next spawn, and
 * the live schedule row) without re-advancing the queue — the turn already
 * happened, and re-running it would hand the boss to the wrong guild.
 */
export const editKillTimeCommand: Command = {
  name: "editkilltime",
  aliases: ["editkill", "fixkill", "kt"],
  description: "Correct the kill time of the last logged kill for a boss.",
  usage: "!editkilltime <boss> <HH:MM>",
  category: "Bosses",
  requiresLink: true,
  minimumRole: OFFICER_MINIMUM,

  async execute(ctx: CommandContext): Promise<void> {
    const actor = ctx.actor!;

    if (ctx.args.length < 2) {
      throw new UserFacingError(
        "Which boss, and what time?",
        "Usage: `!editkilltime <boss> <HH:MM>` — e.g. `!editkilltime Venatus 21:30`",
      );
    }

    // Same parse shape as `!kill`: a trailing HH:MM, with everything before it
    // the boss name (which may contain spaces).
    const last = ctx.args[ctx.args.length - 1]!;
    if (!/^\d{1,2}:\d{2}$/.test(last)) {
      throw new UserFacingError(
        `\`${last}\` isn't a time.`,
        "Use 24-hour `HH:MM` — e.g. `!editkilltime Venatus 21:30`",
      );
    }

    const nameParts = ctx.args.slice(0, -1);
    if (nameParts.length === 0) {
      throw new UserFacingError("Which boss?", "Usage: `!editkilltime <boss> <HH:MM>`");
    }

    const bossName = await ctx.services.boss.resolveBossName(
      nameParts.join(" "),
      ctx.server.discordServerId,
    );

    // Wall-clock in the server's timezone, and never in the future — same rule
    // as `!kill`, since a kill can only have already happened.
    const killedAt = resolveWallClock(last, ctx.server.timezone);

    const result = await ctx.services.boss.editKillTime({
      guildId: ctx.server.guildId,
      bossName,
      killedAt,
      actorId: actor.userId,
    });

    const embed = brandedEmbed(BrandColor.BLUE)
      .setTitle(`🕐 ${bossName} — Kill Time Corrected`)
      .setThumbnail(getBossImageUrl(bossName))
      .addFields(
        {
          name: "Was",
          value: result.previousKilledAt
            ? discordTimestamp(result.previousKilledAt, "t")
            : "*Unknown*",
          inline: true,
        },
        { name: "Now", value: discordTimestamp(killedAt, "t"), inline: true },
        { name: "Corrected By", value: actor.ign ?? actor.displayName, inline: true },
        {
          name: "Next Spawn",
          value: `${discordTimestamp(result.nextSpawnTime, "f")} (${discordTimestamp(result.nextSpawnTime, "R")})`,
        },
      );

    await ctx.message.reply({ embeds: [embed] });

    // Re-announce: the guild's timers just moved, and the people who saw the
    // original kill alert are the ones who need to know. The dedupe key embeds
    // the corrected timestamp, so this is a genuinely new event rather than a
    // duplicate of the original announcement.
    await ctx
      .notify({
        dedupeKey: dedupeKeys.kill(
          ctx.server.discordServerId,
          result.schedule?.id ?? bossName,
          killedAt.getTime(),
        ),
        kind: "KILL",
        embeds: [
          killEmbed({
            bossName,
            killedAt,
            killedBy: `${actor.ign ?? actor.displayName} (corrected)`,
            nextSpawn: result.nextSpawnTime,
            nextTurn: result.schedule?.guildTurn ?? null,
          }),
        ],
      })
      .catch(() => {
        // Dispatcher logs it; the correction itself already succeeded.
      });
  },
};
