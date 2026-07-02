import { z } from "zod";
import { EQUIPMENT_SLOTS } from "../constants";

// ─── Item Screenshot Update (Member Equipment) ──────────────────────

// Upload of the source equipment screenshot. The browser sends a base64
// data URL; the API decodes it and stores it in a private bucket.
export const uploadScreenshotSchema = z.object({
  guildId: z.string().min(1, "Guild context is required"),
  dataUrl: z
    .string()
    .min(1, "Screenshot is required")
    .regex(/^data:image\/(png|jpe?g|webp);base64,/, "Must be a PNG, JPEG, or WebP data URL"),
});
export type UploadScreenshotInput = z.infer<typeof uploadScreenshotSchema>;

// A single confirmed equipment slot. `iconPath`/`iconBucket` must reference an
// existing object in the icon catalog — validated server-side so we never store
// (or invent) an icon that isn't already in storage.
export const equipmentItemSchema = z.object({
  slotType: z.enum(EQUIPMENT_SLOTS),
  itemName: z.string().trim().min(1).max(120),
  iconPath: z.string().trim().min(1).max(300),
  iconBucket: z.string().trim().min(1).max(120),
  rarity: z.string().trim().max(40).optional(),
  confidence: z.number().min(0).max(1),
});
export type EquipmentItemInput = z.infer<typeof equipmentItemSchema>;

// Optional gear captured during guild onboarding (apply flow). Empty/omitted is allowed.
export const gearItemsSchema = z.array(equipmentItemSchema).max(14).optional();

export const confirmEquipmentSchema = z.object({
  guildId: z.string().min(1, "Guild context is required"),
  sourceScreenshotPath: z.string().trim().max(300).optional(),
  items: z.array(equipmentItemSchema).min(1, "At least one item is required").max(14),
});
export type ConfirmEquipmentInput = z.infer<typeof confirmEquipmentSchema>;
