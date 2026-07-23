import { getBossImageUrl } from "@guild/shared";
import type { Command, CommandContext } from "../../types/command.js";
import { brandedEmbed, clampDescription } from "../../embeds/builders.js";
import { spawnEmbed } from "../../embeds/notifications.js";
import { BrandColor } from "../../embeds/theme.js";
import { dedupeKeys } from "../../notifications/dedupe.js";
import { discordTimestamp } from "../../utils/time.js";
import { pingRoleContent } from "../../utils/pingRoles.js";
import { UserFacingError } from "../../utils/errors.js";
import { OFFICER_MINIMUM } from "../../middleware/permissions.js";

/**
 * `!forcespawn <boss>` — mark a boss live right now.
 *
 * For when the game spawned a boss off-schedule, or the tracked timer drifted
 * and the boss is actually up. Distinct from a timer *reset*, which schedules
 * the next spawn in the future.
 *
 * Writes go through @guild/core's `forceSpawnBosses`, which owns the rotation
 * pointer, faction scoping, audit log and cache invalidation.
 */
export const forceSpawnCommand: Command = {
  name: "forcespawn",
  aliases: ["fspawn", "spawnnow"],
  description: "Force a boss to be live right now.",
  usage: "!forcespawn <boss>",
  category: "Bosses",
  requiresLink: true,
  // Rewrites timers the whole faction reads — officers and up only.
  minimumRole: OFFICER_MINIMUM,

  async execute(ctx: CommandContext): Promise<void> {
    const actor = ctx.actor!;

    if (!ctx.rest.trim()) {
      throw new UserFacingError(
        "Which boss?",
        "Usage: `!forcespawn <boss>` — or `!forcespawnall` for every fixed-schedule boss.",
      );
    }

    const bossName = await ctx.services.boss.resolveBossName(
      ctx.rest.trim(),
      ctx.server.discordServerId,
    );

    await ctx.services.boss.forceSpawn({
      guildId: ctx.server.guildId,
      bossNames: [bossName],
      actorId: actor.userId,
    });

    // Re-read rather than assuming — the service owns what "live" now means.
    const [spawn] = await ctx.services.boss.listUpcoming({
      guildId: ctx.server.guildId,
      bossName,
    });

    const embed = brandedEmbed(BrandColor.GREEN)
      .setTitle(`⚡ ${bossName} — Force Spawned`)
      .setThumbnail(getBossImageUrl(bossName))
      .setDescription(`**${bossName}** is now marked **LIVE**.`)
      .addFields(
        { name: "By", value: actor.ign ?? actor.displayName, inline: true },
        { name: "Since", value: discordTimestamp(new Date(), "R"), inline: true },
      );

    if (spawn?.guildTurn) {
      embed.addFields({ name: "Guild Turn", value: `🛡 ${spawn.guildTurn}`, inline: true });
    }

    await ctx.message.reply({ embeds: [embed] });

    // Announce it — a force spawn is exactly the thing the guild needs to know
    // about immediately. The scheduler would also emit a SPAWN alert on its
    // next tick, so reuse that same dedupe key: whichever fires first wins and
    // the other is a no-op, instead of the channel getting two alerts.
    if (spawn) {
      await ctx
        .notify({
          dedupeKey: dedupeKeys.spawn(ctx.server.discordServerId, spawn.scheduleId),
          kind: "SPAWN",
          content: pingRoleContent(ctx.server.pingRoleId),
          embeds: [
            spawnEmbed({
              bossName,
              spawnTime: spawn.nextSpawn,
              location: spawn.location,
              guildTurn: spawn.guildTurn,
              pingRoleMention: pingRoleContent(ctx.server.pingRoleId),
            }),
          ],
        })
        .catch(() => {
          // Dispatcher already logged it; never fail the command over an alert.
        });
    }
  },
};

/**
 * `!forcespawnall` — mark every fixed-schedule boss live.
 *
 * The post-maintenance case: the server came back and the whole fixed roster is
 * up at once.
 */
export const forceSpawnAllCommand: Command = {
  name: "forcespawnall",
  aliases: ["fspawnall", "spawnall"],
  description: "Force every fixed-schedule boss to be live right now.",
  usage: "!forcespawnall",
  category: "Bosses",
  requiresLink: true,
  // Same guild-operations gate as the rest of the bot management commands.
  minimumRole: OFFICER_MINIMUM,

  async execute(ctx: CommandContext): Promise<void> {
    const actor = ctx.actor!;

    // Empty list ⇒ every FIXED_SCHEDULE boss (see forceSpawnBosses).
    await ctx.services.boss.forceSpawn({
      guildId: ctx.server.guildId,
      bossNames: [],
      actorId: actor.userId,
    });

    const live = (await ctx.services.boss.listUpcoming({ guildId: ctx.server.guildId })).filter(
      (spawn) => spawn.live,
    );

    const embed = brandedEmbed(BrandColor.GREEN)
      .setTitle("⚡ Fixed-Schedule Bosses — Force Spawned")
      .addFields(
        { name: "By", value: actor.ign ?? actor.displayName, inline: true },
        { name: "Now Live", value: `**${live.length}**`, inline: true },
      );

    if (live.length > 0) {
      embed.setDescription(
        clampDescription(live.map((spawn) => `🟢 **${spawn.bossName}** — ${spawn.location}`)),
      );
    } else {
      // The write succeeded but nothing reads as live — say so rather than
      // implying success.
      embed.setDescription(
        "No bosses are reading as live. Check the Boss Rotation page — this guild may have no fixed-schedule bosses configured.",
      );
    }

    await ctx.message.reply({ embeds: [embed] });

    // One alert per boss would be a wall of embeds; the summary above is the
    // notification. The scheduler will still announce each boss individually on
    // its next tick only if it hasn't already been claimed.
  },
};
