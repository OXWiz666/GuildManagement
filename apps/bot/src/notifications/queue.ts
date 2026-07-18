import { DiscordAPIError, HTTPError, type EmbedBuilder, type TextBasedChannel } from "discord.js";
import { logger, errorFields } from "../utils/logger.js";

interface QueuedSend {
  channel: TextBasedChannel;
  embeds: EmbedBuilder[];
  content?: string;
  resolve: (messageId: string | null) => void;
  reject: (error: unknown) => void;
  attempt: number;
}

export interface SendQueueOptions {
  /** Minimum gap between dispatches. discord.js handles per-route buckets; this
   *  is a global smoothing valve so a fan-out burst doesn't queue 200 requests
   *  at once and trip the global 50/sec limit. */
  minIntervalMs?: number;
  maxAttempts?: number;
}

/** Discord's "you are being rate limited" status. */
const HTTP_TOO_MANY_REQUESTS = 429;

/**
 * Serialized, retrying Discord sender.
 *
 * discord.js already respects per-route rate limits and Retry-After. This queue
 * adds the two things it doesn't: a global pacing floor across all routes, and
 * durable exponential-backoff retries for transient failures, so a spawn alert
 * to 50 servers degrades into "slightly late" rather than "half of them lost".
 */
export class SendQueue {
  private readonly queue: QueuedSend[] = [];
  private draining = false;
  private readonly minIntervalMs: number;
  private readonly maxAttempts: number;

  constructor(options: SendQueueOptions = {}) {
    this.minIntervalMs = options.minIntervalMs ?? 250;
    this.maxAttempts = options.maxAttempts ?? 4;
  }

  /** Enqueue a send. Resolves with the message id, or rejects after retries. */
  enqueue(params: {
    channel: TextBasedChannel;
    embeds: EmbedBuilder[];
    content?: string;
  }): Promise<string | null> {
    return new Promise((resolve, reject) => {
      this.queue.push({
        channel: params.channel,
        embeds: params.embeds,
        ...(params.content === undefined ? {} : { content: params.content }),
        resolve,
        reject,
        attempt: 0,
      });
      void this.drain();
    });
  }

  private async drain(): Promise<void> {
    if (this.draining) return;
    this.draining = true;

    try {
      while (this.queue.length > 0) {
        const job = this.queue.shift()!;
        await this.dispatch(job);
        // Pace the next send regardless of outcome.
        await sleep(this.minIntervalMs);
      }
    } finally {
      this.draining = false;
    }
  }

  private async dispatch(job: QueuedSend): Promise<void> {
    job.attempt += 1;

    try {
      if (!job.channel.isSendable()) {
        // Permissions revoked or channel type changed — not retryable.
        job.reject(new Error("Channel is not sendable (missing permissions?)"));
        return;
      }

      const message = await job.channel.send({
        embeds: job.embeds,
        ...(job.content === undefined ? {} : { content: job.content }),
      });
      job.resolve(message.id);
    } catch (error) {
      const decision = classify(error);

      if (decision.retryable && job.attempt < this.maxAttempts) {
        // Honor Discord's own Retry-After when present; otherwise exponential
        // backoff (0.5s, 1s, 2s…) with a cap so a long outage doesn't park a
        // job for minutes.
        const wait = decision.retryAfterMs ?? Math.min(500 * 2 ** (job.attempt - 1), 8_000);

        logger.warn("Discord send failed; retrying", {
          attempt: job.attempt,
          waitMs: wait,
          ...errorFields(error),
        });

        await sleep(wait);
        this.queue.unshift(job); // Preserve ordering on retry.
        return;
      }

      logger.error("Discord send failed permanently", {
        attempt: job.attempt,
        ...errorFields(error),
      });
      job.reject(error);
    }
  }
}

function classify(error: unknown): { retryable: boolean; retryAfterMs?: number } {
  if (error instanceof DiscordAPIError) {
    // 429 carries Retry-After; 5xx is Discord being unwell — both worth a retry.
    if (error.status === HTTP_TOO_MANY_REQUESTS) {
      const retryAfter = extractRetryAfter(error);
      return retryAfter === null ? { retryable: true } : { retryable: true, retryAfterMs: retryAfter };
    }
    if (error.status >= 500) return { retryable: true };

    // 403 (no permission), 404 (channel deleted), 400 (bad embed) will fail
    // identically forever — retrying just burns rate limit.
    return { retryable: false };
  }

  // HTTPError covers network-level failures (DNS, socket resets).
  if (error instanceof HTTPError) return { retryable: true };

  return { retryable: false };
}

/** discord.js surfaces Retry-After inconsistently across versions; read defensively. */
function extractRetryAfter(error: DiscordAPIError): number | null {
  const raw = (error as unknown as { retryAfter?: unknown }).retryAfter;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    // Some paths report seconds, others milliseconds. Values under 100 are
    // implausible as ms for a rate limit, so treat them as seconds.
    return raw < 100 ? raw * 1000 : raw;
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
