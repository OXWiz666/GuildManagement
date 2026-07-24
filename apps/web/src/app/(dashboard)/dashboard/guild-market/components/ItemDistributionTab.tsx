"use client";

import { useState, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  CORE_SLOTS,
  NON_CORE_SLOTS,
  SLOT_LABELS,
  WEAPON_TYPES,
  ARMOR_PIECES,
  ACCESSORY_PIECES,
  MATERIAL_TYPES,
  WEAPON_RARITIES,
  GEAR_RARITIES,
  WISHLIST_RARITY_LABELS,
  ARMOR_TYPES,
  ARMOR_TYPE_LABELS,
  WISHLIST_LABELS,
  WISHLIST_STATUS_LABELS,
  WISHLIST_CATEGORY_LABELS,
  DISTRIBUTION_TIERS,
  DISTRIBUTION_TIER_LABELS,
  type WishlistItem,
  type WishlistRarity,
  type WishlistStatus,
  type WishlistCategory,
  type ArmorType,
  type DistributionTier,
} from "@guild/shared";
import {
  marketApi,
  type PriorityQueueEntry,
  type WishlistCaps,
  type WishlistSummary,
  type MountCatalogItem,
} from "@/lib/api";
import { useQuery, queryClient } from "@/lib/query";
import { useToast } from "@/components/ui/Toast";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import ConfirmModal from "@/components/ui/ConfirmModal";
import { RankTierBadge, PrioritySeqBadge } from "./MarketBadges";
import { useGearIcons, GearIcon, type GearIconResolver } from "./useGearIcons";

// Slots entered as a numeric quantity; everything else is a yes/no gear flag (officer Distribute form).
const QUANTITY_SLOTS = new Set([
  "logs",
  "temporalPieces",
  "temporalPiece",
  "materials",
  "itemLog",
  "upgradeScrolls",
]);

const RARITY_BADGE: Record<WishlistRarity, string> = {
  LEGEND: "bg-amber-500/15 text-amber-200 border-amber-500/30",
  EPIC: "bg-fuchsia-500/15 text-fuchsia-200 border-fuchsia-500/30",
  MYTHIC: "bg-rose-500/15 text-rose-200 border-rose-500/30",
};

const ARMOR_TYPE_BADGE = "bg-sky-500/15 text-sky-200 border-sky-500/30";

const keyOf = (item: Pick<WishlistItem, "category" | "key">) => `${item.category}:${item.key}`;
const wishLabel = (item: WishlistItem) => WISHLIST_LABELS[item.key] || SLOT_LABELS[item.key] || item.key;

// Gear first, then mount, then consumables — matches how members think about their picks.
const WISHLIST_GROUP_ORDER: WishlistCategory[] = [
  "WEAPON",
  "ARMOR",
  "ACCESSORY",
  "MOUNT",
  "LOGS",
  "TEMPORAL",
  "MATERIALS",
];

// ─── Reusable presentational chip for a single wish ───────────────────
function WishChip({
  item,
  iconSrc,
  size = 16,
  distributed = false,
}: {
  item: WishlistItem;
  iconSrc: string | null;
  size?: number;
  distributed?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 pl-1 pr-2 py-0.5 rounded-md text-[11px] border ${
        distributed
          ? "bg-emerald-500/[0.06] text-emerald-200/60 border-emerald-500/20"
          : "bg-cyan-500/10 text-cyan-200 border-cyan-500/20"
      }`}
    >
      <GearIcon src={iconSrc} size={size} />
      <span className={`truncate max-w-[140px] ${distributed ? "line-through decoration-emerald-400/40" : ""}`}>
        {wishLabel(item)}
      </span>
      {item.armorType && (
        <span className={`px-1 rounded text-[9px] font-bold border ${ARMOR_TYPE_BADGE}`}>
          {ARMOR_TYPE_LABELS[item.armorType]}
        </span>
      )}
      {item.rarity && (
        <span className={`px-1 rounded text-[9px] font-bold border ${RARITY_BADGE[item.rarity]}`}>
          {WISHLIST_RARITY_LABELS[item.rarity]}
        </span>
      )}
      {typeof item.quantity === "number" && (
        <span className="text-[10px] font-mono text-white/60">×{item.quantity}</span>
      )}
      {distributed && <span aria-hidden className="text-emerald-400">✓</span>}
    </span>
  );
}

// ─── Wishlist distribution status badge ───────────────────────────────
function WishlistStatusBadge({ summary }: { summary?: WishlistSummary }) {
  const total = summary?.total ?? 0;
  const distributed = summary?.distributed ?? 0;
  if (total === 0) {
    return <span className="text-[10px] text-white/30">No wishes</span>;
  }
  if (distributed === 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-200">
        Pending
      </span>
    );
  }
  if (distributed >= total) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-200">
        All distributed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-bold text-cyan-200">
      {distributed}/{total} distributed
    </span>
  );
}

// Small pill for a single item's status (used in master list + detail modal).
function ItemStatusPill({ status }: { status: WishlistStatus }) {
  const distributed = status === "DISTRIBUTED";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-bold ${
        distributed
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
          : "border-amber-500/30 bg-amber-500/10 text-amber-200"
      }`}
    >
      {WISHLIST_STATUS_LABELS[status]}
    </span>
  );
}

// ─── Shared member sort/filter — drives both Priority Queue and Master List ──

type SortField = "SEQUENCE" | "TIER" | "CP" | "POINTS" | "STATUS";
const SORT_FIELD_LABELS: Record<SortField, string> = {
  SEQUENCE: "Sequence",
  TIER: "Tier",
  CP: "CP",
  POINTS: "Points",
  STATUS: "Status",
};
const SORT_FIELDS: SortField[] = ["SEQUENCE", "TIER", "CP", "POINTS", "STATUS"];

const TIER_RANK: Record<string, number> = { CORE: 0, ELITE: 1, MEMBER: 2 };

// Members with pending wishes surface first (most actionable), then members with
// no wishes at all, then fully-distributed members last.
function statusRank(summary: WishlistSummary): number {
  if (summary.total === 0) return 1;
  if (summary.distributed >= summary.total) return 2;
  return 0;
}

function sortQueue(list: PriorityQueueEntry[], field: SortField): PriorityQueueEntry[] {
  const arr = [...list];
  switch (field) {
    case "TIER":
      arr.sort((a, b) => (TIER_RANK[a.tier] ?? 9) - (TIER_RANK[b.tier] ?? 9) || a.position - b.position);
      break;
    case "CP":
      arr.sort((a, b) => b.cp - a.cp || a.position - b.position);
      break;
    case "POINTS":
      arr.sort((a, b) => b.dkp - a.dkp || a.position - b.position);
      break;
    case "STATUS":
      arr.sort((a, b) => statusRank(a.wishlistSummary) - statusRank(b.wishlistSummary) || a.position - b.position);
      break;
    case "SEQUENCE":
    default:
      arr.sort((a, b) => a.position - b.position);
  }
  return arr;
}

interface Props {
  guildId: string;
  isOfficer: boolean;
}

type WishlistView = "queue" | "master";

