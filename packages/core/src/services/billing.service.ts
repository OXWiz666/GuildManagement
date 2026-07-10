import { prisma } from "@guild/db";
import { writeAuditLog } from "./audit.service";
import { NotFoundError, BadRequestError } from "../utils/errors";

// ─── Billing (Phase 4) ───────────────────────────────────────────────
// Plans, subscriptions, payments, coupons. Money = integer minor units.
// Gateway integrations (Stripe et al.) land in Phase 5; payments here are MANUAL.

const ACTIVE_SUB_STATES = ["TRIALING", "ACTIVE", "PAST_DUE"] as const;

// ── Plans ──
export async function listPlans() {
  const plans = await prisma.subscriptionPlan.findMany({
    orderBy: [{ sortOrder: "asc" }, { monthlyPrice: "asc" }],
    include: { _count: { select: { subscriptions: true } } },
  });
  return plans.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    monthlyPrice: p.monthlyPrice,
    yearlyPrice: p.yearlyPrice,
    currency: p.currency,
    limits: p.limits,
    features: p.features,
    isActive: p.isActive,
    sortOrder: p.sortOrder,
    subscriberCount: p._count.subscriptions,
  }));
}

export async function createPlan(
  actorId: string,
  input: {
    name: string;
    description?: string;
    monthlyPrice: number;
    yearlyPrice: number;
    currency?: string;
    limits?: Record<string, unknown>;
    features?: Record<string, unknown>;
    sortOrder?: number;
  },
) {
  const plan = await prisma.subscriptionPlan.create({
    data: {
      name: input.name,
      description: input.description ?? null,
      monthlyPrice: input.monthlyPrice,
      yearlyPrice: input.yearlyPrice,
      currency: input.currency ?? "PHP",
      limits: (input.limits ?? {}) as object,
      features: (input.features ?? {}) as object,
      sortOrder: input.sortOrder ?? 0,
    },
  });
  await writeAuditLog({
    actorId,
    action: "ADMIN_PLAN_CREATED",
    target: "SubscriptionPlan",
    targetId: plan.id,
    detail: { name: plan.name },
  });
  return plan;
}

export async function updatePlan(
  actorId: string,
  planId: string,
  input: Partial<{
    name: string;
    description: string | null;
    monthlyPrice: number;
    yearlyPrice: number;
    currency: string;
    limits: Record<string, unknown>;
    features: Record<string, unknown>;
    isActive: boolean;
    sortOrder: number;
  }>,
) {
  const existing = await prisma.subscriptionPlan.findUnique({ where: { id: planId } });
  if (!existing) throw new NotFoundError("Plan not found");
  const plan = await prisma.subscriptionPlan.update({
    where: { id: planId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.monthlyPrice !== undefined ? { monthlyPrice: input.monthlyPrice } : {}),
      ...(input.yearlyPrice !== undefined ? { yearlyPrice: input.yearlyPrice } : {}),
      ...(input.currency !== undefined ? { currency: input.currency } : {}),
      ...(input.limits !== undefined ? { limits: input.limits as object } : {}),
      ...(input.features !== undefined ? { features: input.features as object } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
    },
  });
  await writeAuditLog({
    actorId,
    action: "ADMIN_PLAN_UPDATED",
    target: "SubscriptionPlan",
    targetId: planId,
    detail: { name: plan.name },
  });
  return plan;
}

export async function deactivatePlan(actorId: string, planId: string) {
  const plan = await prisma.subscriptionPlan.findUnique({ where: { id: planId } });
  if (!plan) throw new NotFoundError("Plan not found");
  await prisma.subscriptionPlan.update({ where: { id: planId }, data: { isActive: false } });
  await writeAuditLog({
    actorId,
    action: "ADMIN_PLAN_DEACTIVATED",
    target: "SubscriptionPlan",
    targetId: planId,
    detail: { name: plan.name },
  });
  return { id: planId };
}

