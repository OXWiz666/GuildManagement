"use client";

import { useMemo } from "react";
import { equipmentApi, type EquipmentCatalogSlot, type DropCatalogItem } from "@/lib/api";
import { useQuery } from "@/lib/query";

// Prefer a "premium" representative icon for a category/slot.
const RARITY_PREF = ["legend", "mythic", "epic", "rare", "uncommon", "common"];

type IconItem = { rarity: string | null; iconUrl: string };

function pickRep(items: IconItem[] | undefined, preferRarity?: string): string | null {
  if (!items || items.length === 0) return null;
  if (preferRarity) {
    const m = items.find((i) => (i.rarity || "").toLowerCase() === preferRarity);
    if (m) return m.iconUrl;
  }
  for (const r of RARITY_PREF) {
    const m = items.find((i) => (i.rarity || "").toLowerCase() === r);
    if (m) return m.iconUrl;
  }
  return items[0]!.iconUrl;
}

// Distribution slot key → equipment catalog slotType (gear icons).
const SLOT_TO_EQUIP: Record<string, string> = {
  weapon: "weapon",
  secondWeapon: "weapon",
  headpiece: "helm",
  helmet: "helm",
  helm: "helm",
  upperArmor: "upperArmor",
  lowerArmor: "lowerArmor",
  gloves: "gloves",
  boots: "boots",
  shoes: "boots",
  necklace: "necklace",
  earrings: "earrings",
  ring: "ring",
  bracelet: "bracelet",
  belt: "belt",
  cloak: "cloak",
  gadget: "gadget",
};

// Consumable-style slot key → drops catalog `type` (skill book / ability / mount icons).
const SLOT_TO_DROP_TYPE: Record<string, string> = {
  skillbook: "Skill Book",
  abilityBook: "Ability",
  abilityBook60: "Ability",
  mount: "Mount",
  saddle: "Mount",
};

const ACCESSORY_SLOTS = ["necklace", "earrings", "ring", "bracelet", "belt"];

export interface GearIconResolver {
  ready: boolean;
  iconForSlot: (slotKey: string) => string | null;
  iconForLegendary: (category: string) => string | null;
}

export function useGearIcons(): GearIconResolver {
  // Equipment catalog is grouped by slotType → real per-slot gear icons.
  const { data: equip } = useQuery<EquipmentCatalogSlot[]>(
    "equipment_catalog",
    async () => {
      const res = await equipmentApi.getCatalog();
      return res.success && res.data ? res.data.slots : [];
    },
    { persist: true, staleTime: 1800000 },
  );

  // Drops catalog carries the consumable types (skill book / ability / mount).
  const { data: drops } = useQuery<DropCatalogItem[]>(
    "drops_catalog",
    async () => {
      const res = await equipmentApi.getDropsCatalog();
      return res.success && res.data ? res.data.items : [];
    },
    { persist: true, staleTime: 1800000 },
  );

  const equipBySlot = useMemo(() => {
    const m = new Map<string, IconItem[]>();
    for (const slot of equip || []) {
      m.set(slot.slotType, slot.items.map((i) => ({ rarity: i.rarity, iconUrl: i.iconUrl })));
    }
    return m;
  }, [equip]);

  const dropByType = useMemo(() => {
    const m = new Map<string, IconItem[]>();
    for (const it of drops || []) {
      const arr = m.get(it.type) || [];
      arr.push({ rarity: it.rarity, iconUrl: it.iconUrl });
      m.set(it.type, arr);
    }
    return m;
  }, [drops]);

  return useMemo(() => {
    const iconForSlot = (slotKey: string): string | null => {
      const equipSlot = SLOT_TO_EQUIP[slotKey];
      if (equipSlot) return pickRep(equipBySlot.get(equipSlot), "legend");
      const dropType = SLOT_TO_DROP_TYPE[slotKey];
      if (dropType) return pickRep(dropByType.get(dropType));
      return null;
    };

    const iconForLegendary = (category: string): string | null => {
      switch (category) {
        case "WEAPON":
          return pickRep(equipBySlot.get("weapon"), "legend");
        case "LEGEND_CLOAK":
          return pickRep(equipBySlot.get("cloak"), "legend");
        case "LEGEND_ACCESSORIES": {
          const combined: IconItem[] = [];
          for (const s of ACCESSORY_SLOTS) combined.push(...(equipBySlot.get(s) || []));
          return pickRep(combined, "legend");
        }
        case "ABILITY_REROLL":
        case "ABILITY_PASSIVE":
          return pickRep(dropByType.get("Ability"));
        default:
          return null;
      }
    };

    return {
      ready: (equip?.length ?? 0) > 0,
      iconForSlot,
      iconForLegendary,
    };
  }, [equip, equipBySlot, dropByType]);
}

// ─── Presentational icon tile with graceful fallback ──────────────────
export function GearIcon({
  src,
  size = 20,
  className = "",
}: {
  src: string | null | undefined;
  size?: number;
  className?: string;
}) {
  if (!src) {
    return (
      <span
        className={`inline-flex shrink-0 items-center justify-center rounded-md border border-white/[0.08] bg-white/[0.03] text-white/30 ${className}`}
        style={{ width: size, height: size }}
        aria-hidden
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" style={{ width: size * 0.6, height: size * 0.6 }}>
          <path d="M20 7l-8-4-8 4 8 4 8-4z" />
          <path d="M4 7v10l8 4 8-4V7" />
          <path d="M12 11v10" />
        </svg>
      </span>
    );
  }
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      className={`shrink-0 rounded-md border border-white/[0.08] object-cover ${className}`}
      style={{ width: size, height: size }}
    />
  );
}
