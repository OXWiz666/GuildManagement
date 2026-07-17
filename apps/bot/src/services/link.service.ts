import { prisma } from "@guild/db";
import type { IdentityRepository } from "../repositories/identity.repository.js";
import { UserFacingError } from "../utils/errors.js";

/**
 * Account linking.
 *
 * Trust model: the website mints a short-lived one-time code for an
 * authenticated user; the user echoes it in Discord. Possession of the code
 * proves possession of a logged-in ForgeKeep session, so the bot never sees a
 * password and never has to trust a self-reported identity (a Discord nickname
 * can claim to be anyone).
 */
export class LinkService {
  constructor(private readonly identity: IdentityRepository) {}

  async redeem(params: {
    code: string;
    discordId: string;
    discordUsername: string;
  }): Promise<{ displayName: string }> {
    // Codes are displayed uppercase; accept any casing the user types.
    const code = params.code.trim().toUpperCase();

    if (!/^[A-Z0-9]{6,12}$/.test(code)) {
      throw new UserFacingError(
        "That doesn't look like a link code.",
        "Codes are 6–12 letters/numbers, e.g. `!link 7QK2ZP`.",
      );
    }

    const result = await this.identity.redeemLinkCode({
      code,
      discordId: params.discordId,
      discordUsername: params.discordUsername,
    });

    if (result.ok) return { displayName: result.displayName };

    // Deliberately uniform-ish messaging: NOT_FOUND and EXPIRED both mean
    // "get a new code", and distinguishing them precisely would let someone
    // probe which codes exist.
    switch (result.reason) {
      case "NOT_FOUND":
      case "EXPIRED":
        throw new UserFacingError(
          "That link code is invalid or has expired.",
          "Generate a fresh one in ForgeKeep → Settings → Link Discord.",
        );
      case "CONSUMED":
        throw new UserFacingError(
          "That link code has already been used.",
          "Generate a fresh one in ForgeKeep → Settings → Link Discord.",
        );
      case "DISCORD_TAKEN":
        throw new UserFacingError(
          "This Discord account is already linked to a different ForgeKeep account.",
          "Run `!unlink` first, or use the Discord account that owns the link.",
        );
    }
  }

  async unlink(discordId: string): Promise<void> {
    const ok = await this.identity.unlink(discordId);
    if (!ok) {
      throw new UserFacingError("This Discord account isn't linked to anything.");
    }
  }

  /**
   * Bind a Discord server to a ForgeKeep guild via the guild's invite code.
   *
   * Authorization is intentionally strict — binding decides which guild's data
   * an entire Discord server can read, so only a Guild Leader (or above) of
   * that specific guild may do it. Being a leader elsewhere grants nothing.
   */
  async resolveGuildForBinding(params: {
    inviteCode: string;
    actorUserId: string;
  }): Promise<{ guildId: string; guildName: string }> {
    const inviteCode = params.inviteCode.trim().toUpperCase();

    if (!/^[A-Z0-9]+-JOIN-[A-Z0-9]+$/.test(inviteCode)) {
      throw new UserFacingError(
        "That doesn't look like a guild invite code.",
        "Copy the full code from ForgeKeep → Guild Settings → Integrations → Discord.",
      );
    }

    const guild = await prisma.guild.findUnique({
      where: { inviteCode },
      select: { id: true, name: true, deletedAt: true, suspendedAt: true },
    });

    if (!guild || guild.deletedAt || guild.suspendedAt) {
      throw new UserFacingError(
        "No active guild matches that invite code.",
        "Copy the code from ForgeKeep → Guild Settings → Integrations → Discord.",
      );
    }

    const membership = await prisma.guildMember.findUnique({
      where: { userId_guildId: { userId: params.actorUserId, guildId: guild.id } },
      select: { role: true, isActive: true },
    });

    const allowed =
      membership?.isActive &&
      ["GUILD_LEADER", "FACTION_LEADER", "ADMIN"].includes(membership.role);

    if (!allowed) {
      throw new UserFacingError(
        "Only a Guild Leader of that guild can bind it to a Discord server.",
      );
    }

    return { guildId: guild.id, guildName: guild.name };
  }
}
