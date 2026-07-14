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

// ─── Guild Storage ──────────────────────────────────────────────────

export const registerStorageInMarketSchema = z.object({
  price: z.number().min(0, "A valid listing price is required").max(1_000_000_000),
});
export type RegisterStorageInMarketInput = z.infer<typeof registerStorageInMarketSchema>;

export const markStorageSoldSchema = z.object({
  saleValue: z.number().min(0, "A valid sale value is required").max(1_000_000_000),
  // Validated as a real date in the service layer; kept loose here.
  soldAt: z.string().trim().min(1).max(40).optional(),
});
export type MarkStorageSoldInput = z.infer<typeof markStorageSoldSchema>;

// Distribute a stored item — direct guild sale or DKP auction.
export const distributeStorageSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("GUILD_SALE"),
    memberId: z.string().min(1, "Target member is required"),
    note: z.string().trim().max(500).optional(),
  }),
  z.object({
    mode: z.literal("GUILD_AUCTION"),
    startingBid: z.number().int().min(0).max(1_000_000).default(0),
    durationHours: z.number().int().min(1).max(168).default(24),
    note: z.string().trim().max(500).optional(),
  }),
]);
export type DistributeStorageInput = z.infer<typeof distributeStorageSchema>;

// ─── Auctions (DKP bidding hall) ────────────────────────────────────

export const createAuctionSchema = z.object({
  itemName: z.string().trim().min(1, "Item name is required").max(120),
  description: z.string().trim().max(500).optional(),
  imageUrl: z.string().trim().max(500).optional(),
  category: z.string().trim().max(40).optional(),
  startingBid: z.number().int().min(0).max(1_000_000).default(0),
  durationHours: z.number().int().min(1).max(168).default(24),
});
export type CreateAuctionInput = z.infer<typeof createAuctionSchema>;

export const placeBidSchema = z.object({
  bidAmount: z.number().int().min(1, "Bid must be at least 1 point").max(10_000_000),
});
export type PlaceBidInput = z.infer<typeof placeBidSchema>;

// ─── Member item wishlist (per-piece: rarity + quantity) ────────────

export const wishlistItemSchema = z.object({
  category: z.enum(["WEAPON", "ARMOR", "ACCESSORY", "LOGS", "TEMPORAL", "MATERIALS", "MOUNT"]),
  key: z.string().min(1).max(60),
  rarity: z.enum(["LEGEND", "EPIC", "MYTHIC"]).optional(),
  armorType: z.enum(["CLOTH", "LEATHER", "PLATE"]).optional(),
  quantity: z.number().int().min(1).max(9999).optional(),
  label: z.string().trim().max(120).optional(),
  // Status is server-managed; accepted (and preserved) on input but never trusted for auth.
  status: z.enum(["PENDING", "DISTRIBUTED"]).optional(),
  fulfilledAt: z.string().optional(),
  fulfilledById: z.string().optional(),
});
export type WishlistItemInput = z.infer<typeof wishlistItemSchema>;

export const wishlistSchema = z.object({
  items: z.array(wishlistItemSchema).max(80),
});
export type WishlistInput = z.infer<typeof wishlistSchema>;

// ─── Mount catalog (Leader's Panel) ─────────────────────────────────

export const mountCatalogSchema = z.object({
  name: z.string().trim().min(1, "Mount name is required").max(120),
  iconUrl: z.string().trim().max(500).optional().nullable(),
  maxSlots: z.number().int().min(1, "At least 1 slot").max(999),
  isActive: z.boolean().optional(),
});
export type MountCatalogInput = z.infer<typeof mountCatalogSchema>;

export const distributeMountSchema = z.object({
  memberId: z.string().min(1, "Target member is required"),
  note: z.string().trim().max(500).optional(),
});
export type DistributeMountInput = z.infer<typeof distributeMountSchema>;

// ─── Notify members to submit a request ─────────────────────────────

export const notifyRequestSchema = z.object({
  itemLabel: z.string().trim().min(1, "Pick an item to notify about").max(120),
  itemRef: z.string().trim().max(120).optional(),
  memberIds: z.array(z.string()).optional(),
  message: z.string().trim().max(500).optional(),
});
export type NotifyRequestInput = z.infer<typeof notifyRequestSchema>;

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
