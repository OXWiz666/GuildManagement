"use client";

import { useState } from "react";
import { factionInventoryApi, type FactionInventoryItemData, type FactionInventoryRequestData } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import Button from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { useQuery, queryClient } from "@/lib/query";

const STATUS_STYLES: Record<string, string> = {
  SUBMITTED: "border-amber-500/25 bg-amber-500/10 text-amber-400",
  UNDER_REVIEW: "border-amber-500/25 bg-amber-500/10 text-amber-400",
  APPROVED: "border-sky-500/25 bg-sky-500/10 text-sky-400",
  REJECTED: "border-red-500/25 bg-red-500/10 text-red-400",
  DISTRIBUTED: "border-emerald-500/25 bg-emerald-500/10 text-emerald-400",
  CANCELLED: "border-white/[0.08] bg-white/[0.03] text-white/40",
};

const PRIORITY_STYLES: Record<string, string> = {
  NORMAL: "text-white/40",
  IMPORTANT: "text-sky-400",
  URGENT: "text-orange-400",
  CRITICAL: "text-red-400",
};

/**
 * Faction Item Requests — a guild asking the faction pool for stock.
 * Submit form (any Guild Leader, for their own guild) + review queue
 * (Inventory access). Follows the row-plus-buttons pending-queue pattern
 * from guild-market/components/RequestItemPanel.tsx rather than
 * introducing a dedicated <ApprovalQueue> component for two call sites.
 */
