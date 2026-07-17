import type { Attachment } from "discord.js";
import type { Command, CommandContext } from "../../types/command.js";
import { clampDescription, successEmbed } from "../../embeds/builders.js";
import { OFFICER_MINIMUM } from "../../middleware/permissions.js";
import { UserFacingError } from "../../utils/errors.js";

export const smartAttendanceCommand: Command = {
  name: "attendance",
  aliases: ["smartattendance", "smartatt", "rallyatt", "rallyattendance"],
  description: "Scan a rally screenshot and mark white/highlighted members present for a boss.",
  usage: "!attendance <boss> [minutes] + screenshot",
  category: "Attendance",
  requiresLink: true,
  minimumRole: OFFICER_MINIMUM,

  async execute(ctx: CommandContext): Promise<void> {
    const attachment = ctx.message.attachments.first();
    if (!attachment) {
      throw new UserFacingError(
        "Attach the rally screenshot with this command.",
        "Example: `!attendance Livera 30` plus the screenshot.",
      );
    }
    if (ctx.args.length === 0) {
      throw new UserFacingError("Which boss?", "Usage: `!attendance <boss> [minutes]` plus the screenshot.");
    }

    return scanSmartAttendance(ctx, attachment);
  },
};

async function scanSmartAttendance(ctx: CommandContext, attachment: Attachment): Promise<void> {
  const actor = ctx.actor!;

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
      `${bossName} has no open spawn to attach attendance to.`,
      "Check the Boss Rotation page for its schedule, or log the kill first if it's already been fought.",
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
      `Checked in: **${result.confirmed.length}** new, **${result.alreadyPresent.length}** already present`,
      `Gray/absent: **${result.absent.length}**`,
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

  if (result.absent.length > 0) {
    embed.addFields({
      name: "Gray / No Attendance",
      value: clampDescription(
        result.absent.map((m) => `\`${m.source}\` -> ${m.name}`),
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
