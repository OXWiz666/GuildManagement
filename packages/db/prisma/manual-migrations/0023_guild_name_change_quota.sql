-- Guild rename quota:
--   - Free guilds may rename once.
--   - Subscribed guilds may rename without a quota limit.

ALTER TABLE "guilds"
ADD COLUMN IF NOT EXISTS "name_change_count" INTEGER NOT NULL DEFAULT 0;
