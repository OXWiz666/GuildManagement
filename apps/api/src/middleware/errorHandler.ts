import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { AppError, ValidationError } from "../utils/errors";
import { env } from "../config/env";
import type { ApiResponse } from "@guild/shared";

/**
 * Global error handler middleware.
 * Catches all errors thrown in routes/middleware and returns a consistent JSON envelope.
 * Never leaks stack traces in production.
 */
export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  // Log the error (always)
  if (env.NODE_ENV === "development") {
    console.error(" Error:", err);
  } else {
    console.error(" Error:", err.message);
  }

  // Zod validation errors → 422
  if (err instanceof ZodError) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Validation failed",
        details: err.errors.map((e) => ({
          field: e.path.join("."),
          message: e.message,
        })),
      },
    };
    res.status(422).json(response);
    return;
  }

  // Our custom AppError subclasses
  if (err instanceof AppError) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: err.code,
        message: err.message,
        details:
          err instanceof ValidationError ? err.details : undefined,
      },
    };
    res.status(err.statusCode).json(response);
    return;
  }

  // JWT errors
  const jwtErr = err as { name?: string };
  if (
    jwtErr.name === "JsonWebTokenError" ||
    jwtErr.name === "TokenExpiredError"
  ) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: "UNAUTHORIZED",
        message: "Invalid or expired token",
      },
    };
    res.status(401).json(response);
    return;
  }

  // Unknown/unexpected errors → 500
  const response: ApiResponse = {
    success: false,
    error: {
      code: "INTERNAL_ERROR",
      message:
        env.NODE_ENV === "production"
          ? "An unexpected error occurred"
          : err.message,
    },
  };
  res.status(500).json(response);
}