export default function FactionInventoryRequestsTab({
  canManage,
  isGuildLeader,
  guildId,
}: {
  canManage: boolean;
  isGuildLeader: boolean;
  guildId?: string;
}) {
  const { addToast } = useToast();
  const [form, setForm] = useState({ itemId: "", quantity: "", purpose: "", priority: "NORMAL" as const });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data: itemsRaw } = useQuery<FactionInventoryItemData[]>(
    "faction_inventory_items",
    async () => {
      const result = await factionInventoryApi.getItems();
      return result.success && result.data?.items ? result.data.items : [];
    },
    { persist: true, staleTime: 20000 },
  );
  const items = itemsRaw || [];

  const { data: requestsRaw, isLoading } = useQuery<FactionInventoryRequestData[]>(
    canManage ? "faction_inventory_requests_all" : "faction_inventory_requests_mine",
    async () => {
      const result = await factionInventoryApi.getRequests(canManage ? {} : { mine: true });
      return result.success && result.data?.requests ? result.data.requests : [];
    },
    { staleTime: 15000 },
  );
  const requests = requestsRaw || [];
  const pending = requests.filter((r) => r.status === "SUBMITTED" || r.status === "UNDER_REVIEW");
  const resolved = requests.filter((r) => r.status !== "SUBMITTED" && r.status !== "UNDER_REVIEW");

  function refresh() {
    queryClient.invalidateQueries("faction_inventory_requests_all");
    queryClient.invalidateQueries("faction_inventory_requests_mine");
    queryClient.invalidateQueries("faction_inventory_items");
  }

  async function submit() {
    if (!guildId || !form.itemId || !form.quantity) return;
    setIsSubmitting(true);
    try {
      const result = await factionInventoryApi.submitRequest({
        guildId,
        itemId: form.itemId,
        quantity: Number(form.quantity),
        purpose: form.purpose || undefined,
        priority: form.priority,
      });
      if (result.success) {
        addToast("success", "Item request submitted");
        setForm({ itemId: "", quantity: "", purpose: "", priority: "NORMAL" });
        refresh();
      } else {
        addToast("error", result.error?.message || "Failed to submit request");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function review(id: string, action: "APPROVE" | "REJECT") {
    setBusyId(id);
    try {
      const result = await factionInventoryApi.reviewRequest(id, action);
      if (result.success) {
        addToast("success", action === "APPROVE" ? "Request approved" : "Request rejected");
        refresh();
      } else {
        addToast("error", result.error?.message || "Failed to review request");
      }
    } finally {
      setBusyId(null);
    }
  }

  async function distribute(id: string) {
    setBusyId(id);
    try {
      const result = await factionInventoryApi.distributeRequest(id);
      if (result.success) {
        addToast("success", "Marked as distributed");
        refresh();
      } else {
        addToast("error", result.error?.message || "Failed to distribute");
      }
    } finally {
      setBusyId(null);
    }
  }

  async function cancel(id: string) {
    setBusyId(id);
    try {
      const result = await factionInventoryApi.cancelRequest(id);
      if (result.success) {
        addToast("success", "Request cancelled");
        refresh();
      } else {
        addToast("error", result.error?.message || "Failed to cancel");
      }
    } finally {
      setBusyId(null);
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-5 items-start">
      <div className="space-y-4">
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-white/80 px-1">{canManage ? "Pending review" : "Your pending requests"}</h3>
          {pending.length === 0 ? (
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-6 text-center">
              <p className="text-xs text-white/45">Nothing pending right now.</p>
            </div>
          ) : (
            pending.map((r) => (
              <article key={r.id} className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-4 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white truncate">
                      {r.itemName} <span className="text-white/40 font-normal">× {r.quantity}</span>
                    </p>
                    <p className="text-[11px] text-white/40 mt-0.5">
                      {r.requestingGuildName} · <span className={PRIORITY_STYLES[r.priority]}>{r.priority}</span>
                    </p>
                    {r.purpose && <p className="text-xs text-white/55 mt-1">{r.purpose}</p>}
                  </div>
                  <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${STATUS_STYLES[r.status]}`}>
                    {r.status.replaceAll("_", " ")}
                  </span>
                </div>
                <div className="flex gap-2 pt-1">
                  {canManage && r.status !== "APPROVED" && (
                    <>
                      <Button variant="ghost" size="sm" onClick={() => review(r.id, "REJECT")} isLoading={busyId === r.id} className="hover:text-red-300 hover:border-red-500/35">
                        Reject
                      </Button>
                      <Button variant="secondary" size="sm" onClick={() => review(r.id, "APPROVE")} isLoading={busyId === r.id}>
                        Approve
                      </Button>
                    </>
                  )}
                  {canManage && r.status === "APPROVED" && (
                    <Button variant="secondary" size="sm" onClick={() => distribute(r.id)} isLoading={busyId === r.id}>
                      Mark distributed
                    </Button>
                  )}
                  {!canManage && r.requestedByUserId && (
                    <Button variant="ghost" size="sm" onClick={() => cancel(r.id)} isLoading={busyId === r.id} className="hover:text-red-300 hover:border-red-500/35">
                      Cancel
                    </Button>
                  )}
                </div>
              </article>
            ))
          )}
        </div>

        {resolved.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-white/80 px-1">History</h3>
            {resolved.slice(0, 10).map((r) => (
              <div key={r.id} className="rounded-xl border border-white/[0.06] bg-black/10 px-4 py-2.5 flex items-center justify-between gap-3">
                <p className="text-sm text-white/60 truncate">
                  {r.itemName} <span className="text-white/35">× {r.quantity}</span> — {r.requestingGuildName}
                </p>
                <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${STATUS_STYLES[r.status]}`}>
                  {r.status.replaceAll("_", " ")}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {isGuildLeader && guildId && (
        <aside className="rounded-xl border border-amber-500/15 bg-amber-500/[0.035] p-3.5 space-y-3">
          <h4 className="text-[12px] font-semibold text-white">Request an item</h4>
          <label className="block">
            <span className="block text-[10px] uppercase tracking-[0.16em] text-white/45 mb-2">Item</span>
            <select
              value={form.itemId}
              onChange={(e) => setForm((p) => ({ ...p, itemId: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-sm text-white focus:outline-none focus:border-amber-500/35 cursor-pointer"
            >
              <option className="bg-[#101014]" value="">Select an item…</option>
              {items.map((item) => (
                <option key={item.id} className="bg-[#101014]" value={item.id}>
                  {item.itemName} ({item.availableQuantity} available)
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="block text-[10px] uppercase tracking-[0.16em] text-white/45 mb-2">Quantity</span>
            <input
              type="number"
              min={1}
              value={form.quantity}
              onChange={(e) => setForm((p) => ({ ...p, quantity: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-sm text-white focus:outline-none focus:border-amber-500/35"
            />
          </label>
          <label className="block">
            <span className="block text-[10px] uppercase tracking-[0.16em] text-white/45 mb-2">Priority</span>
            <select
              value={form.priority}
              onChange={(e) => setForm((p) => ({ ...p, priority: e.target.value as typeof form.priority }))}
              className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-sm text-white focus:outline-none focus:border-amber-500/35 cursor-pointer"
            >
              <option className="bg-[#101014]" value="NORMAL">Normal</option>
              <option className="bg-[#101014]" value="IMPORTANT">Important</option>
              <option className="bg-[#101014]" value="URGENT">Urgent</option>
              <option className="bg-[#101014]" value="CRITICAL">Critical</option>
            </select>
          </label>
          <label className="block">
            <span className="block text-[10px] uppercase tracking-[0.16em] text-white/45 mb-2">Purpose (optional)</span>
            <textarea
              value={form.purpose}
              onChange={(e) => setForm((p) => ({ ...p, purpose: e.target.value }))}
              rows={2}
              className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-sm text-white focus:outline-none focus:border-amber-500/35 resize-none"
            />
          </label>
          <Button variant="secondary" size="sm" onClick={submit} isLoading={isSubmitting} disabled={!form.itemId || !form.quantity}>
            Submit request
          </Button>
        </aside>
      )}
    </div>
  );
}
