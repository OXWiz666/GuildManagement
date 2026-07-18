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
    embed.addFields({ name: "Guild Turn", value: `🛡 ${input.guildTurn}`, inline: true });
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
    embed.addFields({ name: "Guild Turn", value: `🛡 ${input.guildTurn}`, inline: true });
  }

  embed.addFields({
    name: "​",
    value: "Log it with `!kill " + input.bossName + "` once it's down.",
  });

  return embed;
}

export interface KillEmbedInput {
  bossName: string;
  killedAt: Date;
  killedBy: string;
  nextSpawn: Date | null;
  nextTurn: string | null;
  dropItemName?: string | null;
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

  if (input.dropItemName) {
    embed.addFields({ name: "Drop", value: `📦 **${input.dropItemName}** → Guild Storage` });
  }

  if (input.nextSpawn) {
    embed.addFields(
      { name: "Next Spawn", value: discordTimestamp(input.nextSpawn, "f"), inline: false },
      { name: "Respawns", value: discordTimestamp(input.nextSpawn, "R"), inline: true },
    );
  }
  if (input.nextTurn) {
    embed.addFields({ name: "Next Turn", value: `🛡 ${input.nextTurn}`, inline: true });
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
