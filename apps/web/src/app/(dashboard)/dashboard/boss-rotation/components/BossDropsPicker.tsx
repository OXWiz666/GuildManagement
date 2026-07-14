"use client";

import { useMemo, useState } from "react";
import { equipmentApi, type DropCatalogItem } from "@/lib/api";
import { useQuery } from "@/lib/query";
import Button from "@/components/ui/Button";
import { rarityStyle } from "@/lib/rarityStyle";

export interface SelectedDrop {
  item: DropCatalogItem;
  quantity: number;
  // Optional override for this drop's display name (e.g. "Azzam Ring +12").
  // Blank/absent falls back to the catalog item name everywhere it's shown.
  customName?: string;
}

const MAX_CUSTOM_NAME_LENGTH = 60;

export const dropKey = (i: { bucket: string; path: string }) => `${i.bucket}::${i.path}`;

export { rarityStyle };

const RARITY_ORDER = ["Mythic", "Legend", "Epic", "Rare", "Uncommon", "Common"];
const TYPE_ORDER = ["Weapon", "Armor", "Accessory", "Cloak", "Gadget", "Skill Book", "Ability", "Mount"];

export default function BossDropsPicker({
  bossName,
  initial,
  onCancel,
  onApply,
}: {
  bossName: string;
  initial: SelectedDrop[];
  onCancel: () => void;
  onApply: (selected: SelectedDrop[]) => void;
}) {
  const { data, isLoading } = useQuery<DropCatalogItem[]>(
    "drops_catalog",
    async () => {
      const res = await equipmentApi.getDropsCatalog();
      return res.success && res.data ? res.data.items : [];
    },
    { persist: true, staleTime: 1800000 },
  );
  const items = useMemo(() => data || [], [data]);

  const [selected, setSelected] = useState<Map<string, SelectedDrop>>(
    () => new Map(initial.map((d) => [dropKey(d.item), d])),
  );
  const [typeFilter, setTypeFilter] = useState<string>("ALL");
  const [rarityFilter, setRarityFilter] = useState<string>("ALL");
  const [search, setSearch] = useState("");
  const [editingKey, setEditingKey] = useState<string | null>(null);

  // Which type / rarity chips actually exist in the catalog
  const types = useMemo(() => {
    const present = new Set(items.map((i) => i.type));
    return TYPE_ORDER.filter((t) => present.has(t));
  }, [items]);
  const rarities = useMemo(() => {
    const present = new Set(items.map((i) => i.rarity || "").filter(Boolean));
    return RARITY_ORDER.filter((r) => present.has(r));
  }, [items]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return items.filter((i) => {
      if (typeFilter !== "ALL" && i.type !== typeFilter) return false;
      if (rarityFilter !== "ALL" && (i.rarity || "") !== rarityFilter) return false;
      if (!s) return true;
      return (
        i.itemName.toLowerCase().includes(s) ||
        (i.category || "").toLowerCase().includes(s) ||
        i.type.toLowerCase().includes(s)
      );
    });
  }, [items, typeFilter, rarityFilter, search]);

  const selectedList = useMemo(
    () => Array.from(selected.values()).sort((a, b) => a.item.itemName.localeCompare(b.item.itemName)),
    [selected],
  );

  const toggle = (item: DropCatalogItem) => {
    setSelected((prev) => {
      const next = new Map(prev);
      const k = dropKey(item);
      if (next.has(k)) next.delete(k);
      else next.set(k, { item, quantity: 1 });
      return next;
    });
  };

  const setQty = (k: string, qty: number) => {
    setSelected((prev) => {
      const next = new Map(prev);
      const cur = next.get(k);
      if (!cur) return prev;
      const q = Math.max(1, Math.min(999, qty));
      next.set(k, { ...cur, quantity: q });
      return next;
    });
  };

  const setCustomName = (k: string, name: string) => {
    setSelected((prev) => {
      const next = new Map(prev);
      const cur = next.get(k);
      if (!cur) return prev;
      const trimmed = name.trim().slice(0, MAX_CUSTOM_NAME_LENGTH);
      next.set(k, { ...cur, customName: trimmed || undefined });
      return next;
    });
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md animate-fade-in" onClick={onCancel} />
      <div className="relative z-10 flex w-full max-w-3xl max-h-[88vh] flex-col overflow-hidden rounded-3xl border border-[var(--metal-border)] bg-[var(--obsidian-elevated)] shadow-[0_40px_90px_-25px_rgba(0,0,0,0.85)] animate-scale-in">
        {/* Header */}
        <div className="shrink-0 border-b border-white/[0.06] px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.22em] text-[var(--forge-gold-dim)] font-bold">Record drops</p>
              <h3 className="text-base font-semibold text-white mt-0.5">
                What did <span className="text-[var(--forge-gold-bright)]">{bossName}</span> drop?
              </h3>
            </div>
            <span className="shrink-0 rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[11px] font-mono text-white/70">
              {selected.size} selected
            </span>
          </div>

          {/* Search */}
          <div className="relative mt-3">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search item, type or category…"
              className="w-full h-10 pl-10 pr-3 rounded-xl bg-white/[0.03] border border-white/[0.08] text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-[var(--forge-gold)]/40 transition-colors"
            />
          </div>

          {/* Type filter */}
          <div className="mt-3 flex flex-wrap gap-1.5">
            <FilterChip active={typeFilter === "ALL"} onClick={() => setTypeFilter("ALL")}>All types</FilterChip>
            {types.map((t) => (
              <FilterChip key={t} active={typeFilter === t} onClick={() => setTypeFilter(t)}>{t}</FilterChip>
            ))}
          </div>
          {/* Rarity filter */}
          <div className="mt-2 flex flex-wrap gap-1.5">
            <FilterChip active={rarityFilter === "ALL"} onClick={() => setRarityFilter("ALL")}>All rarities</FilterChip>
            {rarities.map((r) => {
              const rs = rarityStyle(r);
              return (
                <FilterChip key={r} active={rarityFilter === r} onClick={() => setRarityFilter(r)} tone={rs.text}>
                  {r}
                </FilterChip>
              );
            })}
          </div>
        </div>

        {/* Grid */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {isLoading && items.length === 0 ? (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2.5">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="aspect-square rounded-xl bg-white/[0.03] animate-pulse" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-sm text-white/35">No items match your filters.</div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2.5">
              {filtered.map((item) => {
                const k = dropKey(item);
                const isSel = selected.has(k);
                const rs = rarityStyle(item.rarity);
                return (
                  <button
                    type="button"
                    key={k}
                    onClick={() => toggle(item)}
                    title={`${item.itemName}${item.rarity ? ` · ${item.rarity}` : ""}`}
                    className={`group relative flex flex-col items-center rounded-xl border p-2 transition-all cursor-pointer ${
                      isSel
                        ? `${rs.border} ${rs.bg} ring-1 ${rs.ring}`
                        : "border-white/[0.06] bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]"
                    }`}
                  >
                    <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-zinc-950">
                      <img
                        src={item.iconUrl}
                        alt={item.itemName}
                        loading="lazy"
                        decoding="async"
                        referrerPolicy="no-referrer"
                        className="h-full w-full object-cover"
                      />
                      {isSel && (
                        <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--forge-gold)] text-black shadow">
                          <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
                        </span>
                      )}
                    </div>
                    <span className="mt-1.5 w-full truncate text-center text-[10px] font-medium text-white/75">{item.itemName}</span>
                    {item.rarity && <span className={`text-[9px] font-bold uppercase tracking-wide ${rs.text}`}>{item.rarity}</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Selected tray */}
        {selectedList.length > 0 && (
          <div className="shrink-0 border-t border-white/[0.06] bg-white/[0.01] px-5 py-3 max-h-[168px] overflow-y-auto">
            <p className="text-[10px] uppercase tracking-[0.18em] text-white/40 font-bold mb-2">Selected drops</p>
            <div className="flex flex-wrap gap-2">
              {selectedList.map(({ item, quantity, customName }) => {
                const k = dropKey(item);
                const rs = rarityStyle(item.rarity);
                const isEditing = editingKey === k;
                return (
                  <span key={k} className={`inline-flex items-center gap-1.5 rounded-lg border ${rs.border} ${rs.bg} pl-1.5 pr-1 py-1`}>
                    <img src={item.iconUrl} alt="" loading="lazy" className="h-5 w-5 rounded object-cover shrink-0" referrerPolicy="no-referrer" />
                    {isEditing ? (
                      <input
                        autoFocus
                        type="text"
                        defaultValue={customName ?? ""}
                        placeholder={item.itemName}
                        maxLength={MAX_CUSTOM_NAME_LENGTH}
                        onBlur={(e) => { setCustomName(k, e.target.value); setEditingKey(null); }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") { setCustomName(k, e.currentTarget.value); setEditingKey(null); }
                          if (e.key === "Escape") setEditingKey(null);
                        }}
                        className="w-28 bg-black/30 border border-white/15 rounded px-1.5 py-0.5 text-[11px] text-white placeholder:text-white/30 focus:outline-none focus:border-[var(--forge-gold)]/50"
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => setEditingKey(k)}
                        title={customName ? `Custom name for ${item.itemName} — click to edit` : "Click to customize name"}
                        className="group/name inline-flex items-center gap-1 text-[11px] font-semibold text-white/85 max-w-[132px] hover:text-[var(--forge-gold-bright)] cursor-pointer transition-colors text-left"
                      >
                        <span className="truncate">{customName || item.itemName}</span>
                        <svg
                          className="h-2.5 w-2.5 shrink-0 text-white/30 group-hover/name:text-[var(--forge-gold-bright)] transition-colors"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.2"
                        >
                          <path d="M12 20h9" />
                          <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                        </svg>
                      </button>
                    )}
                    <span className="flex items-center rounded-md border border-white/10 bg-black/30">
                      <button type="button" onClick={() => setQty(k, quantity - 1)} className="px-1.5 text-white/50 hover:text-white cursor-pointer" aria-label="Decrease">−</button>
                      <span className="min-w-[16px] text-center text-[11px] font-mono text-white/80">{quantity}</span>
                      <button type="button" onClick={() => setQty(k, quantity + 1)} className="px-1.5 text-white/50 hover:text-white cursor-pointer" aria-label="Increase">+</button>
                    </span>
                    <button type="button" onClick={() => toggle(item)} className="ml-0.5 text-white/40 hover:text-rose-300 cursor-pointer" aria-label="Remove">
                      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                    </button>
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="shrink-0 flex items-center justify-between gap-3 border-t border-white/[0.06] px-5 py-3.5">
          <button type="button" onClick={() => setSelected(new Map())} className="text-[11px] font-semibold text-white/40 hover:text-white/70 cursor-pointer disabled:opacity-40" disabled={selected.size === 0}>
            Clear all
          </button>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
            <Button variant="accent" size="sm" onClick={() => onApply(selectedList)}>
              Apply {selected.size > 0 ? `(${selected.size})` : ""}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
  tone,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  tone?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-all cursor-pointer border ${
        active
          ? "border-[var(--forge-gold)]/40 bg-[var(--forge-glow)] text-[var(--forge-gold-bright)]"
          : `border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.05] ${tone || "text-white/50"}`
      }`}
    >
      {children}
    </button>
  );
}
