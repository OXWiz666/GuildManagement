import { z } from "zod";
import { FACTION_INVENTORY_CATEGORIES } from "../constants";

// ─── Inventory Items ──────────────────────────────────────────────────

export const createInventoryItemSchema = z.object({
  itemName: z.string().trim().min(1, "Item name is required").max(120),
  itemIcon: z.string().trim().max(2000).optional(),
  category: z.enum(FACTION_INVENTORY_CATEGORIES),
  rarity: z.string().trim().max(40).optional(),
  description: z.string().trim().max(1000).optional(),
  unitValueCents: z.coerce.number().int().min(0).optional(),
  storageLocation: z.string().trim().max(120).optional(),
  batchNumber: z.string().trim().max(60).optional(),
  expirationDate: z.string().trim().optional(),
  minStockThreshold: z.coerce.number().int().min(0).optional(),
});
export type CreateInventoryItemInput = z.infer<typeof createInventoryItemSchema>;

export const updateInventoryItemSchema = z.object({
  itemName: z.string().trim().min(1).max(120).optional(),
  itemIcon: z.string().trim().max(2000).nullable().optional(),
  category: z.enum(FACTION_INVENTORY_CATEGORIES).optional(),
  rarity: z.string().trim().max(40).nullable().optional(),
  description: z.string().trim().max(1000).nullable().optional(),
  unitValueCents: z.coerce.number().int().min(0).nullable().optional(),
  storageLocation: z.string().trim().max(120).nullable().optional(),
  batchNumber: z.string().trim().max(60).nullable().optional(),
  expirationDate: z.string().trim().nullable().optional(),
  minStockThreshold: z.coerce.number().int().min(0).nullable().optional(),
  status: z.enum(["ACTIVE", "ARCHIVED"]).optional(),
});
export type UpdateInventoryItemInput = z.infer<typeof updateInventoryItemSchema>;

// ─── Quantity-moving actions ──────────────────────────────────────────

export const recordAdditionSchema = z.object({
  quantity: z.coerce.number().int().positive("Quantity must be at least 1"),
  reason: z.string().trim().max(500).optional(),
  sourceGuildId: z.string().trim().optional(),
});
export type RecordAdditionInput = z.infer<typeof recordAdditionSchema>;

export const adjustQuantitySchema = z.object({
  delta: z.coerce.number().int().refine((n) => n !== 0, "Adjustment cannot be zero"),
  reason: z.string().trim().min(1, "A reason is required for manual adjustments").max(500),
});
export type AdjustQuantityInput = z.infer<typeof adjustQuantitySchema>;

// ─── Inventory Requests ───────────────────────────────────────────────

export const submitInventoryRequestSchema = z.object({
  guildId: z.string().min(1, "A requesting guild is required"),
  itemId: z.string().min(1, "An item is required"),
  quantity: z.coerce.number().int().positive("Quantity must be at least 1"),
  purpose: z.string().trim().max(500).optional(),
  priority: z.enum(["NORMAL", "IMPORTANT", "URGENT", "CRITICAL"]).default("NORMAL"),
  requiredDate: z.string().trim().optional(),
  evidenceUrl: z.string().trim().max(2000).optional(),
});
export type SubmitInventoryRequestInput = z.infer<typeof submitInventoryRequestSchema>;

export const reviewInventoryRequestSchema = z.object({
  action: z.enum(["APPROVE", "REJECT"]),
  approvalNotes: z.string().trim().max(500).optional(),
});
export type ReviewInventoryRequestInput = z.infer<typeof reviewInventoryRequestSchema>;

// ─── Transaction ledger query ─────────────────────────────────────────

export const listInventoryTransactionsQuerySchema = z.object({
  itemId: z.string().trim().optional(),
  transactionType: z.string().trim().optional(),
  from: z.string().trim().optional(),
  to: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type ListInventoryTransactionsQueryInput = z.infer<typeof listInventoryTransactionsQuerySchema>;
