-- Guild Storage — a vault of high-value drops (e.g. Clemantis → Legend
-- Weapon). While IN_STORAGE, leaders/officers can register the item into the
-- next market listing, or distribute it directly to a member (GUILD_SALE) or
-- via a DKP auction (GUILD_AUCTION). Purely additive — no existing table or
-- column is dropped or altered.

-- 1. guild_storage_items table
CREATE TABLE "guild_storage_items" (
    "id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "item_name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'LEGEND_WEAPON',
    "source_boss" TEXT,
    "rarity" TEXT NOT NULL DEFAULT 'LEGEND',
    "image_url" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'IN_STORAGE',
    "disposition" TEXT,
    "recipient_member_id" TEXT,
    "auction_item_id" TEXT,
    "added_by_id" TEXT NOT NULL,
    "resolved_by_id" TEXT,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "guild_storage_items_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "guild_storage_items" ADD CONSTRAINT "guild_storage_items_guild_id_fkey"
  FOREIGN KEY ("guild_id") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "guild_storage_items" ADD CONSTRAINT "guild_storage_items_recipient_member_id_fkey"
  FOREIGN KEY ("recipient_member_id") REFERENCES "guild_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "guild_storage_items_guild_id_status_idx"
  ON "guild_storage_items"("guild_id", "status");
