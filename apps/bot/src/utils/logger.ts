import { env } from "../config/env.js";

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const;
type Level = keyof typeof LEVELS;

const threshold = LEVELS[env.LOG_LEVEL];

/**
 * Structured JSON logging. Fly.io ships stdout straight to its log aggregator,
 * where line-delimited JSON is queryable and free-text is not.
 */
function emit(level: Level, message: string, fields?: Record<string, unknown>) {
  if (LEVELS[level] < threshold) return;

  const line = JSON.stringify({
    level,
    message,
    time: new Date().toISOString(),
    ...fields,
  });

  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

/** Serialize an unknown throwable into loggable fields. */
export function errorFields(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return { err: error.message, errName: error.name, stack: error.stack };
  }
  return { err: String(error) };
}

export const logger = {
  debug: (message: string, fields?: Record<string, unknown>) => emit("debug", message, fields),
  info: (message: string, fields?: Record<string, unknown>) => emit("info", message, fields),
  warn: (message: string, fields?: Record<string, unknown>) => emit("warn", message, fields),
  error: (message: string, fields?: Record<string, unknown>) => emit("error", message, fields),

  /** Child logger that stamps every line with a fixed context (e.g. a command). */
  child(base: Record<string, unknown>) {
    return {
      debug: (m: string, f?: Record<string, unknown>) => emit("debug", m, { ...base, ...f }),
      info: (m: string, f?: Record<string, unknown>) => emit("info", m, { ...base, ...f }),
      warn: (m: string, f?: Record<string, unknown>) => emit("warn", m, { ...base, ...f }),
      error: (m: string, f?: Record<string, unknown>) => emit("error", m, { ...base, ...f }),
    };
  },
};

export type Logger = typeof logger;
