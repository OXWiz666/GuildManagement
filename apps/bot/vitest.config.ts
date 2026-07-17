import { defineConfig } from "vitest/config";

/**
 * Test environment.
 *
 * `@guild/core` validates its environment at import time (packages/core/src/
 * config/env.ts), and the bot imports it for the boss-kill service. That means
 * importing almost any bot module transitively demands DATABASE_URL, the JWT
 * secrets and the Supabase vars — even for a pure unit test of date math.
 *
 * These are throwaway values that satisfy the schema. Nothing here connects to
 * anything: unit tests exercise pure functions and injected fakes, never a real
 * database. The JWT secrets are dummy strings meeting the 32-char minimum, not
 * credentials.
 */
process.env["NODE_ENV"] ??= "test";
process.env["DATABASE_URL"] ??= "postgresql://test:test@localhost:5432/test";
process.env["DIRECT_URL"] ??= "postgresql://test:test@localhost:5432/test";
process.env["JWT_ACCESS_SECRET"] ??= "test-only-access-secret-not-a-real-key-000";
process.env["JWT_REFRESH_SECRET"] ??= "test-only-refresh-secret-not-a-real-key-00";
process.env["SUPABASE_URL"] ??= "https://test.supabase.co";
process.env["SUPABASE_KEY"] ??= "test-anon-key";

// Bot-specific vars (apps/bot/src/config/env.ts).
process.env["DISCORD_TOKEN"] ??= "test-token";
process.env["DISCORD_CLIENT_ID"] ??= "000000000000000000";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
