import { env } from "../../config/env.js";
import type { Command, CommandContext, CommandCategory } from "../../types/command.js";
import { brandedEmbed, clampDescription } from "../../embeds/builders.js";
import { BrandColor } from "../../embeds/theme.js";
import { canRun } from "../../middleware/permissions.js";
import { hasMinimumRole } from "@guild/shared";

const CATEGORY_ORDER: CommandCategory[] = ["Bosses", "Combat Power", "Attendance", "Configuration", "General"];
const MEMBER_HELP_COMMANDS = new Set(["spawn", "cp", "commands"]);

/**
 * `!commands` — dynamic help.
 *
 * Generated from the live registry and the caller's actual permissions, so it
 * can't drift from what the bot does. Commands the caller can't run are hidden
 * rather than shown-and-rejected: a member has no use for `!kill`'s syntax.
 *
 * Boss aliases are read from the database (discord_aliases) per the brief, so
 * a server's own nicknames show up in its help.
 */
export const commandsCommand: Command = {
  name: "commands",
  aliases: ["command", "help", "cmds", "h"],
  description: "Show available commands.",
  usage: "!commands [command]",
  example: ["!commands", "!commands kill"],
  category: "General",
  requiresLink: false,
  minimumRole: null,

  async execute(ctx: CommandContext): Promise<void> {
    // Imported lazily: registry.ts imports this module, so a top-level import
    // here would be a require cycle.
    const { COMMANDS, findCommand } = await import("./registry.js");

    const query = ctx.args[0];
    if (query) {
      const target = findCommand(query);
      if (target) {
        if (!isVisibleInHelp(target, ctx.actor)) {
          await ctx.message.reply({
            embeds: [
              brandedEmbed(BrandColor.BLUE)
                .setTitle("Command unavailable")
                .setDescription("That command is limited to officers and leaders, so it is hidden from member help."),
            ],
          });
          return;
        }
        await ctx.message.reply({ embeds: [detailEmbed(target)] });
        return;
      }
    }

    const prefix = env.COMMAND_PREFIX;
    const visible = COMMANDS.filter((command) => isVisibleInHelp(command, ctx.actor));

    const embed = brandedEmbed(BrandColor.GOLD).setTitle("ForgeKeep — Commands");

    if (!ctx.actor) {
      embed.setDescription(
        "You're not linked yet, so most commands are hidden.\nRun `!link` to get started.",
      );
    }

    for (const category of CATEGORY_ORDER) {
      const rows = visible.filter((command) => command.category === category);
      if (rows.length === 0) continue;

      embed.addFields({
        name: category,
        value: clampDescription(
          rows.map((command) => `\`${prefix}${command.name}\` — ${command.description}`),
          1024,
        ),
      });
    }

    // Server-specific boss aliases, straight from the DB. Unbound servers use
    // a placeholder context while showing bootstrap help, so there is no server
    // id to query yet.
    if (ctx.server.discordServerId) {
      const aliases = await ctx.services.repositories.alias.listForServer(ctx.server.discordServerId);
      if (aliases.length > 0) {
        const rendered = aliases
          .slice(0, 20)
          .map((alias) => `\`${alias.alias}\` → ${alias.bossName}`)
          .join(" · ");
        embed.addFields({ name: "Boss Aliases", value: clampDescription([rendered], 1024) });
      }
    }

    embed.addFields({
      name: "​",
      value: `Run \`${prefix}commands <name>\` for details on one command.`,
    });

    await ctx.message.reply({ embeds: [embed] });
  },
};

function detailEmbed(command: Command) {
  const prefix = env.COMMAND_PREFIX;

  const embed = brandedEmbed(BrandColor.BLUE)
    .setTitle(`${prefix}${command.name}`)
    .setDescription(command.description)
    .addFields(
      { name: "Usage", value: `\`${command.usage}\``, inline: false },
      { name: "Category", value: command.category, inline: true },
      {
        name: "Requires",
        value: command.minimumRole ?? (command.requiresLink ? "Linked account" : "Nothing"),
        inline: true,
      },
    );

  if (command.example) {
    const examples = Array.isArray(command.example) ? command.example : [command.example];
    embed.addFields({
      name: examples.length > 1 ? "Examples" : "Example",
      value: examples.map((line) => `\`${line}\``).join("\n"),
      inline: false,
    });
  }

  if (command.aliases.length > 0) {
    embed.addFields({
      name: "Aliases",
      value: command.aliases.map((alias) => `\`${prefix}${alias}\``).join(", "),
      inline: false,
    });
  }

  return embed;
}

function isVisibleInHelp(command: Command, actor: CommandContext["actor"]): boolean {
  if (!canRun(command, actor)) return false;
  if (!actor) return command.name === "link" || command.name === "commands";
  if (!hasMinimumRole(actor.role, "OFFICER")) return MEMBER_HELP_COMMANDS.has(command.name);
  return true;
}
