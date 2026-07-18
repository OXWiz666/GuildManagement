-- Application review/read paths:
--   - current user's pending request: user_id + status
--   - guild officer review queue: guild_id + status ordered newest-first

CREATE INDEX "guild_join_requests_user_id_status_idx"
  ON "guild_join_requests"("user_id", "status");

CREATE INDEX "guild_join_requests_guild_id_status_created_at_idx"
  ON "guild_join_requests"("guild_id", "status", "created_at");
