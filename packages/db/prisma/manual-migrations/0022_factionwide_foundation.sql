-- Factionwide System, Phase 1 (Foundation):
--   - Faction status lifecycle (Active/Inactive/Suspended/Archived) + profile fields
--   - faction_guild_memberships: richer faction<->guild relationship record
--     (contribution requirement, assigned label, notes), alongside the
--     existing guilds.faction_id fast-path FK which is untouched.
--   - faction_role_assignments: Officer/Treasurer/Inventory Manager capability
--     grants, orthogonal to guild_members.role.
--   - faction_audit_logs: dedicated append-only faction-scoped audit trail.

-- CreateEnum
CREATE TYPE "FactionStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "FactionGuildStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'REMOVED', 'LEFT_FACTION');

-- CreateEnum
CREATE TYPE "FactionRoleType" AS ENUM ('OFFICER', 'TREASURER', 'INVENTORY_MANAGER');

-- AlterTable
ALTER TABLE "factions" ADD COLUMN     "banner_url" TEXT,
ADD COLUMN     "faction_code" TEXT,
ADD COLUMN     "game" TEXT,
ADD COLUMN     "region" TEXT,
ADD COLUMN     "server" TEXT,
ADD COLUMN     "status" "FactionStatus" NOT NULL DEFAULT 'ACTIVE';

-- CreateTable
CREATE TABLE "faction_guild_memberships" (
    "id" TEXT NOT NULL,
    "faction_id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "status" "FactionGuildStatus" NOT NULL DEFAULT 'ACTIVE',
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "contribution_requirement" TEXT,
    "assigned_faction_role" TEXT,
    "approved_by_user_id" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "faction_guild_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "faction_role_assignments" (
    "id" TEXT NOT NULL,
    "faction_id" TEXT NOT NULL,
    "guild_member_id" TEXT NOT NULL,
    "role" "FactionRoleType" NOT NULL,
    "granted_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "faction_role_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "faction_audit_logs" (
    "id" TEXT NOT NULL,
    "faction_id" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "actor_role" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity_type" TEXT,
    "entity_id" TEXT,
    "previous_value" JSONB,
    "new_value" JSONB,
    "reason" TEXT,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "faction_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "faction_guild_memberships_guild_id_idx" ON "faction_guild_memberships"("guild_id");

-- CreateIndex
CREATE INDEX "faction_guild_memberships_faction_id_status_idx" ON "faction_guild_memberships"("faction_id", "status");

-- CreateIndex
CREATE INDEX "faction_role_assignments_faction_id_role_idx" ON "faction_role_assignments"("faction_id", "role");

-- CreateIndex
CREATE UNIQUE INDEX "faction_role_assignments_guild_member_id_faction_id_role_key" ON "faction_role_assignments"("guild_member_id", "faction_id", "role");

-- CreateIndex
CREATE INDEX "faction_audit_logs_faction_id_created_at_idx" ON "faction_audit_logs"("faction_id", "created_at");

-- CreateIndex
CREATE INDEX "faction_audit_logs_action_idx" ON "faction_audit_logs"("action");

-- CreateIndex
CREATE INDEX "faction_audit_logs_entity_type_entity_id_idx" ON "faction_audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "factions_faction_code_key" ON "factions"("faction_code");

-- AddForeignKey
ALTER TABLE "faction_guild_memberships" ADD CONSTRAINT "faction_guild_memberships_faction_id_fkey" FOREIGN KEY ("faction_id") REFERENCES "factions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faction_guild_memberships" ADD CONSTRAINT "faction_guild_memberships_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faction_role_assignments" ADD CONSTRAINT "faction_role_assignments_faction_id_fkey" FOREIGN KEY ("faction_id") REFERENCES "factions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faction_role_assignments" ADD CONSTRAINT "faction_role_assignments_guild_member_id_fkey" FOREIGN KEY ("guild_member_id") REFERENCES "guild_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faction_audit_logs" ADD CONSTRAINT "faction_audit_logs_faction_id_fkey" FOREIGN KEY ("faction_id") REFERENCES "factions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faction_audit_logs" ADD CONSTRAINT "faction_audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
