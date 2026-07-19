"use client";

import { useMemo, useState } from "react";
import { factionInventoryApi, type FactionInventoryItemData } from "@/lib/api";
import { FACTION_INVENTORY_CATEGORIES, FACTION_INVENTORY_CATEGORY_LABELS } from "@guild/shared";
import { useToast } from "@/components/ui/Toast";
import Button from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { useQuery, queryClient } from "@/lib/query";

type RowAction = "ADD" | "ADJUST" | null;

/**
 * Faction Inventory — the shared item pool's catalog. Any faction member can
 * view it (read-only); mutation controls (create/add/adjust) are shown for
 * canManage, matching Phase 1's client-side gating convention — the real
 * boundary is server-side (requireFactionInventoryManager), so an Inventory
 * Manager who isn't Faction Leader/Admin can still act via the API even
 * though these controls stay hidden for them here.
 */
export default function FactionInventoryTab({ canManage }: { canManage: boolean }) {
  const { addToast } = useToast();
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ itemName: "", category: FACTION_INVENTORY_CATEGORIES[0], rarity: "", description: "" });
  const [isCreating, setIsCreating] = useState(false);
  const [activeRow, setActiveRow] = useState<{ id: string; action: RowAction } | null>(null);
  const [rowForm, setRowForm] = useState({ quantity: "", reason: "" });
  const [isSubmittingRow, setIsSubmittingRow] = useState(false);

  const { data: itemsRaw, isLoading } = useQuery<FactionInventoryItemData[]>(
    "faction_inventory_items",
    async () => {
      const result = await factionInventoryApi.getItems();
      return result.success && result.data?.items ? result.data.items : [];
    },
    { persist: true, staleTime: 20000 },
  );
  const items = itemsRaw || [];

  const filtered = useMemo(
    () => (categoryFilter === "ALL" ? items : items.filter((i) => i.category === categoryFilter)),
    [items, categoryFilter],
  );

  const categoriesPresent = useMemo(() => {
    const present = new Set(items.map((i) => i.category));
    return FACTION_INVENTORY_CATEGORIES.filter((c) => present.has(c));
  }, [items]);

  function refresh() {
    queryClient.invalidateQueries("faction_inventory_items");
  }

  async function createItem() {
    if (!createForm.itemName.trim()) return;
    setIsCreating(true);
    try {
      const result = await factionInventoryApi.createItem({
        itemName: createForm.itemName,
        category: createForm.category,
        rarity: createForm.rarity || undefined,
        description: createForm.description || undefined,
      });
      if (result.success) {
        addToast("success", "Inventory item created");
        setCreateForm({ itemName: "", category: FACTION_INVENTORY_CATEGORIES[0], rarity: "", description: "" });
        setShowCreate(false);
        refresh();
      } else {
        addToast("error", result.error?.message || "Failed to create item");
      }
    } finally {
      setIsCreating(false);
    }
  }

  function startRowAction(id: string, action: RowAction) {
    setActiveRow({ id, action });
    setRowForm({ quantity: "", reason: "" });
  }

  async function submitRowAction() {
    if (!activeRow) return;
    const quantity = Number(rowForm.quantity);
    if (activeRow.action === "ADD" && (!quantity || quantity <= 0)) return;
    if (activeRow.action === "ADJUST" && (!quantity || !rowForm.reason.trim())) return;

    setIsSubmittingRow(true);
    try {
      const result =
        activeRow.action === "ADD"
          ? await factionInventoryApi.recordAddition(activeRow.id, quantity, rowForm.reason || undefined)
          : await factionInventoryApi.adjustQuantity(activeRow.id, quantity, rowForm.reason);
      if (result.success) {
        addToast("success", activeRow.action === "ADD" ? "Stock added" : "Quantity adjusted");
        setActiveRow(null);
        refresh();
      } else {
        addToast("error", result.error?.message || "Failed to update stock");
      }
    } finally {
      setIsSubmittingRow(false);
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
    <div className="space-y-4">
      <div className="flex flex-col gap-2 px-1 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setCategoryFilter("ALL")}
            className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors cursor-pointer ${
              categoryFilter === "ALL" ? "border-white/25 bg-white/[0.08] text-white" : "border-white/[0.08] bg-white/[0.02] text-white/45 hover:text-white/75"
            }`}
          >
            All categories
          </button>
          {categoriesPresent.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategoryFilter((prev) => (prev === c ? "ALL" : c))}
              className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors cursor-pointer ${
                categoryFilter === c ? "border-amber-500/25 bg-amber-500/10 text-amber-400" : "border-white/[0.08] bg-white/[0.02] text-white/45 hover:text-white/75"
              }`}
            >
              {FACTION_INVENTORY_CATEGORY_LABELS[c]}
            </button>
          ))}
        </div>
        {canManage && (
          <Button variant="secondary" size="sm" onClick={() => setShowCreate((v) => !v)}>
            {showCreate ? "Cancel" : "New item"}
          </Button>
        )}
      </div>

      {showCreate && canManage && (
        <div className="rounded-xl border border-amber-500/15 bg-amber-500/[0.035] p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-[10px] uppercase tracking-[0.16em] text-white/45 mb-1.5">Item name</span>
              <input
                value={createForm.itemName}
                onChange={(e) => setCreateForm((p) => ({ ...p, itemName: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-sm text-white focus:outline-none focus:border-amber-500/35"
              />
            </label>
            <label className="block">
              <span className="block text-[10px] uppercase tracking-[0.16em] text-white/45 mb-1.5">Category</span>
              <select
                value={createForm.category}
                onChange={(e) => setCreateForm((p) => ({ ...p, category: e.target.value as typeof createForm.category }))}
                className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-sm text-white focus:outline-none focus:border-amber-500/35 cursor-pointer"
              >
                {FACTION_INVENTORY_CATEGORIES.map((c) => (
                  <option key={c} className="bg-[#101014]" value={c}>
                    {FACTION_INVENTORY_CATEGORY_LABELS[c]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="block">
            <span className="block text-[10px] uppercase tracking-[0.16em] text-white/45 mb-1.5">Rarity (optional)</span>
            <input
              value={createForm.rarity}
              onChange={(e) => setCreateForm((p) => ({ ...p, rarity: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-sm text-white focus:outline-none focus:border-amber-500/35"
            />
          </label>
          <Button variant="secondary" size="sm" onClick={createItem} isLoading={isCreating} disabled={!createForm.itemName.trim()}>
            Create item
          </Button>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-8 text-center">
          <h3 className="text-sm font-semibold text-white/80">No inventory items yet</h3>
          <p className="text-xs text-white/45 mt-1">
            {canManage ? "Create one above to start pooling faction resources." : "Faction Leaders and Inventory Managers can add items."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((item) => {
            const isLowStock = item.minStockThreshold !== null && item.availableQuantity < item.minStockThreshold;
            return (
              <article key={item.id} className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-4">
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-semibold text-white truncate">{item.itemName}</h3>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold border border-white/[0.08] bg-white/[0.03] text-white/50">
                        {FACTION_INVENTORY_CATEGORY_LABELS[item.category as keyof typeof FACTION_INVENTORY_CATEGORY_LABELS] || item.category}
                      </span>
                      {isLowStock && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold border border-orange-500/25 bg-orange-500/10 text-orange-400">
                          Low stock
                        </span>
                      )}
                    </div>
                    {item.description && <p className="text-[11px] text-white/35 mt-1">{item.description}</p>}
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                  <Stat label="Available" value={item.availableQuantity} accent />
                  <Stat label="Reserved" value={item.reservedQuantity} />
                  <Stat label="Total" value={item.currentQuantity} />
                  <Stat label="Distributed" value={item.distributedQuantity} />
                </div>

                {canManage && (
                  <>
                    {activeRow?.id === item.id ? (
                      <div className="space-y-2 border-t border-white/[0.06] pt-3">
                        <div className="flex gap-2">
                          <input
                            type="number"
                            placeholder={activeRow.action === "ADD" ? "Quantity to add" : "Delta (+/-)"}
                            value={rowForm.quantity}
                            onChange={(e) => setRowForm((p) => ({ ...p, quantity: e.target.value }))}
                            className="w-32 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-sm text-white focus:outline-none focus:border-amber-500/35"
                          />
                          <input
                            placeholder={activeRow.action === "ADJUST" ? "Reason (required)" : "Reason (optional)"}
                            value={rowForm.reason}
                            onChange={(e) => setRowForm((p) => ({ ...p, reason: e.target.value }))}
                            className="flex-1 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-amber-500/35"
                          />
                        </div>
                        <div className="flex gap-2">
                          <Button variant="secondary" size="sm" onClick={submitRowAction} isLoading={isSubmittingRow}>
                            Confirm
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => setActiveRow(null)}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-2 border-t border-white/[0.06] pt-3">
                        <button onClick={() => startRowAction(item.id, "ADD")} className="text-[11px] text-amber-400 hover:text-amber-300 cursor-pointer">
                          Add stock
                        </button>
                        <span className="text-white/20">·</span>
                        <button onClick={() => startRowAction(item.id, "ADJUST")} className="text-[11px] text-amber-400 hover:text-amber-300 cursor-pointer">
                          Adjust
                        </button>
                      </div>
                    )}
                  </>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="rounded-lg bg-black/15 px-3 py-2">
      <p className="text-[10px] uppercase tracking-[0.14em] text-white/35">{label}</p>
      <p className={`text-sm font-semibold ${accent ? "text-amber-400" : "text-white/80"}`}>{value.toLocaleString()}</p>
    </div>
  );
}
