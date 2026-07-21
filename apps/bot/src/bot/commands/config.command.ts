import type { ChannelPurpose } from "../../repositories/discordServer.repository.js";
import type { Command, CommandContext } from "../../types/command.js";
import { successEmbed } from "../../embeds/builders.js";
import { OFFICER_MINIMUM } from "../../middleware/permissions.js";
import {
  parsePingRoleIds,
  pingRoleMentions,
  serializePingRoleIds,
} from "../../utils/pingRoles.js";

function parseRoleIds(ctx: CommandContext): string[] {
  const roleIds = parsePingRoleIds(ctx.rest);

  for (const role of ctx.message.mentions.roles.values()) {
    roleIds.push(role.id);
  }

  return parsePingRoleIds(roleIds.join(","));
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
  description: "Set the role(s) pinged by boss spawn alerts.",
  usage: "!pingrole @Role [@Role...] | !pingrole off",
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

    const roleIds = parseRoleIds(ctx);
    if (roleIds.length === 0) {
      await ctx.message.reply("Usage: `!pingrole @Role [@Role...]` or `!pingrole off`.");
      return;
    }

    await ctx.services.repositories.discordServer.setPingRole({
      discordServerId: ctx.server.discordServerId,
      roleId: serializePingRoleIds(roleIds),
    });
    ctx.server.pingRoleId = serializePingRoleIds(roleIds);

    await ctx.message.reply({
      embeds: [
        successEmbed(
          roleIds.length === 1 ? "Ping role set" : "Ping roles set",
          `Boss spawn alerts will mention ${pingRoleMentions(roleIds)}.`,
        ),
      ],
    });
  },
};
