import { handle } from "hono/vercel";
import { app } from "@/server/hono/app";

// Node runtime is mandatory: the pg pool (via @guild/db), JWT verification, and
// bcrypt all require Node APIs, not the Edge runtime.
export const runtime = "nodejs";

// Single catch-all mount for the whole Hono API. Replaced the 145 file-based
// route handlers under app/api/** after byte-for-byte parity was verified.
export const GET = handle(app);
export const POST = handle(app);
export const PUT = handle(app);
export const PATCH = handle(app);
export const DELETE = handle(app);
export const OPTIONS = handle(app);
export const HEAD = handle(app);
