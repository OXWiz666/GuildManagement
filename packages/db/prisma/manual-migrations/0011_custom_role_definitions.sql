-- Guild-defined custom rank names that fully inherit the permissions of one
-- of the four customizable GuildRole tiers ("band" — OFFICER/CORE_MEMBER/
-- ELITE_MEMBER/MEMBER). A member holding a custom role always has `role`
-- set to that band's literal enum value, so every existing RBAC check keeps
-- working unmodified; `custom_role_id` only drives display (name + color).
-- Purely additive — no existing table/column is dropped or altered.

-- 1. guild_role_definitions table
CREATE TABLE "guild_role_definitions" (
    "id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT 'slate',
    "band" "GuildRole" NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "guild_role_definitions_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "guild_role_definitions" ADD CONSTRAINT "guild_role_definitions_guild_id_fkey"
  FOREIGN KEY ("guild_id") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "guild_role_definitions_guild_id_idx" ON "guild_role_definitions"("guild_id");
CREATE UNIQUE INDEX "guild_role_definitions_guild_id_name_key"
  ON "guild_role_definitions"("guild_id", "name");

-- Defense in depth: the GuildRole Postgres enum still technically permits
-- ADMIN/FACTION_LEADER/GUILD_LEADER, but a custom role's band must never be
-- one of those structural roles. App-layer validation enforces this too.
ALTER TABLE "guild_role_definitions" ADD CONSTRAINT "guild_role_definitions_band_check"
  CHECK ("band" IN ('OFFICER', 'CORE_MEMBER', 'ELITE_MEMBER', 'MEMBER'));

-- 2. guild_members.custom_role_id
ALTER TABLE "guild_members" ADD COLUMN "custom_role_id" TEXT;
ALTER TABLE "guild_members" ADD CONSTRAINT "guild_members_custom_role_id_fkey"
  FOREIGN KEY ("custom_role_id") REFERENCES "guild_role_definitions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "guild_members_custom_role_id_idx" ON "guild_members"("custom_role_id");
