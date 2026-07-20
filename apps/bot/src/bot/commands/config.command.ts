import type { ChannelPurpose } from "../../repositories/discordServer.repository.js";
import type { Command, CommandContext } from "../../types/command.js";
import { successEmbed } from "../../embeds/builders.js";
import { OFFICER_MINIMUM } from "../../middleware/permissions.js";

function parseRoleId(ctx: CommandContext): string | null {
  const mentioned = ctx.message.mentions.roles.first()?.id;
  if (mentioned) return mentioned;

  const raw = ctx.args[0]?.trim() ?? "";
  const mentionMatch = raw.match(/^<@&(\d{5,})>$/);
  if (mentionMatch) return mentionMatch[1]!;
  if (/^\d{5,}$/.test(raw)) return raw;
  return null;
}

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

export const pingRoleCommand: Command = {
  name: "pingrole",
  aliases: ["setpingrole", "spawnrole", "bossrole"],
  description: "Set the role pinged by boss spawn alerts.",
  usage: "!pingrole @Role | !pingrole off",
  category: "Configuration",
  requiresLink: true,
  minimumRole: OFFICER_MINIMUM,

  async execute(ctx: CommandContext): Promise<void> {
    const raw = ctx.args[0]?.toLowerCase();
    const clear = raw === "off" || raw === "clear" || raw === "none" || raw === "disable";

    if (clear) {
      await ctx.services.repositories.discordServer.setPingRole({
        discordServerId: ctx.server.discordServerId,
        roleId: null,
      });
      ctx.server.pingRoleId = null;

      await ctx.message.reply({
        embeds: [successEmbed("Ping role cleared", "Boss spawn alerts will no longer mention a role.")],
      });
      return;
    }

    const roleId = parseRoleId(ctx);
    if (!roleId) {
      await ctx.message.reply("Usage: `!pingrole @Role` or `!pingrole off`.");
      return;
    }

    await ctx.services.repositories.discordServer.setPingRole({
      discordServerId: ctx.server.discordServerId,
      roleId,
    });
    ctx.server.pingRoleId = roleId;

    await ctx.message.reply({
      embeds: [successEmbed("Ping role set", `Boss spawn alerts will mention <@&${roleId}>.`)],
    });
  },
};
