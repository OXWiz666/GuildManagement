import type { Attachment } from "discord.js";
import { ROLE_DISPLAY_NAMES, hasMinimumRole, type GuildRoleType } from "@guild/shared";
import type { Command, CommandContext } from "../../types/command.js";
import {
  brandedEmbed,
  clampDescription,
  formatDelta,
  formatNumber,
  pad,
  padStart,
} from "../../embeds/builders.js";
import { BrandColor } from "../../embeds/theme.js";
import { discordTimestamp } from "../../utils/time.js";
import { MissingPermissionError, UserFacingError } from "../../utils/errors.js";
import { OFFICER_MINIMUM } from "../../middleware/permissions.js";

const PAGE_SIZE = 10;

/**
 * `!cp` — Combat Power.
 *
 *   !cp                → your CP, rank, last update
 *   !cp + screenshot   → OCR the value straight off the game HUD
 *   !cp 985000         → update your CP
 *   !cp leaderboard [n]→ guild rankings, paginated
 *   !cp top10          → shortcut for page 1
 *   !cp history        → your recent CP changes
 *   !cp flagged        → officers: scans marked for review
 *
 * Members may update only their OWN CP: the actor is resolved from the Discord
 * link, never from an argument or from the name on a screenshot, so there is no
 * way to post a value for someone else.
 */
export const cpCommand: Command = {
  name: "cp",
  aliases: ["combatpower", "power", "gs"],
  description: "View or update Combat Power. Attach a screenshot to scan it.",
  usage: "!cp [value | leaderboard [page] | top10 | history | flagged]",
  category: "Combat Power",
  requiresLink: true,
  minimumRole: null,

  async execute(ctx: CommandContext): Promise<void> {
    // An attached image means "scan this", regardless of any text argument.
    const attachment = ctx.message.attachments.first();
    if (attachment) return scanScreenshot(ctx, attachment);

    const sub = (ctx.args[0] ?? "").toLowerCase();

    if (!sub) return showOwnCp(ctx);
    if (sub === "leaderboard" || sub === "lb" || sub === "rank" || sub === "ranks") {
      return showLeaderboard(ctx, Number(ctx.args[1] ?? 1));
    }
    if (sub === "top10" || sub === "top") return showLeaderboard(ctx, 1);
    if (sub === "history" || sub === "log") return showHistory(ctx);
    if (sub === "flagged" || sub === "review") return showFlagged(ctx);

    // Anything else is treated as a CP value; the service rejects non-numerics
    // with a helpful message.
    return updateOwnCp(ctx, ctx.args.join(" "));
  },
};

async function showOwnCp(ctx: CommandContext): Promise<void> {
  const actor = ctx.actor!;
  const profile = await ctx.services.cp.getProfile(actor.memberId);

  if (!profile) {
    throw new UserFacingError("Couldn't find your membership in this guild.");
  }

  const rank = await ctx.services.cp.getRank(ctx.server.guildId, profile.cp);

  const embed = brandedEmbed(BrandColor.GOLD)
    .setTitle(`⚔ ${profile.ign ?? profile.displayName} — Combat Power`)
    .addFields(
      {
        name: "Current CP",
        value: profile.cp === null ? "*Not set*" : `**${formatNumber(profile.cp)}**`,
        inline: true,
      },
      { name: "Guild Rank", value: rank === null ? "—" : `#${rank}`, inline: true },
      {
        name: "Rank",
        value: ROLE_DISPLAY_NAMES[profile.role as GuildRoleType] ?? profile.role,
        inline: true,
      },
      {
        name: "Last Updated",
        value: profile.cpUpdatedAt ? discordTimestamp(profile.cpUpdatedAt, "R") : "*Never*",
        inline: true,
      },
    );

  if (profile.className) {
    embed.addFields({ name: "Class", value: profile.className, inline: true });
  }

  if (profile.cp === null) {
    embed.setDescription("Set your Combat Power with `!cp <value>` — e.g. `!cp 985000`.");
  }

  await ctx.message.reply({ embeds: [embed] });
}

async function updateOwnCp(ctx: CommandContext, raw: string): Promise<void> {
  const actor = ctx.actor!;

  const result = await ctx.services.cp.updateCp({
    memberId: actor.memberId,
    guildId: ctx.server.guildId,
    userId: actor.userId,
    rawValue: raw,
    actorId: actor.userId,
    actorDiscordId: actor.discordId,
  });

  if (!result.changed) {
    const embed = brandedEmbed(BrandColor.BLUE)
      .setTitle("Combat Power unchanged")
      .setDescription(
        `Your CP is already **${formatNumber(result.newCp)}** — nothing to update.`,
      );
    await ctx.message.reply({ embeds: [embed] });
    return;
  }

  const increased = (result.delta ?? 0) > 0;
  const color = result.delta === null ? BrandColor.BLUE : increased ? BrandColor.GREEN : BrandColor.RED;
  const arrow = result.delta === null ? "✨" : increased ? "⬆" : "⬇";

  const embed = brandedEmbed(color)
    .setTitle(`${arrow} Combat Power Updated`)
    .addFields(
      { name: "Player", value: actor.ign ?? actor.displayName, inline: true },
      {
        name: "Previous CP",
        value: result.oldCp === null ? "*Not set*" : formatNumber(result.oldCp),
        inline: true,
      },
      { name: "New CP", value: `**${formatNumber(result.newCp)}**`, inline: true },
      {
        name: "Difference",
        value: result.delta === null ? "*First entry*" : `**${formatDelta(result.delta)}**`,
        inline: true,
      },
      { name: "Guild Rank", value: result.rank === null ? "—" : `#${result.rank}`, inline: true },
    );

  await ctx.message.reply({ embeds: [embed] });
}

