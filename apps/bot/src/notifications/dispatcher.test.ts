import { describe, expect, it, vi } from "vitest";
import { NotificationDispatcher } from "./dispatcher.js";
import type { NotificationRepository } from "../repositories/notification.repository.js";
import type { SendQueue } from "./queue.js";

function makeChannel(sendable = true) {
  return {
    isTextBased: () => true,
    isSendable: () => sendable,
  };
}

function makeDispatcher(options: {
  claimId?: string | null;
  channel?: unknown;
  sendResult?: Promise<string | null>;
} = {}) {
  const notifications = {
    claim: vi.fn().mockResolvedValue(options.claimId === undefined ? "claim1" : options.claimId),
    markSent: vi.fn().mockResolvedValue(undefined),
    markFailed: vi.fn().mockResolvedValue(undefined),
    release: vi.fn().mockResolvedValue(undefined),
  } as unknown as NotificationRepository;

  const queue = {
    enqueue: vi.fn().mockReturnValue(options.sendResult ?? Promise.resolve("msg1")),
  } as unknown as SendQueue;

  const client = {
    channels: {
      fetch: vi.fn().mockResolvedValue(
        options.channel === undefined ? makeChannel() : options.channel,
      ),
    },
  } as never;

  return {
    dispatcher: new NotificationDispatcher(client, queue, notifications),
    notifications,
    queue,
  };
}

const request = {
  dedupeKey: "spawn:srv1:sched1",
  kind: "SPAWN" as const,
  discordServerId: "srv1",
  guildId: "g1",
  channelId: "chan1",
  embeds: [],
};

describe("NotificationDispatcher", () => {
  it("claims before sending", async () => {
    const { dispatcher, notifications, queue } = makeDispatcher();

    const order: string[] = [];
    vi.mocked(notifications.claim).mockImplementation(async () => {
      order.push("claim");
      return "claim1";
    });
    vi.mocked(queue.enqueue).mockImplementation(async () => {
      order.push("send");
      return "msg1";
    });

    await dispatcher.dispatch(request);

    // The ordering IS the dedupe guarantee: claiming first means the worst
    // case is a lost notification, never a duplicated one.
    expect(order).toEqual(["claim", "send"]);
  });

  it("sends and records the message id", async () => {
    const { dispatcher, notifications, queue } = makeDispatcher();

    const outcome = await dispatcher.dispatch(request);

    expect(outcome).toBe("sent");
    expect(queue.enqueue).toHaveBeenCalledOnce();
    expect(notifications.markSent).toHaveBeenCalledWith("claim1", "msg1");
  });

  it("does NOT send when the claim is already taken", async () => {
    // Another instance (or an earlier tick) owns this notification.
    const { dispatcher, notifications, queue } = makeDispatcher({ claimId: null });

    const outcome = await dispatcher.dispatch(request);

    expect(outcome).toBe("duplicate");
    expect(queue.enqueue).not.toHaveBeenCalled();
    expect(notifications.markSent).not.toHaveBeenCalled();
  });

  it("burns the key permanently when the channel is unusable", async () => {
    // Deleted channel / revoked permission — retrying every 30s forever would
    // be pointless noise.
    const { dispatcher, notifications, queue } = makeDispatcher({ channel: null });

    const outcome = await dispatcher.dispatch(request);

    expect(outcome).toBe("failed");
    expect(queue.enqueue).not.toHaveBeenCalled();
    expect(notifications.markFailed).toHaveBeenCalled();
    // NOT released — the claim stays so this isn't retried.
    expect(notifications.release).not.toHaveBeenCalled();
  });

  it("burns the key when the channel exists but isn't sendable", async () => {
    const { dispatcher, notifications } = makeDispatcher({ channel: makeChannel(false) });

    expect(await dispatcher.dispatch(request)).toBe("failed");
    expect(notifications.markFailed).toHaveBeenCalled();
  });

  it("RELEASES the claim when the send fails, so a later tick retries", async () => {
    // Transient: Discord 5xx after the queue exhausted its own retries. The
    // key must be freed or one outage permanently suppresses the alert.
    const { dispatcher, notifications } = makeDispatcher({
      sendResult: Promise.reject(new Error("discord exploded")),
    });

    const outcome = await dispatcher.dispatch(request);

    expect(outcome).toBe("failed");
    expect(notifications.release).toHaveBeenCalledWith("claim1");
    expect(notifications.markSent).not.toHaveBeenCalled();
  });

  it("passes the dedupe key and kind through to the claim", async () => {
    const { dispatcher, notifications } = makeDispatcher();

    await dispatcher.dispatch(request);

    expect(notifications.claim).toHaveBeenCalledWith(
      expect.objectContaining({ dedupeKey: "spawn:srv1:sched1", kind: "SPAWN" }),
    );
  });
});
