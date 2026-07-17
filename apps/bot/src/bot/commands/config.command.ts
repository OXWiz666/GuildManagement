import type { ChannelPurpose } from "../../repositories/discordServer.repository.js";
import type { Command, CommandContext } from "../../types/command.js";
import { successEmbed } from "../../embeds/builders.js";
import { OFFICER_MINIMUM } from "../../middleware/permissions.js";

/**
 * Channel registration commands: !notifhere / !cmdhere / !threadhere.
 *
 * All three are the same operation with a different purpose key, so they're
 * generated from one factory — the brief lists them separately, but
 * implementing them three times would be the duplicated logic it also forbids.
 */
function channelCommand(params: {
  name: string;
  aliases: string[];
  purpose: ChannelPurpose;
  description: string;
  confirmation: string;
}): Command {
  return {
    name: params.name,
    aliases: params.aliases,
    description: params.description,
    usage: `!${params.name}`,
    category: "Configuration",
    requiresLink: true,
    // Notification routing is a guild-wide setting — officers and up only.
    minimumRole: OFFICER_MINIMUM,

    async execute(ctx: CommandContext): Promise<void> {
      const actor = ctx.actor!;

      await ctx.services.repositories.discordServer.setChannel({
        discordServerId: ctx.server.discordServerId,
        purpose: params.purpose,
        channelId: ctx.message.channelId,
        setById: actor.userId,
      });

      await ctx.message.reply({
        embeds: [
          successEmbed(
            "✅ Channel set",
            `${params.confirmation} <#${ctx.message.channelId}>.`,
          ),
        ],
      });
    },
  };
}

export const notifHereCommand = channelCommand({
  name: "notifhere",
  aliases: ["setnotif", "notifychannel"],
  purpose: "NOTIFICATION",
  description: "Send boss spawn and kill notifications to this channel.",
  confirmation: "Notifications will be posted in",
});

export const cmdHereCommand = channelCommand({
  name: "cmdhere",
  aliases: ["setcmd", "commandchannel"],
  purpose: "COMMAND",
  description: "Restrict bot commands to this channel.",
  confirmation: "Commands are now restricted to",
});

export const threadHereCommand = channelCommand({
  name: "threadhere",
  aliases: ["setthread", "threadchannel"],
  purpose: "THREAD",
  description: "Create boss threads in this channel.",
  confirmation: "Boss threads will be created in",
});