async function showLeaderboard(ctx: CommandContext, requestedPage: number): Promise<void> {
  // `!cp leaderboard abc` → NaN; fall back to page 1 rather than erroring.
  const page = Number.isFinite(requestedPage) && requestedPage > 0 ? Math.floor(requestedPage) : 1;

  const { rows, total, totalPages, page: actualPage } = await ctx.services.cp.leaderboard(
    ctx.server.guildId,
    page,
    PAGE_SIZE,
  );

  if (rows.length === 0) {
    const embed = brandedEmbed(BrandColor.BLUE)
      .setTitle(`CP Leaderboard — ${ctx.server.guildName}`)
      .setDescription(
        total === 0
          ? "No members have set their Combat Power yet. Be first with `!cp <value>`."
          : `Page ${page} is empty — there are only ${totalPages} page(s).`,
      );
    await ctx.message.reply({ embeds: [embed] });
    return;
  }

  // Monospace table so ranks and CP columns align. Width is tuned for mobile
  // Discord, which wraps code blocks past roughly 56 characters.
  const header = `${pad("#", 3)}${pad("Player", 17)}${pad("Class", 10)}${padStart("CP", 11)}`;
  const lines = rows.map((row) => {
    const name = row.ign ?? row.displayName;
    const medal = row.rank === 1 ? "🥇" : row.rank === 2 ? "🥈" : row.rank === 3 ? "🥉" : "";
    return (
      pad(`${row.rank}`, 3) +
      pad(name, 17) +
      pad(row.className ?? "—", 10) +
      padStart(row.cp === null ? "—" : formatNumber(row.cp), 11) +
      (medal ? ` ${medal}` : "")
    );
  });

  const embed = brandedEmbed(BrandColor.GOLD_BRIGHT)
    .setTitle(`🏆 CP Leaderboard — ${ctx.server.guildName}`)
    .setDescription(
      "```\n" + clampDescription([header, "─".repeat(41), ...lines], 3900) + "\n```",
    )
    .setFooter({
      text: `Page ${actualPage}/${totalPages} • ${total} ranked • Powered by ForgeKeep`,
    });

  if (totalPages > 1) {
    embed.addFields({
      name: "More",
      value: `\`!cp leaderboard ${Math.min(actualPage + 1, totalPages)}\` for the next page.`,
    });
  }

  await ctx.message.reply({ embeds: [embed] });
}

/**
 * Screenshot → CP.
 *
 * The scan updates the SENDER's row (resolved from their Discord link). The
 * character name read off the image is used only to confirm the screenshot is
 * theirs — never to choose whose CP to write.
 */
