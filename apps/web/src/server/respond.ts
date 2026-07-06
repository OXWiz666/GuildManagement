import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { AppError, ValidationError } from "@guild/core";
import type { ApiResponse } from "@guild/shared";

// The Express API globally serialized BigInt via a `BigInt.prototype.toJSON`
// patch so services can return raw BigInt money fields (amounts are stored in
// cents as BigInt). Preserve that behavior — this module is imported by every
// route handler, so the patch is installed before any response is serialized.
(BigInt.prototype as unknown as { toJSON?: () => string }).toJSON = function () {
  return this.toString();
};

const isProd = process.env.NODE_ENV === "production";

/** Success envelope: `{ success: true, data }`. Mirrors the Express contract. */
export function ok<T>(data?: T, status = 200): NextResponse {
  return NextResponse.json({ success: true, data } satisfies ApiResponse<T>, {
    status,
  });
}

/** Empty success envelope (no data payload). */
export function okEmpty(status = 200): NextResponse {
  return NextResponse.json({ success: true } satisfies ApiResponse, { status });
}

/**
 * Maps a thrown error to the exact JSON envelope the Express global
 * errorHandler produced (ZodError → 422, AppError → its status, JWT → 401,
 * everything else → 500).
 */
export function toErrorResponse(err: unknown): NextResponse {
  if (isProd) {
    console.error("Error:", err instanceof Error ? err.message : err);
  } else {
    console.error("Error:", err);
  }

  // Zod validation errors → 422
  if (err instanceof ZodError) {
    return NextResponse.json(
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
      } satisfies ApiResponse,
      { status: 422 },
    );
  }

  // Our custom AppError subclasses
  if (err instanceof AppError) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: err.code,
          message: err.message,
          details: err instanceof ValidationError ? err.details : undefined,
        },
      } satisfies ApiResponse,
      { status: err.statusCode },
    );
  }

  // JWT errors
  const name = (err as { name?: string })?.name;
  if (name === "JsonWebTokenError" || name === "TokenExpiredError") {
    return NextResponse.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "Invalid or expired token" },
      } satisfies ApiResponse,
      { status: 401 },
    );
  }

  // Unknown/unexpected errors → 500
  const message =
    err instanceof Error && !isProd ? err.message : "An unexpected error occurred";
  return NextResponse.json(
    { success: false, error: { code: "INTERNAL_ERROR", message } } satisfies ApiResponse,
    { status: 500 },
  );
}

/**
 * Wraps a Route Handler so any thrown error is normalized to the standard
 * envelope — the Next.js equivalent of the Express error-handling middleware.
 * Handlers just `throw` AppError/ZodError and return `ok(...)` on success.
 */
export function withApi<TCtx = unknown>(
  handler: (req: NextRequest, ctx: TCtx) => Promise<NextResponse> | Promise<Response>,
): (req: NextRequest, ctx: TCtx) => Promise<Response> {
  return async (req, ctx) => {
    try {
      return await handler(req, ctx);
    } catch (err) {
      return toErrorResponse(err);
    }
  };
}
