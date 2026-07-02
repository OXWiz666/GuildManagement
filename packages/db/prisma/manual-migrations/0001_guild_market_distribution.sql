-- AlterTable
ALTER TABLE "guild_settings" ADD COLUMN     "market_rules" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "guild_members" ADD COLUMN     "market_priority_reason" TEXT,
ADD COLUMN     "market_priority_seq" INTEGER;

-- CreateTable
CREATE TABLE "legendary_priority_requests" (
    "id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "current_gear" TEXT,
    "reason" TEXT,
    "priority_seq" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "officer_note" TEXT,
    "reviewed_by_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "legendary_priority_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_distributions" (
    "id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "form_type" TEXT NOT NULL,
    "rank_tier" TEXT,
    "ign_snapshot" TEXT,
    "class_snapshot" TEXT,
    "cp_snapshot" INTEGER,
    "points_snapshot" INTEGER,
    "priority_seq" INTEGER,
    "items" JSONB NOT NULL DEFAULT '{}',
    "note" TEXT,
    "distributed_by_id" TEXT NOT NULL,
    "overridden" BOOLEAN NOT NULL DEFAULT false,
    "override_reason" TEXT,
    "distributed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "item_distributions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "legendary_priority_requests_guild_id_status_idx" ON "legendary_priority_requests"("guild_id", "status");

-- CreateIndex
CREATE INDEX "legendary_priority_requests_member_id_idx" ON "legendary_priority_requests"("member_id");

-- CreateIndex
CREATE INDEX "item_distributions_guild_id_distributed_at_idx" ON "item_distributions"("guild_id", "distributed_at");

-- CreateIndex
CREATE INDEX "item_distributions_member_id_idx" ON "item_distributions"("member_id");

-- AddForeignKey
ALTER TABLE "legendary_priority_requests" ADD CONSTRAINT "legendary_priority_requests_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "legendary_priority_requests" ADD CONSTRAINT "legendary_priority_requests_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "guild_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_distributions" ADD CONSTRAINT "item_distributions_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_distributions" ADD CONSTRAINT "item_distributions_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "guild_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

