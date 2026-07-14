import type { JwtPayload } from "@guild/shared";
import type { GuildMember, PlatformAdmin } from "@guild/db";

/**
 * Hono context environment for the API. Middleware populates these via
 * `c.set(...)`; handlers read them with `c.get(...)`. Mirrors what the Express
 * middleware attached to `req` (user / membership / admin).
 */
export type AppEnv = {
  Variables: {
    user: JwtPayload;
    membership: GuildMember;
    admin: PlatformAdmin;
  };
};
