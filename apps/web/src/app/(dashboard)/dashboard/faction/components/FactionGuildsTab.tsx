"use client";

import { useState } from "react";
import { factionApi, type FactionGuildMembershipData } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import Button from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { useQuery, queryClient } from "@/lib/query";

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: "border-emerald-500/25 bg-emerald-500/10 text-emerald-400",
  PENDING: "border-amber-500/25 bg-amber-500/10 text-amber-400",
  SUSPENDED: "border-orange-500/25 bg-orange-500/10 text-orange-400",
  REMOVED: "border-white/[0.08] bg-white/[0.03] text-white/40",
  LEFT_FACTION: "border-white/[0.08] bg-white/[0.03] text-white/40",
};
const PAGE_SIZE = 6;

/**
 * Faction Guilds — contribution requirement / assigned label / notes per
 * member guild. Distinct from the "Manage guilds" remove-from-faction
 * section in FactionMembersTab; this is metadata editing only.
 */
export default function FactionGuildsTab({ canManage }: { canManage: boolean }) {
  const { addToast } = useToast();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState({ contributionRequirement: "", assignedFactionRole: "", notes: "" });
  const [isSaving, setIsSaving] = useState(false);
  const [page, setPage] = useState(1);

  const { data: membershipsRaw, isLoading } = useQuery<FactionGuildMembershipData[]>(
    canManage ? "faction_guild_memberships" : "faction_guild_memberships_locked",
    async () => {
      if (!canManage) return [];
      const result = await factionApi.getGuildMemberships();
      return result.success && result.data?.memberships ? result.data.memberships : [];
    },
    { persist: true, staleTime: 30000 },
  );
  const memberships = membershipsRaw || [];
  const totalPages = Math.max(1, Math.ceil(memberships.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedMemberships = memberships.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  function startEdit(m: FactionGuildMembershipData) {
    setEditingId(m.id);
    setDraft({
      contributionRequirement: m.contributionRequirement || "",
      assignedFactionRole: m.assignedFactionRole || "",
      notes: m.notes || "",
    });
  }

  async function save(guildId: string) {
    setIsSaving(true);
    try {
      const result = await factionApi.updateGuildMembership(guildId, {
        contributionRequirement: draft.contributionRequirement || null,
        assignedFactionRole: draft.assignedFactionRole || null,
        notes: draft.notes || null,
      });
      if (result.success) {
        addToast("success", "Guild membership updated");
        setEditingId(null);
        queryClient.invalidateQueries("faction_guild_memberships");
      } else {
        addToast("error", result.error?.message || "Failed to update guild membership");
      }
    } finally {
      setIsSaving(false);
    }
  }

  if (!canManage) {
    return (
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-8 text-center">
        <h3 className="text-sm font-semibold text-white/80">Guild details are restricted</h3>
        <p className="text-xs text-white/45 mt-1">Only Faction Leaders and Admins can manage per-guild contribution details.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
      </div>
    );
  }

  if (memberships.length === 0) {
    return (
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-8 text-center">
        <h3 className="text-sm font-semibold text-white/80">No guilds yet</h3>
        <p className="text-xs text-white/45 mt-1">Invite guilds from the Overview tab to see them here.</p>
      </div>
    );
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-col gap-1 px-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-white/80">Guild membership details</h3>
          <p className="text-[11px] text-white/35">Contribution requirements, guild labels, and officer notes.</p>
        </div>
        <span className="text-[11px] text-white/35">{memberships.length} guild{memberships.length === 1 ? "" : "s"}</span>
      </div>
      <div className="space-y-2">
      {pagedMemberships.map((m) => {
        const isEditing = editingId === m.id;
        return (
          <article key={m.id} className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-4">
            <div className="flex items-start justify-between gap-4 mb-3">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-white truncate">{m.guildName || "Guild"}</h3>
                <p className="text-[11px] text-white/35 mt-1">Joined {new Date(m.joinedAt).toLocaleDateString()}</p>
              </div>
              <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${STATUS_STYLES[m.status] || STATUS_STYLES.ACTIVE}`}>
                {m.status.replaceAll("_", " ")}
              </span>
            </div>

            {isEditing ? (
              <div className="space-y-3">
                <label className="block">
                  <span className="block text-[10px] uppercase tracking-[0.16em] text-white/45 mb-1.5">Contribution requirement</span>
                  <input
                    value={draft.contributionRequirement}
                    onChange={(e) => setDraft((prev) => ({ ...prev, contributionRequirement: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-sm text-white focus:outline-none focus:border-amber-500/35"
                  />
                </label>
                <label className="block">
                  <span className="block text-[10px] uppercase tracking-[0.16em] text-white/45 mb-1.5">Assigned label</span>
                  <input
                    value={draft.assignedFactionRole}
                    onChange={(e) => setDraft((prev) => ({ ...prev, assignedFactionRole: e.target.value }))}
                    placeholder="e.g. Core Guild"
                    className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-amber-500/35"
                  />
                </label>
                <label className="block">
                  <span className="block text-[10px] uppercase tracking-[0.16em] text-white/45 mb-1.5">Notes</span>
                  <textarea
                    value={draft.notes}
                    onChange={(e) => setDraft((prev) => ({ ...prev, notes: e.target.value }))}
                    rows={2}
                    className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-sm text-white focus:outline-none focus:border-amber-500/35 resize-none"
                  />
                </label>
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" onClick={() => save(m.guildId)} isLoading={isSaving}>
                    Save
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-1.5">
                <p className="text-sm text-white/70">
                  <span className="text-white/40">Requirement: </span>
                  {m.contributionRequirement || <span className="text-white/30">Not set</span>}
                </p>
                <p className="text-sm text-white/70">
                  <span className="text-white/40">Label: </span>
                  {m.assignedFactionRole || <span className="text-white/30">Not set</span>}
                </p>
                {m.notes && <p className="text-sm text-white/55 leading-relaxed">{m.notes}</p>}
                <button onClick={() => startEdit(m)} className="mt-2 text-[11px] text-amber-400 hover:text-amber-300 cursor-pointer">
                  Edit
                </button>
              </div>
            )}
          </article>
        );
      })}
      </div>
      <Pagination page={safePage} totalPages={totalPages} totalItems={memberships.length} onPageChange={setPage} />
    </section>
  );
}

function Pagination({
  page,
  totalPages,
  totalItems,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  totalItems: number;
  onPageChange: (page: number) => void;
}) {
  if (totalItems <= PAGE_SIZE) return null;
  const start = (page - 1) * PAGE_SIZE + 1;
  const end = Math.min(totalItems, page * PAGE_SIZE);

  return (
    <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-[11px] text-white/35">
        Showing {start}-{end} of {totalItems} guilds
      </p>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          Previous
        </Button>
        <span className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[11px] font-semibold text-white/55">
          {page} / {totalPages}
        </span>
        <Button variant="ghost" size="sm" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
          Next
        </Button>
      </div>
    </div>
  );
}
