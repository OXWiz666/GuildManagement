"use client";

import { useEffect, useMemo, useState } from "react";
import SettingsCard from "../../settings/components/SettingsCard";
import { guildApi, type CustomRoleData, type GuildMemberData } from "@/lib/api";
import { useRoleDisplayNames } from "@/lib/useRoleDisplayNames";
import { useSocket } from "@/components/providers/socket-provider";
import { useQuery, queryClient } from "@/lib/query";
import RoleList, { selectionKey, type RoleSelection } from "./RoleList";
import RoleEditorPanel from "./RoleEditorPanel";

interface RoleManagementSectionProps {
  guildId: string;
}

/** Discord Server Settings-style role management: a role list on the left
 *  (built-in rank bands + guild-created custom roles) and a detail editor on
 *  the right — replaces the old two-button/two-modal flow. */
export default function RoleManagementSection({ guildId }: RoleManagementSectionProps) {
  const { socket } = useSocket();
  const { overrides: roleDisplayOverrides } = useRoleDisplayNames();
  const [selection, setSelection] = useState<RoleSelection>({ kind: "band", band: "OFFICER" });
  const [busyRoleId, setBusyRoleId] = useState<string | null>(null);

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
      setSelection({ kind: "band", band: "OFFICER" });
    }
  }, [customRoles, selection]);

  function memberCount(sel: RoleSelection): number {
    if (sel.kind === "band") return members.filter((m) => m.role === sel.band && !m.customRole).length;
    if (sel.kind === "custom") return members.filter((m) => m.customRole?.id === sel.id).length;
    return 0;
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
    <SettingsCard
      eyebrow="Guild Settings"
      title="Roles"
      description="Rename your guild's built-in rank tiers, or create custom named roles that inherit a fixed permission level."
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
          onSaved={() => {}}
          onDeleted={() => setSelection({ kind: "band", band: "OFFICER" })}
          onCreated={(role) => {
            setPendingRole(role);
            setSelection({ kind: "custom", id: role.id });
          }}
          onCancelNew={() => setSelection({ kind: "band", band: "OFFICER" })}
        />
      </div>
    </SettingsCard>
  );
}
