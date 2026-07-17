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

  it("gates every write command behind a role", () => {
    // Guard against a future command being added without a permission by
    // omission. These mutate faction-wide state and must never be open.
    const writeCommands = ["kill", "editkilltime", "forcespawn", "forcespawnall"];

    for (const name of writeCommands) {
      const command = findCommand(name);
      expect(command, `!${name} is registered`).not.toBeNull();
      expect(command!.requiresLink, `!${name} requires a link`).toBe(true);
      expect(command!.minimumRole, `!${name} has a minimum role`).not.toBeNull();
    }
  });

  it("keeps !forcespawnall stricter than !forcespawn", () => {
    // forcespawnall rewrites timers for the whole fixed roster across every
    // guild in the faction — deliberately a higher bar.
    expect(findCommand("forcespawn")!.minimumRole).toBe("OFFICER");
    expect(findCommand("forcespawnall")!.minimumRole).toBe("GUILD_LEADER");
  });

  it("leaves account-linking commands open to unlinked users", () => {
    // `!link` requiring a link would be a deadlock.
    expect(findCommand("link")!.requiresLink).toBe(false);
    expect(findCommand("commands")!.requiresLink).toBe(false);
  });
});
