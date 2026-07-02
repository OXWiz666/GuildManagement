import { z } from "zod";
import {
  MARKET_REQUEST_TYPES,
  LEGENDARY_CATEGORIES,
  DISTRIBUTION_TIERS,
} from "../constants";

// ─── Item Request (Logs / Materials / Temporal Pieces) ──────────────

export const createItemRequestSchema = z.object({
  itemType: z.enum(MARKET_REQUEST_TYPES),
  itemName: z.string().trim().max(120).optional(),
  quantity: z.number().int().min(1, "Quantity must be at least 1").max(9999),
  reason: z.string().trim().max(500).optional(),
});
export type CreateItemRequestInput = z.infer<typeof createItemRequestSchema>;

export const reviewRequestSchema = z.object({
  action: z.enum(["APPROVED", "DECLINED", "FULFILLED"]),
  reviewNote: z.string().trim().max(500).optional(),
});
export type ReviewRequestInput = z.infer<typeof reviewRequestSchema>;

// ─── Legendary Priority ─────────────────────────────────────────────

export const legendaryPrioritySchema = z.object({
  category: z.enum(LEGENDARY_CATEGORIES),
  currentGear: z.string().trim().max(500).optional(),
  reason: z.string().trim().max(500).optional(),
});
export type LegendaryPriorityInput = z.infer<typeof legendaryPrioritySchema>;

export const reviewLegendarySchema = z.object({
  action: z.enum(["APPROVED", "REJECTED", "COMPLETED"]),
  officerNote: z.string().trim().max(500).optional(),
});
export type ReviewLegendaryInput = z.infer<typeof reviewLegendarySchema>;

export const legendarySequenceSchema = z.object({
  prioritySeq: z.number().int().min(1).max(9999),
});
export type LegendarySequenceInput = z.infer<typeof legendarySequenceSchema>;

// ─── Priority sequence override ─────────────────────────────────────

export const prioritySequenceSchema = z.object({
  prioritySeq: z.number().int().min(1).max(9999).nullable(),
  reason: z.string().trim().min(1, "A reason is required for manual overrides").max(500),
});
export type PrioritySequenceInput = z.infer<typeof prioritySequenceSchema>;

// ─── Item Distribution ──────────────────────────────────────────────

export const createDistributionSchema = z.object({
  memberId: z.string().min(1, "Target member is required"),
  formType: z.enum(["CORE", "NON_CORE"]),
  // Slot → quantity/flag map. Keys validated against CORE_SLOTS / NON_CORE_SLOTS in the service.
  items: z.record(z.string(), z.union([z.number(), z.boolean(), z.string()])).default({}),
  note: z.string().trim().max(500).optional(),
  overrideReason: z.string().trim().max(500).optional(),
});
export type CreateDistributionInput = z.infer<typeof createDistributionSchema>;

// ─── Member item wishlist (Item Distribution) ──────────────────────

export const wishlistSchema = z.object({
  items: z.array(z.string().max(40)).max(60),
});
export type WishlistInput = z.infer<typeof wishlistSchema>;

// ─── Market rules (Settings) ────────────────────────────────────────

const tierLimitSchema = z.object({
  logs: z.number().int().min(0).max(9999),
  temporalPieces: z.number().int().min(0).max(9999),
  materials: z.number().int().min(0).max(9999),
});

export const marketRulesSchema = z.object({
  cpTiers: z.object({
    eliteMinCp: z.number().int().min(0),
    upperMinCp: z.number().int().min(0),
  }),
  limits: z.object(
    DISTRIBUTION_TIERS.reduce(
      (acc, tier) => {
        acc[tier] = tierLimitSchema;
        return acc;
      },
      {} as Record<(typeof DISTRIBUTION_TIERS)[number], typeof tierLimitSchema>,
    ),
  ),
  weights: z
    .object({
      rank: z.number(),
      dkp: z.number(),
      cp: z.number(),
      attendance: z.number(),
      bossParticipation: z.number(),
      previousReceived: z.number(),
      recency: z.number(),
    })
    .partial()
    .optional(),
});
export type MarketRulesInput = z.infer<typeof marketRulesSchema>;
