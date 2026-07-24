import type { Command } from "../../types/command.js";
import { cpCommand } from "./cp.command.js";
import { killCommand } from "./kill.command.js";
import { editKillTimeCommand } from "./editkilltime.command.js";
import { setSpawnCommand } from "./setspawn.command.js";
import { forceSpawnAllCommand, forceSpawnCommand } from "./forcespawn.command.js";
import { spawnCommand } from "./spawn.command.js";
import { partyCommand } from "./party.command.js";
import { bindGuildCommand, linkCommand, unbindGuildCommand, unlinkCommand } from "./link.command.js";
import {
  cmdHereCommand,
  cmdHereOffCommand,
  notifHereCommand,
  pingRoleCommand,
  threadHereCommand,
} from "./config.command.js";
import { aliasCommand } from "./alias.command.js";
import { commandsCommand } from "./commands.command.js";
import { smartAttendanceCommand } from "./smartattendance.command.js";
import { itemsCommand } from "./items.command.js";
import { webhookHereCommand } from "./webhook.command.js";

/**
 * The command table.
 *
 * `!commands` renders itself from this list, so a new command is documented the
 * moment it's registered — there is no second help file to forget to update.
 */
export const COMMANDS: Command[] = [
  spawnCommand,
  killCommand,
  editKillTimeCommand,
  setSpawnCommand,
  itemsCommand,
  forceSpawnCommand,
  forceSpawnAllCommand,
  partyCommand,
  cpCommand,
  smartAttendanceCommand,
  linkCommand,
  unlinkCommand,
  bindGuildCommand,
  unbindGuildCommand,
  notifHereCommand,
  pingRoleCommand,
  cmdHereCommand,
  cmdHereOffCommand,
  threadHereCommand,
  webhookHereCommand,
  aliasCommand,
  commandsCommand,
];

/**
 * Name/alias → command, built once at module load.
 *
 * A Map lookup keeps dispatch O(1) instead of scanning the table (and every
 * alias array) on every single message the bot sees.
 */
function buildLookup(commands: Command[]): Map<string, Command> {
  const lookup = new Map<string, Command>();

  for (const command of commands) {
    for (const key of [command.name, ...command.aliases]) {
      const normalized = key.toLowerCase();

      // A duplicate alias would silently shadow another command; fail at boot
      // instead of at 3am when someone's !kill runs the wrong handler.
      const existing = lookup.get(normalized);
      if (existing) {
        throw new Error(
          `Duplicate command keyword "${normalized}" registered by both ` +
            `"${existing.name}" and "${command.name}".`,
        );
      }

      lookup.set(normalized, command);
    }
  }

  return lookup;
}

export const COMMAND_LOOKUP = buildLookup(COMMANDS);

export function findCommand(keyword: string): Command | null {
  return COMMAND_LOOKUP.get(keyword.toLowerCase()) ?? null;
}
