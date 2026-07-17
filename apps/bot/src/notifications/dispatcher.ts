import type { Client, EmbedBuilder } from "discord.js";
import type {
  NotificationKind,
  NotificationRepository,
} from "../repositories/notification.repository.js";
import type { SendQueue } from "./queue.js";
import { logger, errorFields } from "../utils/logger.js";

export interface DispatchRequest {
  dedupeKey: string;
  kind: NotificationKind;
  discordServerId: string;
  guildId: string;
  channelId: string;
  embeds: EmbedBuilder[];
  content?: string;
}

export type DispatchOutcome = "sent" | "duplicate" | "failed";

/**
 * Claim → send → record.
 *
 * This is where the dedupe contract is actually honored, and the ordering is
 * the whole point:
 *
 *   1. CLAIM first (unique insert). If another instance/tick already claimed
 *      this key, stop — never send.
 *   2. SEND.
 *   3. Record the outcome.
 *
 * Claiming before sending means the worst case is a *lost* notification (claim
 * succeeded, send died), never a *duplicated* one. For a boss alert that's the
 * right trade: a missed ping is an annoyance, a double ping trains people to
 * mute the bot.
 *
 * Retryable failures RELEASE the claim so a later tick can try again;
 * permanent failures keep the row so the key stays burned and a broken channel
 * isn't retried forever.
 */
export class NotificationDispatcher {
  constructor(
    private readonly client: Client,
    private readonly queue: SendQueue,
    private readonly notifications: NotificationRepository,
  ) {}

  async dispatch(request: DispatchRequest): Promise<DispatchOutcome> {
    const claimId = await this.notifications.claim({
      dedupeKey: request.dedupeKey,
      kind: request.kind,
      discordServerId: request.discordServerId,
      guildId: request.guildId,
      channelId: request.channelId,
    });

    // Someone else owns this notification — not an error, just not ours.
    if (!claimId) return "duplicate";

    try {
      const channel = await this.client.channels.fetch(request.channelId);

      if (!channel || !channel.isTextBased() || !channel.isSendable()) {
        // Channel deleted, or our permissions were revoked. Permanent: keep the
        // claim so we don't re-attempt this every 30s forever.
        await this.notifications.markFailed(
          claimId,
          "Channel is missing or not sendable — re-run !notifhere",
        );
        logger.warn("Notification channel unusable", {
          channelId: request.channelId,
          kind: request.kind,
        });
        return "failed";
      }

      const messageId = await this.queue.enqueue({
        channel,
        embeds: request.embeds,
        ...(request.content === undefined ? {} : { content: request.content }),
      });

      await this.notifications.markSent(claimId, messageId);
      return "sent";
    } catch (error) {
      // The SendQueue already exhausted its retries/backoff, so reaching here
      // means this attempt is over. Release the claim so the next tick can
      // retry — a transient Discord outage shouldn't permanently suppress a
      // spawn alert. If the underlying cause is permanent, the next tick will
      // land in the markFailed branch above and burn the key properly.
      await this.notifications.release(claimId);

      logger.error("Notification dispatch failed; claim released for retry", {
        kind: request.kind,
        channelId: request.channelId,
        ...errorFields(error),
      });
      return "failed";
    }
  }
}
