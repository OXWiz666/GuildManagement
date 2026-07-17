import { EmbedBuilder } from "discord.js";
import { BRAND_FOOTER, BrandColor, FORGEKEEP_ICON_URL } from "./theme.js";

/**
 * Every embed the bot sends goes through here, so branding (footer, timestamp,
 * color palette) is applied in exactly one place.
 */
export function brandedEmbed(color: number = BrandColor.GOLD): EmbedBuilder {
  const embed = new EmbedBuilder().setColor(color).setTimestamp();

  // discord.js rejects `iconURL: null`, so only set the footer icon when the
  // operator actually configured one.
  return FORGEKEEP_ICON_URL
    ? embed.setFooter({ text: BRAND_FOOTER, iconURL: FORGEKEEP_ICON_URL })
    : embed.setFooter({ text: BRAND_FOOTER });
}

export function successEmbed(title: string, description?: string): EmbedBuilder {
  const embed = brandedEmbed(BrandColor.GREEN).setTitle(title);
  return description ? embed.setDescription(description) : embed;
}

export function errorEmbed(title: string, description?: string): EmbedBuilder {
  const embed = brandedEmbed(BrandColor.RED).setTitle(title);
  return description ? embed.setDescription(description) : embed;
}

export function warningEmbed(title: string, description?: string): EmbedBuilder {
  const embed = brandedEmbed(BrandColor.AMBER).setTitle(title);
  return description ? embed.setDescription(description) : embed;
}

export function infoEmbed(title: string, description?: string): EmbedBuilder {
  const embed = brandedEmbed(BrandColor.BLUE).setTitle(title);
  return description ? embed.setDescription(description) : embed;
}

/**
 * Discord hard-limits an embed description to 4096 characters and rejects the
 * whole message if exceeded — so a large guild's leaderboard must be clamped
 * rather than allowed to fail the send.
 */
export const EMBED_DESCRIPTION_LIMIT = 4096;

export function clampDescription(lines: string[], limit = EMBED_DESCRIPTION_LIMIT): string {
  const out: string[] = [];
  let length = 0;

  for (const line of lines) {
    // +1 for the newline join.
    if (length + line.length + 1 > limit - 40) {
      out.push("…(truncated)");
      break;
    }
    out.push(line);
    length += line.length + 1;
  }

  return out.join("\n");
}

/** Right-pad for monospace table columns inside a code block. */
export function pad(value: string, width: number): string {
  return value.length >= width ? value.slice(0, width) : value.padEnd(width, " ");
}

/** Left-pad — used for numeric columns so digits line up. */
export function padStart(value: string, width: number): string {
  return value.length >= width ? value.slice(0, width) : value.padStart(width, " ");
}

/** Thousands separators; CP figures are large and unreadable without them. */
export function formatNumber(value: number): string {
  return value.toLocaleString("en-US");
}

/** Signed delta for CP changes, e.g. "+12,500" / "-300". */
export function formatDelta(value: number): string {
  const sign = value > 0 ? "+" : value < 0 ? "-" : "±";
  return `${sign}${formatNumber(Math.abs(value))}`;
}
