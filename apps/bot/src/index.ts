import type { ServerType } from "@hono/node-server";
import { prisma } from "@guild/db";
import { createBot } from "./bot/client.js";
import { createApiServer } from "./api/server.js";
import { env } from "./config/env.js";
import { logger, errorFields } from "./utils/logger.js";
import { explainStartupError } from "./utils/startupErrors.js";

/**
 * Entrypoint.
 *
 * Fly.io sends SIGTERM and waits a grace period before SIGKILL, so shutdown
 * closes the gateway and drains the pg pool rather than dropping connections —
 * an abrupt exit leaves Supabase pooler slots pinned until they time out.
 */
async function main(): Promise<void> {
  const bot = createBot();

  // Opt-in only (see config/env.ts) — most deployments never set
  // PUBLIC_API_ENABLED, so this stays a no-op for them.
  const api = env.PUBLIC_API_ENABLED ? createApiServer(bot.services) : null;
  let apiServer: ServerType | null = null;

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    // A second Ctrl-C shouldn't start a second teardown.
    if (shuttingDown) return;
    shuttingDown = true;

    logger.info("Shutting down", { signal });

    try {
      if (api && apiServer) await api.stop(apiServer);
      await bot.stop();
      await prisma.$disconnect();
      logger.info("Shutdown complete");
      process.exit(0);
    } catch (error) {
      logger.error("Error during shutdown", errorFields(error));
      process.exit(1);
    }
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  // A rejected promise nobody handled means state may be inconsistent. Log it
  // loudly; let the platform restart us rather than limping on.
  process.on("unhandledRejection", (reason) => {
    logger.error("Unhandled rejection", errorFields(reason));
  });

  process.on("uncaughtException", (error) => {
    logger.error("Uncaught exception — exiting", errorFields(error));
    process.exit(1);
  });

  await bot.start();
  if (api) apiServer = api.start();
}

main().catch((error: unknown) => {
  const guidance = explainStartupError(error);

  if (guidance) {
    // Plain stderr, not the JSON logger: this is a human at a terminal who
    // needs to read it, and a JSON-escaped multi-line block is unreadable.
    console.error(guidance);
    logger.error("Fatal startup error — see guidance above", {
      err: error instanceof Error ? error.message : String(error),
    });
  } else {
    logger.error("Fatal startup error", errorFields(error));
  }

  process.exit(1);
});
