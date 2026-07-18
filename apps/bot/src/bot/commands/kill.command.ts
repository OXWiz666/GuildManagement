import { getBossImageUrl } from "@guild/shared";
import type { Command, CommandContext } from "../../types/command.js";
import { brandedEmbed } from "../../embeds/builders.js";
import { killEmbed } from "../../embeds/notifications.js";
import { BrandColor } from "../../embeds/theme.js";
import { dedupeKeys } from "../../notifications/dedupe.js";
import { discordTimestamp, resolveWallClock } from "../../utils/time.js";
import { UserFacingError } from "../../utils/errors.js";
import { OFFICER_MINIMUM } from "../../middleware/permissions.js";

const USAGE = "!kill <boss> [item drop, item drop, ...] [HH:MM]";

// A boss realistically drops a handful of items — this is a guard against a
// mistyped/pasted wall of text creating dozens of storage rows, not a real
// ceiling anyone should hit. @guild/core's own cap (MAX_DROPS_PER_KILL = 40)
// is a second, independent backstop for the catalog-matched half of the list.
const MAX_DROPS_PER_KILL = 20;

/**
 * `!kill <boss> [item drop, item drop, ...] [HH:MM]` — log a kill and restart
 * the boss's timer.
 *
 * One or more comma-separated item names after the boss (e.g. `!kill Livera
 * Pernox Bow, Temporal Fragment`) are each matched against the live drop
 * catalog and vaulted into Guild Storage automatically — no manual "add to
 * storage" step. A name that doesn't match anything in the catalog still
 * lands in the vault as a plain entry rather than being silently dropped.
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
  description: "Log a boss kill (with optional item drops) and restart its respawn timer.",
  usage: USAGE,
  category: "Bosses",
  requiresLink: true,
  // Kills reorder the faction rotation queue for every guild — a mis-logged
  // kill is disruptive and annoying to unwind, so it stays officer-gated.
  minimumRole: OFFICER_MINIMUM,

  async execute(ctx: CommandContext): Promise<void> {
    const actor = ctx.actor!; // guaranteed by requiresLink + middleware

    if (ctx.args.length === 0) {
      throw new UserFacingError("Which boss?", `Usage: \`${USAGE}\``);
    }

    // A trailing HH:MM is the time; everything before it is boss (+ optional
    // comma-separated items), which may itself contain spaces ("Baron
    // Baraudmore", "Pernox Bow").
    const last = ctx.args[ctx.args.length - 1]!;
    const hasTime = /^\d{1,2}:\d{2}$/.test(last);

    const rest = hasTime ? ctx.args.slice(0, -1) : ctx.args;
    if (rest.length === 0) {
      throw new UserFacingError("Which boss?", `Usage: \`${USAGE}\``);
    }

    // Splits on an exact boss-name/alias match, so free-text item names never
    // get mistaken for part of the boss (see matchBossAndItem's doc comment).
    // Item text only splits out when the boss is given by its full registry
    // name or a configured alias — a bare unique-prefix shorthand like `!kill l`
    // still works, but only for a boss-only kill.
    const { bossName, itemDrops } = await ctx.services.boss.matchBossAndItem(
      rest,
      ctx.server.discordServerId,
    );

    if (itemDrops && itemDrops.length > MAX_DROPS_PER_KILL) {
      throw new UserFacingError(
        "Too many drops in one message",
        `Log at most ${MAX_DROPS_PER_KILL} items per kill — split the rest into a follow-up \`!editkilltime\`-free storage entry, or a second message.`,
      );
    }

    const killedAt = hasTime ? resolveWallClock(last, ctx.server.timezone) : new Date();

    // recordKill returns the exact schedule row the write just rolled forward
    // to — used directly below rather than re-querying, which is what
    // previously let a stale leftover schedule (sorted ahead of the correct
    // one) get displayed as "Next Spawn" right after a kill.
    const { nextSpawn: spawn, drops } = await ctx.services.boss.recordKill({
      guildId: ctx.server.guildId,
      bossName,
      killedAt,
      actorId: actor.userId,
      itemDrops,
    });

    const embed = brandedEmbed(BrandColor.RED)
      .setTitle(`💀 ${bossName} — Killed`)
      .setThumbnail(drops.find((d) => d.iconUrl)?.iconUrl ?? getBossImageUrl(bossName))
      .addFields(
        { name: "Killed At", value: discordTimestamp(killedAt, "f"), inline: true },
        { name: "Logged By", value: actor.ign ?? actor.displayName, inline: true },
      );

    if (drops.length) {
      embed.addFields({
        name: drops.length > 1 ? "Drops" : "Drop",
        value: drops
          .map((d) =>
            d.matched
              ? `📦 **${d.itemName}** → added to Guild Storage`
              : `📦 **${d.itemName}** → added to Guild Storage (no catalog icon matched)`,
          )
          .join("\n"),
      });
    }

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
            dropItemNames: drops.map((d) => d.itemName),
            dropIconUrl: drops.find((d) => d.iconUrl)?.iconUrl ?? null,
          }),
        ],
      })
      .catch(() => {
        // Already logged inside the dispatcher.
      });
  },
};
