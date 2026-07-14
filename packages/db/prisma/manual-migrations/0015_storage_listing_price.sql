-- Guild Storage: asking price captured when an item is registered into the
-- next market listing. Purely additive — nullable, no existing data affected.

ALTER TABLE "guild_storage_items" ADD COLUMN "listing_price" BIGINT;
