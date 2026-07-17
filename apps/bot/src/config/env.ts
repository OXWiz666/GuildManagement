import { z } from "zod";

/**
 * Bot-specific configuration.
 *
 * Note on scope: this validates only what the BOT itself adds. Importing
 * `@guild/core` runs that package's own env validation at import time, which
 * additionally requires DATABASE_URL, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET,
 * SUPABASE_URL and SUPABASE_KEY. The bot never issues JWTs, but the shared
 * services module is a single unit — so those vars must still be present in the
 * bot's environment. `.env.example` documents the full set.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

  DISCORD_TOKEN: z.string().min(1, "DISCORD_TOKEN is required"),
  // Used to scope-check the bot's own identity in mention-prefix parsing.
  DISCORD_CLIENT_ID: z.string().min(1, "DISCORD_CLIENT_ID is required"),

  COMMAND_PREFIX: z.string().min(1).max(3).default("!"),

  // Upper bound for `!cp <value>`. Configurable per the brief; the default is
  // deliberately generous so a legitimate whale is never rejected, while still
  // catching fat-fingered input like a pasted timestamp.
  CP_MAX_VALUE: z.coerce.number().int().positive().default(100_000_000),

  // How long a `!link` code minted by the website stays redeemable.
  LINK_CODE_TTL_MINUTES: z.coerce.number().int().positive().default(15),

  // Minutes before a spawn to fire the early-warning notification.
  SPAWN_WARNING_MINUTES: z.coerce.number().int().positive().default(5),

  // Scheduler tick interval. The dedupe key (notification_history.dedupe_key,
  // UNIQUE) is what actually prevents double-sends, so a fast tick is safe.
  SCHEDULER_INTERVAL_SECONDS: z.coerce.number().int().positive().default(30),

  // How often the guild CP report posts. Must divide 24 evenly, since the
  // dedupe bucket is derived from the UTC hour — otherwise the last window of
  // each day would be short and could double-post across midnight.
  CP_REPORT_INTERVAL_HOURS: z.coerce
    .number()
    .int()
    .positive()
    .max(24)
    .refine((hours) => 24 % hours === 0, {
      message: "CP_REPORT_INTERVAL_HOURS must divide 24 evenly (1, 2, 3, 4, 6, 8, 12 or 24)",
    })
    .default(12),

  // Set false to run the bot without any scheduled notifications — useful when
  // running a second instance for development against the same database.
  SCHEDULER_ENABLED: z
    .preprocess((v) => (v === "false" || v === "0" ? false : v === "true" || v === "1" ? true : v), z.boolean())
    .default(true),

  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),

  // ─── OCR (screenshot CP scanning) ──────────────
  // Where tesseract caches its ~15MB language data. Must be writable; if it
  // isn't persisted, every cold start re-downloads it.
  OCR_CACHE_PATH: z.string().default("/tmp/tesseract"),
  // Hard cap on a downloaded screenshot. Discord allows up to 25MB (more with
  // Nitro); OCR on anything that large is slow and pointless for a HUD grab.
  OCR_MAX_IMAGE_BYTES: z.coerce.number().int().positive().default(8 * 1024 * 1024),
  // Bound on both the attachment download and recognition itself.
  OCR_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  // Below this OCR confidence a scan is flagged for officer review (not rejected).
  OCR_MIN_CONFIDENCE: z.coerce.number().min(0).max(1).default(0.6),
  // Single-update CP growth above this fraction is flagged (0.3 = +30%).
  CP_MAX_GROWTH_RATIO: z.coerce.number().positive().default(0.3),

  // ─── Rate limiting ─────────────────────────────
  // Per-user command budget.
  RATE_LIMIT_COMMANDS_PER_MIN: z.coerce.number().int().positive().default(20),
  // OCR is CPU-heavy and serialized behind one worker — budgeted separately and
  // far more tightly, or one member could starve the whole guild's scans.
  RATE_LIMIT_SCANS_PER_HOUR: z.coerce.number().int().positive().default(10),
});

function validateEnv() {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    // The bot is a long-lived process, not a request handler — fail loudly at
    // boot rather than surfacing a confusing error on the first command.
    const formatted = JSON.stringify(result.error.format(), null, 2);
    throw new Error(`Invalid bot environment variables:\n${formatted}`);
  }
  return result.data;
}

export const env = validateEnv();
export type BotEnv = z.infer<typeof envSchema>;
