-- Factionwide System, Phase 2 (Faction Inventory):
--   - faction_inventory_items: centralized item catalog shared across a
--     faction's member guilds (current/reserved/distributed quantities;
--     available is computed at read time, not stored).
--   - faction_inventory_transactions: append-only ledger, snapshotting
--     previous/new quantity per write. Never mutated after creation —
--     corrections are new ADJUSTMENT/REVERSAL rows.
--   - faction_inventory_requests: a guild asking the faction pool for
--     items (SUBMITTED -> APPROVED/REJECTED -> DISTRIBUTED).

-- CreateEnum
CREATE TYPE "FactionInventoryTransactionType" AS ENUM ('GUILD_CONTRIBUTION', 'MANUAL_ADDITION', 'DISTRIBUTION', 'RESERVATION', 'RESERVATION_RELEASE', 'ADJUSTMENT', 'REVERSAL');

-- CreateEnum
CREATE TYPE "FactionInventoryApprovalStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "FactionInventoryRequestPriority" AS ENUM ('NORMAL', 'IMPORTANT', 'URGENT', 'CRITICAL');

-- CreateEnum
CREATE TYPE "FactionInventoryRequestStatus" AS ENUM ('SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'DISTRIBUTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "faction_inventory_items" (
    "id" TEXT NOT NULL,
    "faction_id" TEXT NOT NULL,
    "item_name" TEXT NOT NULL,
    "item_icon" TEXT,
    "category" TEXT NOT NULL,
    "rarity" TEXT,
    "description" TEXT,
    "current_quantity" INTEGER NOT NULL DEFAULT 0,
    "reserved_quantity" INTEGER NOT NULL DEFAULT 0,
    "distributed_quantity" INTEGER NOT NULL DEFAULT 0,
    "unit_value_cents" INTEGER,
    "storage_location" TEXT,
    "batch_number" TEXT,
    "expiration_date" TIMESTAMP(3),
    "min_stock_threshold" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "faction_inventory_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "faction_inventory_transactions" (
    "id" TEXT NOT NULL,
    "faction_id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "source_guild_id" TEXT,
    "destination_guild_id" TEXT,
    "quantity" INTEGER NOT NULL,
    "previous_quantity" INTEGER NOT NULL,
    "new_quantity" INTEGER NOT NULL,
    "transaction_type" "FactionInventoryTransactionType" NOT NULL,
    "reference_number" TEXT,
    "reason" TEXT,
    "evidence_url" TEXT,
    "requested_by_user_id" TEXT NOT NULL,
    "approved_by_user_id" TEXT,
    "approval_status" "FactionInventoryApprovalStatus" NOT NULL DEFAULT 'APPROVED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approved_at" TIMESTAMP(3),

    CONSTRAINT "faction_inventory_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "faction_inventory_requests" (
    "id" TEXT NOT NULL,
    "faction_id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "requesting_guild_id" TEXT NOT NULL,
    "requested_by_user_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "purpose" TEXT,
    "priority" "FactionInventoryRequestPriority" NOT NULL DEFAULT 'NORMAL',
    "required_date" TIMESTAMP(3),
    "evidence_url" TEXT,
    "status" "FactionInventoryRequestStatus" NOT NULL DEFAULT 'SUBMITTED',
    "reviewer_id" TEXT,
    "approval_notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "faction_inventory_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "faction_inventory_items_faction_id_status_idx" ON "faction_inventory_items"("faction_id", "status");

-- CreateIndex
CREATE INDEX "faction_inventory_items_faction_id_category_idx" ON "faction_inventory_items"("faction_id", "category");

-- CreateIndex
CREATE INDEX "faction_inventory_transactions_faction_id_item_id_created_a_idx" ON "faction_inventory_transactions"("faction_id", "item_id", "created_at");

-- CreateIndex
CREATE INDEX "faction_inventory_transactions_faction_id_approval_status_idx" ON "faction_inventory_transactions"("faction_id", "approval_status");

-- CreateIndex
CREATE INDEX "faction_inventory_requests_faction_id_status_idx" ON "faction_inventory_requests"("faction_id", "status");

-- CreateIndex
CREATE INDEX "faction_inventory_requests_requesting_guild_id_status_idx" ON "faction_inventory_requests"("requesting_guild_id", "status");

-- AddForeignKey
ALTER TABLE "faction_inventory_items" ADD CONSTRAINT "faction_inventory_items_faction_id_fkey" FOREIGN KEY ("faction_id") REFERENCES "factions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faction_inventory_transactions" ADD CONSTRAINT "faction_inventory_transactions_faction_id_fkey" FOREIGN KEY ("faction_id") REFERENCES "factions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faction_inventory_transactions" ADD CONSTRAINT "faction_inventory_transactions_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "faction_inventory_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faction_inventory_requests" ADD CONSTRAINT "faction_inventory_requests_faction_id_fkey" FOREIGN KEY ("faction_id") REFERENCES "factions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faction_inventory_requests" ADD CONSTRAINT "faction_inventory_requests_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "faction_inventory_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faction_inventory_requests" ADD CONSTRAINT "faction_inventory_requests_requesting_guild_id_fkey" FOREIGN KEY ("requesting_guild_id") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
