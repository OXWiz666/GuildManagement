// ─── Role Hierarchy & Permissions ────────────────
// Roles are per-guild. Higher index = higher privilege.
// A user may be a leader in one guild and a recruit in another.

export const GUILD_ROLES = [
  "MEMBER",
  "ELITE_MEMBER",
  "CORE_MEMBER",
  "OFFICER",
  "GUILD_LEADER",
  "FACTION_LEADER",
  "ADMIN",
] as const;

export type GuildRoleType = (typeof GUILD_ROLES)[number];

// Map roles to display names
export const ROLE_DISPLAY_NAMES: Record<GuildRoleType, string> = {
  MEMBER: "Member",
  ELITE_MEMBER: "Elite Member",
  CORE_MEMBER: "Core Member",
  OFFICER: "Officer",
  GUILD_LEADER: "Guild Leader",
  FACTION_LEADER: "Faction Leader",
  ADMIN: "Admin",
};

// Role permissions description
export const ROLE_PERMISSIONS: Record<GuildRoleType, string> = {
  ADMIN: "Full system control",
  FACTION_LEADER: "Manage faction",
  GUILD_LEADER: "Manage guild",
  OFFICER: "Attendance, member management",
  CORE_MEMBER: "High-rank member",
  ELITE_MEMBER: "Mid-rank member",
  MEMBER: "Standard permissions",
};

// Recommended rank display names
export const RANK_DISPLAY_NAMES = [
  "Guild Leader",
  "Officer",
  "Core",
  "Elite-Core",
  "Higher Rank",
  "Lower Rank",
] as const;

/**
 * Check if a user's role meets the minimum required role.
 * Higher index in GUILD_ROLES = higher privilege.
 */
export function hasMinimumRole(
  userRole: GuildRoleType,
  minimumRole: GuildRoleType,
): boolean {
  const userIndex = GUILD_ROLES.indexOf(userRole);
  const minIndex = GUILD_ROLES.indexOf(minimumRole);
  return userIndex >= minIndex;
}

/**
 * Get all roles that a given role can assign to others.
 * GUILD_LEADER can assign up to GUILD_LEADER (for leadership transfer).
 * Others can only assign roles below their own.
 */
export function getAssignableRoles(role: GuildRoleType): GuildRoleType[] {
  if (role === "GUILD_LEADER") {
    // GL can assign any role up to GUILD_LEADER (for transfer)
    const glIndex = GUILD_ROLES.indexOf("GUILD_LEADER");
    return GUILD_ROLES.filter((_, i) => i <= glIndex) as GuildRoleType[];
  }
  const roleIndex = GUILD_ROLES.indexOf(role);
  return GUILD_ROLES.filter((_, i) => i < roleIndex) as GuildRoleType[];
}

/**
 * Get all roles that a given role can manage (lower roles).
 */
export function getManageableRoles(role: GuildRoleType): GuildRoleType[] {
  const roleIndex = GUILD_ROLES.indexOf(role);
  return GUILD_ROLES.filter((_, i) => i < roleIndex) as GuildRoleType[];
}

/**
 * Check if a user can manage another user based on role hierarchy.
 */
export function canManageRole(
  actorRole: GuildRoleType,
  targetRole: GuildRoleType,
): boolean {
  // GUILD_LEADER can manage themselves (self-demotion for transfer)
  if (actorRole === "GUILD_LEADER" && targetRole === "GUILD_LEADER") {
    return true;
  }
  const actorIndex = GUILD_ROLES.indexOf(actorRole);
  const targetIndex = GUILD_ROLES.indexOf(targetRole);
  return actorIndex > targetIndex;
}
