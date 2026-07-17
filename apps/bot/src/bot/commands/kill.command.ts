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
 * `!kill <boss> [HH:MM]` — log a kill and restart the boss's timer.
 *
 * The optional time is wall-clock in the server's configured timezone (default
 * Asia/Singapore, the game's server time). Omitted, the kill is "now".
 *
 * The write itself is delegated to @guild/core, which advances the rotation
 * queue, computes the next spawn, writes the audit log, and broadcasts to the
 * website — so a kill logged here is on the site immediately.
 */
export const killCommand: Command = {
  name: "kill",
  aliases: ["killed", "down"],
  description: "Log a boss kill and restart its respawn timer.",
  usage: "!kill <boss> [HH:MM]",
  category: "Bosses",
  requiresLink: true,
  // Kills reorder the faction rotation queue for every guild — a mis-logged
  // kill is disruptive and annoying to unwind, so it stays officer-gated.
  minimumRole: OFFICER_MINIMUM,

  async execute(ctx: CommandContext): Promise<void> {
    const actor = ctx.actor!; // guaranteed by requiresLink + middleware

    if (ctx.args.length === 0) {
      throw new UserFacingError("Which boss?", "Usage: `!kill <boss> [HH:MM]`");
    }

    // A trailing HH:MM is the time; everything before it is the boss name,
    // which may contain spaces ("Baron Baraudmore", "Lady Dalia").
    const last = ctx.args[ctx.args.length - 1]!;
    const hasTime = /^\d{1,2}:\d{2}$/.test(last);

    const nameParts = hasTime ? ctx.args.slice(0, -1) : ctx.args;
    if (nameParts.length === 0) {
      throw new UserFacingError("Which boss?", "Usage: `!kill <boss> [HH:MM]`");
    }

    const bossName = await ctx.services.boss.resolveBossName(
      nameParts.join(" "),
      ctx.server.discordServerId,
    );

    const killedAt = hasTime ? resolveWallClock(last, ctx.server.timezone) : new Date();

    // recordKill returns the exact schedule row the write just rolled forward
    // to — used directly below rather than re-querying, which is what
    // previously let a stale leftover schedule (sorted ahead of the correct
    // one) get displayed as "Next Spawn" right after a kill.
    const { nextSpawn: spawn } = await ctx.services.boss.recordKill({
      guildId: ctx.server.guildId,
      bossName,
      killedAt,
      actorId: actor.userId,
    });

    const embed = brandedEmbed(BrandColor.RED)
      .setTitle(`💀 ${bossName} — Killed`)
      .setThumbnail(getBossImageUrl(bossName))
      .addFields(
        { name: "Killed At", value: discordTimestamp(killedAt, "f"), inline: true },
        { name: "Logged By", value: actor.ign ?? actor.displayName, inline: true },
      );

    if (spawn) {
      embed.addFields(
        { name: "Next Spawn", value: discordTimestamp(spawn.nextSpawn, "f"), inline: false },
        { name: "Respawns", value: discordTimestamp(spawn.nextSpawn, "R"), inline: true },
      );
      if (spawn.guildTurn) {
        embed.addFields({ name: "Next Turn", value: `🛡 ${spawn.guildTurn}`, inline: true });
      }
    } else {
      // The kill landed but no forward schedule came back — surface it rather
      // than implying a timer exists.
      embed.addFields({
        name: "Next Spawn",
        value: "Not scheduled — check the Boss Rotation page.",
      });
    }

    await ctx.message.reply({ embeds: [embed] });

    // Announce to the notification channel so the guild sees the new timer
    // without watching the command channel. Goes through the same dedupe path
    // as scheduled alerts; a failure here must not fail the command, since the
    // kill is already committed.
    await ctx
      .notify({
        dedupeKey: dedupeKeys.kill(
          ctx.server.discordServerId,
          spawn?.scheduleId ?? bossName,
          killedAt.getTime(),
        ),
        kind: "KILL",
        embeds: [
          killEmbed({
            bossName,
            killedAt,
            killedBy: actor.ign ?? actor.displayName,
            nextSpawn: spawn?.nextSpawn ?? null,
            nextTurn: spawn?.guildTurn ?? null,
          }),
        ],
      })
      .catch(() => {
        // Already logged inside the dispatcher.
      });
  },
};
