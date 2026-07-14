import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { ZodError } from "zod";
import { AppError, ValidationError } from "@guild/core";

// The Express API globally serialized BigInt via a `BigInt.prototype.toJSON`
// patch so services can return raw BigInt money fields (amounts are stored in
// cents as BigInt). Preserve that behavior — this module is imported by the
// Hono app, so the patch is installed before any response is serialized. Hono's
// `c.json` uses `JSON.stringify`, which honors this `toJSON`.
(BigInt.prototype as unknown as { toJSON?: () => string }).toJSON = function () {
  return this.toString();
};

const isProd = process.env.NODE_ENV === "production";

/**
 * Success envelope: `{ success: true, data }`. Mirrors the Express/Next
 * contract. Returning through this helper keeps Hono RPC output inference
 * intact (it flows the `c.json` TypedResponse type through).
 */
export function ok<T>(c: Context, data: T, status: ContentfulStatusCode = 200) {
  return c.json({ success: true as const, data }, status);
}

/** Empty success envelope (`{ success: true }`), no data payload. */
export function okEmpty(c: Context, status: ContentfulStatusCode = 200) {
  return c.json({ success: true as const }, status);
}

/**
 * Global error handler — the Hono equivalent of `withApi` / `toErrorResponse`.
 * Reproduces the exact JSON envelope the previous route handlers produced
 * (ZodError → 422, AppError → its status, JWT → 401, else → 500), plus Hono's
 * own HTTPException (e.g. malformed JSON body) mapped into the same envelope.
 */
export function onError(err: Error, c: Context) {
  if (isProd) {
    console.error("Error:", err.message);
  } else {
    console.error("Error:", err);
  }

  // Zod validation errors → 422
  if (err instanceof ZodError) {
    return c.json(
      {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Validation failed",
          details: err.errors.map((e) => ({
            field: e.path.join("."),
            message: e.message,
          })),
        },
      },
      422,
    );
  }

  // Our custom AppError subclasses
  if (err instanceof AppError) {
    return c.json(
      {
        success: false,
        error: {
          code: err.code,
          message: err.message,
          details: err instanceof ValidationError ? err.details : undefined,
        },
      },
      err.statusCode as ContentfulStatusCode,
    );
  }

  // Hono HTTPException (e.g. malformed JSON body from a validator)
  if (err instanceof HTTPException) {
    return c.json(
      { success: false, error: { code: "BAD_REQUEST", message: err.message } },
      err.status,
    );
  }

  // JWT errors
  const name = (err as { name?: string })?.name;
  if (name === "JsonWebTokenError" || name === "TokenExpiredError") {
    return c.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "Invalid or expired token" } },
      401,
    );
  }

  // Unknown/unexpected errors → 500
  const message = !isProd ? err.message : "An unexpected error occurred";
  return c.json(
    { success: false, error: { code: "INTERNAL_ERROR", message } },
    500,
  );
}
