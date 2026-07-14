"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { marketApi, type AuctionData } from "@/lib/api";
import { useQuery, queryClient } from "@/lib/query";
import { useToast } from "@/components/ui/Toast";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { Magnetic } from "@/components/dashboard/DashboardHelpers";

interface Props {
  guildId: string;
}

function timeLeft(endsAt: string): { label: string; urgent: boolean; ended: boolean } {
  const ms = new Date(endsAt).getTime() - Date.now();
  if (ms <= 0) return { label: "Ended", urgent: true, ended: true };
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const label = h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s}s` : `${s}s`;
  return { label, urgent: ms < 5 * 60_000, ended: false };
}

export default function AuctionHallTab({ guildId }: Props) {
  const { addToast } = useToast();
  const [now, setNow] = useState(Date.now());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // Tick every second so countdowns stay live.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const key = `market_auctions:${guildId}`;
  const { data, isLoading } = useQuery(
    key,
    async () => {
      const res = await marketApi.getAuctions(guildId);
      return res.success && res.data ? res.data : { auctions: [], canManage: false, myBidPoints: 0 };
    },
    { staleTime: 8000 },
  );

  const auctions = data?.auctions || [];
  const canManage = data?.canManage || false;
  const myBidPoints = data?.myBidPoints ?? 0;
  const refresh = () => queryClient.invalidateQueries(key);

  async function placeBid(auction: AuctionData) {
    const min = auction.currentBid + 1;
    const input = window.prompt(
      `Place a bid on "${auction.itemName}".\nCurrent: ${auction.currentBid} · Minimum: ${min} · You have: ${myBidPoints} points`,
      String(min),
    );
    if (input == null) return;
    const amount = parseInt(input, 10);
    if (isNaN(amount) || amount < min) {
      addToast("error", `Bid must be at least ${min} points`);
      return;
    }
    setBusyId(auction.id);
    try {
      const res = await marketApi.placeBid(guildId, auction.id, amount);
      if (res.success) {
        addToast("success", `Bid placed! ${res.data?.newBidPoints ?? ""} points remaining.`);
        refresh();
      } else addToast("error", res.error?.message || "Bid failed");
    } catch (err: any) {
      addToast("error", err?.message || "An error occurred");
    } finally {
      setBusyId(null);
    }
  }

  async function manage(id: string, fn: () => Promise<{ success: boolean; error?: { message?: string } }>, ok: string) {
    setBusyId(id);
    try {
      const res = await fn();
      if (res.success) {
        addToast("success", ok);
        refresh();
      } else addToast("error", res.error?.message || "Action failed");
    } catch (err: any) {
      addToast("error", err?.message || "An error occurred");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">Auction Hall</h3>
          <p className="text-[11px] text-white/45 mt-1">Bid on guild items with DKP bid points. Highest bid at close wins.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-lg border border-[var(--forge-gold)]/25 bg-[var(--forge-gold)]/10 px-3 py-1.5 text-[11px] font-mono text-[var(--forge-gold-bright)]">
            {myBidPoints.toLocaleString()} pts
          </span>
          <Button variant="ghost" size="sm" onClick={() => setShowHistory(true)}>History</Button>
          {canManage && (
            <Magnetic strength={4}>
              <Button variant="primary" size="sm" onClick={() => setShowCreate(true)}>New auction</Button>
            </Magnetic>
          )}
        </div>
      </div>

      {isLoading && auctions.length === 0 ? (
        <Skeleton className="h-64 w-full rounded-2xl animate-pulse" />
      ) : auctions.length === 0 ? (
        <div className="text-center py-16 text-sm text-white/35 border border-dashed border-white/[0.06] rounded-2xl">
          <p className="text-3xl mb-2">🔨</p>
          No active auctions. Distribute a stored item as a Guild Auction to start one.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3" data-now={now}>
          {auctions.map((a, index) => {
            const t = timeLeft(a.endsAt);
            const leading = a.bids && a.bids[0];
            return (
              <div
                key={a.id}
                className="market-row rounded-2xl border border-white/[0.06] bg-[#0c0d12]/40 backdrop-blur p-4 flex flex-col gap-3"
                style={{ animationDelay: `${Math.min(index, 16) * 30}ms` }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-white truncate">{a.itemName}</p>
                    {a.description && <p className="text-[11px] text-white/40 mt-0.5 line-clamp-1">{a.description}</p>}
                  </div>
                  <span
                    className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-bold font-mono border ${
                      t.urgent
                        ? "bg-rose-500/10 text-rose-300 border-rose-500/25"
                        : "bg-white/[0.04] text-white/60 border-white/[0.08]"
                    }`}
                  >
                    {t.label}
                  </span>
                </div>

                <div className="flex items-end justify-between gap-3 border-t border-white/[0.05] pt-3">
                  <div>
                    <p className="text-[10px] text-white/35 uppercase tracking-wider">Current bid</p>
                    <p className="text-lg font-bold font-mono text-[var(--forge-gold-bright)]">{a.currentBid.toLocaleString()}</p>
                    <p className="text-[10px] text-white/40 mt-0.5">
                      {leading ? `Top: ${leading.member?.ign || "Member"}` : "No bids yet"}
                      {a.myBid ? ` · your bid ${a.myBid}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <Button variant="primary" size="xs" isLoading={busyId === a.id} disabled={t.ended} onClick={() => placeBid(a)}>
                      Place bid
                    </Button>
                    {canManage && (
                      <div className="flex items-center gap-1.5">
                        <Button variant="ghost" size="xs" disabled={busyId === a.id} onClick={() => manage(a.id, () => marketApi.endAuction(guildId, a.id), "Auction closed.")} className="text-emerald-300/70">
                          Close
                        </Button>
                        <Button variant="ghost" size="xs" disabled={busyId === a.id} onClick={() => manage(a.id, () => marketApi.cancelAuction(guildId, a.id), "Auction cancelled; bids refunded.")} className="text-rose-300/70">
                          Cancel
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showCreate && <CreateAuctionModal guildId={guildId} onClose={() => setShowCreate(false)} onSaved={refresh} />}
      {showHistory && <AuctionHistoryModal guildId={guildId} onClose={() => setShowHistory(false)} />}
    </div>
  );
}

function CreateAuctionModal({ guildId, onClose, onSaved }: { guildId: string; onClose: () => void; onSaved: () => void }) {
  const { addToast } = useToast();
  const [itemName, setItemName] = useState("");
  const [description, setDescription] = useState("");
  const [startingBid, setStartingBid] = useState("0");
  const [durationHours, setDurationHours] = useState("24");
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!itemName.trim()) {
      addToast("error", "Item name is required");
      return;
    }
    setIsSaving(true);
    try {
      const res = await marketApi.createAuction(guildId, {
        itemName: itemName.trim(),
        description: description.trim() || undefined,
        startingBid: Math.max(0, parseInt(startingBid, 10) || 0),
        durationHours: Math.min(168, Math.max(1, parseInt(durationHours, 10) || 24)),
      });
      if (res.success) {
        addToast("success", "Auction created.");
        onSaved();
        onClose();
      } else addToast("error", res.error?.message || "Failed to create auction");
    } catch (err: any) {
      addToast("error", err?.message || "An error occurred");
    } finally {
      setIsSaving(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md animate-fade-in" onClick={() => !isSaving && onClose()} />
      <div className="relative glass-strong w-full max-w-lg rounded-3xl p-6 border border-white/[0.08] animate-scale-in z-50">
        <div className="space-y-5">
          <div>
            <p className="text-[10px] text-[var(--forge-gold-bright)] font-bold uppercase tracking-[0.24em]">Auction Hall</p>
            <h3 className="text-lg font-extrabold text-white tracking-tight mt-1">New auction</h3>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input label="Item name" value={itemName} onChange={(e) => setItemName(e.target.value)} placeholder="e.g. Legend Weapon" />
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-white/50 mb-2">Description (optional)</label>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="w-full rounded-xl bg-surface-100 border border-white/8 text-white placeholder-gray-500 px-4 py-3 text-sm focus:outline-none focus:border-primary-500/50 resize-none" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Starting bid (points)" type="number" min={0} value={startingBid} onChange={(e) => setStartingBid(e.target.value)} />
              <Input label="Duration (hours)" type="number" min={1} max={168} value={durationHours} onChange={(e) => setDurationHours(e.target.value)} />
            </div>
            <div className="flex gap-3 justify-end border-t border-white/[0.06] pt-4">
              <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={isSaving} className="text-xs uppercase font-bold text-white/60">Cancel</Button>
              <Button type="submit" variant="primary" size="sm" isLoading={isSaving} className="text-xs uppercase font-bold min-w-[120px]">Create</Button>
            </div>
          </form>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function AuctionHistoryModal({ guildId, onClose }: { guildId: string; onClose: () => void }) {
  const { data, isLoading } = useQuery(
    `market_auction_history:${guildId}`,
    async () => {
      const res = await marketApi.getAuctionHistory(guildId, 1);
      return res.success && res.data ? res.data.items : [];
    },
    { staleTime: 15000 },
  );
  const items = data || [];

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md animate-fade-in" onClick={onClose} />
      <div className="relative glass-strong w-full max-w-lg rounded-3xl p-6 border border-white/[0.08] animate-scale-in z-50">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-extrabold text-white tracking-tight">Auction history</h3>
            <Button variant="ghost" size="xs" onClick={onClose}>Close</Button>
          </div>
          {isLoading ? (
            <Skeleton className="h-40 w-full rounded-2xl animate-pulse" />
          ) : items.length === 0 ? (
            <div className="text-center py-10 text-xs text-white/35">No closed auctions yet.</div>
          ) : (
            <div className="space-y-2 max-h-[420px] overflow-auto scroll-fade-x">
              {items.map((a) => {
                const winner = a.bids && a.bids[0];
                return (
                  <div key={a.id} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{a.itemName}</p>
                      <p className="text-[10px] text-white/40">
                        {a.status === "CANCELLED" ? "Cancelled" : winner ? `Won by ${winner.member?.ign || "Member"}` : "No bids"}
                      </p>
                    </div>
                    <span className="shrink-0 font-mono text-sm text-[var(--forge-gold-bright)]">
                      {a.status === "CANCELLED" ? "—" : `${a.currentBid.toLocaleString()} pts`}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
