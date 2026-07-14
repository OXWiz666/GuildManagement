-- Leader's Panel "Register Activity" — customizable catalog of point-earning
-- activities (Boss, PVP, Guild Boss, ...) each with a base point value and a
-- per-rank multiplier keyed by the 4 customizable role bands (OFFICER /
-- CORE_MEMBER / ELITE_MEMBER / MEMBER). Purely additive — no existing
-- table/column is dropped or altered.

ALTER TABLE "guild_settings"
  ADD COLUMN "activity_point_rules" JSONB NOT NULL DEFAULT '{}';
