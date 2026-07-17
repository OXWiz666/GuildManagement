"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { STORAGE_CATEGORY_LABELS } from "@guild/shared";
import { marketApi, guildApi, type StorageItemData } from "@/lib/api";
import { useQuery } from "@/lib/query";
import { useToast } from "@/components/ui/Toast";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { rarityStyle } from "@/lib/rarityStyle";

const CATEGORY_ICONS: Record<string, string> = {
  LEGEND_WEAPON: "⚔️",
  LEGEND_ARMOR: "🛡️",
  LEGEND_ACCESSORY: "💍",
  MOUNT: "🐎",
  OTHER: "📦",
};

const STATUS_LABEL: Record<StorageItemData["status"], string> = {
  IN_STORAGE: "In Storage",
  LISTED_MARKET: "Listed in the Next Market",
  DISTRIBUTED: "Distributed",
};

function formatPrice(cents: string | null, currencySymbol: string): string | null {
  if (cents == null) return null;
  return `${currencySymbol}${(Number(cents) / 100).toLocaleString()}`;
}

export default function ItemDetailModal({
  guildId,
  item,
  canManage,
  currencySymbol,
  onClose,
  onChanged,
}: {
  guildId: string;
  item: StorageItemData;
  canManage: boolean;
  currencySymbol: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { addToast } = useToast();
  const rs = rarityStyle(item.rarity);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"GUILD_SALE" | "GUILD_AUCTION">("GUILD_SALE");
  const [memberId, setMemberId] = useState("");
  const [startingBid, setStartingBid] = useState("0");
  const [durationHours, setDurationHours] = useState("24");
  const [note, setNote] = useState("");

  const [showListForm, setShowListForm] = useState(false);
  const [listPrice, setListPrice] = useState("");

  const [showSoldForm, setShowSoldForm] = useState(false);
  const [saleValue, setSaleValue] = useState("");
  const [soldAt, setSoldAt] = useState("");

  const { data: membersData, isLoading: loadingMembers } = useQuery(
    `guild_members_simple:${guildId}`,
    async () => {
      const res = await guildApi.getMembers(guildId);
      return res.success && res.data ? res.data.members : [];
    },
    { staleTime: 60000, enabled: canManage && mode === "GUILD_SALE" },
  );
  const members = (membersData || []).filter((m: any) => m.isActive !== false);

  async function act(fn: () => Promise<{ success: boolean; error?: { message?: string } }>, ok: string) {
    setBusy(true);
    try {
      const res = await fn();
      if (res.success) {
        addToast("success", ok);
        onChanged();
        onClose();
      } else addToast("error", res.error?.message || "Action failed");
    } catch (err: any) {
      addToast("error", err?.message || "An error occurred");
    } finally {
      setBusy(false);
    }
  }

  function openListForm() {
    setListPrice("");
    setShowListForm(true);
  }

  async function confirmListing(e: React.FormEvent) {
    e.preventDefault();
    const price = parseFloat(listPrice);
    if (!Number.isFinite(price) || price < 0) {
      addToast("error", "Enter a valid listing price");
      return;
    }
    await act(() => marketApi.registerStorageInMarket(guildId, item.id, price), "Listed in next market.");
  }

  function openSoldForm() {
    setSaleValue(item.listingPrice != null ? (Number(item.listingPrice) / 100).toString() : "");
    setSoldAt("");
    setShowSoldForm(true);
  }

  async function confirmSold(e: React.FormEvent) {
    e.preventDefault();
    const value = parseFloat(saleValue);
    if (!Number.isFinite(value) || value < 0) {
      addToast("error", "Enter a valid sale value");
      return;
    }
    await act(
      () => marketApi.markStorageItemSold(guildId, item.id, { saleValue: value, soldAt: soldAt || undefined }),
      "Marked as sold — added to the Sold Item Registry.",
    );
  }

  async function handleDistribute(e: React.FormEvent) {
    e.preventDefault();
    if (mode === "GUILD_SALE" && !memberId) {
      addToast("error", "Select a member to receive the item");
      return;
    }
    const payload =
      mode === "GUILD_SALE"
        ? { mode: "GUILD_SALE" as const, memberId, note: note.trim() || undefined }
        : {
            mode: "GUILD_AUCTION" as const,
            startingBid: Math.max(0, parseInt(startingBid, 10) || 0),
            durationHours: Math.min(168, Math.max(1, parseInt(durationHours, 10) || 24)),
            note: note.trim() || undefined,
          };
    await act(
      () => marketApi.distributeStorageItem(guildId, item.id, payload),
      mode === "GUILD_SALE" ? "Distributed to member." : "DKP auction created — now live in the Auction Hall.",
    );
  }

  const canAct = canManage && item.status !== "DISTRIBUTED";
  const listingPriceLabel = formatPrice(item.listingPrice, currencySymbol);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md animate-fade-in" onClick={() => !busy && onClose()} />
      <div className="relative glass-strong w-full max-w-lg rounded-3xl p-6 border border-white/[0.08] animate-scale-in z-50 max-h-[90vh] overflow-y-auto">
        <button onClick={() => !busy && onClose()} className="absolute top-5 right-5 text-white/40 hover:text-white cursor-pointer" aria-label="Close">
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
        </button>

        {/* Item hero */}
        <div className="flex items-start gap-4 mb-5">
          <div className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border text-3xl ${rs.border} ${rs.bg}`}>
            {item.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.imageUrl} alt="" className="h-full w-full rounded-2xl object-cover" loading="lazy" decoding="async" />
            ) : (
              <span aria-hidden>{CATEGORY_ICONS[item.category] || "📦"}</span>
            )}
          </div>
          <div className="min-w-0 flex-1 pr-6">
            <p className={`font-extrabold text-lg tracking-tight truncate ${rs.text}`}>
              {item.itemName}
              {item.quantity > 1 && <span className="text-white/40 font-mono text-sm"> ×{item.quantity}</span>}
            </p>
            <p className="text-[11px] text-white/50 mt-1">
              <span className={`${rs.text} font-semibold`}>{item.rarity}</span>
              <span className="text-white/30"> · </span>
              <span>{STORAGE_CATEGORY_LABELS[item.category as keyof typeof STORAGE_CATEGORY_LABELS] || item.category}</span>
              {item.sourceBoss && <span className="text-white/35"> · from {item.sourceBoss}</span>}
            </p>
            {item.note && <p className="text-[12px] text-white/45 mt-2 leading-relaxed">{item.note}</p>}
          </div>
        </div>

        {/* Status */}
        <div className="flex items-center gap-2 mb-5 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              item.status === "IN_STORAGE" ? "bg-[var(--forge-gold)]" : item.status === "LISTED_MARKET" ? "bg-cyan-400" : "bg-emerald-400"
            }`}
          />
          <span className="text-[11px] font-semibold text-white/70">{STATUS_LABEL[item.status]}</span>
          {item.status === "LISTED_MARKET" && listingPriceLabel && (
            <span className="text-[11px] font-bold text-[var(--forge-gold-bright)] ml-auto">{listingPriceLabel}</span>
          )}
          {item.status === "DISTRIBUTED" && item.disposition === "GUILD_SALE" && item.recipient && (
            <span className="text-[11px] text-white/40 ml-auto">to {item.recipient.ign || "member"}</span>
          )}
          {item.status === "DISTRIBUTED" && item.disposition === "GUILD_AUCTION" && (
            <span className="text-[11px] text-white/40 ml-auto">via Guild Auction</span>
          )}
          {item.status === "DISTRIBUTED" && item.disposition === "MARKET" && (
            <span className="text-[11px] text-white/40 ml-auto">Sold in the Next Market</span>
          )}
        </div>

        {!canAct ? (
          !canManage ? (
            <p className="text-xs text-white/35 text-center py-2">You don&apos;t have permission to manage guild storage.</p>
          ) : null
        ) : (
          <div className="space-y-5">
            {/* Quick actions */}
            <div className="flex flex-wrap items-center gap-2">
              {item.status === "IN_STORAGE" ? (
                <Button variant="secondary" size="xs" disabled={busy} className="border border-white/[0.08]" onClick={openListForm}>
                  Register in Market
                </Button>
              ) : (
                <>
                  <Button variant="ghost" size="xs" disabled={busy} onClick={() => act(() => marketApi.recallStorageItem(guildId, item.id), "Recalled to storage.")}>
                    Recall to Storage
                  </Button>
                  <Button variant="secondary" size="xs" disabled={busy} className="border border-emerald-500/25 text-emerald-300" onClick={openSoldForm}>
                    Mark as Sold
                  </Button>
                </>
              )}
              <Button variant="ghost" size="xs" disabled={busy} className="text-rose-300/70" onClick={() => act(() => marketApi.removeStorageItem(guildId, item.id), "Removed from storage.")}>
                Remove
              </Button>
            </div>

            {/* Register in market — inline price form */}
            {showListForm && (
              <form onSubmit={confirmListing} className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3 space-y-3">
                <Input
                  label={`Listing price (${currencySymbol})`}
                  type="number"
                  min={0}
                  step="0.01"
                  value={listPrice}
                  onChange={(e) => setListPrice(e.target.value)}
                  placeholder="0.00"
                  autoFocus
                />
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="ghost" size="xs" onClick={() => setShowListForm(false)} disabled={busy}>Cancel</Button>
                  <Button type="submit" variant="primary" size="xs" isLoading={busy}>Confirm Listing</Button>
                </div>
              </form>
            )}

            {/* Mark as sold — inline confirm form */}
            {showSoldForm && (
              <form onSubmit={confirmSold} className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] p-3 space-y-3">
                <p className="text-[10px] text-white/45">Confirms the sale and adds this item to the Sold Item Registry.</p>
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    label={`Sale value (${currencySymbol})`}
                    type="number"
                    min={0}
                    step="0.01"
                    value={saleValue}
                    onChange={(e) => setSaleValue(e.target.value)}
                    autoFocus
                  />
                  <Input
                    label="Sold date (optional)"
                    type="date"
                    value={soldAt}
                    onChange={(e) => setSoldAt(e.target.value)}
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="ghost" size="xs" onClick={() => setShowSoldForm(false)} disabled={busy}>Cancel</Button>
                  <Button type="submit" variant="primary" size="xs" isLoading={busy}>Confirm Sold</Button>
                </div>
              </form>
            )}

            {/* Distribute */}
            <div className="border-t border-white/[0.06] pt-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/50 mb-2">Distribute</p>
              <div className="grid grid-cols-2 gap-2 mb-4">
                {(["GUILD_SALE", "GUILD_AUCTION"] as const).map((m) => (
                  <button
                    type="button"
                    key={m}
                    onClick={() => setMode(m)}
                    className={`py-3 px-3 rounded-xl border text-sm font-semibold transition-all cursor-pointer ${
                      mode === m
                        ? "border-[var(--forge-gold)]/50 bg-[var(--forge-gold)]/10 text-white"
                        : "border-white/[0.08] bg-white/[0.02] text-white/50 hover:text-white/80 hover:border-white/20"
                    }`}
                  >
                    {m === "GUILD_SALE" ? "Guild Sale" : "Guild Auction"}
                    <span className="block text-[10px] font-normal text-white/40 mt-0.5">
                      {m === "GUILD_SALE" ? "Direct to member" : "DKP bidding"}
                    </span>
                  </button>
                ))}
              </div>

              <form onSubmit={handleDistribute} className="space-y-4">
                {mode === "GUILD_SALE" ? (
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-white/50 mb-2">Recipient</label>
                    <select
                      value={memberId}
                      onChange={(e) => setMemberId(e.target.value)}
                      className="w-full rounded-xl bg-surface-100 border border-white/8 text-white px-4 py-3 text-sm focus:outline-none focus:border-primary-500/50 cursor-pointer"
                    >
                      <option value="">{loadingMembers ? "Loading members…" : "Select a member…"}</option>
                      {members.map((m: any) => (
                        <option key={m.id} value={m.id}>
                          {m.ign || m.user?.displayName || "Member"} {m.rankName ? `· ${m.rankName}` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <Input label="Starting bid (points)" type="number" min={0} value={startingBid} onChange={(e) => setStartingBid(e.target.value)} />
                    <Input label="Duration (hours)" type="number" min={1} max={168} value={durationHours} onChange={(e) => setDurationHours(e.target.value)} />
                  </div>
                )}
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-white/50 mb-2">Note (optional)</label>
                  <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="w-full rounded-xl bg-surface-100 border border-white/8 text-white placeholder-gray-500 px-4 py-3 text-sm focus:outline-none focus:border-primary-500/50 resize-none" />
                </div>
                <div className="flex justify-end">
                  <Button type="submit" variant="primary" size="sm" isLoading={busy} className="text-xs uppercase font-bold min-w-[140px]">
                    {mode === "GUILD_SALE" ? "Distribute" : "Create Auction"}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
