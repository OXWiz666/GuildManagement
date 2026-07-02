import type { Request, Response, NextFunction } from "express";

// Requests slower than this (ms) get a WARN log so latency regressions surface
// without drowning logs in normal traffic. Override via SLOW_REQUEST_MS.
const SLOW_REQUEST_MS = Number(process.env["SLOW_REQUEST_MS"] ?? 750);

/**
 * Per-endpoint latency monitoring. Records wall-clock duration for every API
 * request, attaches an `X-Response-Time` header, and logs slow requests as
 * warnings so they can be tracked in production observability tooling.
 *
 * Intentionally dependency-free and allocation-light so it can sit in front of
 * every route without measurable overhead.
 */
export function performanceMonitor(req: Request, res: Response, next: NextFunction): void {
  const start = process.hrtime.bigint();
  const elapsedMs = () => Number(process.hrtime.bigint() - start) / 1_000_000;

  // Stamp the response-time header just before headers flush (writeHead fires
  // before the body is sent, so the header is still mutable here).
  const originalWriteHead = res.writeHead.bind(res);
  (res as Response).writeHead = function patchedWriteHead(this: Response, ...args: unknown[]) {
    if (!this.headersSent) {
      this.setHeader("X-Response-Time", `${elapsedMs().toFixed(1)}ms`);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (originalWriteHead as any)(...args);
  } as Response["writeHead"];

  res.on("finish", () => {
    const durationMs = elapsedMs();
    const line = `${req.method} ${req.originalUrl} → ${res.statusCode} in ${durationMs.toFixed(1)}ms`;

    if (durationMs >= SLOW_REQUEST_MS) {
      console.warn(`[Perf][SLOW] ${line}`);
    } else if (res.statusCode >= 500) {
      console.error(`[Perf][5xx] ${line}`);
    }
  });

  next();
}
