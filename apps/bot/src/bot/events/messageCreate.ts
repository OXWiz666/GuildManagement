import type { Message } from "discord.js";
import { redisCache, cacheKeys, cacheTtl } from "@guild/core";
import { env } from "../../config/env.js";
import type { ServiceContainer } from "../../services/container.js";
import type { CommandContext } from "../../types/command.js";
import type { NotificationDispatcher } from "../../notifications/dispatcher.js";
import { findCommand } from "../commands/registry.js";
import { assertCommandAllowed } from "../../middleware/permissions.js";
import { errorEmbed } from "../../embeds/builders.js";
import { NotGuildMemberError, ServerNotBoundError, toUserMessage } from "../../utils/errors.js";
import { logger, errorFields } from "../../utils/logger.js";

/**
 * Commands exempt from the `!cmdhere` channel restriction.
 *
 * `!bindguild` must work before any channel is configured, and `!commands`
 * needs to be able to tell a confused user where the right channel is —
 * restricting either would make the bot unrecoverable from a bad config.
 */
const BOOTSTRAP_COMMANDS = new Set(["bindguild", "commands", "link"]);
const CHANNEL_RESTRICTION_EXEMPT = new Set([...BOOTSTRAP_COMMANDS]);

/**
 * The dispatch pipeline. In order:
 *   parse → resolve server → resolve channel policy → resolve actor →
 *   authorize → execute → reply, with everything wrapped so a thrown error
 *   becomes a friendly embed rather than an unhandled rejection.
 */
export async function handleMessage(
  message: Message,
  services: ServiceContainer,
  dispatcher: NotificationDispatcher,
): Promise<void> {
  // Ignore bots (including ourselves) — otherwise two ForgeKeep bots in one
  // server could trigger each other indefinitely.
  if (message.author.bot) return;

  // DMs have no guild scope, so there's no way to know which guild's data to
  // read. Everything is server-scoped by design.
  if (!message.inGuild()) return;

  const prefix = env.COMMAND_PREFIX;
  if (!message.content.startsWith(prefix)) return;

  const withoutPrefix = message.content.slice(prefix.length).trim();
  if (!withoutPrefix) return;

  const parts = withoutPrefix.split(/\s+/);
  const keyword = parts[0]!;
  const args = parts.slice(1);

  const command = findCommand(keyword);
  if (!command) return; // Unknown keyword — stay silent rather than nagging.

  const startedAt = Date.now();
  const log = logger.child({
    command: command.name,
    discordGuildId: message.guildId,
    discordUserId: message.author.id,
  });

  try {
    const dbClaimed = await services.repositories.notification.claimCommandMessage({
      messageId: message.id,
      command: command.name,
      discordGuildId: message.guildId,
      channelId: message.channelId,
      authorDiscordId: message.author.id,
    });
    if (!dbClaimed) return;

    await redisCache.setIfAbsent(
      cacheKeys.discordMessageClaim(message.id),
      true,
      cacheTtl.discordMessageClaim,
    );

    let server = await services.repositories.discordServer.findByDiscordGuildId(message.guildId);
    if (!server) {
      server = await services.repositories.discordServer.refreshByDiscordGuildId(message.guildId);
    }
    if (server) {
      await services.repositories.notification.attachCommandMessageContext({
        messageId: message.id,
        discordServerId: server.discordServerId,
        guildId: server.guildId,
      });
    }

    // Bootstrap commands must run before a server is bound. `!link` is needed
    // before `!bindguild`, and `!commands` explains that flow.
    if (!server) {
      if (!BOOTSTRAP_COMMANDS.has(command.name)) throw new ServerNotBoundError(message.guildId);

      await services.rateLimiter.enforce("command", message.author.id);

      await command.execute(
        buildContext(message, args, keyword, PLACEHOLDER_SERVER, null, services, dispatcher),
      );
      log.info("Command completed", { ms: Date.now() - startedAt, bound: false });
      return;
    }

    // `!cmdhere` restriction: if a command channel is set, other channels are
    // ignored silently — a reply in every wrong channel would be its own spam.
    if (!CHANNEL_RESTRICTION_EXEMPT.has(command.name)) {
      const commandChannel = await services.repositories.discordServer.getChannel(
        server.discordServerId,
        "COMMAND",
      );
      if (commandChannel && commandChannel !== message.channelId) return;
    }

    // Rate limit AFTER resolving the server (so unbound servers cost nothing)
    // but BEFORE any real work. Scans carry an additional, tighter budget
    // enforced inside the command itself.
    await services.rateLimiter.enforce("command", message.author.id);

    const actor = await services.repositories.identity.resolveActor(
      message.author.id,
      server.guildId,
      message.author.username,
    );

    const ctx = buildContext(message, args, keyword, server, actor, services, dispatcher);

    // Throws NotLinkedError / MissingPermissionError, caught below.
    if (command.requiresLink || command.minimumRole) {
      if (
        !actor &&
        await services.repositories.identity.isLinked(message.author.id, message.author.username)
      ) {
        throw new NotGuildMemberError();
      }
      assertCommandAllowed(command, actor);
    }

    await command.execute(ctx);

    log.info("Command completed", {
      ms: Date.now() - startedAt,
      guildId: server.guildId,
      userId: actor?.userId,
    });
  } catch (error) {
    const { message: text, hint, internal } = toUserMessage(error);

    if (internal) {
      log.error("Command failed", { ms: Date.now() - startedAt, ...errorFields(error) });
    } else {
      log.info("Command rejected", { ms: Date.now() - startedAt, reason: text });
    }

    await message
      .reply({ embeds: [errorEmbed("⚠ " + text, hint)] })
      .catch((replyError: unknown) => {
        // Replying can itself fail (message deleted, permissions revoked).
        // Log and move on — never let error handling throw.
        log.warn("Failed to deliver error reply", errorFields(replyError));
      });
  }
}

function buildContext(
  message: Message,
  args: string[],
  keyword: string,
  server: CommandContext["server"],
  actor: CommandContext["actor"],
  services: ServiceContainer,
  dispatcher: NotificationDispatcher,
): CommandContext {
  // `rest` preserves the raw remainder so boss names with spaces survive.
  const prefix = env.COMMAND_PREFIX;
  const rest = message.content.slice(prefix.length + keyword.length).trim();

  return {
    message: message as Message<true>,
    args,
    rest,
    server,
    actor,
    services,

    async notify({ dedupeKey, kind, embeds, content }) {
      const channelId = await services.repositories.discordServer.getChannel(
        server.discordServerId,
        "NOTIFICATION",
      );
      // No notification channel configured — the command's own reply is the
      // only output. Not an error.
      if (!channelId) return false;

      // Don't echo into the same channel the command was run in: the member
      // already got a reply there, and posting twice reads as a bug.
      if (channelId === message.channelId) return false;

      const outcome = await dispatcher.dispatch({
        dedupeKey,
        kind,
        discordServerId: server.discordServerId,
        guildId: server.guildId,
        channelId,
        embeds,
        ...(content ? { content } : {}),
      });

      return outcome === "sent";
    },
  };
}

/**
 * Stand-in server context for the unbound `!bindguild` path.
 *
 * The command never reads these fields — it resolves its own guild from the
 * invite code — but CommandContext requires a server. Using empty strings
 * rather than a fake id means any accidental read fails loudly instead of
 * silently querying the wrong tenant.
 */
const PLACEHOLDER_SERVER: CommandContext["server"] = {
  discordServerId: "",
  discordGuildId: "",
  guildId: "",
  guildName: "",
  timezone: "Asia/Singapore",
};
