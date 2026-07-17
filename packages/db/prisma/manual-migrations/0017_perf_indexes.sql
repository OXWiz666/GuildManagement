-- Performance pass: composite indexes for hot query paths. Additive only.

-- requireActiveMember/requireOfficer-style checks filter guild_members by
-- (guild_id, is_active) on nearly every authenticated request.
CREATE INDEX IF NOT EXISTS "guild_members_guild_id_is_active_idx" ON "guild_members" ("guild_id", "is_active");

-- Dashboard "online members" check filters sessions by (user_id, last_active)
-- for every active guild member on every dashboard load.
CREATE INDEX IF NOT EXISTS "sessions_user_id_last_active_idx" ON "sessions" ("user_id", "last_active");
