import { Prisma, PrismaClient } from "./generated/client";

// Singleton pattern — prevents multiple PrismaClient instances
// during Next.js hot-reload in development
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Queries slower than this (ms) are logged as a warning in every environment so
// production slow queries surface in logs/observability without flipping on the
// full `query` firehose. Override via PRISMA_SLOW_QUERY_MS.
const SLOW_QUERY_MS = Number(process.env["PRISMA_SLOW_QUERY_MS"] ?? 300);

function createPrismaClient(): PrismaClient {
  const isDev = process.env["NODE_ENV"] === "development";

  const client = new PrismaClient({
    // Emit `query` as an event (not stdout) so we can measure duration and only
    // surface the slow ones. `error`/`warn` still go to stdout.
    log: [
      { level: "query", emit: "event" },
      { level: "error", emit: "stdout" },
      { level: "warn", emit: "stdout" },
    ],
  });

  // Slow-query monitoring — applies in all environments.
  (client as unknown as { $on: (e: "query", cb: (ev: Prisma.QueryEvent) => void) => void }).$on(
    "query",
    (event: Prisma.QueryEvent) => {
      if (event.duration >= SLOW_QUERY_MS) {
        console.warn(
          `[Prisma][SLOW ${event.duration}ms] ${event.query}` +
            (isDev && event.params ? ` -- params: ${event.params}` : ""),
        );
      } else if (isDev) {
        console.log(`[Prisma][${event.duration}ms] ${event.query}`);
      }
    },
  );

  return client;
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env["NODE_ENV"] !== "production") {
  globalForPrisma.prisma = prisma;
}