// ── Subscriptions ──
export async function listSubscriptions(opts: { status?: string; guildId?: string; page?: number; limit?: number }) {
  const page = Math.max(1, opts.page || 1);
  const take = Math.min(opts.limit || 25, 100);
  const where: any = {};
  if (opts.status) where.status = opts.status;
  if (opts.guildId) where.guildId = opts.guildId;

  const [rows, total] = await Promise.all([
    prisma.subscription.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * take,
      take,
      include: {
        guild: { select: { id: true, name: true, slug: true } },
        plan: { select: { name: true, currency: true } },
      },
    }),
    prisma.subscription.count({ where }),
  ]);
  return {
    subscriptions: rows.map((s) => ({
      id: s.id,
      guild: s.guild,
      planName: s.plan.name,
      currency: s.plan.currency,
      status: s.status,
      interval: s.interval,
      gateway: s.gateway,
      currentPeriodEnd: s.currentPeriodEnd?.toISOString() ?? null,
      createdAt: s.createdAt.toISOString(),
    })),
    pagination: { page, limit: take, total, totalPages: Math.ceil(total / take) },
  };
}

export async function createSubscription(
  actorId: string,
  input: { guildId: string; planId: string; interval?: "MONTHLY" | "YEARLY"; status?: string },
) {
  const [guild, plan] = await Promise.all([
    prisma.guild.findUnique({ where: { id: input.guildId }, select: { name: true } }),
    prisma.subscriptionPlan.findUnique({ where: { id: input.planId } }),
  ]);
  if (!guild) throw new NotFoundError("Guild not found");
  if (!plan) throw new NotFoundError("Plan not found");

  const interval = input.interval ?? "MONTHLY";
  const periodMs = interval === "YEARLY" ? 365 : 30;
  const sub = await prisma.subscription.create({
    data: {
      guildId: input.guildId,
      planId: input.planId,
      interval,
      status: (input.status as never) ?? "ACTIVE",
      currentPeriodEnd: new Date(Date.now() + periodMs * 24 * 60 * 60 * 1000),
    },
  });
  await writeAuditLog({
    actorId,
    guildId: input.guildId,
    action: "ADMIN_SUBSCRIPTION_CREATED",
    target: "Subscription",
    targetId: sub.id,
    detail: { guild: guild.name, plan: plan.name },
  });
  return sub;
}

export async function changeSubscriptionStatus(
  actorId: string,
  subscriptionId: string,
  action: "cancel" | "pause" | "resume",
) {
  const sub = await prisma.subscription.findUnique({ where: { id: subscriptionId } });
  if (!sub) throw new NotFoundError("Subscription not found");

  const statusMap = { cancel: "CANCELLED", pause: "PAUSED", resume: "ACTIVE" } as const;
  const updated = await prisma.subscription.update({
    where: { id: subscriptionId },
    data: {
      status: statusMap[action] as never,
      ...(action === "cancel" ? { cancelAt: new Date() } : {}),
    },
  });
  await writeAuditLog({
    actorId,
    guildId: sub.guildId,
    action: `ADMIN_SUBSCRIPTION_${action.toUpperCase()}`,
    target: "Subscription",
    targetId: subscriptionId,
  });
  return updated;
}

// ── Payments ──
export async function listPayments(opts: { status?: string; guildId?: string; page?: number; limit?: number }) {
  const page = Math.max(1, opts.page || 1);
  const take = Math.min(opts.limit || 25, 100);
  const where: any = {};
  if (opts.status) where.status = opts.status;
  if (opts.guildId) where.guildId = opts.guildId;

  const [rows, total] = await Promise.all([
    prisma.payment.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * take,
      take,
    }),
    prisma.payment.count({ where }),
  ]);
  return {
    payments: rows.map((p) => ({
      id: p.id,
      guildId: p.guildId,
      amount: p.amount,
      currency: p.currency,
      status: p.status,
      gateway: p.gateway,
      refundedAmount: p.refundedAmount,
      createdAt: p.createdAt.toISOString(),
    })),
    pagination: { page, limit: take, total, totalPages: Math.ceil(total / take) },
  };
}

export async function recordManualPayment(
  actorId: string,
  input: { guildId: string; subscriptionId?: string; amount: number; currency?: string; status?: string },
) {
  const guild = await prisma.guild.findUnique({ where: { id: input.guildId }, select: { name: true } });
  if (!guild) throw new NotFoundError("Guild not found");
  const status = (input.status as never) ?? "SUCCEEDED";

  const payment = await prisma.payment.create({
    data: {
      guildId: input.guildId,
      subscriptionId: input.subscriptionId ?? null,
      amount: input.amount,
      currency: input.currency ?? "PHP",
      status,
      gateway: "MANUAL",
      events: { create: { type: "created", data: { by: actorId } } },
    },
  });
  await writeAuditLog({
    actorId,
    guildId: input.guildId,
    action: "ADMIN_PAYMENT_RECORDED",
    target: "Payment",
    targetId: payment.id,
    detail: { amount: input.amount, status },
  });
  return payment;
}

