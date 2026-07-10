-- Faction-scope BossRotation / BossLowRotation (previously one shared global
-- row each, leaking every guild's rotation state into every faction) and add
-- the Multi-Guild faction-join workflow (invite code + FactionJoinRequest).
--
-- NOT additive-only: this backfills existing global rotation data onto the
-- oldest faction (by created_at) and tightens columns to NOT NULL/unique.
-- Review before applying to production. Order matters — do not reorder.

-- ── 1. Faction invite codes ──────────────────────────────
ALTER TABLE "factions" ADD COLUMN "invite_code" TEXT;
UPDATE "factions" SET "invite_code" = upper(substr(md5(random()::text || id), 1, 8)) WHERE "invite_code" IS NULL;
ALTER TABLE "factions" ALTER COLUMN "invite_code" SET NOT NULL;
CREATE UNIQUE INDEX "factions_invite_code_key" ON "factions"("invite_code");

-- ── 2. BossRotation gains faction_id ──────────────────────
ALTER TABLE "boss_rotations" ADD COLUMN "faction_id" TEXT;
-- Backfill: every pre-existing rotation row is assigned to the OLDEST faction.
-- Every other faction intentionally ends up with zero BossRotation rows (a
-- clean slate) — there is nothing to insert for them here.
UPDATE "boss_rotations" SET "faction_id" = (SELECT "id" FROM "factions" ORDER BY "created_at" ASC LIMIT 1);
ALTER TABLE "boss_rotations" ALTER COLUMN "faction_id" SET NOT NULL;
ALTER TABLE "boss_rotations" ADD CONSTRAINT "boss_rotations_faction_id_fkey"
  FOREIGN KEY ("faction_id") REFERENCES "factions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "boss_rotations_faction_id_idx" ON "boss_rotations"("faction_id");
DROP INDEX IF EXISTS "boss_rotations_boss_name_key";
CREATE UNIQUE INDEX "boss_rotations_faction_id_boss_name_key" ON "boss_rotations"("faction_id", "boss_name");

-- ── 3. BossLowRotation: repoint singleton PK to the oldest faction ───────
ALTER TABLE "boss_low_rotations" ADD COLUMN "faction_id" TEXT;
UPDATE "boss_low_rotations" SET "faction_id" = (SELECT "id" FROM "factions" ORDER BY "created_at" ASC LIMIT 1) WHERE "id" = 'singleton';
-- Drop any row that couldn't be attributed (no factions exist yet) rather
-- than leaving a NULL faction_id primary key.
DELETE FROM "boss_low_rotations" WHERE "faction_id" IS NULL;
ALTER TABLE "boss_low_rotations" ALTER COLUMN "faction_id" SET NOT NULL;
ALTER TABLE "boss_low_rotations" DROP CONSTRAINT "boss_low_rotations_pkey";
ALTER TABLE "boss_low_rotations" DROP COLUMN "id";
ALTER TABLE "boss_low_rotations" ADD CONSTRAINT "boss_low_rotations_pkey" PRIMARY KEY ("faction_id");
ALTER TABLE "boss_low_rotations" ADD CONSTRAINT "boss_low_rotations_faction_id_fkey"
  FOREIGN KEY ("faction_id") REFERENCES "factions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── 4. FactionJoinRequest (Multi-Guild invite workflow) ───────────────
CREATE TABLE "faction_join_requests" (
    "id" TEXT NOT NULL,
    "faction_id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "invited_by_user_id" TEXT,
    "direction" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "responded_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "faction_join_requests_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "faction_join_requests" ADD CONSTRAINT "faction_join_requests_faction_id_fkey"
  FOREIGN KEY ("faction_id") REFERENCES "factions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "faction_join_requests" ADD CONSTRAINT "faction_join_requests_guild_id_fkey"
  FOREIGN KEY ("guild_id") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "faction_join_requests" ADD CONSTRAINT "faction_join_requests_invited_by_user_id_fkey"
  FOREIGN KEY ("invited_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "faction_join_requests_guild_id_idx" ON "faction_join_requests"("guild_id");
CREATE INDEX "faction_join_requests_faction_id_status_idx" ON "faction_join_requests"("faction_id", "status");
-- Defense-in-depth: a guild can have at most one PENDING request at a time,
-- across all factions (Prisma's schema can't express a partial unique index).
CREATE UNIQUE INDEX "faction_join_requests_one_pending_per_guild"
  ON "faction_join_requests"("guild_id") WHERE "status" = 'PENDING';
