import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET must be at least 32 chars"),
  JWT_REFRESH_SECRET: z.string().min(32, "JWT_REFRESH_SECRET must be at least 32 chars"),
  JWT_ACCESS_EXPIRY: z.string().default("1d"),
  JWT_REFRESH_EXPIRY: z.string().default("7d"),
  BCRYPT_ROUNDS: z.coerce.number().min(10).max(15).default(12),
  SLOW_REQUEST_MS: z.coerce.number().default(750),
  SUPABASE_URL: z.string().url("SUPABASE_URL must be a valid URL"),
  SUPABASE_KEY: z.string().min(1, "SUPABASE_KEY is required"),
  // Optional — the Redis cache layer (packages/core/src/lib/redis.ts) falls
  // back to the in-memory cache when these aren't set, so local dev and any
  // environment without Upstash provisioned keep working unchanged. `.env`
  // ships these as empty-string placeholders (not commented out), and
  // `.optional()` alone only exempts `undefined` — an empty string still
  // fails `.url()`/`.min(1)` and would throw at import time, taking down
  // every route, not just Redis-related ones. Preprocess "" to undefined
  // first so an unfilled placeholder is treated as "not configured".
  UPSTASH_REDIS_REST_URL: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.string().url("UPSTASH_REDIS_REST_URL must be a valid URL").optional(),
  ),
  UPSTASH_REDIS_REST_TOKEN: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.string().min(1).optional(),
  ),
});

function validateEnv() {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    // Next.js has no process to exit — throw so the failing route/render
    // clearly surfaces the misconfiguration instead of silently continuing.
    const formatted = JSON.stringify(result.error.format(), null, 2);
    throw new Error(`Invalid environment variables:\n${formatted}`);
  }

  return result.data;
}

export const env = validateEnv();
export type Env = z.infer<typeof envSchema>;
