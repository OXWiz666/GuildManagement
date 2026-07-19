import { describe, expect, it } from "vitest";
import { COMMANDS, COMMAND_LOOKUP, findCommand } from "./registry.js";

/**
 * The registry throws on a duplicate keyword at module load, so simply
 * importing it here is the assertion — a collision fails this file outright
 * rather than shipping and silently shadowing a command at runtime. Typecheck
 * can't catch that; this can.
 */
describe("command registry", () => {
  it("builds without duplicate keywords", () => {
    expect(COMMANDS.length).toBeGreaterThan(0);
    expect(COMMAND_LOOKUP.size).toBeGreaterThanOrEqual(COMMANDS.length);
  });

  it("resolves every command by its own name", () => {
    for (const command of COMMANDS) {
      expect(findCommand(command.name), `!${command.name}`).toBe(command);
    }
  });

  it("resolves every alias", () => {
    for (const command of COMMANDS) {
      for (const alias of command.aliases) {
        expect(findCommand(alias), `alias !${alias} → !${command.name}`).toBe(command);
      }
    }
  });

  it("is case-insensitive", () => {
    expect(findCommand("SPAWN")).toBe(findCommand("spawn"));
  });

  it("accepts !command as a help alias", () => {
    expect(findCommand("command")).toBe(findCommand("commands"));
  });

  it("returns null for an unknown keyword", () => {
    expect(findCommand("definitelynotacommand")).toBeNull();
  });

  it("gives every command a usage string and description", () => {
    // `!commands` renders straight from these — a blank one ships as a blank
    // help entry.
    for (const command of COMMANDS) {
      expect(command.usage, `!${command.name} usage`).toBeTruthy();
      expect(command.description, `!${command.name} description`).toBeTruthy();
    }
  });

  it("keeps only !spawn and !cp member-accessible among linked guild commands", () => {
    // Bootstrap/account commands stay open so users can link and see help.
    // Every other linked guild command should be member-visible only when
    // explicitly allowed here.
    const bootstrapCommands = new Set(["link", "unlink", "bindguild", "commands"]);
    const memberCommands = new Set(["spawn", "cp"]);
    const guildLeaderCommands = new Set(["unbindguild"]);

    for (const command of COMMANDS) {
      if (bootstrapCommands.has(command.name)) continue;

      expect(command.requiresLink, `!${command.name} requires a link`).toBe(true);
      if (memberCommands.has(command.name)) {
        expect(command.minimumRole, `!${command.name} remains member-accessible`).toBeNull();
      } else if (guildLeaderCommands.has(command.name)) {
        expect(command.minimumRole, `!${command.name} requires guild leader or higher`).toBe("GUILD_LEADER");
      } else {
        expect(command.minimumRole, `!${command.name} requires officer or higher`).toBe("OFFICER");
      }
    }
  });

  it("uses the same Officer+ gate for boss timer management commands", () => {
    // forcespawnall rewrites timers for the whole fixed roster across every
    // guild in the faction — deliberately a higher bar.
    expect(findCommand("forcespawn")!.minimumRole).toBe("OFFICER");
    expect(findCommand("forcespawnall")!.minimumRole).toBe("OFFICER");
  });

  it("leaves account-linking commands open to unlinked users", () => {
    // `!link` requiring a link would be a deadlock.
    expect(findCommand("link")!.requiresLink).toBe(false);
    expect(findCommand("commands")!.requiresLink).toBe(false);
  });
});
