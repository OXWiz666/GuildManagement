import type { Attachment } from "discord.js";
import { hasMinimumRole } from "@guild/shared";
import type { Command, CommandContext } from "../../types/command.js";
import { clampDescription, infoEmbed, successEmbed, warningEmbed } from "../../embeds/builders.js";
import { OFFICER_MINIMUM } from "../../middleware/permissions.js";
import { UserFacingError } from "../../utils/errors.js";

export const smartAttendanceCommand: Command = {
  name: "attendance",
  aliases: ["smartattendance", "smartatt", "rallyatt", "rallyattendance"],
  description: "View open killed-boss attendance windows, or scan a rally screenshot for one boss.",
  usage: "!attendance [boss] OR !attendance <boss> [minutes] + screenshot",
  category: "Attendance",
  requiresLink: true,
  minimumRole: null,

  async execute(ctx: CommandContext): Promise<void> {
    const attachment = ctx.message.attachments.first();
    if (!attachment) {
      if (ctx.args.length === 0) return listOpenAttendance(ctx);
      return showBossAttendance(ctx);
    }

    return scanSmartAttendance(ctx, attachment);
  },
};

async function listOpenAttendance(ctx: CommandContext): Promise<void> {
  const windows = await ctx.services.boss.listOpenKilledAttendanceWindows(ctx.server.guildId);

  if (windows.length === 0) {
    await ctx.message.reply({
      embeds: [
        warningEmbed(
          "No open killed-boss attendance",
          "Attendance appears here only after a boss is killed and its attendance window is still open.",
        ),
      ],
    });
    return;
  }

  const embed = infoEmbed(
    "Open Boss Attendance",
    clampDescription(
      windows.map(
        (window) =>
          `**${window.bossName}** - ${window.location}\n` +
          `Countdown: \`${formatCountdown(window.expiresAt)}\` | Confirmed: **${window.confirmedCount}** | Pending: **${window.pendingCount}**\n` +
          `Run \`!attendance ${window.bossName}\` to view members.`,
      ),
    ),
  );

  await ctx.message.reply({ embeds: [embed] });
}

async function showBossAttendance(ctx: CommandContext): Promise<void> {
  const actor = ctx.actor!;
  const bossName = await ctx.services.boss.resolveBossName(ctx.rest, ctx.server.discordServerId);
  const checkedIn = await ctx.services.boss.checkInToOpenKilledAttendance(ctx.server.guildId, bossName, actor.userId);

  if (!checkedIn) {
    throw new UserFacingError(
      `${bossName} has no open killed-boss attendance window.`,
      "Run `!attendance` to see killed bosses with attendance currently open.",
    );
  }

  const embed = successEmbed(
    `${checkedIn.window.bossName} Attendance`,
    [
      `**${actor.ign ?? actor.displayName}** checked in and is awaiting officer verification.`,
      `Window closes in: \`${formatCountdown(checkedIn.window.expiresAt)}\``,
      `Open Boss Attendance in ForgeKeep to confirm members.`,
    ].join("\n"),
  );

  await ctx.message.reply({ embeds: [embed] });
}

async function scanSmartAttendance(ctx: CommandContext, attachment: Attachment): Promise<void> {
  const actor = ctx.actor!;

  if (!hasMinimumRole(actor.role, OFFICER_MINIMUM)) {
    throw new UserFacingError(
      "Only officers can scan attendance screenshots.",
      "Members can run `!attendance <boss>` to check in for an open killed-boss attendance window.",
    );
  }

  if (!attachment.contentType?.startsWith("image/")) {
    throw new UserFacingError(
      "That attachment isn't an image.",
      "Attach a PNG, JPG, or WEBP screenshot of the rally member list.",
    );
  }

  const options = parseOptions(ctx.args);
  if (!options.bossQuery) {
    throw new UserFacingError("Which boss?", "Usage: `!attendance <boss> [minutes]` plus the screenshot.");
  }

  const bossName = await ctx.services.boss.resolveBossName(options.bossQuery, ctx.server.discordServerId);
  const schedule = await ctx.services.boss.findScheduleForBoss(bossName, ctx.server.guildId);
  if (!schedule) {
    throw new UserFacingError(
      `${bossName} has no open killed-boss attendance window.`,
      "Log the boss kill first, then run `!attendance` to confirm the window is open before scanning.",
    );
  }

  await ctx.services.rateLimiter.enforce("scan", actor.discordId);
  await ctx.message.channel.sendTyping().catch(() => {});

  const result = await ctx.services.smartAttendance.scan({
    imageUrl: attachment.url,
    imageSize: attachment.size,
    contentType: attachment.contentType,
    guildId: ctx.server.guildId,
    actorId: actor.userId,
    bossScheduleId: schedule.scheduleId,
    minutes: options.minutes,
    forceNewSession: options.forceNewSession,
  });

  const presentCount = result.confirmed.length + result.alreadyPresent.length;
  const embed = successEmbed(
    "Smart attendance scanned",
    [
      `Boss: **${bossName}**`,
      `Session: **${result.session.title}** ${result.session.created ? "(created)" : "(existing)"}`,
      `Matched names: **${result.confirmed.length}** new, **${result.alreadyPresent.length}** already confirmed`,
      `OCR confidence: **${Math.round(result.pageConfidence * 100)}%**`,
    ].join("\n"),
  ).setThumbnail(attachment.url);

  if (presentCount > 0) {
    embed.addFields({
      name: "Present",
      value: clampDescription(
        [...result.confirmed, ...result.alreadyPresent].map(
          (m) => `\`${m.source}\` -> **${m.name}**${result.alreadyPresent.some((a) => a.userId === m.userId) ? " (already)" : ""}`,
        ),
        1024,
      ),
    });
  }

  if (result.ambiguous.length > 0) {
    embed.addFields({
      name: "Needs Review",
      value: clampDescription(
        result.ambiguous.map((m) => `\`${m.source}\` (${m.reason})`),
        1024,
      ),
    });
  }

  await ctx.message.reply({ embeds: [embed] });
}

function formatCountdown(expiresAt: Date): string {
  const diff = expiresAt.getTime() - Date.now();
  if (diff <= 0) return "closed";
  const hours = Math.floor(diff / (60 * 60 * 1000));
  const minutes = Math.floor((diff % (60 * 60 * 1000)) / (60 * 1000));
  const seconds = Math.floor((diff % (60 * 1000)) / 1000);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function parseOptions(args: string[]): {
  forceNewSession: boolean;
  minutes: number | undefined;
  bossQuery: string;
} {
  const remaining = [...args];
  let forceNewSession = false;

  const first = remaining[0]?.toLowerCase();
  if (first === "new" || first === "fresh" || first === "create") {
    forceNewSession = true;
    remaining.shift();
  }

  // A trailing number is the check-in window length; everything before it is
  // the boss name, which may contain spaces ("Baron Baraudmore", "Lady Dalia")
  // — same convention `!kill <boss> [HH:MM]` uses for its trailing token.
  let minutes: number | undefined;
  const last = remaining[remaining.length - 1];
  const maybeMinutes = Number(last);
  if (remaining.length > 1 && last !== undefined && last.trim() !== "" && Number.isFinite(maybeMinutes) && maybeMinutes > 0) {
    minutes = Math.floor(maybeMinutes);
    remaining.pop();
  }

  const bossQuery = remaining.join(" ").trim();
  return { forceNewSession, minutes, bossQuery };
}
