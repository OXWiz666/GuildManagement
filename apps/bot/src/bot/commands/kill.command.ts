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

// A boss realistically drops a handful of items. This guards against a pasted
// wall of text creating dozens of storage rows.
const MAX_DROPS_PER_KILL = 20;

/**
 * `!kill <boss> [item drop, item drop, ...] [HH:MM]` logs a kill and restarts
 * the boss timer. If the boss was already killed and its next spawn has not
 * arrived yet, the command only shows the existing kill details.
 */
export const killCommand: Command = {
  name: "kill",
  aliases: ["killed", "down"],
  description: "Log a boss kill (with optional item drops) and restart its respawn timer.",
  usage: USAGE,
  category: "Bosses",
  requiresLink: true,
  minimumRole: OFFICER_MINIMUM,

  async execute(ctx: CommandContext): Promise<void> {
    const actor = ctx.actor!;

    if (ctx.args.length === 0) {
      throw new UserFacingError("Which boss?", `Usage: \`${USAGE}\``);
    }

    const last = ctx.args[ctx.args.length - 1]!;
    const hasTime = /^\d{1,2}:\d{2}$/.test(last);

    const rest = hasTime ? ctx.args.slice(0, -1) : ctx.args;
    if (rest.length === 0) {
      throw new UserFacingError("Which boss?", `Usage: \`${USAGE}\``);
    }

    const { bossName, itemDrops } = await ctx.services.boss.matchBossAndItem(
      rest,
      ctx.server.discordServerId,
    );

    if (itemDrops && itemDrops.length > MAX_DROPS_PER_KILL) {
      throw new UserFacingError(
        "Too many drops in one message",
        `Log at most ${MAX_DROPS_PER_KILL} items per kill. Split the rest into another storage entry.`,
      );
    }

    const requestedKilledAt = hasTime ? resolveWallClock(last, ctx.server.timezone) : new Date();

    const { nextSpawn: spawn, drops, alreadyLogged, killedAt } = await ctx.services.boss.recordKill({
      guildId: ctx.server.guildId,
      bossName,
      killedAt: requestedKilledAt,
      actorId: actor.userId,
      itemDrops,
    });

    const embed = brandedEmbed(BrandColor.RED)
      .setTitle(`${bossName} - ${alreadyLogged ? "Already logged" : "Killed"}`)
      .setThumbnail(drops.find((d) => d.iconUrl)?.iconUrl ?? getBossImageUrl(bossName))
      .addFields(
        { name: "Killed At", value: discordTimestamp(killedAt, "f"), inline: true },
        {
          name: alreadyLogged ? "Status" : "Logged By",
          value: alreadyLogged ? "This boss kill was already recorded." : actor.ign ?? actor.displayName,
          inline: true,
        },
      );

    if (drops.length) {
      embed.addFields({
        name: drops.length > 1 ? "Drops" : "Drop",
        value: drops
          .map((d) =>
            d.matched
              ? `**${d.itemName}** -> added to Guild Storage`
              : `**${d.itemName}** -> added to Guild Storage (no catalog icon matched)`,
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
        embed.addFields({ name: "Next Turn", value: spawn.guildTurn, inline: true });
      }
    } else {
      embed.addFields({
        name: "Next Spawn",
        value: "Not scheduled. Check the Boss Rotation page.",
      });
    }

    await ctx.message.reply({ embeds: [embed] });
    if (alreadyLogged) return;

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
