"use client";

import { useEffect, useMemo, useState } from "react";
import SettingsCard from "../../settings/components/SettingsCard";
import { DEFAULT_MARKET_RULES } from "@guild/shared";
import { guildApi, marketApi, type CustomRoleData, type GuildMemberData, type MarketRulesData } from "@/lib/api";
import { useRoleDisplayNames } from "@/lib/useRoleDisplayNames";
import { useSocket } from "@/components/providers/socket-provider";
import { useToast } from "@/components/ui/Toast";
import { useQuery, queryClient } from "@/lib/query";
import RoleList, { selectionKey, type RoleSelection } from "./RoleList";
import RoleEditorPanel from "./RoleEditorPanel";

interface RoleManagementSectionProps {
  guildId: string;
  onDirtyChange?: (isDirty: boolean) => void;
}

function memberMatchesCpRank(
  cp: number,
  band: string,
  cpTiers: { coreMinCp?: number; eliteMinCp: number; upperMinCp: number },
) {
  const coreMinCp = cpTiers.coreMinCp ?? Number.POSITIVE_INFINITY;
  if (band === "CORE_MEMBER") return cp >= coreMinCp;
  if (band === "ELITE_MEMBER") return cp >= cpTiers.eliteMinCp && cp < coreMinCp;
  if (band === "MEMBER") return cp < cpTiers.eliteMinCp;
  return false;
}

/** Discord Server Settings-style role management: a role list on the left
 *  (built-in rank bands + guild-created custom roles) and a detail editor on
 *  the right — replaces the old two-button/two-modal flow. */
