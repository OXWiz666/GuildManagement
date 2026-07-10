-- Mount wishlist: leader-defined catalog of available mounts (with max
-- distribution slots) + a record of each mount distributed to a member.
-- Wishlist item status lives in the existing GuildMember.market_wishlist JSON
-- blob, so no column changes are needed there.
-- Additive only — safe to apply to production. (Or run `prisma db push`.)

-- ── Guild mount catalog ──────────────────────────────────
CREATE TABLE "guild_mounts" (
    "id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon_url" TEXT,
    "max_slots" INTEGER NOT NULL DEFAULT 1,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "guild_mounts_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "guild_mounts_guild_id_idx" ON "guild_mounts"("guild_id");
ALTER TABLE "guild_mounts" ADD CONSTRAINT "guild_mounts_guild_id_fkey"
  FOREIGN KEY ("guild_id") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Mount distributions (consume a slot each) ────────────
CREATE TABLE "mount_distributions" (
    "id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "mount_id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "ign_snapshot" TEXT,
    "mount_name_snapshot" TEXT,
    "note" TEXT,
    "distributed_by_id" TEXT NOT NULL,
    "distributed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "mount_distributions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "mount_distributions_guild_id_distributed_at_idx" ON "mount_distributions"("guild_id", "distributed_at");
CREATE INDEX "mount_distributions_mount_id_idx" ON "mount_distributions"("mount_id");
CREATE INDEX "mount_distributions_member_id_idx" ON "mount_distributions"("member_id");
ALTER TABLE "mount_distributions" ADD CONSTRAINT "mount_distributions_guild_id_fkey"
  FOREIGN KEY ("guild_id") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "mount_distributions" ADD CONSTRAINT "mount_distributions_mount_id_fkey"
  FOREIGN KEY ("mount_id") REFERENCES "guild_mounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "mount_distributions" ADD CONSTRAINT "mount_distributions_member_id_fkey"
  FOREIGN KEY ("member_id") REFERENCES "guild_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;
