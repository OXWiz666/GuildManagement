"use client";

import { useEffect, useMemo, useState } from "react";
import type { EquipmentCatalogItem, EquipmentCatalogSlot } from "@/lib/api";
import { rankItemsByCrop, rankItemsByCropEmbed } from "@/lib/equipment-match";
import type { IconSignature } from "@/lib/image-hash";
import { rarityColor } from "./SlotCard";

// Display order for rarity groups (highest tier first).
const RARITY_ORDER = ["Mythic", "Legend", "Legendary", "Epic", "Rare", "Uncommon"];
function rarityRank(r: string | null): number {
  const i = RARITY_ORDER.findIndex((x) => x.toLowerCase() === (r || "").toLowerCase());
  return i === -1 ? RARITY_ORDER.length : i;
}

export default function CorrectionPicker({
  slot,
  currentPath,
  cropSig,
  cropEmbed,
  onSelect,
  onClear,
  onClose,
}: {
  slot: EquipmentCatalogSlot;
  currentPath: string | null;
  cropSig?: IconSignature | null;
  cropEmbed?: Float32Array | null;
  onSelect: (item: EquipmentCatalogItem) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const [rarity, setRarity] = useState<string>("ALL");
  const [variant, setVariant] = useState<string>("ALL");
  const [visualScores, setVisualScores] = useState<Map<string, number> | null>(null);

  // Rank this slot's items by visual similarity to the scanned crop, if available.
  // Prefer CLIP embeddings (stronger); fall back to the dHash signature.
  useEffect(() => {
    let cancelled = false;
    // No reset branch: the picker remounts per slot, so initial state (null) already
    // covers the "no crop" case — avoids a synchronous setState in the effect body.
    if (cropEmbed) {
      rankItemsByCropEmbed(cropEmbed, slot.items).then((scores) => {
        if (!cancelled) setVisualScores(scores);
      });
    } else if (cropSig) {
      rankItemsByCrop(cropSig, slot.items).then((scores) => {
        if (!cancelled) setVisualScores(scores);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [cropEmbed, cropSig, slot.items]);

  // DINOv2 embedding cosine (cropEmbed) vs dHash similarity (cropSig) sit on different
  // scales — floor each so the "best matches" strip stays useful without noise.
  const minVisual = cropEmbed ? 0.5 : 0.55;
  const bestMatches = useMemo(() => {
    if (!visualScores) return [];
    return [...slot.items]
      .map((it) => ({ it, score: visualScores.get(`${it.bucket}/${it.path}`) ?? 0 }))
      .filter((x) => x.score >= minVisual)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);
  }, [visualScores, slot.items, minVisual]);

  // Distinct rarities / variants present for this slot, in sensible order.
  const rarities = useMemo(() => {
    const set = new Set<string>();
    for (const it of slot.items) if (it.rarity) set.add(it.rarity);
    return [...set].sort((a, b) => rarityRank(a) - rarityRank(b));
  }, [slot.items]);

  const variants = useMemo(() => {
    const set = new Set<string>();
    for (const it of slot.items) if (it.variant) set.add(it.variant);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [slot.items]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return slot.items.filter((it) => {
      if (rarity !== "ALL" && (it.rarity || "") !== rarity) return false;
      if (variant !== "ALL" && (it.variant || "") !== variant) return false;
      if (!q) return true;
      return (
        it.itemName.toLowerCase().includes(q) ||
        (it.variant || "").toLowerCase().includes(q) ||
        (it.rarity || "").toLowerCase().includes(q)
      );
    });
  }, [slot.items, search, rarity, variant]);

  // Group filtered items by rarity, ordered; sort within by variant then name.
  const groups = useMemo(() => {
    const byRarity = new Map<string, EquipmentCatalogItem[]>();
    for (const it of filtered) {
      const key = it.rarity || "Other";
      const arr = byRarity.get(key) ?? [];
      arr.push(it);
      byRarity.set(key, arr);
    }
    return [...byRarity.entries()]
      .sort((a, b) => rarityRank(a[0]) - rarityRank(b[0]))
      .map(([rarityKey, items]) => ({
        rarity: rarityKey,
        items: items.sort(
          (a, b) =>
            (a.variant || "").localeCompare(b.variant || "") || a.itemName.localeCompare(b.itemName),
        ),
      }));
  }, [filtered]);

  const chip = (label: string, active: boolean, onClick: () => void, color?: string) => (
    <button
      key={label}
      type="button"
      onClick={onClick}
      className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-all ${
        active
          ? "border-[var(--forge-gold)]/50 bg-[var(--forge-gold)]/[0.10] text-[var(--forge-gold-bright)]"
          : "border-white/[0.08] bg-white/[0.02] text-white/55 hover:border-white/20 hover:text-white/80"
      }`}
    >
      {color && (
        <span className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle" style={{ background: color }} />
      )}
      {label}
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative mx-4 flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl glass-strong p-5 animate-scale-in">
        {/* Header */}
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--forge-gold-dim)]">
              Select item
            </p>
            <h3 className="text-base font-bold text-white">
              {slot.label} <span className="text-white/35 font-normal">· {filtered.length}</span>
            </h3>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white" aria-label="Close">
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Search */}
        <input
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={`Search ${slot.label.toLowerCase()}…`}
          className="mb-3 w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-3.5 py-2 text-sm text-white focus:border-white/25 focus:outline-none"
        />

        {/* Filters */}
        {(rarities.length > 1 || variants.length > 1) && (
          <div className="mb-3 space-y-2">
            {rarities.length > 1 && (
              <div className="flex flex-wrap gap-1.5">
                {chip("All rarities", rarity === "ALL", () => setRarity("ALL"))}
                {rarities.map((r) => chip(r, rarity === r, () => setRarity(r), rarityColor(r)))}
              </div>
            )}
            {variants.length > 1 && (
              <div className="flex flex-wrap gap-1.5">
                {chip("All types", variant === "ALL", () => setVariant("ALL"))}
                {variants.map((v) => chip(v, variant === v, () => setVariant(v)))}
              </div>
            )}
          </div>
        )}

        {/* Best visual matches (from the scanned crop) */}
        {bestMatches.length > 0 && (
          <div className="mb-3 rounded-xl border border-[var(--forge-gold)]/20 bg-[var(--forge-gold)]/[0.04] p-2.5">
            <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--forge-gold-bright)]">
              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2l2.2 6.6H21l-5.4 4 2 6.6-5.6-4-5.6 4 2-6.6-5.4-4h6.8z" />
              </svg>
              Best visual matches
            </p>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {bestMatches.map(({ it, score }) => (
                <button
                  key={`best-${it.bucket}/${it.path}`}
                  onClick={() => onSelect(it)}
                  title={`${it.itemName}${it.variant ? ` · ${it.variant}` : ""} — ${Math.round(score * 100)}% match`}
                  className="group relative shrink-0"
                >
                  <div
                    className="h-12 w-12 overflow-hidden rounded-md border bg-black/30"
                    style={{ borderColor: `${rarityColor(it.rarity)}99` }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={it.iconUrl} alt={it.itemName} className="h-full w-full object-cover" loading="lazy" decoding="async" />
                  </div>
                  <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded bg-black/80 px-1 font-mono text-[8px] text-emerald-300">
                    {Math.round(score * 100)}%
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Results */}
        <div className="-mr-1 flex-1 overflow-y-auto pr-1">
          <button
            onClick={onClear}
            className="mb-2 flex w-full items-center gap-2.5 rounded-lg border border-white/[0.06] p-2 text-left hover:border-white/20 hover:bg-white/[0.03]"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-md border border-white/[0.08] bg-black/30 text-white/30">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </div>
            <span className="text-sm text-white/60">Clear slot (no item)</span>
          </button>

          {groups.length === 0 && (
            <p className="py-8 text-center text-sm text-white/40">No matching items.</p>
          )}

          {groups.map((group) => (
            <div key={group.rarity} className="mb-3">
              <div className="sticky top-0 z-10 mb-1.5 flex items-center gap-2 bg-[var(--obsidian-elevated,#0c0c0e)]/80 py-1 backdrop-blur">
                <span
                  className="text-[10px] font-bold uppercase tracking-wider"
                  style={{ color: rarityColor(group.rarity) }}
                >
                  {group.rarity}
                </span>
                <span className="text-[10px] text-white/30">{group.items.length}</span>
                <span className="h-px flex-1 bg-white/[0.06]" />
              </div>
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {group.items.map((it) => {
                  const active = it.path === currentPath;
                  return (
                    <button
                      key={`${it.bucket}/${it.path}`}
                      onClick={() => onSelect(it)}
                      className={`flex items-center gap-2.5 rounded-lg border p-2 text-left transition-all hover:bg-white/[0.04] ${
                        active
                          ? "border-[var(--forge-gold)]/50 bg-[var(--forge-gold)]/[0.05]"
                          : "border-white/[0.06] hover:border-white/20"
                      }`}
                    >
                      <div
                        className="h-10 w-10 shrink-0 overflow-hidden rounded-md border bg-black/30"
                        style={{ borderColor: `${rarityColor(it.rarity)}66` }}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={it.iconUrl} alt={it.itemName} className="h-full w-full object-cover" loading="lazy" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-white/90">{it.itemName}</p>
                        {it.variant && <p className="truncate text-[11px] text-white/45">{it.variant}</p>}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
