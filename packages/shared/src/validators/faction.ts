import { z } from "zod";
import { orgNameSchema } from "./auth";
import { FACTION_ROLES } from "../types/roles";

// ─── Faction Profile ────────────────────────────────────────────────

export const updateFactionProfileSchema = z.object({
  name: orgNameSchema.optional(),
  description: z.string().trim().max(1000).optional(),
  avatarUrl: z.string().trim().max(2000).optional(),
  bannerUrl: z.string().trim().max(2000).optional(),
  code: z.string().trim().max(20).optional(),
  server: z.string().trim().max(60).optional(),
  region: z.string().trim().max(60).optional(),
  game: z.string().trim().max(60).optional(),
});
export type UpdateFactionProfileInput = z.infer<typeof updateFactionProfileSchema>;

// ─── Faction Status (Super Admin only) ──────────────────────────────

export const updateFactionStatusSchema = z.object({
  factionId: z.string().min(1, "factionId is required"),
  status: z.enum(["ACTIVE", "INACTIVE", "SUSPENDED", "ARCHIVED"]),
  reason: z.string().trim().max(500).optional(),
});
export type UpdateFactionStatusInput = z.infer<typeof updateFactionStatusSchema>;

// ─── Faction Guild Memberships ───────────────────────────────────────

export const updateFactionGuildMembershipSchema = z.object({
  contributionRequirement: z.string().trim().max(500).nullable().optional(),
  assignedFactionRole: z.string().trim().max(80).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});
export type UpdateFactionGuildMembershipInput = z.infer<typeof updateFactionGuildMembershipSchema>;

// ─── Faction Role Assignments ───────────────────────────────────────

export const assignFactionRoleSchema = z.object({
  guildMemberId: z.string().min(1, "A member is required"),
  role: z.enum(FACTION_ROLES),
});
export type AssignFactionRoleInput = z.infer<typeof assignFactionRoleSchema>;

// ─── Faction Audit Log query ─────────────────────────────────────────

export const listFactionAuditLogsQuerySchema = z.object({
  from: z.string().trim().optional(),
  to: z.string().trim().optional(),
  action: z.string().trim().max(120).optional(),
  entityType: z.string().trim().max(80).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type ListFactionAuditLogsQueryInput = z.infer<typeof listFactionAuditLogsQuerySchema>;
