-- Replaces the free-text "member categories" tagging system with per-guild
-- customizable display names for the fixed OFFICER/CORE_MEMBER/ELITE_MEMBER/
-- MEMBER rank tiers. Categories were unused in production (checked before
-- writing this migration: 1 category row, 0 members assigned) so dropping
-- the table is safe.

-- ── 1. Drop guild_members.category_id ────────────────────
ALTER TABLE "guild_members" DROP CONSTRAINT IF EXISTS "guild_members_category_id_fkey";
DROP INDEX IF EXISTS "guild_members_category_id_idx";
ALTER TABLE "guild_members" DROP COLUMN IF EXISTS "category_id";

-- ── 2. Drop guild_member_categories table ────────────────
DROP TABLE IF EXISTS "guild_member_categories";

-- ── 3. Add guild_settings.role_display_names ─────────────
ALTER TABLE "guild_settings" ADD COLUMN "role_display_names" JSONB NOT NULL DEFAULT '{}';
