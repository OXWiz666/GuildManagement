"use client";

import { useState } from "react";
import { CORE_SLOTS, NON_CORE_SLOTS, SLOT_LABELS } from "@guild/shared";
import { marketApi, type PriorityQueueEntry } from "@/lib/api";
import { useQuery, queryClient } from "@/lib/query";
import { useToast } from "@/components/ui/Toast";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import ConfirmModal from "@/components/ui/ConfirmModal";
import { RankTierBadge, PrioritySeqBadge } from "./MarketBadges";
import { useGearIcons, GearIcon } from "./useGearIcons";

// Slots entered as a numeric quantity; everything else is a yes/no gear flag.
const QUANTITY_SLOTS = new Set([
  "logs",
  "temporalPieces",
  "temporalPiece",
  "materials",
  "itemLog",
  "upgradeScrolls",
]);

interface Props {
  guildId: string;
  isOfficer: boolean;
}

export default function ItemDistributionTab({ guildId, isOfficer }: Props) {
  const { addToast } = useToast();
  const gearIcons = useGearIcons();
  const [search, setSearch] = useState("");
  const [target, setTarget] = useState<PriorityQueueEntry | null>(null);

  const key = `market_priority:${guildId}`;
  const { data, isLoading } = useQuery(
    key,
    async () => {
      const res = await marketApi.getPriorityQueue(guildId);
      return res.success && res.data ? res.data.queue : [];
    },
    { staleTime: 15000 },
  );
  const queue = (data || []) as PriorityQueueEntry[];
  const refresh = () => {
    queryClient.invalidateQueries(key);
    queryClient.invalidateQueries(`market_distributions:${guildId}`);
  };

  const filtered = queue.filter((m) => {
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    return m.ign.toLowerCase().includes(s) || m.role.toLowerCase().includes(s) || m.tier.toLowerCase().includes(s);
  });

  async function overrideSeq(m: PriorityQueueEntry) {
    const input = window.prompt(`Manual priority position for ${m.ign} (blank to clear):`, m.manualSeq ? String(m.manualSeq) : "");
    if (input == null) return;
    const seq = input.trim() === "" ? null : parseInt(input, 10);
    if (seq !== null && (isNaN(seq) || seq < 1)) {
      addToast("error", "Enter a valid position number");
      return;
    }
    const reason = seq === null ? "Cleared override" : window.prompt("Reason for manual override (required):", "") || "";
    if (seq !== null && !reason.trim()) {
      addToast("error", "A reason is required for manual overrides");
      return;
    }
    try {
      const res = await marketApi.overridePriority(guildId, m.memberId, seq, reason);
      if (res.success) {
        addToast("success", "Priority sequence updated.");
        refresh();
      } else addToast("error", res.error?.message || "Failed");
    } catch (err: any) {
      addToast("error", err?.message || "An error occurred");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="max-w-sm flex-1 min-w-[200px]">
          <Input placeholder="Search members…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <p className="text-[11px] text-white/40">
          Priority blends rank, points, CP, attendance, boss participation & item history.
        </p>
      </div>

      {/* Members choose the items they want */}
      {!isOfficer && <MyWishlistCard guildId={guildId} />}

      {isLoading && queue.length === 0 ? (
        <Skeleton className="h-64 w-full rounded-2xl animate-pulse" />
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-sm text-white/35 border border-dashed border-white/[0.06] rounded-2xl">No members to display.</div>
      ) : (
        <div className="rounded-2xl border border-white/[0.06] bg-[#0c0d12]/40 backdrop-blur overflow-auto max-h-[600px]">
          <table className="w-full text-[12px] min-w-[640px]">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-white/[0.08] bg-[#0d0e13] text-[10px] text-white/45 font-bold uppercase tracking-wider text-left">
                <th className="px-4 py-3">#</th>
                <th className="px-4 py-3">Member</th>
                <th className="px-4 py-3">Tier</th>
                <th className="px-4 py-3 text-right">CP</th>
                <th className="px-4 py-3 text-right">Points</th>
                <th className="px-4 py-3 text-right hidden sm:table-cell">Attend.</th>
                <th className="px-4 py-3 text-right hidden sm:table-cell">Boss</th>
                <th className="px-4 py-3 text-right hidden md:table-cell">Recv'd</th>
                <th className="px-4 py-3 text-right">Score</th>
                {isOfficer && <th className="px-4 py-3 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04] text-white/70">
              {filtered.map((m, index) => (
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
                    {isOfficer && (m.wishlist?.length ?? 0) > 0 && (
                      <span className="mt-1 flex flex-wrap gap-1">
                        {m.wishlist.slice(0, 4).map((w) => (
                          <span key={w} className="inline-flex items-center gap-1 pl-0.5 pr-1.5 py-0.5 rounded text-[9px] bg-cyan-500/10 text-cyan-200/90 border border-cyan-500/20">
                            <GearIcon src={gearIcons.iconForSlot(w)} size={14} />
                            {SLOT_LABELS[w] || w}
                          </span>
                        ))}
                        {m.wishlist.length > 4 && <span className="text-[9px] text-white/40">+{m.wishlist.length - 4}</span>}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3"><RankTierBadge tier={m.tier} /></td>
                  <td className="px-4 py-3 text-right font-mono">{m.cp.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right font-mono">{m.dkp.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right font-mono hidden sm:table-cell">{m.attendance}</td>
                  <td className="px-4 py-3 text-right font-mono hidden sm:table-cell">{m.bossParticipation}</td>
                  <td className="px-4 py-3 text-right font-mono hidden md:table-cell">{m.previousReceived}</td>
                  <td className="px-4 py-3 text-right font-mono font-bold text-[var(--forge-gold-bright)]">{m.priorityScore}</td>
                  {isOfficer && (
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 justify-end">
                        <Button variant="ghost" size="xs" onClick={() => overrideSeq(m)} className="text-white/50">Pin</Button>
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
    </div>
  );
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

  // Pre-check the gear slots this member said they want
  const [items, setItems] = useState<Record<string, number | boolean>>(() => {
    const init: Record<string, number | boolean> = {};
    for (const slot of member.wishlist || []) {
      if (!QUANTITY_SLOTS.has(slot)) init[slot] = true;
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

  return (
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
                  {(member.wishlist || []).map((s) => (
                    <span key={s} className="inline-flex items-center gap-1.5 pl-1 pr-2 py-0.5 rounded-md text-[11px] bg-cyan-500/10 text-cyan-200 border border-cyan-500/20">
                      <GearIcon src={gearIcons.iconForSlot(s)} size={16} />
                      {SLOT_LABELS[s] || s}
                    </span>
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
    </>
  );
}

// ─── Member: choose the items you want ───────────────────────────────

function MyWishlistCard({ guildId }: { guildId: string }) {
  const gearIcons = useGearIcons();
  const [showModal, setShowModal] = useState(false);
  const key = `market_wishlist:${guildId}`;
  const { data, isLoading } = useQuery(
    key,
    async () => {
      const res = await marketApi.getMyWishlist(guildId);
      return res.success && res.data ? res.data : { items: [], tier: "LOWER", formType: "NON_CORE" as const, slots: [] as string[] };
    },
    { staleTime: 15000 },
  );
  const refresh = () => queryClient.invalidateQueries(key);

  const items = data?.items || [];

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-[#0c0d12]/40 backdrop-blur p-5">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <h3 className="text-sm font-bold text-white flex items-center gap-2"><span aria-hidden>🎯</span> Items you want</h3>
          <p className="text-[11px] text-white/45 mt-0.5">Choose the items you&apos;d like. Officers see your picks when distributing.</p>
        </div>
        <Button variant="primary" size="sm" onClick={() => setShowModal(true)}>Choose items</Button>
      </div>
      {isLoading && items.length === 0 ? (
        <p className="text-xs text-white/40 py-2">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-xs text-white/35 py-2 border border-dashed border-white/[0.06] rounded-xl text-center">You haven&apos;t chosen any items yet.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {items.map((s) => (
            <span key={s} className="inline-flex items-center gap-1.5 pl-1 pr-2 py-0.5 rounded-md text-[11px] bg-cyan-500/10 text-cyan-200 border border-cyan-500/20">
              <GearIcon src={gearIcons.iconForSlot(s)} size={16} />
              {SLOT_LABELS[s] || s}
            </span>
          ))}
        </div>
      )}
      {showModal && data && (
        <WishlistModal
          guildId={guildId}
          slots={data.slots}
          initial={items}
          tier={data.tier}
          onClose={() => setShowModal(false)}
          onSaved={refresh}
        />
      )}
    </div>
  );
}

function WishlistModal({
  guildId,
  slots,
  initial,
  tier,
  onClose,
  onSaved,
}: {
  guildId: string;
  slots: string[];
  initial: string[];
  tier: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { addToast } = useToast();
  const gearIcons = useGearIcons();
  const [selected, setSelected] = useState<Set<string>>(new Set(initial));
  const [isSaving, setIsSaving] = useState(false);

  const toggle = (slot: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(slot)) next.delete(slot);
      else next.add(slot);
      return next;
    });

  async function save() {
    setIsSaving(true);
    try {
      const res = await marketApi.setWishlist(guildId, Array.from(selected));
      if (res.success) {
        addToast("success", "Your item choices were saved.");
        onSaved();
        onClose();
      } else addToast("error", res.error?.message || "Failed to save");
    } catch (err: any) {
      addToast("error", err?.message || "An error occurred");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md animate-fade-in" onClick={() => !isSaving && onClose()} />
      <div className="relative glass-strong w-full max-w-lg rounded-3xl border border-white/[0.08] animate-scale-in z-50 overflow-hidden max-h-[90vh] flex flex-col">
        <div aria-hidden className="absolute top-0 inset-x-0 h-24 pointer-events-none bg-gradient-to-b from-cyan-500/[0.06] to-transparent" />
        <div className="relative z-10 p-6 pb-4 shrink-0">
          <p className="text-[10px] text-cyan-300 font-bold uppercase tracking-[0.24em]">Item Distribution</p>
          <h3 className="text-lg font-extrabold text-white tracking-tight mt-1 flex items-center gap-2">
            Choose items you want <RankTierBadge tier={tier} />
          </h3>
          <p className="text-xs text-white/50 mt-1">Tap the items you&apos;d like to receive. Your tier determines the list.</p>
        </div>
        <div className="relative z-10 overflow-y-auto px-6 flex-1">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {slots.map((slot) => {
              const checked = selected.has(slot);
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
                    <span className="truncate">{SLOT_LABELS[slot] || slot}</span>
                  </span>
                  <span className={`h-4 w-4 shrink-0 rounded flex items-center justify-center border ${checked ? "bg-cyan-400/80 border-cyan-300 text-black" : "border-white/20"}`}>
                    {checked && <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="relative z-10 flex gap-3 justify-end border-t border-white/[0.06] px-6 py-4 shrink-0">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={isSaving} className="text-xs uppercase font-bold text-white/60">Cancel</Button>
          <Button variant="primary" size="sm" onClick={save} isLoading={isSaving} className="text-xs uppercase font-bold min-w-[120px]">Save choices</Button>
        </div>
      </div>
    </div>
  );
}
