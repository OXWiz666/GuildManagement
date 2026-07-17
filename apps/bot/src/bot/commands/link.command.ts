import type { Command, CommandContext } from "../../types/command.js";
import { brandedEmbed, successEmbed } from "../../embeds/builders.js";
import { BrandColor } from "../../embeds/theme.js";
import { UserFacingError } from "../../utils/errors.js";

/**
 * `!link <code>` — attach this Discord account to a ForgeKeep account.
 *
 * requiresLink is false for obvious reasons: this is how you get linked.
 */
export const linkCommand: Command = {
  name: "link",
  aliases: ["connect"],
  description: "Link your Discord account to ForgeKeep using a code from the website.",
  usage: "!link <code>",
  category: "General",
  requiresLink: false,
  minimumRole: null,

  async execute(ctx: CommandContext): Promise<void> {
    const code = ctx.args[0];

    if (!code) {
      const embed = brandedEmbed(BrandColor.BLUE)
        .setTitle("Link your ForgeKeep account")
        .setDescription(
          [
            "**1.** Open ForgeKeep → **Settings** → **Link Discord**",
            "**2.** Copy the one-time code",
            "**3.** Run `!link <code>` here",
            "",
            "Codes expire quickly and work once.",
          ].join("\n"),
        );
      await ctx.message.reply({ embeds: [embed] });
      return;
    }

    const { displayName } = await ctx.services.link.redeem({
      code,
      discordId: ctx.message.author.id,
      discordUsername: ctx.message.author.username,
    });

    const embed = successEmbed(
      "✅ Account linked",
      `This Discord account is now linked to **${displayName}**.\n\nTry \`!cp\` or \`!spawn\`.`,
    );

    await ctx.message.reply({ embeds: [embed] });

    // The code was visible in a public channel. It's already single-use and
    // consumed, so deletion is defense-in-depth rather than strictly required —
    // and it keeps codes out of channel history and scrollback screenshots.
    await ctx.message.delete().catch(() => {
      // Missing Manage Messages — not worth failing the link over.
    });
  },
};

export const unlinkCommand: Command = {
  name: "unlink",
  aliases: ["disconnect"],
  description: "Disconnect your Discord account from ForgeKeep.",
  usage: "!unlink",
  category: "General",
  requiresLink: false,
  minimumRole: null,

  async execute(ctx: CommandContext): Promise<void> {
    await ctx.services.link.unlink(ctx.message.author.id);
    await ctx.message.reply({
      embeds: [successEmbed("Unlinked", "This Discord account is no longer linked to ForgeKeep.")],
    });
  },
};

/**
 * `!bindguild <invite-code>` — bind this Discord server to a ForgeKeep guild.
 *
 * Bootstrapping problem: this must run BEFORE the server has a guild context,
 * so it can't use the normal `ctx.server` path. It resolves the actor purely
 * from the Discord link and authorizes against the target guild's own roster
 * (see LinkService.resolveGuildForBinding) — being a leader elsewhere grants
 * nothing here.
 */
export const bindGuildCommand: Command = {
  name: "bindguild",
  aliases: ["bind", "setguild"],
  description: "Bind this Discord server to a ForgeKeep guild (Guild Leader only).",
  usage: "!bindguild <invite-code>",
  category: "Configuration",
  requiresLink: false, // handled manually — see below
  minimumRole: null,

  async execute(ctx: CommandContext): Promise<void> {
    const inviteCode = ctx.args[0];
    if (!inviteCode) {
      throw new UserFacingError(
        "Which guild?",
        "Usage: `!bindguild <invite-code>` — copy the ready-made command from " +
          "ForgeKeep → Guild Settings → Integrations → Discord.",
      );
    }

    // This command runs outside the normal guild scope, so resolve the linked
    // user directly rather than via ctx.actor (which needs a bound server).
    const linked = await ctx.services.repositories.identity.isLinked(ctx.message.author.id);
    if (!linked) {
      throw new UserFacingError(
        "Link your ForgeKeep account first.",
        "Run `!link <code>` — get a code from ForgeKeep → Settings → Link Discord.",
      );
    }

    const user = await ctx.services.repositories.identity.resolveActorAnyGuild(
      ctx.message.author.id,
    );
    if (!user) {
      throw new UserFacingError("Couldn't resolve your ForgeKeep account.");
    }

    const { guildId, guildName } = await ctx.services.link.resolveGuildForBinding({
      inviteCode,
      actorUserId: user.userId,
    });

    await ctx.services.repositories.discordServer.bind({
      discordGuildId: ctx.message.guildId,
      guildId,
      linkedById: user.userId,
    });

    const embed = successEmbed(
      "🔗 Server bound",
      [
        `This Discord server now serves **${guildName}**.`,
        "",
        "Next steps:",
        "• `!commands` — see everything available",
        "• `!notifhere` — set the boss alert channel",
        "• `!cmdhere` — restrict commands to one channel (optional)",
      ].join("\n"),
    );

    await ctx.message.reply({ embeds: [embed] });
  },
};