export async function refundPayment(actorId: string, paymentId: string) {
  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment) throw new NotFoundError("Payment not found");
  if (payment.status !== "SUCCEEDED") throw new BadRequestError("Only succeeded payments can be refunded");

  const updated = await prisma.payment.update({
    where: { id: paymentId },
    data: {
      status: "REFUNDED",
      refundedAmount: payment.amount,
      events: { create: { type: "refunded", data: { by: actorId } } },
    },
  });
  await writeAuditLog({
    actorId,
    guildId: payment.guildId,
    action: "ADMIN_PAYMENT_REFUNDED",
    target: "Payment",
    targetId: paymentId,
    detail: { amount: payment.amount },
  });
  return updated;
}

// ── Coupons ──
export async function listCoupons() {
  const coupons = await prisma.coupon.findMany({ orderBy: { createdAt: "desc" } });
  return coupons.map((c) => ({
    id: c.id,
    code: c.code,
    type: c.type,
    amount: c.amount,
    currency: c.currency,
    maxUses: c.maxUses,
    usedCount: c.usedCount,
    expiresAt: c.expiresAt?.toISOString() ?? null,
    isActive: c.isActive,
  }));
}

export async function createCoupon(
  actorId: string,
  input: {
    code: string;
    type: "PERCENT" | "FIXED" | "FREE_TRIAL";
    amount: number;
    currency?: string;
    maxUses?: number;
    expiresAt?: string;
  },
) {
  const existing = await prisma.coupon.findUnique({ where: { code: input.code } });
  if (existing) throw new BadRequestError("A coupon with that code already exists");
  const coupon = await prisma.coupon.create({
    data: {
      code: input.code.trim().toUpperCase(),
      type: input.type,
      amount: input.amount,
      currency: input.currency ?? null,
      maxUses: input.maxUses ?? null,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
    },
  });
  await writeAuditLog({
    actorId,
    action: "ADMIN_COUPON_CREATED",
    target: "Coupon",
    targetId: coupon.id,
    detail: { code: coupon.code },
  });
  return coupon;
}

export async function deactivateCoupon(actorId: string, couponId: string) {
  const coupon = await prisma.coupon.findUnique({ where: { id: couponId } });
  if (!coupon) throw new NotFoundError("Coupon not found");
  await prisma.coupon.update({ where: { id: couponId }, data: { isActive: false } });
  await writeAuditLog({
    actorId,
    action: "ADMIN_COUPON_DEACTIVATED",
    target: "Coupon",
    targetId: couponId,
    detail: { code: coupon.code },
  });
  return { id: couponId };
}

// ── Billing overview (revenue metrics; also feeds the Phase 1 cards) ──
export async function getBillingOverview() {
  const startOfMonth = new Date();
  startOfMonth.setUTCDate(1);
  startOfMonth.setUTCHours(0, 0, 0, 0);

  const [revenueAgg, monthlyAgg, pending, failed, activeSubs, premiumGuilds, totalGuilds] = await Promise.all([
    prisma.payment.aggregate({ where: { status: "SUCCEEDED" }, _sum: { amount: true } }),
    prisma.payment.aggregate({
      where: { status: "SUCCEEDED", createdAt: { gte: startOfMonth } },
      _sum: { amount: true },
    }),
    prisma.payment.count({ where: { status: "PENDING" } }),
    prisma.payment.count({ where: { status: "FAILED" } }),
    prisma.subscription.count({ where: { status: { in: [...ACTIVE_SUB_STATES] } } }),
    prisma.subscription
      .findMany({
        where: { status: { in: [...ACTIVE_SUB_STATES] } },
        select: { guildId: true },
        distinct: ["guildId"],
      })
      .then((r) => r.length),
    prisma.guild.count({ where: { deletedAt: null } }),
  ]);

  return {
    totalRevenue: revenueAgg._sum.amount ?? 0,
    monthlyRevenue: monthlyAgg._sum.amount ?? 0,
    pendingPayments: pending,
    failedPayments: failed,
    activeSubscriptions: activeSubs,
    premiumGuilds,
    freeGuilds: Math.max(0, totalGuilds - premiumGuilds),
  };
}
