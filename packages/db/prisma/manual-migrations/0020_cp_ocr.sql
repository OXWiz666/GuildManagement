-- CP screenshot scanning (OCR) — purely additive.
--
-- A screenshot is trivially editable, so a scanned CP carries provenance the
-- typed `!cp <value>` path doesn't need: the image it came from, how confident
-- the OCR was, and whether the jump looked implausible. Officers review flagged
-- rows after the fact; the member still gets an instant update.

-- ═══════════════════════════════════════════════════
-- COMBAT POWER HISTORY — OCR provenance
-- `source` already distinguishes DISCORD | WEB | SYSTEM; OCR scans record
-- 'DISCORD_OCR' so a typed value and a scanned one are never conflated.
-- ═══════════════════════════════════════════════════

-- Discord CDN attachment URL. NOTE: Discord signs attachment URLs and they
-- expire (~24h), so this supports near-term officer review — which is the
-- actual use case — not permanent forensics. Re-hosting every screenshot to
-- Supabase storage would make it durable at the cost of unbounded growth;
-- deliberately not done until someone asks for it.
ALTER TABLE "combat_power_history" ADD COLUMN "image_url" TEXT;

-- Page-level OCR confidence, 0..1. Null for typed (non-OCR) updates.
ALTER TABLE "combat_power_history" ADD COLUMN "ocr_confidence" DOUBLE PRECISION;

-- Set when the scan looked suspicious (implausible jump / low confidence /
-- IGN mismatch). The update still applies — this marks it for review.
ALTER TABLE "combat_power_history" ADD COLUMN "flagged" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "combat_power_history" ADD COLUMN "flag_reason" TEXT;

-- Officer review queue: "flagged rows in this guild, newest first". Partial so
-- the index stays small — the overwhelming majority of rows are never flagged.
CREATE INDEX "combat_power_history_flagged_idx"
  ON "combat_power_history"("guild_id", "created_at" DESC) WHERE "flagged" = true;

-- ═══════════════════════════════════════════════════
-- GUILD SETTINGS — character class catalog
-- `guild_members.class` is free text and there is no canonical class list in
-- the codebase, so OCR class detection matches against (a) the distinct values
-- already present on the guild's members and (b) this optional override list.
-- Shape: string[] e.g. ["Destroyer", "Hunter", "Mage"]
-- ═══════════════════════════════════════════════════
ALTER TABLE "guild_settings"
  ADD COLUMN "character_classes" JSONB NOT NULL DEFAULT '[]';
