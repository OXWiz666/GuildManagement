-- Phases 2–4: User/Guild moderation, login history, and the billing layer.
-- Additive only — safe to apply to production. (Or run `prisma db push`.)

-- ── Phase 2: User moderation ─────────────────────────────
ALTER TABLE "users"
  ADD COLUMN "email_verified_at" TIMESTAMP(3),
  ADD COLUMN "banned_at" TIMESTAMP(3),
  ADD COLUMN "suspended_until" TIMESTAMP(3),
  ADD COLUMN "deleted_at" TIMESTAMP(3);

-- ── Phase 3: Guild moderation ────────────────────────────
ALTER TABLE "guilds"
  ADD COLUMN "suspended_at" TIMESTAMP(3),
  ADD COLUMN "deleted_at" TIMESTAMP(3);

-- ── Phase 2: Login events ────────────────────────────────
CREATE TABLE "login_events" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "email" TEXT,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "country" TEXT,
    "device" TEXT,
    "browser" TEXT,
    "os" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "login_events_user_id_created_at_idx" ON "login_events"("user_id", "created_at");
CREATE INDEX "login_events_created_at_idx" ON "login_events"("created_at");
ALTER TABLE "login_events" ADD CONSTRAINT "login_events_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── Phase 4: Billing enums ───────────────────────────────
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'PAUSED', 'CANCELLED', 'EXPIRED');
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'REFUNDED', 'CHARGEBACK');
CREATE TYPE "PaymentGatewayType" AS ENUM ('STRIPE', 'PAYMONGO', 'XENDIT', 'PAYPAL', 'GCASH', 'MAYA', 'MANUAL');
CREATE TYPE "CouponType" AS ENUM ('PERCENT', 'FIXED', 'FREE_TRIAL');
CREATE TYPE "BillingInterval" AS ENUM ('MONTHLY', 'YEARLY');

-- ── Phase 4: Billing tables ──────────────────────────────
CREATE TABLE "subscription_plans" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "monthly_price" INTEGER NOT NULL,
    "yearly_price" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'PHP',
    "limits" JSONB NOT NULL DEFAULT '{}',
    "features" JSONB NOT NULL DEFAULT '{}',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "subscription_plans_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'TRIALING',
    "interval" "BillingInterval" NOT NULL DEFAULT 'MONTHLY',
    "current_period_end" TIMESTAMP(3),
    "cancel_at" TIMESTAMP(3),
    "gateway" "PaymentGatewayType" NOT NULL DEFAULT 'MANUAL',
    "external_id" TEXT,
    "coupon_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "subscriptions_guild_id_idx" ON "subscriptions"("guild_id");
CREATE INDEX "subscriptions_status_idx" ON "subscriptions"("status");

CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "subscription_id" TEXT,
    "guild_id" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'PHP',
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "gateway" "PaymentGatewayType" NOT NULL,
    "external_id" TEXT,
    "failure_reason" TEXT,
    "refunded_amount" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "payments_guild_id_idx" ON "payments"("guild_id");
CREATE INDEX "payments_status_idx" ON "payments"("status");

CREATE TABLE "payment_events" (
    "id" TEXT NOT NULL,
    "payment_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "data" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "payment_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "payment_events_payment_id_idx" ON "payment_events"("payment_id");

CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "subscription_id" TEXT,
    "payment_id" TEXT,
    "guild_id" TEXT NOT NULL,
    "subtotal" INTEGER NOT NULL,
    "tax_amount" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'PHP',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "pdf_url" TEXT,
    "issued_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "invoices_number_key" ON "invoices"("number");
CREATE UNIQUE INDEX "invoices_payment_id_key" ON "invoices"("payment_id");
CREATE INDEX "invoices_guild_id_idx" ON "invoices"("guild_id");

CREATE TABLE "coupons" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" "CouponType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT,
    "max_uses" INTEGER,
    "used_count" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMP(3),
    "restrictions" JSONB NOT NULL DEFAULT '{}',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "coupons_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "coupons_code_key" ON "coupons"("code");

-- Foreign keys
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_guild_id_fkey"
  FOREIGN KEY ("guild_id") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_fkey"
  FOREIGN KEY ("plan_id") REFERENCES "subscription_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_subscription_id_fkey"
  FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_payment_id_fkey"
  FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_subscription_id_fkey"
  FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_payment_id_fkey"
  FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
