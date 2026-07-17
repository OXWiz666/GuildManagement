import { Client, GatewayIntentBits, Partials } from "discord.js";
import { env } from "../config/env.js";
import { createContainer, type ServiceContainer } from "../services/container.js";
import { SendQueue } from "../notifications/queue.js";
import { NotificationDispatcher } from "../notifications/dispatcher.js";
import { BossScheduler } from "../scheduler/bossScheduler.js";
import { CpMonitor } from "../scheduler/cpMonitor.js";
import { RealtimeSubscriber } from "../realtime/subscriber.js";
import { handleMessage } from "./events/messageCreate.js";
import { logger, errorFields } from "../utils/logger.js";

export interface Bot {
  client: Client;
  services: ServiceContainer;
  queue: SendQueue;
  start(): Promise<void>;
  stop(): Promise<void>;
}

export function createBot(): Bot {
  const client = new Client({
    // Least-privilege intents. MessageContent is a privileged intent and MUST
    // be enabled in the Discord Developer Portal — without it every message
    // arrives with empty content and no prefix command ever matches. This is
    // the single most common "bot silently does nothing" cause.
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
    partials: [Partials.Channel],
  });

  const services = createContainer();
  const queue = new SendQueue();

  const dispatcher = new NotificationDispatcher(client, queue, services.repositories.notification);
  const bossScheduler = new BossScheduler(services, dispatcher);
  const cpMonitor = new CpMonitor(services, dispatcher);
  const realtime = new RealtimeSubscriber(services);

  client.once("clientReady", () => {
    logger.info("Bot ready", {
      tag: client.user?.tag,
      guilds: client.guilds.cache.size,
      prefix: env.COMMAND_PREFIX,
    });

    // Started only after the gateway is ready: the dispatcher resolves channels
    // through the client, and doing that before READY would fail every send on
    // the first tick.
    if (env.SCHEDULER_ENABLED) {
      bossScheduler.start();
      cpMonitor.start();
    } else {
      logger.warn("Schedulers disabled (SCHEDULER_ENABLED=false) — no notifications will be sent");
    }

    // Realtime is a cache-invalidation optimization, never a correctness
    // dependency — so a failure to connect degrades to TTL-based staleness
    // rather than taking the bot down.
    void realtime.start().catch((error: unknown) => {
      logger.error("Realtime subscriber failed to start — falling back to cache TTLs", {
        ...errorFields(error),
      });
    });
  });

  client.on("messageCreate", (message) => {
    // Fire-and-forget with a catch-all: handleMessage owns its own error
    // reporting, so anything reaching here is a bug in the handler itself and
    // must never take the process down.
    void handleMessage(message, services, dispatcher).catch((error: unknown) => {
      logger.error("Unhandled error in message handler", errorFields(error));
    });
  });

  client.on("error", (error) => {
    logger.error("Discord client error", errorFields(error));
  });

  client.on("warn", (warning) => {
    logger.warn("Discord client warning", { warning });
  });

  return {
    client,
    services,
    queue,
    async start() {
      await client.login(env.DISCORD_TOKEN);
    },
    async stop() {
      // Stop scheduling before tearing down the client, so an in-flight tick
      // can't try to send through a destroyed gateway.
      bossScheduler.stop();
      cpMonitor.stop();
      await realtime.stop();
      await client.destroy();
      // Terminate the tesseract worker — it holds a WASM runtime that would
      // otherwise keep the event loop alive and stall shutdown past Fly's
      // SIGTERM grace period.
      await services.ocr.dispose();
    },
  };
}
