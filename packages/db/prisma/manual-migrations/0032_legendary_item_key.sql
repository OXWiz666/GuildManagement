-- Legendary Priority: optional specific item within the category — e.g. a
-- WEAPON request for "greatSword", a LEGEND_ACCESSORIES request for "ring".
-- Key values come from the shared WEAPON_TYPES / ACCESSORY_PIECES catalogs;
-- display labels resolve client-side via WISHLIST_LABELS.

ALTER TABLE "legendary_priority_requests" ADD COLUMN IF NOT EXISTS "item_key" TEXT;
