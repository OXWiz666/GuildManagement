"use client";

import {
  DISTRIBUTION_TIER_LABELS,
  LEGENDARY_CATEGORY_LABELS,
  MARKET_REQUEST_TYPE_LABELS,
  REQUEST_STATUS_LABELS,
} from "@guild/shared";

const TIER_STYLES: Record<string, string> = {
  CORE: "bg-cyan-500/10 text-cyan-300 border-cyan-500/25",
  ELITE: "bg-emerald-500/10 text-emerald-300 border-emerald-500/25",
  MEMBER: "bg-white/[0.05] text-zinc-300 border-white/10",
};

// Historical records may still carry the pre-migration UPPER/LOWER rank
// split — both collapse into the single MEMBER rank for display.
const LEGACY_TIER_ALIASES: Record<string, string> = { UPPER: "MEMBER", LOWER: "MEMBER" };

export function RankTierBadge({ tier }: { tier: string | null | undefined }) {
  const raw = (tier || "MEMBER").toUpperCase();
  const key = LEGACY_TIER_ALIASES[raw] || raw;
  const label = DISTRIBUTION_TIER_LABELS[key as keyof typeof DISTRIBUTION_TIER_LABELS] || key;
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border ${
        TIER_STYLES[key] || TIER_STYLES.MEMBER
      }`}
    >
      {label}
    </span>
  );
}

const STATUS_STYLES: Record<string, string> = {
  PENDING: "bg-amber-500/10 text-amber-300 border-amber-500/25",
  APPROVED: "bg-emerald-500/10 text-emerald-300 border-emerald-500/25",
  DECLINED: "bg-rose-500/10 text-rose-300 border-rose-500/25",
  REJECTED: "bg-rose-500/10 text-rose-300 border-rose-500/25",
  FULFILLED: "bg-cyan-500/10 text-cyan-300 border-cyan-500/25",
  COMPLETED: "bg-violet-500/10 text-violet-300 border-violet-500/25",
};

/** statusKind toggles spec labelling between item-request and legendary wording. */
export function MarketStatusBadge({
  status,
  legendary = false,
}: {
  status: string;
  legendary?: boolean;
}) {
  const key = status.toUpperCase();
  const label = legendary
    ? key.charAt(0) + key.slice(1).toLowerCase()
    : REQUEST_STATUS_LABELS[key] || key;
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border ${
        STATUS_STYLES[key] || STATUS_STYLES.PENDING
      }`}
    >
      {label}
    </span>
  );
}

export function PrioritySeqBadge({ position }: { position: number }) {
  const medal = position === 1 ? "🥇" : position === 2 ? "🥈" : position === 3 ? "🥉" : null;
  return (
    <span className="inline-flex items-center justify-center min-w-[26px] h-[22px] px-1.5 rounded-md text-[11px] font-mono font-bold bg-[var(--forge-gold)]/10 text-[var(--forge-gold-bright)] border border-[var(--forge-gold)]/25">
      {medal || `#${position}`}
    </span>
  );
}

const TYPE_ICONS: Record<string, string> = {
  LOGS: "🪵",
  MATERIALS: "⛏️",
  TEMPORAL_PIECES: "⏳",
};

export function ItemTypeIcon({ type }: { type: string }) {
  return <span aria-hidden>{TYPE_ICONS[type] || "📦"}</span>;
}

export function ItemTypeLabel({ type }: { type: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <ItemTypeIcon type={type} />
      {MARKET_REQUEST_TYPE_LABELS[type as keyof typeof MARKET_REQUEST_TYPE_LABELS] || type}
    </span>
  );
}

const LEGENDARY_ICONS: Record<string, string> = {
  WEAPON: "⚔️",
  LEGEND_ACCESSORIES: "💍",
  LEGEND_CLOAK: "🧥",
  ABILITY_REROLL: "🎲",
  ABILITY_PASSIVE: "✨",
};

export function LegendaryCategoryBadge({ category }: { category: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-violet-500/10 text-violet-200 border border-violet-500/25">
      <span aria-hidden>{LEGENDARY_ICONS[category] || "✨"}</span>
      {LEGENDARY_CATEGORY_LABELS[category as keyof typeof LEGENDARY_CATEGORY_LABELS] || category}
    </span>
  );
}
