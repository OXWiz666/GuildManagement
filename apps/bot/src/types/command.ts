import type { EmbedBuilder, Message } from "discord.js";
import type { GuildRoleType } from "@guild/shared";
import type { ServiceContainer } from "../services/container.js";
import type { NotificationKind } from "../repositories/notification.repository.js";

/** Grouping used by `!commands` to render its help sections. */
export type CommandCategory = "Bosses" | "Combat Power" | "Attendance" | "Configuration" | "General";

/**
 * Who a Discord message resolves to on the ForgeKeep side.
 *
 * `userId` is the canonical actor threaded into every @guild/core service call,
 * which performs its own authorization. `role` is cached here purely so command
 * middleware can reject early with a friendly message instead of letting a
 * service throw ForbiddenError — the service check remains the real gate.
 */
export interface Actor {
  userId: string;
  displayName: string;
  discordId: string;
  memberId: string;
  role: GuildRoleType;
  ign: string | null;
}

/** The ForgeKeep guild a Discord server is bound to. */
export interface ServerContext {
  discordServerId: string;
  discordGuildId: string;
  guildId: string;
  guildName: string;
  timezone: string;
  pingRoleId?: string | null;
}

export interface CommandContext {
  message: Message<true>;
  /** Whitespace-split arguments after the command word. */
  args: string[];
  /** Everything after the command word, untouched (for names with spaces). */
  rest: string;
  server: ServerContext;
  /** Null when the Discord user has not linked a ForgeKeep account. */
  actor: Actor | null;
  services: ServiceContainer;
  /**
   * Broadcast to the guild's configured notification channel.
   *
   * Goes through the same dedupe+queue path as scheduled notifications, so a
   * command-triggered announcement can't double-post and respects the same
   * rate limiting. Resolves false when no channel is set (`!notifhere` never
   * run) — callers should treat that as normal, not an error.
   */
  notify: (params: {
    dedupeKey: string;
    kind: NotificationKind;
    embeds: EmbedBuilder[];
  }) => Promise<boolean>;
}

export interface Command {
  name: string;
  aliases: string[];
  description: string;
  usage: string;
  category: CommandCategory;

  /**
   * Whether the command needs a linked ForgeKeep account. Everything that
   * writes, or that reads guild-scoped data, does.
   */
  requiresLink: boolean;

  /**
   * Minimum guild role. Null means any linked member.
   *
   * This is an early-exit convenience only. It is NOT the security boundary —
   * @guild/core services re-check authorization against the database on every
   * call, so a stale cached role here cannot escalate privileges.
   */
  minimumRole: GuildRoleType | null;

  execute(ctx: CommandContext): Promise<void>;
}
