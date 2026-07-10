-- Member-owned payment QR codes (GCash, Maya, etc.), shown to whoever needs
-- to pay them. Stored as a JSON array on the user row — no new table needed.
-- Additive only — safe to apply to production. (Or run `prisma db push`.)

ALTER TABLE "users" ADD COLUMN "payment_methods" JSONB NOT NULL DEFAULT '[]';
