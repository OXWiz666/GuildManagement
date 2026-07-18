"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { MARKET_REQUEST_TYPES, MARKET_REQUEST_TYPE_LABELS } from "@guild/shared";
import { marketApi } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { ItemTypeIcon } from "./MarketBadges";

interface Props {
  guildId: string;
  onClose: () => void;
  onSubmitted: () => void;
}

export default function RequestItemModal({ guildId, onClose, onSubmitted }: Props) {
  const { addToast } = useToast();
  const [itemType, setItemType] = useState<string>(MARKET_REQUEST_TYPES[0]);
  const [itemName, setItemName] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [quota, setQuota] = useState<{ used: number; limit: number; remaining: number } | null>(null);
  const [mounted, setMounted] = useState(false);

  // Portal target only exists on the client.
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    let cancelled = false;
    marketApi.getMyRequests(guildId).then((res) => {
      if (!cancelled && res.success && res.data) setQuota(res.data.quota);
    });
    return () => {
      cancelled = true;
    };
  }, [guildId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const qty = parseInt(quantity, 10);
    if (isNaN(qty) || qty < 1) {
      addToast("error", "Quantity must be at least 1");
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await marketApi.createItemRequest(guildId, {
        itemType,
        itemName: itemName.trim() || undefined,
        quantity: qty,
        reason: reason.trim() || undefined,
      });
      if (res.success) {
        addToast("success", "Request submitted! Officers and leaders have been notified.");
        onSubmitted();
        onClose();
      } else {
        addToast("error", res.error?.message || "Failed to submit request");
      }
    } catch (err: any) {
      addToast("error", err?.message || "An error occurred");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md animate-fade-in" onClick={() => !isSubmitting && onClose()} />
      <div className="relative glass-strong w-full max-w-lg rounded-3xl border border-white/[0.08] animate-scale-in z-50 overflow-hidden max-h-[90vh] flex flex-col">
        <div aria-hidden className="absolute top-0 inset-x-0 h-24 pointer-events-none bg-gradient-to-b from-amber-500/[0.06] to-transparent" />

        {/* Header (fixed) */}
        <div className="relative z-10 flex items-start justify-between gap-4 p-6 pb-4 shrink-0">
          <div>
            <p className="text-[10px] text-[var(--forge-gold-bright)] font-bold uppercase tracking-[0.24em]">Guild Market</p>
            <h3 className="text-lg font-extrabold text-white tracking-tight mt-1">Request an item</h3>
            <p className="text-xs text-white/50 mt-1">Logs, materials, and temporal pieces. Limits depend on your rank/CP tier.</p>
          </div>
          {quota && (
            <div className="text-right shrink-0">
              <p className="text-[10px] uppercase tracking-wider text-white/40 font-bold">Quota</p>
              <p className="text-sm font-mono font-bold text-white">{quota.remaining}<span className="text-white/40">/{quota.limit}</span></p>
              <p className="text-[10px] text-white/40">remaining this cycle</p>
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="relative z-10 flex flex-col min-h-0 flex-1">
          <div className="overflow-y-auto px-6 space-y-4 flex-1">
            {/* Request type selector */}
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-white/50 mb-2">Request type</label>
              <div className="grid grid-cols-3 gap-2">
                {MARKET_REQUEST_TYPES.map((t) => (
                  <button
                    type="button"
                    key={t}
                    onClick={() => setItemType(t)}
                    className={`flex flex-col items-center gap-1 py-3 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                      itemType === t
                        ? "border-[var(--forge-gold)]/50 bg-[var(--forge-gold)]/10 text-white"
                        : "border-white/[0.08] bg-white/[0.02] text-white/50 hover:text-white/80 hover:border-white/20"
                    }`}
                  >
                    <span className="text-lg"><ItemTypeIcon type={t} /></span>
                    {MARKET_REQUEST_TYPE_LABELS[t]}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Specific name (optional)"
                placeholder="e.g. Life Core"
                value={itemName}
                onChange={(e) => setItemName(e.target.value)}
              />
              <Input
                label="Quantity"
                type="number"
                min={1}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-white/50 mb-2">Reason / purpose</label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                placeholder="Why do you need this?"
                className="w-full rounded-xl bg-surface-100 border border-white/8 text-white placeholder-gray-500 px-4 py-3 text-sm transition-all focus:outline-none focus:border-primary-500/50 focus:ring-2 focus:ring-primary-500/20 hover:border-white/12 resize-none"
              />
            </div>

          </div>

          <div className="flex gap-3 justify-end border-t border-white/[0.06] px-6 py-4 shrink-0 relative z-10">
            <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={isSubmitting} className="text-xs uppercase font-bold text-white/60">
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm" isLoading={isSubmitting} className="text-xs uppercase font-bold min-w-[120px]">
              Submit request
            </Button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
