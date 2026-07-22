"use client";

import { useState, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  LEGENDARY_CATEGORIES,
  LEGENDARY_CATEGORY_LABELS,
  LEGENDARY_STATUSES,
  WEAPON_TYPES,
  ACCESSORY_PIECES,
  WISHLIST_LABELS,
} from "@guild/shared";

const LEGENDARY_STATUS_LABELS: Record<string, string> = {
  PENDING: "Pending",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  COMPLETED: "Completed",
};

// Which categories break down into specific items, and from which catalog.
const LEGENDARY_ITEM_OPTIONS: Record<string, Record<string, string>> = {
  WEAPON: WEAPON_TYPES,
  LEGEND_ACCESSORIES: ACCESSORY_PIECES,
};
const legendaryItemLabel = (itemKey: string | null | undefined) =>
  itemKey ? WISHLIST_LABELS[itemKey] || itemKey : null;
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

// Active requests vs the settled record — mirrors the wishlist tab's
// Priority Queue / board split so officers can audit past awards.
type LegendaryView = "active" | "history";
const ACTIVE_STATUSES = new Set(["PENDING", "APPROVED"]);

export default function LegendaryPriorityTab({ guildId }: Props) {
  const { addToast } = useToast();
  const gearIcons = useGearIcons();
  const [showModal, setShowModal] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<LegendaryView>("active");
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

  const requests = useMemo(() => (data?.requests || []) as LegendaryRequestData[], [data]);
  const canManage = data?.canManage || false;
  const refresh = () => queryClient.invalidateQueries(key);

  const filtered = useMemo(() => {
    const pool = requests.filter((r) =>
      view === "active" ? ACTIVE_STATUSES.has(r.status) : !ACTIVE_STATUSES.has(r.status),
    );
    const searched = pool.filter((r) => {
      if (categoryFilter !== "ALL" && r.category !== categoryFilter) return false;
      if (statusFilter !== "ALL" && r.status !== statusFilter) return false;
      if (!search.trim()) return true;
      const s = search.toLowerCase();
      return (
        (r.member?.ign || "").toLowerCase().includes(s) ||
        r.category.toLowerCase().includes(s) ||
        (legendaryItemLabel(r.itemKey) || "").toLowerCase().includes(s) ||
        (r.member?.user?.displayName || "").toLowerCase().includes(s)
      );
    });
    if (view === "history") {
      // Most recently settled first.
      return [...searched].sort(
        (a, b) =>
          new Date(b.completedAt || b.reviewedAt || b.createdAt).getTime() -
          new Date(a.completedAt || a.reviewedAt || a.createdAt).getTime(),
      );
    }
    return searched;
  }, [requests, view, categoryFilter, statusFilter, search]);

  const historyCount = useMemo(() => requests.filter((r) => !ACTIVE_STATUSES.has(r.status)).length, [requests]);
  const activeCount = requests.length - historyCount;
  const viewStatuses = view === "active" ? ["PENDING", "APPROVED"] : ["COMPLETED", "REJECTED"];

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
        <div className="inline-flex items-center gap-1 rounded-xl border border-white/[0.08] bg-[#0c0d12]/60 p-1">
          {(["active", "history"] as LegendaryView[]).map((v) => (
            <button
              key={v}
              onClick={() => {
                setView(v);
                setStatusFilter("ALL");
              }}
              className={`rounded-lg px-3 py-1.5 text-[11px] font-bold transition-all cursor-pointer ${
                view === v ? "bg-white/[0.08] text-white" : "text-white/45 hover:text-white/80"
              }`}
            >
              {v === "active" ? "Requests" : "History"}
              <span className={`ml-1.5 rounded px-1 text-[9px] font-mono ${view === v ? "bg-violet-400/20 text-violet-200" : "bg-white/[0.07] text-white/45"}`}>
                {v === "active" ? activeCount : historyCount}
              </span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[200px] justify-end">
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
            {LEGENDARY_STATUSES.filter((s) => viewStatuses.includes(s)).map((s) => (
              <option key={s} value={s}>{LEGENDARY_STATUS_LABELS[s] || s}</option>
            ))}
          </select>
          <div className="relative flex-1 min-w-[160px] max-w-sm">
            <Input placeholder="Search by IGN, category, item…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Magnetic strength={4}>
            <Button variant="primary" size="sm" onClick={() => setShowModal(true)}>
              Request Priority
            </Button>
          </Magnetic>
        </div>
      </div>

      {isLoading && requests.length === 0 ? (
        <Skeleton className="h-64 w-full rounded-2xl animate-pulse" />
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-sm text-white/35 border border-dashed border-white/[0.06] rounded-2xl">
          <p className="text-3xl mb-2">{view === "active" ? "✨" : "📜"}</p>
          {view === "active" ? "No active legendary priority requests." : "No completed or rejected requests yet."}
        </div>
      ) : (
        <div className="rounded-2xl border border-white/[0.06] bg-[#0c0d12]/40 backdrop-blur overflow-auto scroll-fade-x max-h-[560px]">
          <table className="w-full text-[12px] min-w-[640px]">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-white/[0.08] bg-[#0d0e13] text-[10px] text-white/45 font-bold uppercase tracking-wider text-left">
                {view === "active" && <th className="px-4 py-3">Seq</th>}
                <th className="px-4 py-3">Member</th>
                <th className="px-4 py-3">Item</th>
                <th className="px-4 py-3 hidden md:table-cell">Reason</th>
                {view === "history" && <th className="px-4 py-3">Settled</th>}
                <th className="px-4 py-3">Status</th>
                {canManage && view === "active" && <th className="px-4 py-3 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04] text-white/70">
              {filtered.map((r, index) => (
                <tr
                  key={r.id}
                  className="market-row hover:bg-white/[0.02]"
                  style={{ animationDelay: `${Math.min(index, 16) * 35}ms` }}
                >
                  {view === "active" && (
                    <td className="px-4 py-3">{r.prioritySeq ? <PrioritySeqBadge position={r.prioritySeq} /> : <span className="text-white/25">—</span>}</td>
                  )}
                  <td className="px-4 py-3">
                    <span className="font-semibold text-white">{r.member?.ign || r.member?.user?.displayName || "Member"}</span>
                    <span className="block text-[10px] text-white/40">{r.member?.rankName}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-2">
                      <GearIcon src={r.itemKey ? gearIcons.iconForSlot(r.itemKey) : gearIcons.iconForLegendary(r.category)} size={24} />
                      <span className="min-w-0">
                        <LegendaryCategoryBadge category={r.category} />
                        {r.itemKey && (
                          <span className="block text-[10px] font-semibold text-violet-200/80 mt-0.5">
                            {legendaryItemLabel(r.itemKey)}
                          </span>
                        )}
                      </span>
                    </span>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell max-w-[260px]">
                    <span className="text-white/55 line-clamp-2">{r.reason || <span className="text-white/25">—</span>}</span>
                    {r.officerNote && <span className="block text-[10px] text-amber-300/70 mt-1">Officer: {r.officerNote}</span>}
                  </td>
                  {view === "history" && (
                    <td className="px-4 py-3 text-white/50 font-mono text-[11px]">
                      {new Date(r.completedAt || r.reviewedAt || r.createdAt).toLocaleDateString()}
                    </td>
                  )}
                  <td className="px-4 py-3"><MarketStatusBadge status={r.status} legendary /></td>
                  {canManage && view === "active" && (
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

function StepTag({ n, label, optional = false }: { n: number; label: string; optional?: boolean }) {
  return (
    <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-white/50 mb-2">
      <span className="h-[18px] w-[18px] shrink-0 rounded-full border border-violet-400/40 text-violet-300 text-[9px] font-bold flex items-center justify-center">
        {n}
      </span>
      {label}
      {optional && <span className="text-white/25 normal-case tracking-normal font-normal">(optional)</span>}
    </label>
  );
}

function LegendaryRequestModal({ guildId, onClose, onSubmitted }: { guildId: string; onClose: () => void; onSubmitted: () => void }) {
  const { addToast } = useToast();
  const gearIcons = useGearIcons();
  const [category, setCategory] = useState<string>(LEGENDARY_CATEGORIES[0]);
  const [itemKey, setItemKey] = useState<string | null>(null);
  const [currentGear, setCurrentGear] = useState("");
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const itemOptions = LEGENDARY_ITEM_OPTIONS[category];

  function pickCategory(c: string) {
    setCategory(c);
    setItemKey(null); // an item only makes sense within its own category
  }

  async function handleSubmit(e: React.SyntheticEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const res = await marketApi.createLegendary(guildId, {
        category,
        itemKey: itemKey || undefined,
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
      <div className="relative glass-strong w-full max-w-xl rounded-3xl border border-white/[0.08] animate-scale-in z-50 overflow-hidden max-h-[90vh] flex flex-col">
        <div aria-hidden className="absolute top-0 inset-x-0 h-24 pointer-events-none bg-gradient-to-b from-violet-500/[0.07] to-transparent" />

        <div className="relative z-10 px-6 pt-6 pb-4 shrink-0 flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] text-violet-300 font-bold uppercase tracking-[0.24em]">Legendary Priority</p>
            <h3 className="text-lg font-extrabold text-white tracking-tight mt-1">Request priority</h3>
            <p className="text-xs text-white/50 mt-1">Officers weigh contribution, rank, CP, points, and need.</p>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="h-8 w-8 shrink-0 rounded-lg hover:bg-white/[0.06] text-white/50 hover:text-white transition-colors cursor-pointer"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="relative z-10 flex-1 overflow-y-auto px-6 pb-2 space-y-5">
          <div>
            <StepTag n={1} label="Category" />
            <div className="grid grid-cols-2 gap-2">
              {LEGENDARY_CATEGORIES.map((c) => (
                <button
                  type="button"
                  key={c}
                  onClick={() => pickCategory(c)}
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

          {itemOptions && (
            <div>
              <StepTag n={2} label="Specific item" optional />
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {Object.entries(itemOptions).map(([key, label]) => {
                  const on = itemKey === key;
                  return (
                    <button
                      type="button"
                      key={key}
                      onClick={() => setItemKey(on ? null : key)}
                      className={`flex items-center gap-2 py-2 px-2.5 rounded-xl border text-[11px] font-semibold transition-all cursor-pointer text-left ${
                        on
                          ? "border-violet-500/50 bg-violet-500/10 text-white"
                          : "border-white/[0.08] bg-white/[0.02] text-white/50 hover:text-white/80 hover:border-white/20"
                      }`}
                    >
                      <GearIcon src={gearIcons.iconForSlot(key)} size={24} />
                      <span className="min-w-0 truncate">{label}</span>
                    </button>
                  );
                })}
              </div>
              <p className="mt-1.5 text-[10px] text-white/30">
                Leave unselected to request the category in general — officers see exactly what you need either way.
              </p>
            </div>
          )}

          <div>
            <StepTag n={itemOptions ? 3 : 2} label="Current gear status" optional />
            <Input placeholder="e.g. T3 weapon, no legend cloak" value={currentGear} onChange={(e) => setCurrentGear(e.target.value)} />
          </div>

          <div>
            <StepTag n={itemOptions ? 4 : 3} label="Reason for priority" />
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="Why should you be prioritized?" className="w-full rounded-xl bg-surface-100 border border-white/8 text-white placeholder-gray-500 px-4 py-3 text-sm focus:outline-none focus:border-primary-500/50 focus:ring-2 focus:ring-primary-500/20 resize-none" />
          </div>
        </form>

        <div className="relative z-10 flex items-center justify-between gap-3 border-t border-white/[0.06] px-6 py-4 shrink-0">
          <span className="text-[11px] text-white/40 truncate">
            {LEGENDARY_CATEGORY_LABELS[category as keyof typeof LEGENDARY_CATEGORY_LABELS]}
            {itemKey ? ` · ${legendaryItemLabel(itemKey)}` : ""}
          </span>
          <div className="flex gap-3">
            <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={isSubmitting} className="text-xs uppercase font-bold text-white/60">Cancel</Button>
            <Button variant="primary" size="sm" isLoading={isSubmitting} onClick={handleSubmit} className="text-xs uppercase font-bold min-w-[120px]">Submit</Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
