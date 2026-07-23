export const MAX_PING_ROLES = 20;

const ROLE_ID_PATTERN = /\d{5,}/g;

export function parsePingRoleIds(value: string | null | undefined): string[] {
  if (!value) return [];

  const seen = new Set<string>();
  const ids: string[] = [];

  for (const match of value.matchAll(ROLE_ID_PATTERN)) {
    const id = match[0];
    if (seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
    if (ids.length >= MAX_PING_ROLES) break;
  }

  return ids;
}

export function serializePingRoleIds(roleIds: string[]): string | null {
  const unique = uniquePingRoleIds(roleIds);
  return unique.length ? unique.join(",") : null;
}

export function pingRoleMentions(roleIds: string[]): string {
  return uniquePingRoleIds(roleIds).map((roleId) => `<@&${roleId}>`).join(" ");
}

export function pingRoleContent(value: string | null | undefined): string | undefined {
  const mentions = pingRoleMentions(parsePingRoleIds(value));
  return mentions || undefined;
}

function uniquePingRoleIds(roleIds: string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const roleId of roleIds) {
    if (!/^\d{5,}$/.test(roleId) || seen.has(roleId)) continue;
    seen.add(roleId);
    unique.push(roleId);
    if (unique.length >= MAX_PING_ROLES) break;
  }

  return unique;
}
