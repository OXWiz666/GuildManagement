// ─── Platform (SaaS-level) roles ────────────────
// Distinct from per-guild roles. Governs the Super Admin area.
// Higher index = higher privilege.

export const PLATFORM_ROLES = ["ANALYST", "SUPPORT", "ADMIN", "SUPER_ADMIN"] as const;

export type PlatformRoleType = (typeof PLATFORM_ROLES)[number];

export const PLATFORM_ROLE_DISPLAY_NAMES: Record<PlatformRoleType, string> = {
  SUPER_ADMIN: "Super Admin",
  ADMIN: "Platform Admin",
  SUPPORT: "Support",
  ANALYST: "Analyst",
};

/** Check whether a platform role meets the minimum required platform role. */
export function hasMinimumPlatformRole(
  role: PlatformRoleType,
  minimum: PlatformRoleType,
): boolean {
  return PLATFORM_ROLES.indexOf(role) >= PLATFORM_ROLES.indexOf(minimum);
}
