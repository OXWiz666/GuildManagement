import { Prisma, prisma } from "@guild/db";

export type NotificationKind =
  | "SPAWN_WARNING"
  | "SPAWN"
  | "KILL"
  | "CP_UPDATE"
  | "MAINTENANCE"
  | "ANNOUNCEMENT";

/** Prisma's unique-constraint violation code. */
const UNIQUE_VIOLATION = "P2002";

export class NotificationRepository {
  /**
   * Claim the right to send one notification.
   *
   * The dedupe contract: callers claim BEFORE sending. `dedupe_key` is UNIQUE,
   * so the insert itself is the lock — if two bot instances (or a restart, or
   * an overlapping scheduler tick) try to claim the same key, exactly one wins
   * and the loser gets P2002 and skips. Checking-then-inserting would leave a
   * race window; letting Postgres arbitrate leaves none.
   *
   * Returns the row id when the claim succeeds, or null when already claimed.
   */
  async claim(params: {
    dedupeKey: string;
    kind: NotificationKind;
    discordServerId?: string | null;
    guildId?: string | null;
    channelId?: string | null;
    payload?: Prisma.InputJsonValue;
  }): Promise<string | null> {
    try {
      const row = await prisma.notificationHistory.create({
        data: {
          dedupeKey: params.dedupeKey,
          kind: params.kind,
          discordServerId: params.discordServerId ?? null,
          guildId: params.guildId ?? null,
          channelId: params.channelId ?? null,
          status: "PENDING",
          ...(params.payload === undefined ? {} : { payload: params.payload }),
        },
        select: { id: true },
      });
      return row.id;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === UNIQUE_VIOLATION
      ) {
        return null; // Already claimed — another sender owns this notification.
      }
      throw error;
    }
  }

  async markSent(id: string, messageId: string | null): Promise<void> {
    await prisma.notificationHistory.update({
      where: { id },
      data: { status: "SENT", sentAt: new Date(), messageId },
    });
  }

  /**
   * Mark a claim failed.
   *
   * The row is kept (not deleted) so the dedupe key stays burned — a permanent
   * failure like "channel deleted" must not be retried on every tick forever.
   * `retryable` callers delete instead; see `release`.
   */
  async markFailed(id: string, error: string): Promise<void> {
    await prisma.notificationHistory.update({
      where: { id },
      // Discord error strings can be long; the column is unbounded TEXT but
      // there's no value in storing a novel.
      data: { status: "FAILED", error: error.slice(0, 500) },
    });
  }

  /**
   * Give up a claim so it can be retried later.
   *
   * Used for transient failures (rate limit exhausted, network blip): deleting
   * the row frees the unique key, letting the next scheduler tick re-claim and
   * re-send. Without this, one 503 would permanently suppress a spawn alert.
   */
  async release(id: string): Promise<void> {
    await prisma.notificationHistory.delete({ where: { id } }).catch(() => {
      // Already gone — nothing to release.
    });
  }
}