export default function ItemDistributionTab({ guildId, isOfficer }: Props) {
  const { addToast } = useToast();
  const [search, setSearch] = useState("");
  const [view, setView] = useState<WishlistView>("queue");
  const [sortBy, setSortBy] = useState<SortField>("SEQUENCE");
  const [tierFilter, setTierFilter] = useState<DistributionTier | "ALL">("ALL");
  const [target, setTarget] = useState<PriorityQueueEntry | null>(null);
  const [detailMember, setDetailMember] = useState<PriorityQueueEntry | null>(null);
  const [showNotify, setShowNotify] = useState(false);
  const [notifyMember, setNotifyMember] = useState<PriorityQueueEntry | null>(null);

  const key = `market_priority:${guildId}`;
  const { data, isLoading } = useQuery(
    key,
    async () => {
      const res = await marketApi.getPriorityQueue(guildId);
      return res.success && res.data ? res.data.queue : [];
    },
    { staleTime: 15000 },
  );
  const queue = useMemo(() => (data || []) as PriorityQueueEntry[], [data]);
  const refresh = () => {
    queryClient.invalidateQueries(key);
    queryClient.invalidateQueries(`market_distributions:${guildId}`);
    queryClient.invalidateQueries(`wishlist_master:${guildId}`);
    queryClient.invalidateQueries(`market_wishlist:${guildId}`);
  };

  const visibleQueue = useMemo(() => {
    const searched = queue.filter((m) => {
      if (!search.trim()) return true;
      const s = search.toLowerCase();
      return m.ign.toLowerCase().includes(s) || m.role.toLowerCase().includes(s) || m.tier.toLowerCase().includes(s);
    });
    const tierFiltered = tierFilter === "ALL" ? searched : searched.filter((m) => m.tier === tierFilter);
    return sortQueue(tierFiltered, sortBy);
  }, [queue, search, tierFilter, sortBy]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* View toggle */}
        <div className="inline-flex items-center gap-1 rounded-xl border border-white/[0.08] bg-[#0c0d12]/60 p-1">
          {(["queue", "master"] as WishlistView[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`rounded-lg px-3 py-1.5 text-[11px] font-bold transition-all cursor-pointer ${
                view === v ? "bg-white/[0.08] text-white" : "text-white/45 hover:text-white/80"
              }`}
            >
              {v === "queue" ? "Priority Queue" : "Guild Wishlists"}
            </button>
          ))}
        </div>
        <div className="flex flex-1 flex-wrap items-center justify-end gap-2 min-w-[200px]">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortField)}
            className="rounded-lg border border-white/[0.1] bg-black/30 px-2.5 py-1.5 text-[11px] text-white focus:border-cyan-500/50 focus:outline-none cursor-pointer"
          >
            {SORT_FIELDS.map((f) => (
              <option key={f} value={f}>
                Sort: {SORT_FIELD_LABELS[f]}
              </option>
            ))}
          </select>
          <select
            value={tierFilter}
            onChange={(e) => setTierFilter(e.target.value as DistributionTier | "ALL")}
            className="rounded-lg border border-white/[0.1] bg-black/30 px-2.5 py-1.5 text-[11px] text-white focus:border-cyan-500/50 focus:outline-none cursor-pointer"
          >
            <option value="ALL">All tiers</option>
            {DISTRIBUTION_TIERS.map((t) => (
              <option key={t} value={t}>
                {DISTRIBUTION_TIER_LABELS[t]}
              </option>
            ))}
          </select>
          <div className="max-w-xs flex-1 min-w-[160px]">
            <Input placeholder="Search members…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          {isOfficer && (
            <Button variant="secondary" size="sm" onClick={() => setShowNotify(true)}>
              Notify
            </Button>
          )}
        </div>
      </div>

      {/* Every guild member — including officers & leaders — builds their own wishlist */}
      <MyWishlistCard guildId={guildId} />

      {view === "master" ? (
        <MasterListView guildId={guildId} isOfficer={isOfficer} queue={visibleQueue} onDone={refresh} />
      ) : isLoading && queue.length === 0 ? (
        <Skeleton className="h-64 w-full rounded-2xl animate-pulse" />
      ) : visibleQueue.length === 0 ? (
        <div className="text-center py-16 text-sm text-white/35 border border-dashed border-white/[0.06] rounded-2xl">No members to display.</div>
      ) : (
        <div className="rounded-2xl border border-white/[0.06] bg-[#0c0d12]/40 backdrop-blur overflow-auto scroll-fade-x max-h-[600px]">
          <table className="w-full text-[12px] min-w-[560px]">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-white/[0.08] bg-[#0d0e13] text-[10px] text-white/45 font-bold uppercase tracking-wider text-left">
                <th className="px-4 py-3">#</th>
                <th className="px-4 py-3">Member</th>
                <th className="px-4 py-3">Tier</th>
                <th className="px-4 py-3 text-right">CP</th>
                <th className="px-4 py-3 text-right">Points</th>
                <th className="px-4 py-3">Status</th>
                {isOfficer && <th className="px-4 py-3 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04] text-white/70">
              {visibleQueue.map((m, index) => (
                <tr
                  key={m.memberId}
                  className="market-row hover:bg-white/[0.02]"
                  style={{ animationDelay: `${Math.min(index, 16) * 35}ms` }}
                >
                  <td className="px-4 py-3"><PrioritySeqBadge position={m.position} /></td>
                  <td className="px-4 py-3">
                    <span className="font-semibold text-white">{m.ign}</span>
                    <span className="block text-[10px] text-white/40">
                      {m.rankName}
                      {m.manualSeq != null && <span className="text-amber-300/70"> · pinned</span>}
                    </span>
                  </td>
                  <td className="px-4 py-3"><RankTierBadge tier={m.tier} /></td>
                  <td className="px-4 py-3 text-right font-mono">{m.cp.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right font-mono">{m.dkp.toLocaleString()}</td>
                  <td className="px-4 py-3"><WishlistStatusBadge summary={m.wishlistSummary} /></td>
                  {isOfficer && (
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 justify-end">
                        <Button variant="ghost" size="xs" onClick={() => setDetailMember(m)} className="text-white/60">Wishlist</Button>
                        <Button variant="ghost" size="xs" onClick={() => setNotifyMember(m)} className="text-white/50">Notify</Button>
                        <Button variant="primary" size="xs" onClick={() => setTarget(m)}>Distribute</Button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {target && (
        <DistributeModal guildId={guildId} member={target} onClose={() => setTarget(null)} onDone={refresh} />
      )}
      {detailMember && (
        <WishlistDetailModal
          guildId={guildId}
          member={detailMember}
          isOfficer={isOfficer}
          onClose={() => setDetailMember(null)}
          onDone={refresh}
        />
      )}
      {(showNotify || notifyMember) && (
        <NotifyModal
          guildId={guildId}
          member={notifyMember}
          onClose={() => {
            setShowNotify(false);
            setNotifyMember(null);
          }}
        />
      )}
    </div>
  );
}

// ─── Officer: record a distribution against a member ──────────────────

// Map a member's structured wish to a slot key on the officer Distribute form (best-effort).
const GEAR_SLOT_ALIASES: Record<string, string> = { helmet: "headpiece", shoes: "boots" };

function wishToFormSlot(item: WishlistItem, formSlots: readonly string[]): { slot: string; qty?: number } | null {
  const has = (k: string) => formSlots.includes(k);
  switch (item.category) {
    case "WEAPON":
      return has("weapon") ? { slot: "weapon" } : null;
    case "ARMOR":
    case "ACCESSORY": {
      if (has(item.key)) return { slot: item.key };
      const alias = GEAR_SLOT_ALIASES[item.key];
      return alias && has(alias) ? { slot: alias } : null;
    }
    case "LOGS":
      if (has("logs")) return { slot: "logs", qty: item.quantity };
      if (has("itemLog")) return { slot: "itemLog", qty: item.quantity };
      return null;
    case "TEMPORAL":
      if (has("temporalPieces")) return { slot: "temporalPieces", qty: item.quantity };
      if (has("temporalPiece")) return { slot: "temporalPiece", qty: item.quantity };
      return null;
    case "MATERIALS":
      return has("materials") ? { slot: "materials", qty: item.quantity } : null;
    default:
      return null;
  }
}

function DistributeModal({
  guildId,
  member,
  onClose,
  onDone,
}: {
  guildId: string;
  member: PriorityQueueEntry;
  onClose: () => void;
  onDone: () => void;
}) {
  const { addToast } = useToast();
  const gearIcons = useGearIcons();
  const formType: "CORE" | "NON_CORE" = member.tier === "CORE" ? "CORE" : "NON_CORE";
  const slots = formType === "CORE" ? CORE_SLOTS : NON_CORE_SLOTS;

  // Pre-fill the form from the member's structured wishlist
  const [items, setItems] = useState<Record<string, number | boolean>>(() => {
    const init: Record<string, number | boolean> = {};
    for (const w of member.wishlist || []) {
      const mapped = wishToFormSlot(w, slots);
      if (!mapped) continue;
      if (QUANTITY_SLOTS.has(mapped.slot)) {
        init[mapped.slot] = ((init[mapped.slot] as number) || 0) + (mapped.qty || 0);
      } else {
        init[mapped.slot] = true;
      }
    }
    return init;
  });
  const [note, setNote] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const setQty = (slot: string, v: string) => {
    const n = parseInt(v, 10);
    setItems((prev) => ({ ...prev, [slot]: isNaN(n) ? 0 : n }));
  };
  const toggle = (slot: string) => setItems((prev) => ({ ...prev, [slot]: !prev[slot] }));

  const selectedCount = Object.values(items).filter((v) => (typeof v === "number" ? v > 0 : v)).length;

  async function submit() {
    setIsSubmitting(true);
    try {
      const payload: Record<string, number | boolean> = {};
      for (const [k, v] of Object.entries(items)) {
        if ((typeof v === "number" && v > 0) || v === true) payload[k] = v;
      }
      const res = await marketApi.createDistribution(guildId, {
        memberId: member.memberId,
        formType,
        items: payload,
        note: note.trim() || undefined,
        overrideReason: overrideReason.trim() || undefined,
      });
      if (res.success) {
        addToast("success", `Distribution recorded for ${member.ign}.`);
        onDone();
        onClose();
      } else {
        addToast("error", res.error?.message || "Failed to distribute");
        setConfirming(false);
      }
    } catch (err: any) {
      addToast("error", err?.message || "An error occurred");
      setConfirming(false);
    } finally {
      setIsSubmitting(false);
    }
  }

  return createPortal(
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/80 backdrop-blur-md animate-fade-in" onClick={() => !isSubmitting && onClose()} />
        <div className="relative glass-strong w-full max-w-2xl rounded-3xl p-6 border border-white/[0.08] animate-scale-in z-50 overflow-hidden max-h-[90vh] flex flex-col">
          <div aria-hidden className="absolute top-0 inset-x-0 h-24 pointer-events-none bg-gradient-to-b from-cyan-500/[0.06] to-transparent" />
          <div className="relative z-10 flex items-center justify-between gap-3 mb-4">
            <div>
              <p className="text-[10px] text-cyan-300 font-bold uppercase tracking-[0.24em]">Item Distribution</p>
              <h3 className="text-lg font-extrabold text-white tracking-tight mt-1 flex items-center gap-2">
                {member.ign} <RankTierBadge tier={member.tier} />
              </h3>
              <p className="text-xs text-white/50 mt-0.5">{formType === "CORE" ? "Core detailed distribution form" : "Standard distribution form"} · CP {member.cp.toLocaleString()} · {member.dkp.toLocaleString()} pts</p>
            </div>
          </div>

          <div className="relative z-10 overflow-y-auto flex-1 pr-1">
            {(member.wishlist?.length ?? 0) > 0 && (
              <div className="mb-3 rounded-xl border border-cyan-500/20 bg-cyan-500/[0.06] px-3 py-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-cyan-300/80 mb-1">Member wants</p>
                <div className="flex flex-wrap gap-1.5">
                  {(member.wishlist || []).map((w) => (
                    <WishChip key={keyOf(w)} item={w} iconSrc={gearIcons.iconForSlot(w.key)} />
                  ))}
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {slots.map((slot) => {
                const label = SLOT_LABELS[slot] || slot;
                if (QUANTITY_SLOTS.has(slot)) {
                  return (
                    <Input
                      key={slot}
                      label={label}
                      type="number"
                      min={0}
                      value={(items[slot] as number) ?? ""}
                      onChange={(e) => setQty(slot, e.target.value)}
                      placeholder="0"
                    />
                  );
                }
                const checked = items[slot] === true;
                return (
                  <button
                    type="button"
                    key={slot}
                    onClick={() => toggle(slot)}
                    className={`flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border text-xs font-medium transition-all cursor-pointer ${
                      checked
                        ? "border-cyan-500/50 bg-cyan-500/10 text-white"
                        : "border-white/[0.08] bg-white/[0.02] text-white/50 hover:text-white/80 hover:border-white/20"
                    }`}
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <GearIcon src={gearIcons.iconForSlot(slot)} size={22} />
                      <span className="truncate">{label}</span>
                    </span>
                    <span className={`h-4 w-4 shrink-0 rounded flex items-center justify-center border ${checked ? "bg-cyan-400/80 border-cyan-300 text-black" : "border-white/20"}`}>
                      {checked && (
                        <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mt-4 space-y-3">
              <Input label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Context for this distribution" />
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-white/50 mb-2">Override reason <span className="text-white/30 normal-case">(required only if exceeding tier limits)</span></label>
                <Input value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} placeholder="Why exceed the limit?" />
              </div>
            </div>
          </div>

          <div className="relative z-10 flex gap-3 justify-end border-t border-white/[0.06] pt-4 mt-4">
            <Button variant="ghost" size="sm" onClick={onClose} disabled={isSubmitting} className="text-xs uppercase font-bold text-white/60">Cancel</Button>
            <Button variant="primary" size="sm" disabled={selectedCount === 0} onClick={() => setConfirming(true)} className="text-xs uppercase font-bold min-w-[120px]">
              Distribute ({selectedCount})
            </Button>
          </div>
        </div>
      </div>

      <ConfirmModal
        show={confirming}
        title="Confirm distribution"
        message={`Record distribution of ${selectedCount} item${selectedCount === 1 ? "" : "s"} to ${member.ign}? This is logged to the audit trail.`}
        confirmText="Distribute"
        isSubmitting={isSubmitting}
        onConfirm={submit}
        onCancel={() => setConfirming(false)}
      />
    </>,
    document.body,
  );
}

// ─── Member: build the detailed wishlist ──────────────────────────────

function MyWishlistCard({ guildId }: { guildId: string }) {
  const gearIcons = useGearIcons();
  const [showModal, setShowModal] = useState(false);
  const key = `market_wishlist:${guildId}`;
  const { data, isLoading } = useQuery(
    key,
    async () => {
      const res = await marketApi.getMyWishlist(guildId);
      return res.success && res.data
        ? res.data
        : {
            items: [] as WishlistItem[],
            tier: "MEMBER",
            formType: "NON_CORE" as const,
            caps: { logs: 5, temporalPieces: 3, materials: 5 } as WishlistCaps,
          };
    },
    { staleTime: 15000 },
  );
  const refresh = () => queryClient.invalidateQueries(key);

  const items = (data?.items || []) as WishlistItem[];
  const receivedCount = items.filter((w) => w.status === "DISTRIBUTED").length;
  const pendingCount = items.length - receivedCount;

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-[#0c0d12]/40 backdrop-blur p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <span aria-hidden>🎯</span> My wishlist
            {data?.tier && <RankTierBadge tier={data.tier} />}
          </h3>
          <p className="text-[11px] text-white/45 mt-0.5">Wish the exact gear, logs, temporal pieces &amp; materials you want. Officers see your picks when distributing.</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {items.length > 0 && (
            <span className="hidden sm:inline-flex items-center gap-1.5 text-[10px] font-bold">
              <span className="rounded-md border border-amber-500/25 bg-amber-500/10 px-1.5 py-0.5 text-amber-200">{pendingCount} pending</span>
              <span className="rounded-md border border-emerald-500/25 bg-emerald-500/10 px-1.5 py-0.5 text-emerald-200">{receivedCount} received</span>
            </span>
          )}
          <Button variant="primary" size="sm" onClick={() => setShowModal(true)}>
            {items.length === 0 ? "Build wishlist" : "Edit wishlist"}
          </Button>
        </div>
      </div>
      {isLoading && items.length === 0 ? (
        <p className="text-xs text-white/40 py-2">Loading…</p>
      ) : items.length === 0 ? (
        <button
          type="button"
          onClick={() => setShowModal(true)}
          className="w-full text-xs text-white/40 py-5 border border-dashed border-white/[0.08] rounded-xl text-center hover:border-cyan-500/30 hover:text-white/60 transition-colors cursor-pointer"
        >
          You haven&apos;t wished for anything yet — pick the gear and resources you want.
        </button>
      ) : (
        <div className="space-y-3">
          {items.length > 0 && (
            <div className="h-1 rounded-full bg-white/[0.05] overflow-hidden" aria-hidden>
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-500/70 to-emerald-400/70 transition-all"
                style={{ width: `${items.length === 0 ? 0 : Math.round((receivedCount / items.length) * 100)}%` }}
              />
            </div>
          )}
          {WISHLIST_GROUP_ORDER.map((cat) => {
            const group = items.filter((w) => w.category === cat);
            if (group.length === 0) return null;
            return (
              <div key={cat}>
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/35 mb-1.5">
                  {WISHLIST_CATEGORY_LABELS[cat]}
                  <span className="ml-1.5 text-white/25 font-mono normal-case tracking-normal">{group.length}</span>
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {group.map((w) => (
                    <WishChip key={keyOf(w)} item={w} iconSrc={gearIcons.iconForSlot(w.key)} distributed={w.status === "DISTRIBUTED"} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {showModal && data && (
        <WishlistModal
          guildId={guildId}
          initial={items}
          tier={data.tier}
          caps={data.caps}
          gearIcons={gearIcons}
          onClose={() => setShowModal(false)}
          onSaved={refresh}
        />
      )}
    </div>
  );
}

function WishlistModal({
  guildId,
  initial,
  tier,
  caps,
  gearIcons,
  onClose,
  onSaved,
}: {
  guildId: string;
  initial: WishlistItem[];
  tier: string;
  caps: WishlistCaps;
  gearIcons: GearIconResolver;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { addToast } = useToast();
  // Selected wishes keyed by `${category}:${key}`
  const [selected, setSelected] = useState<Record<string, WishlistItem>>(() => {
    const m: Record<string, WishlistItem> = {};
    for (const w of initial) m[keyOf(w)] = w;
    return m;
  });
  const [isSaving, setIsSaving] = useState(false);

  // Leader-defined mount catalog the member can wish from.
  const { data: mountData } = useQuery(
    `market_mounts:${guildId}`,
    async () => {
      const res = await marketApi.listMounts(guildId);
      return res.success && res.data ? res.data.mounts : [];
    },
    { staleTime: 30000 },
  );
  const mounts = ((mountData || []) as MountCatalogItem[]).filter((m) => m.isActive);

  const toggleMount = (mount: MountCatalogItem) => {
    const id = `MOUNT:${mount.id}`;
    setSelected((prev) => {
      const next = { ...prev };
      if (next[id]) delete next[id];
      else next[id] = { category: "MOUNT", key: mount.id, label: mount.name };
      return next;
    });
  };

  const setGear = (
    category: WishlistItem["category"],
    key: string,
    rarity: WishlistRarity | null,
  ) => {
    const id = `${category}:${key}`;
    setSelected((prev) => {
      const next = { ...prev };
      if (rarity == null) delete next[id];
      else next[id] = { ...next[id], category, key, rarity };
      return next;
    });
  };

  // Armor's 2nd dimension: which material the piece is (Cloth/Leather/Plate), on top of rarity.
  const setArmorType = (key: string, armorType: ArmorType | null) => {
    const id = `ARMOR:${key}`;
    setSelected((prev) => {
      const next = { ...prev };
      const existing = next[id];
      if (armorType == null) {
        if (existing) {
          const { armorType: _drop, ...rest } = existing;
          next[id] = rest as WishlistItem;
        }
      } else {
        next[id] = { ...existing, category: "ARMOR", key, armorType };
      }
      return next;
    });
  };

  // Resources are toggles, not free inputs: the quantity is the member's
  // tier allowance from the guild's Distribution Rules (caps), so a member
  // just picks WHAT they want — how many comes from their rank.
  const toggleResource = (category: WishlistItem["category"], key: string, cap: number) => {
    const id = `${category}:${key}`;
    setSelected((prev) => {
      const next = { ...prev };
      if (next[id]) delete next[id];
      else if (cap > 0) next[id] = { category, key, quantity: cap };
      return next;
    });
  };

  // Logs get a real quantity input instead of the all-or-nothing toggle
  // above — a member can ask for fewer than their tier's cap. The backend
  // (normalizeWishlist) already clamps to the cap regardless, so this only
  // needs to mirror that clamp for the input itself.
  const setResourceQuantity = (category: WishlistItem["category"], key: string, cap: number, quantity: number) => {
    const id = `${category}:${key}`;
    setSelected((prev) => {
      const next = { ...prev };
      if (quantity <= 0) delete next[id];
      else next[id] = { category, key, quantity: Math.min(quantity, Math.max(cap, 1)) };
      return next;
    });
  };

  async function save() {
    const incomplete = Object.values(selected).filter((i) => i.category === "ARMOR" && !i.rarity);
    if (incomplete.length > 0) {
      const names = incomplete.map((i) => WISHLIST_LABELS[i.key] || i.key).join(", ");
      addToast("error", `Pick a rarity for ${names} to save ${incomplete.length > 1 ? "them" : "it"}.`);
      return;
    }
    setIsSaving(true);
    try {
      const res = await marketApi.setWishlist(guildId, Object.values(selected));
      if (res.success) {
        addToast("success", "Your wishlist was saved.");
        onSaved();
        onClose();
      } else addToast("error", res.error?.message || "Failed to save");
    } catch (err: any) {
      addToast("error", err?.message || "An error occurred");
    } finally {
      setIsSaving(false);
    }
  }

  const selectedCount = Object.keys(selected).length;

  // ── Filters ──
  const [filter, setFilter] = useState<WishFilterTab>("ALL");
  const [search, setSearch] = useState("");
  const [selectedOnly, setSelectedOnly] = useState(false);

  const q = search.trim().toLowerCase();
  const matches = (label: string) => q === "" || label.toLowerCase().includes(q);
  const showTab = (tab: Exclude<WishFilterTab, "ALL">) => filter === "ALL" || filter === tab;
  const passes = (label: string, id: string) => matches(label) && (!selectedOnly || !!selected[id]);

  const countIn = (cat: WishlistCategory) => Object.values(selected).filter((i) => i.category === cat).length;
  const tabCounts: Record<Exclude<WishFilterTab, "ALL">, number> = {
    WEAPON: countIn("WEAPON"),
    ARMOR: countIn("ARMOR"),
    ACCESSORY: countIn("ACCESSORY"),
    RESOURCES: countIn("LOGS") + countIn("TEMPORAL") + countIn("MATERIALS"),
    MOUNT: countIn("MOUNT"),
  };

  const weaponRows = Object.entries(WEAPON_TYPES).filter(([key, label]) => passes(label, `WEAPON:${key}`));
  const armorRows = Object.entries(ARMOR_PIECES).filter(([key, label]) => passes(label, `ARMOR:${key}`));
  const accessoryRows = Object.entries(ACCESSORY_PIECES).filter(([key, label]) => passes(label, `ACCESSORY:${key}`));
  const materialRows = Object.entries(MATERIAL_TYPES).filter(([key, label]) => passes(label, `MATERIALS:${key}`));
  const showLogs = passes("Logs", "LOGS:logs");
  const showTemporal = passes("Temporal Pieces", "TEMPORAL:temporalPieces");
  const mountRows = mounts.filter((m) => passes(m.name, `MOUNT:${m.id}`));

  const nothingVisible =
    (!showTab("WEAPON") || weaponRows.length === 0) &&
    (!showTab("ARMOR") || armorRows.length === 0) &&
    (!showTab("ACCESSORY") || accessoryRows.length === 0) &&
    (!showTab("RESOURCES") || (!showLogs && !showTemporal && materialRows.length === 0)) &&
    (!showTab("MOUNT") || mountRows.length === 0);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md animate-fade-in" onClick={() => !isSaving && onClose()} />
      <div className="relative glass-strong w-full max-w-3xl rounded-3xl border border-white/[0.08] animate-scale-in z-50 overflow-hidden max-h-[90vh] flex flex-col">
        <div aria-hidden className="absolute top-0 inset-x-0 h-24 pointer-events-none bg-gradient-to-b from-cyan-500/[0.06] to-transparent" />

        {/* Header */}
        <div className="relative z-10 px-6 pt-6 pb-3 shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] text-cyan-300 font-bold uppercase tracking-[0.24em]">Member Wishlist</p>
              <h3 className="text-lg font-extrabold text-white tracking-tight mt-1 flex items-center gap-2">
                Build your wishlist <RankTierBadge tier={tier} />
              </h3>
              <p className="text-xs text-white/50 mt-1">
                Pick a rarity for each gear piece. Resource quantities are set automatically by your rank&apos;s distribution rules.
              </p>
            </div>
            <button
              onClick={onClose}
              disabled={isSaving}
              className="h-8 w-8 shrink-0 rounded-lg hover:bg-white/[0.06] text-white/50 hover:text-white transition-colors cursor-pointer"
              aria-label="Close"
            >
              ✕
            </button>
          </div>

          {/* Filter bar */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap items-center gap-1 rounded-xl border border-white/[0.07] bg-black/25 p-1">
              {WISH_FILTER_TABS.map((tab) => {
                const active = filter === tab.value;
                const count = tab.value === "ALL" ? selectedCount : tabCounts[tab.value];
                return (
                  <button
                    key={tab.value}
                    type="button"
                    onClick={() => setFilter(tab.value)}
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all cursor-pointer ${
                      active ? "bg-cyan-500/15 text-cyan-200 border border-cyan-500/30" : "text-white/45 hover:text-white/80 border border-transparent"
                    }`}
                  >
                    {tab.label}
                    {count > 0 && (
                      <span className={`ml-1.5 rounded px-1 text-[9px] font-mono ${active ? "bg-cyan-400/20 text-cyan-100" : "bg-white/[0.07] text-white/50"}`}>
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <div className="relative flex-1 min-w-[140px]">
              <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="11" cy="11" r="7" />
                <path d="M21 21l-4.35-4.35" />
              </svg>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search items…"
                className="w-full rounded-xl border border-white/[0.07] bg-black/25 pl-8 pr-3 py-2 text-xs text-white placeholder:text-white/25 focus:border-cyan-500/40 focus:outline-none"
              />
            </div>
            <button
              type="button"
              onClick={() => setSelectedOnly((v) => !v)}
              className={`px-2.5 py-2 rounded-xl text-[11px] font-semibold border transition-all cursor-pointer shrink-0 ${
                selectedOnly ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-200" : "border-white/[0.07] bg-black/25 text-white/45 hover:text-white/80"
              }`}
            >
              Selected only
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="relative z-10 overflow-y-auto px-6 flex-1 space-y-5 py-4 border-t border-white/[0.05]">
          {showTab("WEAPON") && weaponRows.length > 0 && (
            <WishSection title="Weapon" hint="Legend / Epic">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                {weaponRows.map(([key, label]) => (
                  <GearRow
                    key={key}
                    label={label}
                    iconSrc={gearIcons.iconForSlot(key)}
                    rarities={WEAPON_RARITIES}
                    active={selected[`WEAPON:${key}`]?.rarity ?? null}
                    onSet={(r) => setGear("WEAPON", key, r)}
                  />
                ))}
              </div>
            </WishSection>
          )}

          {showTab("ARMOR") && armorRows.length > 0 && (
            <WishSection title="Armor" hint="Legend / Epic / Mythic · Cloth / Leather / Plate">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                {armorRows.map(([key, label]) => (
                  <GearRow
                    key={key}
                    label={label}
                    iconSrc={gearIcons.iconForSlot(key)}
                    rarities={GEAR_RARITIES}
                    active={selected[`ARMOR:${key}`]?.rarity ?? null}
                    onSet={(r) => setGear("ARMOR", key, r)}
                    armorTypeActive={selected[`ARMOR:${key}`]?.armorType ?? null}
                    onSetArmorType={(t) => setArmorType(key, t)}
                  />
                ))}
              </div>
            </WishSection>
          )}

          {showTab("ACCESSORY") && accessoryRows.length > 0 && (
            <WishSection title="Accessories" hint="Legend / Epic / Mythic">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                {accessoryRows.map(([key, label]) => (
                  <GearRow
                    key={key}
                    label={label}
                    iconSrc={gearIcons.iconForSlot(key)}
                    rarities={GEAR_RARITIES}
                    active={selected[`ACCESSORY:${key}`]?.rarity ?? null}
                    onSet={(r) => setGear("ACCESSORY", key, r)}
                  />
                ))}
              </div>
            </WishSection>
          )}

          {showTab("RESOURCES") && (showLogs || showTemporal || materialRows.length > 0) && (
            <WishSection
              title="Resources"
              hint="Quantities follow your rank's distribution rules"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                {showLogs && (
                  <ResourceQuantityRow
                    label="Logs"
                    iconSrc={gearIcons.iconForSlot("logs")}
                    cap={caps.logs}
                    quantity={selected["LOGS:logs"]?.quantity ?? 0}
                    onChange={(quantity) => setResourceQuantity("LOGS", "logs", caps.logs, quantity)}
                  />
                )}
                {showTemporal && (
                  <ResourceRow
                    label="Temporal Pieces"
                    iconSrc={gearIcons.iconForSlot("temporalPieces")}
                    allowance={caps.temporalPieces}
                    on={!!selected["TEMPORAL:temporalPieces"]}
                    onToggle={() => toggleResource("TEMPORAL", "temporalPieces", caps.temporalPieces)}
                  />
                )}
                {materialRows.map(([key, label]) => (
                  <ResourceRow
                    key={key}
                    label={label}
                    iconSrc={gearIcons.iconForSlot(key)}
                    allowance={caps.materials}
                    on={!!selected[`MATERIALS:${key}`]}
                    onToggle={() => toggleResource("MATERIALS", key, caps.materials)}
                  />
                ))}
              </div>
            </WishSection>
          )}

          {showTab("MOUNT") && mountRows.length > 0 && (
            <WishSection title="Mounts" hint="Set by your guild leader">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                {mountRows.map((mount) => {
                  const on = !!selected[`MOUNT:${mount.id}`];
                  const soldOut = mount.remaining <= 0;
                  return (
                    <button
                      type="button"
                      key={mount.id}
                      onClick={() => (!soldOut || on) && toggleMount(mount)}
                      disabled={soldOut && !on}
                      className={`flex w-full items-center justify-between gap-2 px-3 py-2 rounded-xl border text-left transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${
                        on ? "border-cyan-500/40 bg-cyan-500/[0.06]" : "border-white/[0.08] bg-white/[0.02]"
                      }`}
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <GearIcon src={mount.iconUrl} size={22} />
                        <span className={`truncate text-xs font-medium ${on ? "text-white" : "text-white/60"}`}>{mount.name}</span>
                      </span>
                      <span className="text-[10px] text-white/40 shrink-0">
                        {mount.remaining}/{mount.maxSlots} slots
                      </span>
                    </button>
                  );
                })}
              </div>
            </WishSection>
          )}

          {nothingVisible && (
            <p className="text-xs text-white/35 py-8 text-center border border-dashed border-white/[0.06] rounded-xl">
              {selectedOnly ? "Nothing selected matches this view." : "No items match your search."}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="relative z-10 flex items-center justify-between gap-3 border-t border-white/[0.06] px-6 py-4 shrink-0">
          <span className="text-[11px] text-white/40">
            <span className="font-bold text-white/70">{selectedCount}</span> item{selectedCount === 1 ? "" : "s"} wished
          </span>
          <div className="flex gap-3">
            <Button variant="ghost" size="sm" onClick={onClose} disabled={isSaving} className="text-xs uppercase font-bold text-white/60">Cancel</Button>
            <Button variant="primary" size="sm" onClick={save} isLoading={isSaving} className="text-xs uppercase font-bold min-w-[120px]">Save wishlist</Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ─── Wishlist builder building blocks ─────────────────────────────────

type WishFilterTab = "ALL" | "WEAPON" | "ARMOR" | "ACCESSORY" | "RESOURCES" | "MOUNT";
const WISH_FILTER_TABS: Array<{ value: WishFilterTab; label: string }> = [
  { value: "ALL", label: "All" },
  { value: "WEAPON", label: "Weapons" },
  { value: "ARMOR", label: "Armor" },
  { value: "ACCESSORY", label: "Accessories" },
  { value: "RESOURCES", label: "Resources" },
  { value: "MOUNT", label: "Mounts" },
];

function WishSection({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <h4 className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/55">{title}</h4>
        {hint && <span className="text-[10px] text-white/30">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function GearRow({
  label,
  iconSrc,
  rarities,
  active,
  onSet,
  armorTypeActive,
  onSetArmorType,
}: {
  label: string;
  iconSrc: string | null;
  rarities: WishlistRarity[];
  active: WishlistRarity | null;
  onSet: (rarity: WishlistRarity | null) => void;
  armorTypeActive?: ArmorType | null;
  onSetArmorType?: (armorType: ArmorType | null) => void;
}) {
  const isSelected = active != null;
  return (
    <div
      className={`flex flex-col gap-1.5 px-3 py-2 rounded-xl border transition-all ${
        isSelected ? "border-cyan-500/40 bg-cyan-500/[0.06]" : "border-white/[0.08] bg-white/[0.02]"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 min-w-0">
          <GearIcon src={iconSrc} size={22} />
          <span className={`truncate text-xs font-medium ${isSelected ? "text-white" : "text-white/60"}`}>{label}</span>
        </span>
        <span className="flex gap-1 shrink-0">
          {rarities.map((r) => {
            const on = active === r;
            return (
              <button
                type="button"
                key={r}
                onClick={() => onSet(on ? null : r)}
                className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wide border transition-all cursor-pointer ${
                  on ? RARITY_BADGE[r] : "border-white/[0.08] text-white/40 hover:text-white/80 hover:border-white/20"
                }`}
              >
                {WISHLIST_RARITY_LABELS[r]}
              </button>
            );
          })}
        </span>
      </div>
      {onSetArmorType && (
        <div className="flex items-center gap-1.5 pl-[30px]">
          <span className="text-[9px] uppercase tracking-wide text-white/30 shrink-0">Type</span>
          <span className="flex gap-1">
            {ARMOR_TYPES.map((t) => {
              const on = armorTypeActive === t;
              return (
                <button
                  type="button"
                  key={t}
                  onClick={() => onSetArmorType(on ? null : t)}
                  className={`px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wide border transition-all cursor-pointer ${
                    on ? ARMOR_TYPE_BADGE : "border-white/[0.08] text-white/35 hover:text-white/70 hover:border-white/20"
                  }`}
                >
                  {ARMOR_TYPE_LABELS[t]}
                </button>
              );
            })}
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * A resource wish is a toggle, not a quantity input — the amount a member
 * receives is their rank's allowance from the guild's Distribution Rules.
 * An allowance of 0 means the leader hasn't granted this tier any, so the
 * row is shown disabled rather than hidden (members see WHY it's off-limits).
 */
function ResourceRow({
  label,
  iconSrc,
  allowance,
  on,
  onToggle,
}: {
  label: string;
  iconSrc: string | null;
  allowance: number;
  on: boolean;
  onToggle: () => void;
}) {
  const unavailable = allowance <= 0 && !on;
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={unavailable}
      className={`flex w-full items-center justify-between gap-2 px-3 py-2 rounded-xl border text-left transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-45 ${
        on ? "border-cyan-500/40 bg-cyan-500/[0.06]" : "border-white/[0.08] bg-white/[0.02] hover:border-white/[0.16]"
      }`}
    >
      <span className="flex items-center gap-2 min-w-0">
        <GearIcon src={iconSrc} size={22} />
        <span className={`truncate text-xs font-medium ${on ? "text-white" : "text-white/60"}`}>{label}</span>
      </span>
      <span className="flex items-center gap-1.5 shrink-0">
        {unavailable ? (
          <span className="text-[9px] uppercase tracking-wide text-white/30">Not for your rank</span>
        ) : (
          <span
            className={`rounded-md border px-1.5 py-0.5 text-[10px] font-mono font-bold ${
              on ? "border-cyan-500/30 bg-cyan-500/10 text-cyan-200" : "border-white/[0.08] bg-white/[0.03] text-white/45"
            }`}
          >
            ×{allowance}
          </span>
        )}
        <span
          aria-hidden
          className={`flex h-4 w-4 items-center justify-center rounded border text-[10px] ${
            on ? "border-cyan-400/60 bg-cyan-500/25 text-cyan-100" : "border-white/[0.14] text-transparent"
          }`}
        >
          ✓
        </span>
      </span>
    </button>
  );
}

/**
 * Like ResourceRow, but for a resource the member can request a partial
 * quantity of (currently just Logs) instead of all-or-nothing — the cap
 * from Distribution Rules is still the ceiling, just not the only option.
 */
function ResourceQuantityRow({
  label,
  iconSrc,
  cap,
  quantity,
  onChange,
}: {
  label: string;
  iconSrc: string | null;
  cap: number;
  quantity: number;
  onChange: (quantity: number) => void;
}) {
  const unavailable = cap <= 0;
  const on = quantity > 0;
  return (
    <div
      className={`flex w-full items-center justify-between gap-2 px-3 py-2 rounded-xl border transition-all ${
        on ? "border-cyan-500/40 bg-cyan-500/[0.06]" : "border-white/[0.08] bg-white/[0.02]"
      } ${unavailable ? "opacity-45" : ""}`}
    >
      <span className="flex items-center gap-2 min-w-0">
        <GearIcon src={iconSrc} size={22} />
        <span className={`truncate text-xs font-medium ${on ? "text-white" : "text-white/60"}`}>{label}</span>
      </span>
      {unavailable ? (
        <span className="text-[9px] uppercase tracking-wide text-white/30 shrink-0">Not for your rank</span>
      ) : (
        <span className="flex items-center gap-1 shrink-0">
          <input
            type="number"
            min={0}
            max={cap}
            value={quantity}
            onChange={(e) => {
              const raw = Number(e.target.value);
              const next = Number.isFinite(raw) ? Math.max(0, Math.min(cap, Math.floor(raw))) : 0;
              onChange(next);
            }}
            className="w-12 rounded-md border border-white/[0.08] bg-black/30 px-1.5 py-0.5 text-center text-[11px] font-mono font-bold text-white focus:border-cyan-500/40 focus:outline-none"
          />
          <span className="text-[10px] font-mono text-white/35">/ {cap}</span>
        </span>
      )}
    </div>
  );
}

// ─── Master list: every wished item across the guild + per-item status ─

const CATEGORY_FILTERS: (WishlistCategory | "ALL")[] = [
  "ALL",
  "WEAPON",
  "ARMOR",
  "ACCESSORY",
  "LOGS",
  "TEMPORAL",
  "MATERIALS",
  "MOUNT",
];

function MasterListView({
  guildId,
  isOfficer,
  queue,
  onDone,
}: {
  guildId: string;
  isOfficer: boolean;
  queue: PriorityQueueEntry[];
  onDone: () => void;
}) {
  const { addToast } = useToast();
  const gearIcons = useGearIcons();
  const [status, setStatus] = useState<WishlistStatus | "ALL">("ALL");
  const [category, setCategory] = useState<WishlistCategory | "ALL">("ALL");
  const [busyKey, setBusyKey] = useState<string | null>(null);

  async function giveMount(member: PriorityQueueEntry, item: WishlistItem) {
    setBusyKey(`${member.memberId}:${item.key}`);
    try {
      const res = await marketApi.distributeMount(guildId, item.key, { memberId: member.memberId });
      if (res.success) {
        addToast("success", `${item.label || "Mount"} given to ${member.ign}.`);
        onDone();
      } else addToast("error", res.error?.message || "Failed to distribute");
    } catch (err: any) {
      addToast("error", err?.message || "An error occurred");
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div className="space-y-3">
      {/* Item-level filter bar — member sort/tier filtering lives in the toolbar above */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center gap-1 rounded-lg border border-white/[0.08] bg-[#0c0d12]/60 p-1">
          {(["ALL", "PENDING", "DISTRIBUTED"] as (WishlistStatus | "ALL")[]).map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={`rounded-md px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide transition-all cursor-pointer ${
                status === s ? "bg-white/[0.1] text-white" : "text-white/40 hover:text-white/75"
              }`}
            >
              {s === "ALL" ? "All items" : WISHLIST_STATUS_LABELS[s]}
            </button>
          ))}
        </div>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as WishlistCategory | "ALL")}
          className="rounded-lg border border-white/[0.1] bg-black/30 px-2.5 py-1.5 text-[11px] text-white focus:border-cyan-500/50 focus:outline-none cursor-pointer"
        >
          {CATEGORY_FILTERS.map((c) => (
            <option key={c} value={c}>
              {c === "ALL" ? "All categories" : WISHLIST_CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
      </div>

      {queue.length === 0 ? (
        <div className="text-center py-16 text-sm text-white/35 border border-dashed border-white/[0.06] rounded-2xl">
          No members to display.
        </div>
      ) : (
        <div className="space-y-3 max-h-[680px] overflow-y-auto pr-1">
          {queue.map((member, index) => {
            const items = (member.wishlist || []).filter((w) => {
              if (category !== "ALL" && w.category !== category) return false;
              if (status !== "ALL") {
                const s: WishlistStatus = w.status === "DISTRIBUTED" ? "DISTRIBUTED" : "PENDING";
                if (s !== status) return false;
              }
              return true;
            });
            return (
              <div
                key={member.memberId}
                className="market-row rounded-2xl border border-white/[0.06] bg-[#0c0d12]/40 backdrop-blur p-4"
                style={{ animationDelay: `${Math.min(index, 16) * 25}ms` }}
              >
                <div className="flex items-center justify-between gap-3 flex-wrap mb-3 pb-3 border-b border-white/[0.06]">
                  <div className="flex items-center gap-2.5">
                    <PrioritySeqBadge position={member.position} />
                    <div>
                      <p className="text-sm font-bold text-white flex items-center gap-2">
                        {member.ign} <RankTierBadge tier={member.tier} />
                      </p>
                      <p className="text-[10px] text-white/40">{member.rankName}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-[9px] uppercase tracking-wider text-white/30">CP</p>
                      <p className="text-xs font-mono font-semibold text-white/80">{member.cp.toLocaleString()}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[9px] uppercase tracking-wider text-white/30">Points</p>
                      <p className="text-xs font-mono font-semibold text-white/80">{member.dkp.toLocaleString()}</p>
                    </div>
                    <WishlistStatusBadge summary={member.wishlistSummary} />
                  </div>
                </div>

                {items.length === 0 ? (
                  <p className="text-xs text-white/30 text-center py-3">
                    {(member.wishlist?.length ?? 0) > 0 ? "No items match these filters." : "No wishes yet."}
                  </p>
                ) : (
                  <div className="space-y-2.5">
                    {WISHLIST_GROUP_ORDER.map((cat) => {
                      const group = items.filter((w) => w.category === cat);
                      if (group.length === 0) return null;
                      return (
                        <div key={cat}>
                          <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-white/30 mb-1">
                            {WISHLIST_CATEGORY_LABELS[cat]}
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {group.map((w) => {
                              const s: WishlistStatus = w.status === "DISTRIBUTED" ? "DISTRIBUTED" : "PENDING";
                              return (
                                <span key={keyOf(w)} className="inline-flex items-center gap-1.5">
                                  <WishChip item={w} iconSrc={gearIcons.iconForSlot(w.key)} distributed={s === "DISTRIBUTED"} />
                                  {isOfficer && w.category === "MOUNT" && s === "PENDING" && (
                                    <Button
                                      variant="primary"
                                      size="xs"
                                      isLoading={busyKey === `${member.memberId}:${w.key}`}
                                      onClick={() => giveMount(member, w)}
                                    >
                                      Give
                                    </Button>
                                  )}
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Officer: view a member's full wishlist + distribute their mounts ──

function WishlistDetailModal({
  guildId,
  member,
  isOfficer,
  onClose,
  onDone,
}: {
  guildId: string;
  member: PriorityQueueEntry;
  isOfficer: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const { addToast } = useToast();
  const gearIcons = useGearIcons();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const items = member.wishlist || [];

  async function giveMount(item: WishlistItem) {
    setBusyKey(item.key);
    try {
      const res = await marketApi.distributeMount(guildId, item.key, { memberId: member.memberId });
      if (res.success) {
        addToast("success", `${item.label || "Mount"} given to ${member.ign}.`);
        onDone();
        onClose();
      } else addToast("error", res.error?.message || "Failed to distribute");
    } catch (err: any) {
      addToast("error", err?.message || "An error occurred");
    } finally {
      setBusyKey(null);
    }
  }

  const receivedCount = items.filter((w) => w.status === "DISTRIBUTED").length;
  const progressPct = items.length === 0 ? 0 : Math.round((receivedCount / items.length) * 100);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md animate-fade-in" onClick={onClose} />
      <div className="relative glass-strong w-full max-w-lg rounded-3xl border border-white/[0.08] animate-scale-in z-50 overflow-hidden max-h-[90vh] flex flex-col">
        <div className="relative z-10 p-6 pb-4 shrink-0 border-b border-white/[0.06]">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] text-cyan-300 font-bold uppercase tracking-[0.24em]">Member Wishlist</p>
              <h3 className="text-lg font-extrabold text-white tracking-tight mt-1 flex items-center gap-2">
                {member.ign} <RankTierBadge tier={member.tier} />
              </h3>
              <p className="text-[11px] text-white/40 mt-0.5">{member.rankName}</p>
            </div>
            <div className="flex items-center gap-4 shrink-0 text-right">
              <div>
                <p className="text-[9px] uppercase tracking-wider text-white/30">CP</p>
                <p className="text-xs font-mono font-semibold text-white/80">{member.cp.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-[9px] uppercase tracking-wider text-white/30">Points</p>
                <p className="text-xs font-mono font-semibold text-white/80">{member.dkp.toLocaleString()}</p>
              </div>
            </div>
          </div>
          {items.length > 0 && (
            <div className="mt-3 flex items-center gap-2.5">
              <div className="flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-500/70 to-emerald-400/70 transition-all"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <span className="text-[10px] font-mono text-white/45 shrink-0">{receivedCount}/{items.length} received</span>
            </div>
          )}
        </div>
        <div className="relative z-10 overflow-y-auto px-6 py-4 flex-1 space-y-4">
          {items.length === 0 ? (
            <p className="text-xs text-white/40 py-6 text-center">This member hasn&apos;t wished for anything yet.</p>
          ) : (
            WISHLIST_GROUP_ORDER.map((cat) => {
              const group = items.filter((w) => w.category === cat);
              if (group.length === 0) return null;
              return (
                <div key={cat}>
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/35 mb-1.5">
                    {WISHLIST_CATEGORY_LABELS[cat]}
                    <span className="ml-1.5 text-white/25 font-mono normal-case tracking-normal">{group.length}</span>
                  </p>
                  <div className="space-y-2">
                    {group.map((w) => {
                      const status: WishlistStatus = w.status === "DISTRIBUTED" ? "DISTRIBUTED" : "PENDING";
                      return (
                        <div
                          key={keyOf(w)}
                          className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 transition-colors ${
                            status === "DISTRIBUTED"
                              ? "border-emerald-500/15 bg-emerald-500/[0.03]"
                              : "border-white/[0.06] bg-white/[0.02]"
                          }`}
                        >
                          <WishChip item={w} iconSrc={gearIcons.iconForSlot(w.key)} distributed={status === "DISTRIBUTED"} />
                          <span className="flex items-center gap-2 shrink-0">
                            <ItemStatusPill status={status} />
                            {isOfficer && w.category === "MOUNT" && status === "PENDING" && (
                              <Button variant="primary" size="xs" isLoading={busyKey === w.key} onClick={() => giveMount(w)}>
                                Give
                              </Button>
                            )}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
        <div className="relative z-10 flex justify-end border-t border-white/[0.06] px-6 py-4 shrink-0">
          <Button variant="ghost" size="sm" onClick={onClose} className="text-xs uppercase font-bold text-white/60">Close</Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ─── Officer: notify a member (or everyone) to submit a wishlist request ──

type NotifyCategory = WishlistCategory;
const NOTIFY_CATEGORIES: NotifyCategory[] = ["WEAPON", "ARMOR", "ACCESSORY", "LOGS", "TEMPORAL", "MATERIALS", "MOUNT"];

function NotifyModal({
  guildId,
  member,
  onClose,
}: {
  guildId: string;
  member?: PriorityQueueEntry | null;
  onClose: () => void;
}) {
  const { addToast } = useToast();
  const gearIcons = useGearIcons();
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Leader-defined mount catalog — needed both to label MOUNT wishes and to
  // offer mounts as a notifiable category.
  const { data: mountData } = useQuery(
    `market_mounts:${guildId}`,
    async () => {
      const res = await marketApi.listMounts(guildId);
      return res.success && res.data ? res.data.mounts : [];
    },
    { staleTime: 30000 },
  );
  const mounts = ((mountData || []) as MountCatalogItem[]).filter((m) => m.isActive);
  const mountName = (id: string) => mounts.find((m) => m.id === id)?.name;

  const CATALOG: Record<NotifyCategory, { key: string; label: string }[]> = {
    WEAPON: Object.entries(WEAPON_TYPES).map(([key, label]) => ({ key, label })),
    ARMOR: Object.entries(ARMOR_PIECES).map(([key, label]) => ({ key, label })),
    ACCESSORY: Object.entries(ACCESSORY_PIECES).map(([key, label]) => ({ key, label })),
    LOGS: [{ key: "logs", label: "Logs" }],
    TEMPORAL: [{ key: "temporalPieces", label: "Temporal Pieces" }],
    MATERIALS: Object.entries(MATERIAL_TYPES).map(([key, label]) => ({ key, label })),
    MOUNT: mounts.map((m) => ({ key: m.id, label: m.name })),
  };
  const itemLabelFor = (w: WishlistItem) =>
    w.category === "MOUNT" ? mountName(w.key) || w.label || "Mount" : WISHLIST_LABELS[w.key] || w.key;

  // Targeting a specific member: default to picking straight from their own
  // pending wishes, since that's almost always what the officer means to nudge.
  const pendingWishes = (member?.wishlist || []).filter((w) => w.status !== "DISTRIBUTED");
  const [pickFromCatalog, setPickFromCatalog] = useState(!member || pendingWishes.length === 0);
  const [wishKey, setWishKey] = useState<string | null>(pendingWishes[0] ? keyOf(pendingWishes[0]) : null);

  const [category, setCategory] = useState<NotifyCategory>("WEAPON");
  const [itemKey, setItemKey] = useState("");
  const catalogOptions = CATALOG[category];

  const selectedWish = pendingWishes.find((w) => keyOf(w) === wishKey) || null;
  const selectedCatalogItem = catalogOptions.find((i) => i.key === itemKey) || null;

  const usingWishlist = !!member && !pickFromCatalog;
  const resolvedLabel = usingWishlist ? (selectedWish ? itemLabelFor(selectedWish) : "") : selectedCatalogItem?.label || "";
  const resolvedRef = usingWishlist
    ? selectedWish
      ? `${selectedWish.category}:${selectedWish.key}`
      : undefined
    : selectedCatalogItem
      ? `${category}:${selectedCatalogItem.key}`
      : undefined;

  async function submit() {
    if (!resolvedLabel) {
      addToast("error", "Pick an item to notify about");
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await marketApi.notifyRequest(guildId, {
        itemLabel: resolvedLabel,
        itemRef: resolvedRef,
        memberIds: member ? [member.memberId] : undefined,
        message: message.trim() || undefined,
      });
      if (res.success) {
        addToast("success", member ? `Notified ${member.ign}.` : `Notified ${res.data?.notified ?? 0} member(s).`);
        onClose();
      } else {
        addToast("error", res.error?.message || "Failed to notify");
      }
    } catch (err: any) {
      addToast("error", err?.message || "An error occurred");
    } finally {
      setIsSubmitting(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md animate-fade-in" onClick={() => !isSubmitting && onClose()} />
      <div className="relative glass-strong w-full max-w-md rounded-3xl border border-white/[0.08] animate-scale-in z-50 p-6 max-h-[85vh] overflow-y-auto">
        <p className="text-[10px] text-cyan-300 font-bold uppercase tracking-[0.24em]">
          {member ? `Notify ${member.ign}` : "Notify Members"}
        </p>
        <h3 className="text-lg font-extrabold text-white tracking-tight mt-1">Request a wishlist log</h3>
        <p className="text-xs text-white/50 mt-1">
          {member
            ? `Nudge ${member.ign} to submit a request for a specific item.`
            : "Pick the item members should submit a request for. Every active member is notified."}
        </p>

        {member && pendingWishes.length > 0 && (
          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-white/50">
                {member.ign}&apos;s pending wishes
              </label>
              <button
                type="button"
                onClick={() => setPickFromCatalog((v) => !v)}
                className="text-[10px] font-semibold text-cyan-300/80 hover:text-cyan-200 cursor-pointer"
              >
                {pickFromCatalog ? "Use their wishlist" : "Pick a different item"}
              </button>
            </div>
            {!pickFromCatalog && (
              <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                {pendingWishes.map((w) => {
                  const on = wishKey === keyOf(w);
                  return (
                    <button
                      type="button"
                      key={keyOf(w)}
                      onClick={() => setWishKey(keyOf(w))}
                      className={`flex w-full items-center gap-2 px-3 py-2 rounded-xl border text-left transition-all cursor-pointer ${
                        on ? "border-cyan-500/40 bg-cyan-500/[0.06]" : "border-white/[0.08] bg-white/[0.02] hover:border-white/20"
                      }`}
                    >
                      <GearIcon src={gearIcons.iconForSlot(w.key)} size={18} />
                      <span className="text-xs text-white/80 truncate flex-1">{itemLabelFor(w)}</span>
                      {w.rarity && (
                        <span className={`px-1 rounded text-[9px] font-bold border shrink-0 ${RARITY_BADGE[w.rarity]}`}>
                          {WISHLIST_RARITY_LABELS[w.rarity]}
                        </span>
                      )}
                      {typeof w.quantity === "number" && (
                        <span className="text-[10px] font-mono text-white/50 shrink-0">×{w.quantity}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {(pickFromCatalog || !member || pendingWishes.length === 0) && (
          <div className="mt-4 grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-white/50 mb-2">Category</label>
              <select
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value as NotifyCategory);
                  setItemKey("");
                }}
                className="w-full rounded-lg border border-white/[0.1] bg-black/30 px-3 py-2 text-sm text-white focus:border-cyan-500/50 focus:outline-none"
              >
                {NOTIFY_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{WISHLIST_CATEGORY_LABELS[c]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-white/50 mb-2">Item</label>
              <select
                value={itemKey}
                onChange={(e) => setItemKey(e.target.value)}
                className="w-full rounded-lg border border-white/[0.1] bg-black/30 px-3 py-2 text-sm text-white focus:border-cyan-500/50 focus:outline-none disabled:opacity-40"
                disabled={catalogOptions.length === 0}
              >
                <option value="">{catalogOptions.length === 0 ? "No mounts configured" : "Select…"}</option>
                {catalogOptions.map((i) => (
                  <option key={i.key} value={i.key}>{i.label}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        <div className="mt-4">
          <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-white/50 mb-2">Message (optional)</label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
            placeholder="Add context for the request…"
            className="w-full rounded-lg border border-white/[0.1] bg-black/30 px-3 py-2 text-sm text-white focus:border-cyan-500/50 focus:outline-none resize-none"
          />
        </div>

        <div className="mt-5 flex justify-end gap-3">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={isSubmitting} className="text-xs uppercase font-bold text-white/60">Cancel</Button>
          <Button
            variant="primary"
            size="sm"
            onClick={submit}
            isLoading={isSubmitting}
            disabled={!resolvedLabel}
            className="text-xs uppercase font-bold min-w-[120px]"
          >
            Send Notification
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
