import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "./generated/client";

// Singleton pattern — prevents multiple PrismaClient instances (and pg pools)
// during Next.js hot-reload in development
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  pgPool: Pool | undefined;
};

// Queries slower than this (ms) are logged as a warning in every environment so
// production slow queries surface in logs/observability without flipping on the
// full `query` firehose. Override via PRISMA_SLOW_QUERY_MS.
const SLOW_QUERY_MS = Number(process.env["PRISMA_SLOW_QUERY_MS"] ?? 300);

/**
 * Use the `pg` driver adapter instead of Prisma's default query engine.
 *
 * The Supabase connection goes through the transaction pooler (`pgbouncer=true`),
 * where the default engine cannot keep prepared statements and wraps every query
 * as BEGIN → DEALLOCATE ALL → <query> → COMMIT — 4 network round trips per query.
 * `pg` issues each query with the extended protocol using unnamed statements,
 * which is safe under transaction pooling and costs a single round trip. Against
 * a remote database (round trips dominate latency) this is a large speedup.
 */
function createPool(): Pool {
  return new Pool({
    connectionString: process.env["DATABASE_URL"],
    // Supabase requires TLS; the URL carries no sslmode, so enable it here.
    // rejectUnauthorized:false matches the engine's default lenient behavior.
    ssl: { rejectUnauthorized: false },
    // Keep the per-instance pool small — the Supabase pooler fans out to Postgres.
    max: 10,
  });
}

function createPrismaClient(): PrismaClient {
  const isDev = process.env["NODE_ENV"] === "development";

  const pool = globalForPrisma.pgPool ?? createPool();
  if (process.env["NODE_ENV"] !== "production") {
    globalForPrisma.pgPool = pool;
  }

  const adapter = new PrismaPg(pool);

  const client = new PrismaClient({
    adapter,
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
