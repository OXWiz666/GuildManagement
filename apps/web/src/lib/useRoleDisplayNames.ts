"use client";

import { resolveRoleDisplayName, type GuildRoleType } from "@guild/shared";
import { useAuth } from "./auth-context";
import { useQuery } from "./query";
import { guildApi } from "./api";

/**
 * Resolves a guild's custom role display names (e.g. "Officer" -> "Captain").
 * Shares the same query key GuildSettingsSection uses, so most call sites
 * (Badge, MemberRow, etc.) get overrides for free without a dedicated fetch.
 */
export function useRoleDisplayNames() {
  const { user } = useAuth();
  const guildId = user?.guilds?.[0]?.guildId;

  const { data: settings } = useQuery<any | null>(
    guildId ? `guild_settings:${guildId}` : "guild_settings_empty",
    async () => {
      if (!guildId) return null;
      const result = await guildApi.getSettings(guildId);
      return result.success ? result.data : null;
    },
    { persist: true, staleTime: 300000, enabled: !!guildId },
  );

  const overrides = (settings?.roleDisplayNames || null) as Partial<
    Record<GuildRoleType, string>
  > | null;

  function resolveRoleName(role: string): string {
    return resolveRoleDisplayName(role as GuildRoleType, overrides);
  }

  return { overrides, resolveRoleName };
}
