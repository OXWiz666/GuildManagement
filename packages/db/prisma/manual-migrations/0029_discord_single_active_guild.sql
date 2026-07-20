-- Enforce one active Discord server per ForgeKeep guild.
--
-- `discord_guild_id` is already globally unique, so one Discord server cannot
-- point at multiple ForgeKeep guilds. This closes the reverse direction: a
-- ForgeKeep guild may have many historical/inactive bindings, but only one
-- active Discord server at a time.

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY guild_id
      ORDER BY updated_at DESC, created_at DESC, id DESC
    ) AS rn
  FROM discord_servers
  WHERE is_active = true
)
UPDATE discord_servers ds
SET is_active = false,
    updated_at = CURRENT_TIMESTAMP
FROM ranked
WHERE ds.id = ranked.id
  AND ranked.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS "discord_servers_active_guild_id_key"
  ON "discord_servers"("guild_id")
  WHERE "is_active" = true;