async function scanScreenshot(ctx: CommandContext, attachment: Attachment): Promise<void> {
  const actor = ctx.actor!;

  // OCR is CPU-bound and serialized behind a single worker; its own tighter
  // budget stops one member from queueing everyone else's scans behind theirs.
  await ctx.services.rateLimiter.enforce("scan", actor.discordId);

  if (!attachment.contentType?.startsWith("image/")) {
    throw new UserFacingError(
      "That attachment isn't an image.",
      "Attach a PNG or JPG screenshot showing your Combat Power.",
    );
  }

  // OCR takes seconds. Typing indicator first so the channel doesn't look dead;
  // if the bot lacks permission for it, that's not worth failing the scan over.
  await ctx.message.channel.sendTyping().catch(() => {});

  const result = await ctx.services.cpScan.scan({
    imageUrl: attachment.url,
    imageSize: attachment.size,
    contentType: attachment.contentType,
    memberId: actor.memberId,
    guildId: ctx.server.guildId,
    userId: actor.userId,
    ign: actor.ign,
    actorDiscordId: actor.discordId,
  });

  if (!result.changed) {
    const embed = brandedEmbed(BrandColor.BLUE)
      .setTitle("📷 Scanned — Combat Power unchanged")
      .setDescription(`Your CP is already **${formatNumber(result.cp)}**.`)
      .setThumbnail(attachment.url);
    await ctx.message.reply({ embeds: [embed] });
    return;
  }

  const increased = (result.delta ?? 0) > 0;
  const color = result.flagged
    ? BrandColor.AMBER
    : result.delta === null
      ? BrandColor.BLUE
      : increased
        ? BrandColor.GREEN
        : BrandColor.RED;
  const arrow = result.delta === null ? "✨" : increased ? "⬆" : "⬇";

  const embed = brandedEmbed(color)
    .setTitle(`${arrow} Combat Power Updated — Scanned`)
    .setThumbnail(attachment.url)
    .addFields(
      { name: "Player", value: actor.ign ?? actor.displayName, inline: true },
      {
        name: "Previous CP",
        value: result.oldCp === null ? "*Not set*" : formatNumber(result.oldCp),
        inline: true,
      },
      { name: "New CP", value: `**${formatNumber(result.cp)}**`, inline: true },
      {
        name: "Difference",
        value: result.delta === null ? "*First entry*" : `**${formatDelta(result.delta)}**`,
        inline: true,
      },
      { name: "Guild Rank", value: result.rank === null ? "—" : `#${result.rank}`, inline: true },
      { name: "Read Accuracy", value: `${Math.round(result.confidence * 100)}%`, inline: true },
    );

  // Surface what the scan detected, so a wrong read is obvious to the member
  // rather than silently written to their profile.
  const detected: string[] = [];
  if (actor.ign) {
    detected.push(
      result.name.matched
        ? `✅ Name matches **${actor.ign}**`
        : `⚠️ Name on screenshot didn't match **${actor.ign}**`,
    );
  }
  if (result.classUpdated) {
    detected.push(`✅ Class set to **${result.classUpdated}**`);
  } else if (result.detectedClass.className) {
    detected.push(`ℹ️ Detected class **${result.detectedClass.className}**`);
  }
  if (detected.length > 0) {
    embed.addFields({ name: "Detected", value: detected.join("\n") });
  }

  if (result.flagged) {
    embed.addFields({
      name: "⚠️ Flagged for review",
      value: `${result.flagReason}\n\nYour CP **was updated** — an officer will review this scan.`,
    });
  }

  await ctx.message.reply({ embeds: [embed] });
}

/** `!cp flagged` — officer review queue for suspicious scans. */
async function showFlagged(ctx: CommandContext): Promise<void> {
  const actor = ctx.actor!;

  // Not enforced by the command's `minimumRole` (which gates the whole `!cp`
  // command for everyone), so this subcommand checks for itself.
  if (!hasMinimumRole(actor.role, OFFICER_MINIMUM)) {
    throw new MissingPermissionError(
      ROLE_DISPLAY_NAMES[OFFICER_MINIMUM],
      ROLE_DISPLAY_NAMES[actor.role] ?? actor.role,
    );
  }

  const rows = await ctx.services.repositories.cp.listFlagged(ctx.server.guildId, 10);

  if (rows.length === 0) {
    await ctx.message.reply({
      embeds: [
        brandedEmbed(BrandColor.GREEN)
          .setTitle("✅ No flagged scans")
          .setDescription("Every screenshot scan looked plausible."),
      ],
    });
    return;
  }

  const lines = rows.map((row) => {
    const who = row.member.ign ?? row.member.user.displayName;
    const from = row.oldCp === null ? "—" : formatNumber(row.oldCp);
    const change = row.delta === null ? "" : ` (${formatDelta(row.delta)})`;
    // Discord expires signed attachment URLs (~24h), so an older row's image
    // link may 404. Say so rather than serving a dead link silently.
    const image = row.imageUrl ? ` · [image](${row.imageUrl})` : "";
    return (
      `${discordTimestamp(row.createdAt, "R")} · **${who}**\n` +
      `┗ ${from} → ${formatNumber(row.newCp)}${change} · ${row.flagReason}${image}`
    );
  });

  await ctx.message.reply({
    embeds: [
      brandedEmbed(BrandColor.AMBER)
        .setTitle(`⚠️ Flagged CP Scans — ${ctx.server.guildName}`)
        .setDescription(clampDescription(lines))
        .setFooter({ text: "Image links expire ~24h after upload • Powered by ForgeKeep" }),
    ],
  });
}

async function showHistory(ctx: CommandContext): Promise<void> {
  const actor = ctx.actor!;
  const rows = await ctx.services.cp.history(actor.memberId, PAGE_SIZE);

  if (rows.length === 0) {
    const embed = brandedEmbed(BrandColor.BLUE)
      .setTitle("No CP history yet")
      .setDescription("Your CP changes will appear here once you run `!cp <value>`.");
    await ctx.message.reply({ embeds: [embed] });
    return;
  }

  const lines = rows.map((row) => {
    const when = discordTimestamp(row.createdAt, "D");
    const from = row.oldCp === null ? "—" : formatNumber(row.oldCp);
    const to = formatNumber(row.newCp);
    const delta = row.delta === null ? "*first*" : `**${formatDelta(row.delta)}**`;
    return `${when} · ${from} → ${to} · ${delta}`;
  });

  const embed = brandedEmbed(BrandColor.GOLD)
    .setTitle(`📈 CP History — ${actor.ign ?? actor.displayName}`)
    .setDescription(clampDescription(lines));

  await ctx.message.reply({ embeds: [embed] });
}
