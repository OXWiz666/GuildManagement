-- Boss Commitments — pre-fight headcount. A member marks themselves as able
-- to participate in a SPECIFIC upcoming boss spawn (one row per live
-- BossSchedule instance), so leaders can gauge war-readiness turnout before
-- the boss is even taken. Distinct from AttendanceRecord, which confirms who
-- actually showed up AFTER a kill is logged. Purely additive.

CREATE TABLE "boss_commitments" (
    "id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "schedule_id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "boss_commitments_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "boss_commitments" ADD CONSTRAINT "boss_commitments_guild_id_fkey"
  FOREIGN KEY ("guild_id") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "boss_commitments" ADD CONSTRAINT "boss_commitments_schedule_id_fkey"
  FOREIGN KEY ("schedule_id") REFERENCES "boss_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "boss_commitments" ADD CONSTRAINT "boss_commitments_member_id_fkey"
  FOREIGN KEY ("member_id") REFERENCES "guild_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "boss_commitments_schedule_id_member_id_key"
  ON "boss_commitments"("schedule_id", "member_id");

CREATE INDEX "boss_commitments_guild_id_schedule_id_idx"
  ON "boss_commitments"("guild_id", "schedule_id");
