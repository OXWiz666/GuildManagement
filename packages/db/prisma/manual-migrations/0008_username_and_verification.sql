-- Adds a unique `username` login identifier (alternative to email) and
-- grandfathers existing legacy-password accounts as verified so enforcing
-- email verification on the legacy login path doesn't lock anyone out who
-- was already working before this change.
--
-- Not additive-only: backfills every existing user with a generated username
-- and tightens the column to NOT NULL + UNIQUE. Review before applying.

-- ── 1. username column + per-row unique backfill ─────────────────
ALTER TABLE "users" ADD COLUMN "username" TEXT;

DO $$
DECLARE
  r RECORD;
  base_username TEXT;
  candidate TEXT;
  suffix INT;
BEGIN
  FOR r IN SELECT id, display_name FROM "users" WHERE "username" IS NULL ORDER BY created_at LOOP
    base_username := lower(regexp_replace(r.display_name, '[^a-zA-Z0-9]', '', 'g'));
    IF base_username IS NULL OR base_username = '' THEN
      base_username := 'user';
    END IF;
    IF base_username !~ '^[a-z]' THEN
      base_username := 'u' || base_username;
    END IF;
    base_username := substr(base_username, 1, 16);

    candidate := base_username;
    suffix := 0;
    WHILE EXISTS (SELECT 1 FROM "users" WHERE "username" = candidate) LOOP
      suffix := suffix + 1;
      candidate := substr(base_username, 1, 16) || suffix::text;
    END LOOP;

    UPDATE "users" SET "username" = candidate WHERE id = r.id;
  END LOOP;
END $$;

ALTER TABLE "users" ALTER COLUMN "username" SET NOT NULL;
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- ── 2. Grandfather existing legacy-password accounts as verified ──────────
-- These accounts predate any confirmation step (Supabase-created accounts
-- already have their own confirmation enforced separately via auth.users).
-- Only accounts created AFTER this migration will require real verification
-- on the legacy login path.
UPDATE "users" SET "email_verified_at" = "created_at"
WHERE "password_hash" != '' AND "email_verified_at" IS NULL;
