ALTER TABLE "discord_servers"
  ADD COLUMN IF NOT EXISTS "ping_role_id" TEXT;
