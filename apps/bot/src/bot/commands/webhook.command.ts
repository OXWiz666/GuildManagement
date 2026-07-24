import { PermissionFlagsBits } from "discord.js";
import type { Command, CommandContext } from "../../types/command.js";
import { errorEmbed, successEmbed } from "../../embeds/builders.js";
import { OFFICER_MINIMUM } from "../../middleware/permissions.js";

const DEFAULT_WEBHOOK_NAME = "ForgeKeep Bot";
const WEBHOOK_NAME_LIMIT = 80;

type WebhookCapableChannel = CommandContext["message"]["channel"] & {
  createWebhook(options: { name: string; reason?: string }): Promise<{
    id: string;
    name: string | null;
    url: string;
    delete(reason?: string): Promise<unknown>;
  }>;
};

export const webhookHereCommand: Command = {
  name: "webhookhere",
  aliases: ["createwebhook", "webhook"],
  description: "Create a Discord webhook for this channel and DM you the URL.",
  usage: "!webhookhere [name]",
  example: ["!webhookhere", "!webhookhere Boss Alerts"],
  category: "Configuration",
  requiresLink: true,
  minimumRole: OFFICER_MINIMUM,

  async execute(ctx: CommandContext): Promise<void> {
    const channel = ctx.message.channel;

    if (!isWebhookCapable(channel)) {
      await ctx.message.reply({
        embeds: [
          errorEmbed(
            "Webhook not available here",
            "Run this in a normal server text or announcement channel.",
          ),
        ],
      });
      return;
    }

    const botMember = ctx.message.guild.members.me ?? (await ctx.message.guild.members.fetchMe());
    const permissions = channel.permissionsFor(botMember);

    if (!permissions?.has(PermissionFlagsBits.ManageWebhooks)) {
      await ctx.message.reply({
        embeds: [
          errorEmbed(
            "Missing Discord permission",
            "Give the bot the Manage Webhooks permission, then run this command again.",
          ),
        ],
      });
      return;
    }

    const webhookName = normalizeWebhookName(ctx.rest);
    const webhook = await channel.createWebhook({
      name: webhookName,
      reason: `Created by ${ctx.message.author.tag} through ${ctx.message.content.split(/\s+/)[0]}`,
    });

    try {
      await ctx.message.author.send({
        embeds: [
          successEmbed(
            "Webhook created",
            [
              `Channel: <#${ctx.message.channelId}>`,
              `Name: ${webhook.name ?? webhookName}`,
              "",
              "Keep this URL private. Anyone with it can post into the channel.",
              "",
              webhook.url,
            ].join("\n"),
          ),
        ],
      });
    } catch {
      await webhook.delete("Deleted because the webhook URL could not be delivered by DM");

      await ctx.message.reply({
        embeds: [
          errorEmbed(
            "Could not DM the webhook URL",
            "Enable DMs from this server, then run the command again. I deleted the webhook I created so the secret URL is not lost.",
          ),
        ],
      });
      return;
    }

    await ctx.message.reply({
      embeds: [
        successEmbed(
          "Webhook created",
          `I sent the private webhook URL to ${ctx.message.author}. Keep it secret.`,
        ),
      ],
    });
  },
};

function isWebhookCapable(channel: CommandContext["message"]["channel"]): channel is WebhookCapableChannel {
  return "createWebhook" in channel && typeof channel.createWebhook === "function";
}

function normalizeWebhookName(input: string): string {
  const normalized = input.trim().replace(/\s+/g, " ");
  return (normalized || DEFAULT_WEBHOOK_NAME).slice(0, WEBHOOK_NAME_LIMIT);
}