export default function RoleManagementSection({ guildId, onDirtyChange }: RoleManagementSectionProps) {
  const { socket } = useSocket();
  const { addToast } = useToast();
  const { overrides: roleDisplayOverrides } = useRoleDisplayNames();
  const [selection, setSelection] = useState<RoleSelection>({ kind: "band", band: "CORE_MEMBER" });
  const [busyRoleId, setBusyRoleId] = useState<string | null>(null);
  const [rules, setRules] = useState<MarketRulesData>(DEFAULT_MARKET_RULES as MarketRulesData);
  const [savedRules, setSavedRules] = useState<MarketRulesData>(DEFAULT_MARKET_RULES as MarketRulesData);
  const [isSavingThresholds, setIsSavingThresholds] = useState(false);
  const [roleEditorDirty, setRoleEditorDirty] = useState(false);

  const { data: customRolesRaw } = useQuery<CustomRoleData[]>(
    `guild_custom_roles:${guildId}`,
    async () => {
      const result = await guildApi.listCustomRoles(guildId);
      return result.success && result.data?.roles ? result.data.roles : [];
    },
    { persist: true, staleTime: 30000 },
  );

  // Bridges the gap between "role created" and the invalidated query actually
  // refetching (this cache is eventually-consistent, not synchronous — see
  // lib/query.ts). Without this, selecting the just-created role before its
  // real data arrives leaves RoleEditorPanel with a selection pointing at a
  // role `customRoles` doesn't have yet — which used to crash reading
  // `existingCustom!.band`. Cleared once the real list catches up.
  const [pendingRole, setPendingRole] = useState<CustomRoleData | null>(null);

  const customRoles = useMemo(() => {
    const base = customRolesRaw || [];
    if (pendingRole && !base.some((r) => r.id === pendingRole.id)) {
      return [...base, pendingRole];
    }
    return base;
  }, [customRolesRaw, pendingRole]);

  useEffect(() => {
    if (pendingRole && customRolesRaw?.some((r) => r.id === pendingRole.id)) {
      setPendingRole(null);
    }
  }, [customRolesRaw, pendingRole]);

  const { data: membersRaw } = useQuery<GuildMemberData[]>(
    `guild_members:${guildId}`,
    async () => {
      const result = await guildApi.getMembers(guildId);
      return result.success && result.data?.members ? result.data.members : [];
    },
    { persist: true, staleTime: 30000 },
  );
  const members = membersRaw || [];

  useEffect(() => {
    let cancelled = false;
    marketApi.getRules(guildId).then((res) => {
      if (!cancelled && res.success && res.data) {
        setRules(res.data.rules);
        setSavedRules(res.data.rules);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [guildId]);

  useEffect(() => {
    if (!socket) return;
    const handleCustomRolesUpdate = () => queryClient.invalidateQueries(`guild_custom_roles:${guildId}`);
    const handleRosterUpdate = () => queryClient.invalidateQueries(`guild_members:${guildId}`);
    socket.on("custom_roles_updated", handleCustomRolesUpdate);
    socket.on("member_role_updated", handleRosterUpdate);
    return () => {
      socket.off("custom_roles_updated", handleCustomRolesUpdate);
      socket.off("member_role_updated", handleRosterUpdate);
    };
  }, [socket, guildId]);

  // If the selected custom role gets deleted out from under us (e.g. another
  // officer removes it), fall back to the first band rather than showing a
  // dead selection.
  useEffect(() => {
    if (selection.kind === "custom" && !customRoles.some((r) => r.id === selection.id)) {
      setSelection({ kind: "band", band: "CORE_MEMBER" });
    }
  }, [customRoles, selection]);

  function memberCount(sel: RoleSelection): number {
    if (sel.kind === "band") return members.filter((m) => memberMatchesCpRank(m.cp ?? 0, sel.band, rules.cpTiers)).length;
    if (sel.kind === "custom") return members.filter((m) => m.customRole?.id === sel.id).length;
    return 0;
  }

  const isThresholdDirty = JSON.stringify(rules.cpTiers) !== JSON.stringify(savedRules.cpTiers);
  const isDirty = isThresholdDirty || roleEditorDirty;

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  const setCpTier = (key: "coreMinCp" | "eliteMinCp" | "upperMinCp", value: string) =>
    setRules((current) => ({
      ...current,
      cpTiers: { ...current.cpTiers, [key]: parseInt(value, 10) || 0 },
    }));

  async function saveThresholds() {
    setIsSavingThresholds(true);
    try {
      const result = await marketApi.updateRules(guildId, rules);
      if (result.success && result.data) {
        setRules(result.data.rules);
        setSavedRules(result.data.rules);
        addToast("success", "Role CP thresholds updated.");
      } else {
        addToast("error", result.error?.message || "Failed to save CP thresholds");
      }
    } catch (err: unknown) {
      addToast("error", err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsSavingThresholds(false);
    }
  }

  async function move(role: CustomRoleData, direction: -1 | 1) {
    const ordered = [...customRoles].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    const index = ordered.findIndex((r) => r.id === role.id);
    const swapWith = ordered[index + direction];
    if (!swapWith) return;
    setBusyRoleId(role.id);
    try {
      await Promise.all([
        guildApi.updateCustomRole(guildId, role.id, { sortOrder: swapWith.sortOrder }),
        guildApi.updateCustomRole(guildId, swapWith.id, { sortOrder: role.sortOrder }),
      ]);
      queryClient.invalidateQueries(`guild_custom_roles:${guildId}`);
    } finally {
      setBusyRoleId(null);
    }
  }

  return (
    <div className="space-y-6">
      <SettingsCard
        eyebrow="Guild Settings"
        title="Moderator & Permissions"
        description="Manage permission roles separately from CP-based ranks. Core, Elite, and Member ranks are assigned automatically from Combat Power thresholds."
      >
      <div className="flex flex-col lg:flex-row gap-4">
        <RoleList
          customRoles={customRoles}
          selection={selection}
          onSelect={setSelection}
          onCreateNew={() => setSelection({ kind: "new" })}
          memberCount={memberCount}
          onMove={move}
          busyRoleId={busyRoleId}
        />
        <RoleEditorPanel
          key={selectionKey(selection)}
          guildId={guildId}
          selection={selection}
          customRoles={customRoles}
          roleDisplayOverrides={roleDisplayOverrides || {}}
          members={members}
          cpTiers={rules.cpTiers}
          onCpTierChange={setCpTier}
          onSaveCpThresholds={saveThresholds}
          isCpThresholdDirty={isThresholdDirty}
          isSavingCpThresholds={isSavingThresholds}
          onDirtyChange={setRoleEditorDirty}
          onSaved={() => {}}
          onDeleted={() => setSelection({ kind: "band", band: "CORE_MEMBER" })}
          onCreated={(role) => {
            setPendingRole(role);
            setSelection({ kind: "custom", id: role.id });
          }}
          onCancelNew={() => setSelection({ kind: "band", band: "CORE_MEMBER" })}
        />
      </div>
      </SettingsCard>
    </div>
  );
}
