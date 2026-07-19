"use client";

import { useMemo, useState } from "react";
import { factionApi, type FactionMemberData, type FactionRoleAssignmentData, type FactionCapabilityRole } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import Button from "@/components/ui/Button";
import Avatar from "@/components/ui/Avatar";
import { Skeleton } from "@/components/ui/Skeleton";
import { useQuery, queryClient } from "@/lib/query";

const ROLE_LABELS: Record<FactionCapabilityRole, string> = {
  OFFICER: "Faction Officer",
  TREASURER: "Faction Treasurer",
  INVENTORY_MANAGER: "Faction Inventory Manager",
};

const ROLE_OPTIONS = Object.keys(ROLE_LABELS) as FactionCapabilityRole[];

/**
 * Faction Roles — capability grants (Officer / Treasurer / Inventory
 * Manager) orthogonal to a member's guild rank. Inventory Manager gates
 * mutations on the Inventory tab; Treasurer is accepted by the Accounting
 * tab's backend, though the tab itself is currently only shown to Faction
 * Leaders/Admins (see faction/page.tsx's ACCOUNTING gate).
 */
export default function FactionRolesTab({ canManage }: { canManage: boolean }) {
  const { addToast } = useToast();
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [selectedRole, setSelectedRole] = useState<FactionCapabilityRole>("OFFICER");
  const [isSaving, setIsSaving] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const { data: membersRaw, isLoading: isLoadingMembers } = useQuery<FactionMemberData[]>(
    canManage ? "faction_members" : "faction_members_locked",
    async () => {
      if (!canManage) return [];
      const result = await factionApi.getMembers();
      return result.success && result.data?.members ? result.data.members : [];
    },
    { persist: true, staleTime: 30000 },
  );
  const members = membersRaw || [];

  const { data: assignmentsRaw, isLoading: isLoadingAssignments } = useQuery<FactionRoleAssignmentData[]>(
    canManage ? "faction_role_assignments" : "faction_role_assignments_locked",
    async () => {
      if (!canManage) return [];
      const result = await factionApi.getRoleAssignments();
      return result.success && result.data?.assignments ? result.data.assignments : [];
    },
    { persist: true, staleTime: 15000 },
  );
  const assignments = assignmentsRaw || [];

  const sortedMembers = useMemo(
    () => [...members].sort((a, b) => (a.ign || a.user.displayName).localeCompare(b.ign || b.user.displayName)),
    [members],
  );

  async function assign() {
    if (!selectedMemberId) return;
    setIsSaving(true);
    try {
      const result = await factionApi.assignRole(selectedMemberId, selectedRole);
      if (result.success) {
        addToast("success", "Faction role granted");
        setSelectedMemberId("");
        queryClient.invalidateQueries("faction_role_assignments");
      } else {
        addToast("error", result.error?.message || "Failed to grant role");
      }
    } finally {
      setIsSaving(false);
    }
  }

  async function revoke(id: string) {
    setRevokingId(id);
    try {
      const result = await factionApi.revokeRole(id);
      if (result.success) {
        addToast("success", "Faction role revoked");
        queryClient.invalidateQueries("faction_role_assignments");
      } else {
        addToast("error", result.error?.message || "Failed to revoke role");
      }
    } finally {
      setRevokingId(null);
    }
  }

  if (!canManage) {
    return (
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-8 text-center">
        <h3 className="text-sm font-semibold text-white/80">Role management is restricted</h3>
        <p className="text-xs text-white/45 mt-1">Only Faction Leaders and Admins can grant faction capability roles.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_280px] gap-4 items-start">
      <div className="min-w-0 space-y-2">
        {isLoadingAssignments ? (
          [1, 2, 3].map((i) => <Skeleton key={i} className="h-16 rounded-xl" />)
        ) : assignments.length === 0 ? (
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-8 text-center">
            <h3 className="text-sm font-semibold text-white/80">No faction roles granted yet</h3>
            <p className="text-xs text-white/45 mt-1">Grant Officer, Treasurer, or Inventory Manager from the panel.</p>
          </div>
        ) : (
          assignments.map((a) => (
            <div key={a.id} className="rounded-xl border border-white/[0.06] bg-black/15 px-3 py-3 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Avatar name={a.member?.ign || a.member?.displayName || "?"} src={a.member?.avatarUrl ?? null} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-white truncate">{a.member?.ign || a.member?.displayName || "Unknown member"}</p>
                <p className="text-[11px] text-white/40 truncate">{a.member?.guildName || "Guild"}</p>
              </div>
              <span className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-semibold border border-amber-500/25 bg-amber-500/10 text-amber-400">
                {ROLE_LABELS[a.role]}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => revoke(a.id)}
                isLoading={revokingId === a.id}
                className="shrink-0 hover:text-red-300 hover:border-red-500/35"
              >
                Revoke
              </Button>
            </div>
          ))
        )}
      </div>

      <aside className="rounded-xl border border-amber-500/15 bg-amber-500/[0.035] p-3.5 space-y-3">
        <h4 className="text-[12px] font-semibold text-white">Grant role</h4>
        <label className="block">
          <span className="block text-[10px] uppercase tracking-[0.16em] text-white/45 mb-2">Member</span>
          <select
            value={selectedMemberId}
            onChange={(e) => setSelectedMemberId(e.target.value)}
            disabled={isLoadingMembers}
            className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-sm text-white focus:outline-none focus:border-amber-500/35 cursor-pointer"
          >
            <option className="bg-[#101014]" value="">Select a member…</option>
            {sortedMembers.map((m) => (
              <option key={m.id} className="bg-[#101014]" value={m.id}>
                {m.ign || m.user.displayName} — {m.guild?.name || "Guild"}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="block text-[10px] uppercase tracking-[0.16em] text-white/45 mb-2">Role</span>
          <select
            value={selectedRole}
            onChange={(e) => setSelectedRole(e.target.value as FactionCapabilityRole)}
            className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-sm text-white focus:outline-none focus:border-amber-500/35 cursor-pointer"
          >
            {ROLE_OPTIONS.map((role) => (
              <option key={role} className="bg-[#101014]" value={role}>
                {ROLE_LABELS[role]}
              </option>
            ))}
          </select>
        </label>
        <Button variant="secondary" size="sm" onClick={assign} isLoading={isSaving} disabled={!selectedMemberId}>
          Grant role
        </Button>
      </aside>
    </div>
  );
}
