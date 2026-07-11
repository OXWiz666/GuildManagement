import type { NextRequest } from "next/server";
import { services } from "@guild/core";
import { resolveIdentifierSchema } from "@guild/shared";
import { withApi, ok } from "@/server/respond";
import { readJson } from "@/server/request";
import { authLimit } from "@/server/ratelimit";

export const runtime = "nodejs";

// Resolves a login identifier (username or email) to the real email address
// Supabase/the legacy login need — neither understands a bare username.
// Never reveals *why* an identifier didn't resolve (email: null covers both
// "no such username" and malformed input) to avoid leaking which usernames
// exist.
export const POST = withApi(async (req: NextRequest) => {
  authLimit(req);
  const { identifier } = resolveIdentifierSchema.parse(await readJson(req));
  const email = await services.auth.resolveLoginIdentifier(identifier);
  return ok({ email });
});
