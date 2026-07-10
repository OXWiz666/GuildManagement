-- Factions: a group of guilds led by a Faction Leader.
-- Additive only — safe to apply to production. (Or run `prisma db push`.)

-- ── Faction table ────────────────────────────────────────
CREATE TABLE "factions" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "avatar_url" TEXT,
    "leader_user_id" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "factions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "factions_slug_key" ON "factions"("slug");
CREATE INDEX "factions_leader_user_id_idx" ON "factions"("leader_user_id");
ALTER TABLE "factions" ADD CONSTRAINT "factions_leader_user_id_fkey"
  FOREIGN KEY ("leader_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Guilds belong to an optional faction ─────────────────
ALTER TABLE "guilds" ADD COLUMN "faction_id" TEXT;
CREATE INDEX "guilds_faction_id_idx" ON "guilds"("faction_id");
ALTER TABLE "guilds" ADD CONSTRAINT "guilds_faction_id_fkey"
  FOREIGN KEY ("faction_id") REFERENCES "factions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
