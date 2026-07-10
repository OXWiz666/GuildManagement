import { z } from "zod";

// ─── Phase 2: User moderation ────────────────────────────────────────
export const userModerationSchema = z.object({
  action: z.enum(["ban", "unban", "suspend", "unsuspend", "soft_delete", "restore", "verify_email"]),
  days: z.number().int().min(1).max(3650).optional(),
  reason: z.string().trim().max(500).optional(),
});
export type UserModerationInput = z.infer<typeof userModerationSchema>;

// ─── Phase 3: Guild moderation ───────────────────────────────────────
export const guildModerationSchema = z.object({
  action: z.enum(["suspend", "unsuspend", "soft_delete", "restore"]),
  reason: z.string().trim().max(500).optional(),
});
export type GuildModerationInput = z.infer<typeof guildModerationSchema>;

export const transferOwnershipSchema = z.object({
  newMemberId: z.string().min(1),
});
export type TransferOwnershipInput = z.infer<typeof transferOwnershipSchema>;

// ─── Phase 4: Billing ────────────────────────────────────────────────
export const planSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).optional(),
  monthlyPrice: z.number().int().min(0),
  yearlyPrice: z.number().int().min(0),
  currency: z.string().trim().min(1).max(8).optional(),
  limits: z.record(z.string(), z.unknown()).optional(),
  features: z.record(z.string(), z.unknown()).optional(),
  sortOrder: z.number().int().optional(),
});
export type PlanInput = z.infer<typeof planSchema>;

export const planUpdateSchema = planSchema.partial().extend({
  isActive: z.boolean().optional(),
  description: z.string().trim().max(500).nullable().optional(),
});
export type PlanUpdateInput = z.infer<typeof planUpdateSchema>;

export const subscriptionCreateSchema = z.object({
  guildId: z.string().min(1),
  planId: z.string().min(1),
  interval: z.enum(["MONTHLY", "YEARLY"]).optional(),
  status: z.enum(["TRIALING", "ACTIVE", "PAST_DUE", "PAUSED", "CANCELLED", "EXPIRED"]).optional(),
});
export type SubscriptionCreateInput = z.infer<typeof subscriptionCreateSchema>;

export const subscriptionActionSchema = z.object({
  action: z.enum(["cancel", "pause", "resume"]),
});
export type SubscriptionActionInput = z.infer<typeof subscriptionActionSchema>;

export const paymentSchema = z.object({
  guildId: z.string().min(1),
  subscriptionId: z.string().optional(),
  amount: z.number().int().min(1),
  currency: z.string().trim().min(1).max(8).optional(),
  status: z.enum(["PENDING", "SUCCEEDED", "FAILED", "REFUNDED", "CHARGEBACK"]).optional(),
});
export type PaymentInput = z.infer<typeof paymentSchema>;

export const couponSchema = z.object({
  code: z.string().trim().min(2).max(40),
  type: z.enum(["PERCENT", "FIXED", "FREE_TRIAL"]),
  amount: z.number().int().min(0),
  currency: z.string().trim().min(1).max(8).optional(),
  maxUses: z.number().int().min(1).optional(),
  expiresAt: z.string().optional(),
});
export type CouponInput = z.infer<typeof couponSchema>;
