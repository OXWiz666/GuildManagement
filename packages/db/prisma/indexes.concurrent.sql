-- ─────────────────────────────────────────────────────────────
-- Production-safe index creation (zero table locks)
-- ─────────────────────────────────────────────────────────────
-- This project uses `prisma db push`, which creates indexes with a
-- short-lived ACCESS EXCLUSIVE lock. On a large, live table that lock can
-- block writes. Run THIS script against production FIRST (it uses
-- CREATE INDEX CONCURRENTLY, which does not lock writes); afterwards
-- `prisma db push` becomes a no-op because the indexes already exist with
-- the names Prisma expects.
--
-- Notes:
--   * CONCURRENTLY cannot run inside a transaction block — run each
--     statement on its own (psql does this automatically when not wrapped
--     in BEGIN/COMMIT). Do NOT paste these into a single transaction.
--   * IF NOT EXISTS keeps the script idempotent.
--   * Index names match Prisma's default derivation so the ORM stays in sync.
-- ─────────────────────────────────────────────────────────────

-- Officer "pending verification" queue: WHERE session_id = ? AND status = 'PENDING'
CREATE INDEX CONCURRENTLY IF NOT EXISTS "attendance_records_session_id_status_idx"
  ON "attendance_records" ("session_id", "status");

-- Sold-item log: WHERE guild_id = ? ORDER BY created_at DESC
CREATE INDEX CONCURRENTLY IF NOT EXISTS "loot_sales_guild_id_created_at_idx"
  ON "loot_sales" ("guild_id", "created_at");
