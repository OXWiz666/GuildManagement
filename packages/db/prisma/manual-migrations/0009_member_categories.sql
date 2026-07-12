-- Customizable, guild-defined member categories (a tagging layer on top of the
-- fixed GuildRole hierarchy). A Guild Leader creates categories and assigns one
-- to each member; nothing downstream (market/distribution/boss rotation) reads
-- these, so this migration is purely additive and safe to apply to production.

-- ── 1. guild_member_categories table ─────────────────────
CREATE TABLE "guild_member_categories" (
    "id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT 'slate',
    "description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "guild_member_categories_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "guild_member_categories" ADD CONSTRAINT "guild_member_categories_guild_id_fkey"
  FOREIGN KEY ("guild_id") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "guild_member_categories_guild_id_idx" ON "guild_member_categories"("guild_id");
-- Category names are unique within a guild.
CREATE UNIQUE INDEX "guild_member_categories_guild_id_name_key"
  ON "guild_member_categories"("guild_id", "name");

-- ── 2. guild_members.category_id ─────────────────────────
ALTER TABLE "guild_members" ADD COLUMN "category_id" TEXT;
ALTER TABLE "guild_members" ADD CONSTRAINT "guild_members_category_id_fkey"
  FOREIGN KEY ("category_id") REFERENCES "guild_member_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "guild_members_category_id_idx" ON "guild_members"("category_id");
