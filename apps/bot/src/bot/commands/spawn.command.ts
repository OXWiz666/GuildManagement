import { getBossImageUrl } from "@guild/shared";
import type { Command, CommandContext } from "../../types/command.js";
import type { ResolvedActivity, ResolvedSpawn } from "../../services/boss.service.js";
import { brandedEmbed, clampDescription } from "../../embeds/builders.js";
import { BrandColor } from "../../embeds/theme.js";
import { dayBucket, discordTimestamp, type DayBucket } from "../../utils/time.js";

/**
 * `!spawn` / `!spawn <boss>` — upcoming spawns, grouped Today/Tomorrow/Future.
 *
 * Times render as Discord timestamps so each member sees their own local clock;
 * the countdown comes from the same @guild/shared timer the website displays.
 */
export const spawnCommand: Command = {
  name: "spawn",
  aliases: ["spawns", "timer", "timers"],
  description: "Show upcoming boss spawns. Pass a boss name to filter.",
  usage: "!spawn [boss]",
  category: "Bosses",
  requiresLink: true,
  minimumRole: null,

  async execute(ctx: CommandContext): Promise<void> {
    const filter = ctx.rest.trim();

    // Resolve aliases/prefixes up front so `!spawn venatus` and `!spawn viorent`
    // behave the same here as they do in `!kill`.
    const bossName = filter
      ? await ctx.services.boss.resolveBossName(filter, ctx.server.discordServerId)
      : undefined;

    const [spawns, activities] = await Promise.all([
      ctx.services.boss.listUpcoming({
        guildId: ctx.server.guildId,
        ...(bossName ? { bossName } : {}),
      }),
      bossName ? Promise.resolve([]) : ctx.services.boss.listUpcomingActivities(ctx.server.guildId, 5),
    ]);

    if (spawns.length === 0) {
      if (!bossName && activities.length > 0) {
        const embed = withActivityFields(
          brandedEmbed(BrandColor.GOLD).setTitle(`Boss Spawns - ${ctx.server.guildName}`),
          activities,
        ).setDescription("No boss spawns are scheduled right now.");
        await ctx.message.reply({ embeds: [embed] });
        return;
      }

      const embed = brandedEmbed(BrandColor.BLUE)
        .setTitle(bossName ? `No upcoming spawn for ${bossName}` : "No upcoming spawns")
        .setDescription(
          bossName
            ? `**${bossName}** has no live or scheduled spawn right now. Log a kill with \`!kill ${bossName}\` to start its timer.`
            : "Nothing is scheduled. Log a kill with `!kill <boss>` to start a timer.",
        );
      await ctx.message.reply({ embeds: [embed] });
      return;
    }

    // Single-boss view gets a richer card with the boss art.
    if (bossName && spawns.length === 1) {
      await ctx.message.reply({ embeds: [singleBossEmbed(spawns[0]!, ctx)] });
      return;
    }

    await ctx.message.reply({ embeds: [withActivityFields(groupedEmbed(spawns, ctx), activities)] });
  },
};

function singleBossEmbed(spawn: ResolvedSpawn, ctx: CommandContext) {
  const registry = ctx.services.boss.getRegistryBoss(spawn.bossName);

  const embed = brandedEmbed(spawn.live ? BrandColor.GREEN : BrandColor.GOLD)
    .setTitle(spawn.bossName)
    .setThumbnail(getBossImageUrl(spawn.bossName))
    .addFields(
      {
        name: "Status",
        value: spawn.live ? "Live now" : `Respawns ${discordTimestamp(spawn.nextSpawn, "R")}`,
        inline: true,
      },
      {
        name: spawn.live ? "Up for" : "Remaining",
        value: spawn.live ? `\`${spawn.liveElapsedText || "just now"}\`` : `\`${spawn.timerText}\``,
        inline: true,
      },
      { name: "Location", value: spawn.location || registry?.location || "Unknown", inline: true },
      {
        name: "Spawn time",
        value: discordTimestamp(spawn.nextSpawn, "f"),
        inline: true,
      },
      { name: "Guild turn", value: spawn.guildTurn ?? "Unassigned", inline: true },
    );

  if (registry) {
    embed.addFields({
      name: "Cycle",
      value: registry.cooldownHours ? `${registry.cooldownHours}h cooldown` : "Fixed schedule",
      inline: true,
    });
  }

  return embed;
}

function withActivityFields(embed: ReturnType<typeof brandedEmbed>, activities: ResolvedActivity[]) {
  if (activities.length === 0) return embed;
  embed.addFields({
    name: `Events (${activities.length})`,
    value: clampDescription(
      activities.map((activity) => {
        const location = activity.location ? ` - ${activity.location}` : "";
        const opponent = activity.opponent ? ` - vs ${activity.opponent}` : "";
        return `**${activity.title}** - ${discordTimestamp(activity.scheduledAt, "f")} - ${discordTimestamp(activity.scheduledAt, "R")}${location}${opponent}`;
      }),
      1024,
    ),
  });
  return embed;
}

function groupedEmbed(spawns: ResolvedSpawn[], ctx: CommandContext) {
  const { timezone } = ctx.server;
  const now = new Date();

  // Live bosses float to their own section — they're the actionable ones.
  const live = spawns.filter((s) => s.live);
  const pending = spawns.filter((s) => !s.live);

  const groups = new Map<DayBucket, ResolvedSpawn[]>([
    ["Today", []],
    ["Tomorrow", []],
    ["Future", []],
  ]);

  for (const spawn of pending) {
    groups.get(dayBucket(spawn.nextSpawn, timezone, now))!.push(spawn);
  }

  const embed = brandedEmbed(live.length > 0 ? BrandColor.GREEN : BrandColor.GOLD).setTitle(
    `Boss Spawns — ${ctx.server.guildName}`,
  );

  if (live.length > 0) {
    embed.addFields({
      name: `Live now (${live.length})`,
      value: clampDescription(live.map(liveLine), 1024),
    });
  }

  for (const [bucket, rows] of groups) {
    if (rows.length === 0) continue;
    embed.addFields({
      name: `${bucket} (${rows.length})`,
      // Embed FIELD values cap at 1024 chars — a tighter limit than the 4096
      // description cap, so clamp to the field limit here.
      value: clampDescription(rows.map(pendingLine), 1024),
    });
  }

  embed.setFooter({ text: `Powered by ForgeKeep • times shown in your local timezone` });
  return embed;
}

function liveLine(spawn: ResolvedSpawn): string {
  const turn = spawn.guildTurn ? ` · ${spawn.guildTurn}` : "";
  // timerText is the literal "LIVE" while a boss is up — the useful figure is
  // how long it has been up, which the shared timer reports separately.
  const elapsed = spawn.liveElapsedText ? ` · up for \`${spawn.liveElapsedText}\`` : "";
  return `**${spawn.bossName}**${elapsed}${turn}`;
}

function pendingLine(spawn: ResolvedSpawn): string {
  const turn = spawn.guildTurn ? ` · ${spawn.guildTurn}` : "";
  return `**${spawn.bossName}** · ${discordTimestamp(spawn.nextSpawn, "t")} · ${discordTimestamp(spawn.nextSpawn, "R")}${turn}`;
}
