import { getBossImageUrl } from "@guild/shared";
import type { EmbedBuilder } from "discord.js";
import { brandedEmbed, formatDelta, formatNumber } from "./builders.js";
import { BrandColor } from "./theme.js";
import { discordTimestamp } from "../utils/time.js";

export interface SpawnEmbedInput {
  bossName: string;
  spawnTime: Date;
  location: string;
  guildTurn: string | null;
  /** Bare role mention(s) (`<@&id>`), if this server has ping roles configured. */
  pingRoleMention?: string;
}

/** Imminent-spawn warning (default: 5 minutes out). */
export function spawnWarningEmbed(input: SpawnEmbedInput, minutes: number): EmbedBuilder {
  const embed = brandedEmbed(BrandColor.AMBER)
    .setTitle(`⏰ ${input.bossName} spawns in ~${minutes} min`)
    .setThumbnail(getBossImageUrl(input.bossName))
    .addFields(
      { name: "Spawns", value: discordTimestamp(input.spawnTime, "R"), inline: true },
      { name: "At", value: discordTimestamp(input.spawnTime, "t"), inline: true },
      { name: "Location", value: input.location || "Unknown", inline: true },
    );

  if (input.guildTurn) {
    embed.addFields({ name: "Guild Turn", value: `${input.guildTurn}`, inline: true });
  }

  return embed;
}

/** The boss is up. */
export function spawnEmbed(input: SpawnEmbedInput): EmbedBuilder {
  const embed = brandedEmbed(BrandColor.GREEN)
    .setTitle(`🟢 ${input.bossName} is LIVE`)
    .setThumbnail(getBossImageUrl(input.bossName))
    .addFields(
      { name: "Spawned", value: discordTimestamp(input.spawnTime, "R"), inline: true },
      { name: "Location", value: input.location || "Unknown", inline: true },
    );

  if (input.guildTurn) {
    embed.addFields({ name: "Guild Turn", value: `${input.guildTurn}`, inline: true });
  }

  // Discord only fires a role-mention notification from message `content`,
  // never from an embed — so the bare mention still has to live in content
  // for the ping to actually land. This field just makes the same "who got
  // pinged and why" reasoning visible on the embed itself instead of being
  // legible only from a separate content line above it.
  const callToAction = "Log it with `!kill " + input.bossName + "` once it's down.";
  embed.addFields({
    name: "​",
    value: input.pingRoleMention ? `${callToAction} ${input.pingRoleMention}` : callToAction,
  });

  return embed;
}

export interface KillEmbedInput {
  bossName: string;
  killedAt: Date;
  killedBy: string;
  nextSpawn: Date | null;
  nextTurn: string | null;
  // Zero or more item names dropped this kill (`!kill <boss> <item>, <item>`).
  // Thumbnail always shows at most one icon, so it uses the first match.
  dropItemNames?: string[];
  dropIconUrl?: string | null;
}

export function killEmbed(input: KillEmbedInput): EmbedBuilder {
  const embed = brandedEmbed(BrandColor.RED)
    .setTitle(`💀 ${input.bossName} — Killed`)
    .setThumbnail(input.dropIconUrl ?? getBossImageUrl(input.bossName))
    .addFields(
      { name: "Killed", value: discordTimestamp(input.killedAt, "R"), inline: true },
      { name: "Logged By", value: input.killedBy, inline: true },
    );

  if (input.dropItemNames?.length) {
    embed.addFields({
      name: input.dropItemNames.length > 1 ? "Drops" : "Drop",
      value: input.dropItemNames.map((name) => `📦 **${name}** → Guild Storage`).join("\n"),
    });
  }

  if (input.nextSpawn) {
    embed.addFields(
      { name: "Next Spawn", value: discordTimestamp(input.nextSpawn, "f"), inline: false },
      { name: "Respawns", value: discordTimestamp(input.nextSpawn, "R"), inline: true },
    );
  }
  if (input.nextTurn) {
    embed.addFields({ name: "Next Turn", value: `${input.nextTurn}`, inline: true });
  }

  return embed;
}

export interface CpReportInput {
  guildName: string;
  highest: number | null;
  lowest: number | null;
  average: number | null;
  total: bigint;
  counted: number;
  weeklyGrowth: number;
  monthlyGrowth: number;
}

/** Periodic guild CP statistics report. */
export function cpReportEmbed(input: CpReportInput): EmbedBuilder {
  return brandedEmbed(BrandColor.GOLD_BRIGHT)
    .setTitle(`📊 Guild Combat Power — ${input.guildName}`)
    .addFields(
      {
        name: "Highest",
        value: input.highest === null ? "—" : formatNumber(input.highest),
        inline: true,
      },
      {
        name: "Lowest",
        value: input.lowest === null ? "—" : formatNumber(input.lowest),
        inline: true,
      },
      {
        name: "Average",
        value: input.average === null ? "—" : formatNumber(input.average),
        inline: true,
      },
      // BigInt can exceed Number's safe range once a guild is large enough, so
      // format from the BigInt directly rather than coercing.
      { name: "Total Guild CP", value: formatBigInt(input.total), inline: true },
      { name: "Members Ranked", value: String(input.counted), inline: true },
      { name: "​", value: "​", inline: true },
      { name: "Weekly Growth", value: `**${formatDelta(input.weeklyGrowth)}**`, inline: true },
      { name: "Monthly Growth", value: `**${formatDelta(input.monthlyGrowth)}**`, inline: true },
    );
}

function formatBigInt(value: bigint): string {
  return value.toLocaleString("en-US");
}
