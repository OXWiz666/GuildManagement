"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { LEGENDARY_CATEGORIES, LEGENDARY_CATEGORY_LABELS, LEGENDARY_STATUSES } from "@guild/shared";

const LEGENDARY_STATUS_LABELS: Record<string, string> = {
  PENDING: "Pending",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  COMPLETED: "Completed",
};
import { marketApi, type LegendaryRequestData } from "@/lib/api";
import { useQuery, queryClient } from "@/lib/query";
import { useToast } from "@/components/ui/Toast";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { Magnetic } from "@/components/dashboard/DashboardHelpers";
import { LegendaryCategoryBadge, MarketStatusBadge, PrioritySeqBadge } from "./MarketBadges";
import { useGearIcons, GearIcon } from "./useGearIcons";

interface Props {
  guildId: string;
}

export default function LegendaryPriorityTab({ guildId }: Props) {
  const { addToast } = useToast();
  const gearIcons = useGearIcons();
  const [showModal, setShowModal] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  const key = `market_legendary:${guildId}`;
  const { data, isLoading } = useQuery(
    key,
    async () => {
      const res = await marketApi.getLegendary(guildId);
      return res.success && res.data ? res.data : { requests: [], canManage: false };
    },
    { staleTime: 15000 },
  );

  const requests = (data?.requests || []) as LegendaryRequestData[];
  const canManage = data?.canManage || false;
  const refresh = () => queryClient.invalidateQueries(key);

  const filtered = requests.filter((r) => {
    if (categoryFilter !== "ALL" && r.category !== categoryFilter) return false;
    if (statusFilter !== "ALL" && r.status !== statusFilter) return false;
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    return (
      (r.member?.ign || "").toLowerCase().includes(s) ||
      r.category.toLowerCase().includes(s) ||
      (r.member?.user?.displayName || "").toLowerCase().includes(s)
    );
  });

  async function review(id: string, action: "APPROVED" | "REJECTED" | "COMPLETED") {
    setBusyId(id);
    try {
      const res = await marketApi.reviewLegendary(guildId, id, action);
      if (res.success) {
        addToast("success", `Marked ${action.toLowerCase()}.`);
        refresh();
      } else addToast("error", res.error?.message || "Action failed");
    } catch (err: any) {
      addToast("error", err?.message || "An error occurred");
    } finally {
      setBusyId(null);
    }
  }

  async function setSequence(id: string, current: number | null) {
    const input = window.prompt("Set priority sequence number (lower = higher priority):", current ? String(current) : "");
    if (input == null) return;
    const seq = parseInt(input, 10);
    if (isNaN(seq) || seq < 1) {
      addToast("error", "Enter a valid sequence number");
      return;
    }
    setBusyId(id);
    try {
      const res = await marketApi.setLegendarySequence(guildId, id, seq);
      if (res.success) {
        addToast("success", "Priority sequence updated.");
        refresh();
      } else addToast("error", res.error?.message || "Failed to set sequence");
    } catch (err: any) {
      addToast("error", err?.message || "An error occurred");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[200px]">
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="rounded-lg border border-white/[0.1] bg-black/30 px-2.5 py-1.5 text-[11px] text-white focus:border-cyan-500/50 focus:outline-none cursor-pointer"
          >
            <option value="ALL">All categories</option>
            {LEGENDARY_CATEGORIES.map((c) => (
              <option key={c} value={c}>{LEGENDARY_CATEGORY_LABELS[c]}</option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-white/[0.1] bg-black/30 px-2.5 py-1.5 text-[11px] text-white focus:border-cyan-500/50 focus:outline-none cursor-pointer"
          >
            <option value="ALL">All statuses</option>
            {LEGENDARY_STATUSES.map((s) => (
              <option key={s} value={s}>{LEGENDARY_STATUS_LABELS[s] || s}</option>
            ))}
          </select>
          <div className="relative flex-1 min-w-[160px] max-w-sm">
            <Input placeholder="Search by IGN or category…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>
        <Magnetic strength={4}>
          <Button variant="primary" size="sm" onClick={() => setShowModal(true)}>
            Request Priority
          </Button>
        </Magnetic>
      </div>

      {isLoading && requests.length === 0 ? (
        <Skeleton className="h-64 w-full rounded-2xl animate-pulse" />
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-sm text-white/35 border border-dashed border-white/[0.06] rounded-2xl">
          <p className="text-3xl mb-2">✨</p>
          No legendary priority requests yet.
        </div>
      ) : (
        <div className="rounded-2xl border border-white/[0.06] bg-[#0c0d12]/40 backdrop-blur overflow-auto scroll-fade-x max-h-[560px]">
          <table className="w-full text-[12px]">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-white/[0.08] bg-[#0d0e13] text-[10px] text-white/45 font-bold uppercase tracking-wider text-left">
                <th className="px-4 py-3">Seq</th>
                <th className="px-4 py-3">Member</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3 hidden md:table-cell">Reason</th>
                <th className="px-4 py-3">Status</th>
                {canManage && <th className="px-4 py-3 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04] text-white/70">
              {filtered.map((r, index) => (
                <tr
                  key={r.id}
                  className="market-row hover:bg-white/[0.02]"
                  style={{ animationDelay: `${Math.min(index, 16) * 35}ms` }}
                >
                  <td className="px-4 py-3">{r.prioritySeq ? <PrioritySeqBadge position={r.prioritySeq} /> : <span className="text-white/25">—</span>}</td>
                  <td className="px-4 py-3">
                    <span className="font-semibold text-white">{r.member?.ign || r.member?.user?.displayName || "Member"}</span>
                    <span className="block text-[10px] text-white/40">{r.member?.rankName}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-2">
                      <GearIcon src={gearIcons.iconForLegendary(r.category)} size={24} />
                      <LegendaryCategoryBadge category={r.category} />
                    </span>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell max-w-[260px]">
                    <span className="text-white/55 line-clamp-2">{r.reason || <span className="text-white/25">—</span>}</span>
                    {r.officerNote && <span className="block text-[10px] text-amber-300/70 mt-1">Officer: {r.officerNote}</span>}
                  </td>
                  <td className="px-4 py-3"><MarketStatusBadge status={r.status} legendary /></td>
                  {canManage && (
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 justify-end flex-wrap">
                        <Button variant="ghost" size="xs" onClick={() => setSequence(r.id, r.prioritySeq)} disabled={busyId === r.id} className="text-white/50">Seq</Button>
                        {r.status === "PENDING" && (
                          <>
                            <Button variant="ghost" size="xs" isLoading={busyId === r.id} onClick={() => review(r.id, "REJECTED")} className="text-rose-300/80">Reject</Button>
                            <Button variant="primary" size="xs" isLoading={busyId === r.id} onClick={() => review(r.id, "APPROVED")}>Approve</Button>
                          </>
                        )}
                        {r.status === "APPROVED" && (
                          <Button variant="accent" size="xs" isLoading={busyId === r.id} onClick={() => review(r.id, "COMPLETED")}>Complete</Button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && <LegendaryRequestModal guildId={guildId} onClose={() => setShowModal(false)} onSubmitted={refresh} />}
    </div>
  );
}

function LegendaryRequestModal({ guildId, onClose, onSubmitted }: { guildId: string; onClose: () => void; onSubmitted: () => void }) {
  const { addToast } = useToast();
  const gearIcons = useGearIcons();
  const [category, setCategory] = useState<string>(LEGENDARY_CATEGORIES[0]);
  const [currentGear, setCurrentGear] = useState("");
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const res = await marketApi.createLegendary(guildId, {
        category,
        currentGear: currentGear.trim() || undefined,
        reason: reason.trim() || undefined,
      });
      if (res.success) {
        addToast("success", "Priority request submitted! Officers notified.");
        onSubmitted();
        onClose();
      } else addToast("error", res.error?.message || "Failed to submit");
    } catch (err: any) {
      addToast("error", err?.message || "An error occurred");
    } finally {
      setIsSubmitting(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md animate-fade-in" onClick={() => !isSubmitting && onClose()} />
      <div className="relative glass-strong w-full max-w-lg rounded-3xl p-6 border border-white/[0.08] animate-scale-in z-50 overflow-hidden">
        <div aria-hidden className="absolute top-0 inset-x-0 h-24 pointer-events-none bg-gradient-to-b from-violet-500/[0.07] to-transparent" />
        <div className="relative z-10 space-y-5">
          <div>
            <p className="text-[10px] text-violet-300 font-bold uppercase tracking-[0.24em]">Legendary Priority</p>
            <h3 className="text-lg font-extrabold text-white tracking-tight mt-1">Request priority</h3>
            <p className="text-xs text-white/50 mt-1">Officers weigh contribution, rank, CP, points, and need.</p>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-white/50 mb-2">Category</label>
              <div className="grid grid-cols-2 gap-2">
                {LEGENDARY_CATEGORIES.map((c) => (
                  <button
                    type="button"
                    key={c}
                    onClick={() => setCategory(c)}
                    className={`flex items-center gap-2.5 py-2.5 px-3 rounded-xl border text-xs font-semibold transition-all cursor-pointer text-left ${
                      category === c
                        ? "border-violet-500/50 bg-violet-500/10 text-white"
                        : "border-white/[0.08] bg-white/[0.02] text-white/50 hover:text-white/80 hover:border-white/20"
                    }`}
                  >
                    <GearIcon src={gearIcons.iconForLegendary(c)} size={30} />
                    <span className="min-w-0 truncate">{LEGENDARY_CATEGORY_LABELS[c]}</span>
                  </button>
                ))}
              </div>
            </div>
            <Input label="Current gear status (optional)" placeholder="e.g. T3 weapon, no legend cloak" value={currentGear} onChange={(e) => setCurrentGear(e.target.value)} />
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-white/50 mb-2">Reason for priority</label>
              <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="Why should you be prioritized?" className="w-full rounded-xl bg-surface-100 border border-white/8 text-white placeholder-gray-500 px-4 py-3 text-sm focus:outline-none focus:border-primary-500/50 focus:ring-2 focus:ring-primary-500/20 resize-none" />
            </div>
            <div className="flex gap-3 justify-end border-t border-white/[0.06] pt-4">
              <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={isSubmitting} className="text-xs uppercase font-bold text-white/60">Cancel</Button>
              <Button type="submit" variant="primary" size="sm" isLoading={isSubmitting} className="text-xs uppercase font-bold min-w-[120px]">Submit</Button>
            </div>
          </form>
        </div>
      </div>
    </div>,
    document.body,
  );
}
