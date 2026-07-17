-- Recurring activities: WEEKLY | BIWEEKLY | MONTHLY, or NULL for one-off. Additive only.

ALTER TABLE "guild_activities" ADD COLUMN "repeat_interval" TEXT;
