import { getBossImageUrl } from "@guild/shared";
import type { Command, CommandContext } from "../../types/command.js";
import { brandedEmbed } from "../../embeds/builders.js";
import { BrandColor } from "../../embeds/theme.js";
import { discordTimestamp, resolveFutureWallClock } from "../../utils/time.js";
import { UserFacingError } from "../../utils/errors.js";
import { OFFICER_MINIMUM } from "../../middleware/permissions.js";

/**
 * `!setspawn <boss> <HH:MM>` — set a boss's next spawn to an exact known
 * time, bypassing the usual kill-time-plus-cooldown math entirely.
 *
 * For when the real spawn is known from outside ForgeKeep — a rival guild's
 * own timer, a screenshot of the in-game clock — rather than from a kill
 * logged here. `!editkilltime` only *corrects a logged kill* and still
 * derives the next spawn from cooldown; this instead overwrites the spawn
 * time directly, so it works even with no kill logged for the boss yet.
 */
export const setSpawnCommand: Command = {
  name: "setspawn",
  aliases: ["settimer", "spawntime", "correctspawn"],
  description: "Set a boss's next spawn to an exact known time.",
  usage: "!setspawn <boss> <HH:MM>",
  category: "Bosses",
  requiresLink: true,
  minimumRole: OFFICER_MINIMUM,

  async execute(ctx: CommandContext): Promise<void> {
    const actor = ctx.actor!;

    if (ctx.args.length < 2) {
      throw new UserFacingError(
        "Which boss, and what time?",
        "Usage: `!setspawn <boss> <HH:MM>` — e.g. `!setspawn Venatus 04:25` for a 4:25 AM spawn.",
      );
    }

    // Same trailing-HH:MM parse shape as `!kill` / `!editkilltime`: everything
    // before the time is the boss name, which may contain spaces.
    const last = ctx.args[ctx.args.length - 1]!;
    if (!/^\d{1,2}:\d{2}$/.test(last)) {
      throw new UserFacingError(
        `\`${last}\` isn't a time.`,
        "Use 24-hour `HH:MM` — e.g. `!setspawn Venatus 04:25`.",
      );
    }

    const nameParts = ctx.args.slice(0, -1);
    if (nameParts.length === 0) {
      throw new UserFacingError("Which boss?", "Usage: `!setspawn <boss> <HH:MM>`");
    }

    const bossName = await ctx.services.boss.resolveBossName(
      nameParts.join(" "),
      ctx.server.discordServerId,
    );

    // Wall-clock in the server's timezone, rolled to the next occurrence —
    // a spawn being set is always upcoming, never in the past.
    const spawnTime = resolveFutureWallClock(last, ctx.server.timezone);

    await ctx.services.boss.setSpawnTime({
      guildId: ctx.server.guildId,
      bossName,
      spawnTime,
      actorId: actor.userId,
    });

    const embed = brandedEmbed(BrandColor.BLUE)
      .setTitle(`${bossName} — Spawn Time Set`)
      .setThumbnail(getBossImageUrl(bossName))
      .addFields(
        { name: "Spawns at", value: discordTimestamp(spawnTime, "f"), inline: true },
        { name: "Countdown", value: discordTimestamp(spawnTime, "R"), inline: true },
        { name: "Set by", value: actor.ign ?? actor.displayName, inline: true },
      )
      .setFooter({ text: "Check !spawn to confirm — no kill was logged, only the timer was corrected." });

    await ctx.message.reply({ embeds: [embed] });
  },
};
