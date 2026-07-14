// Rarity → palette. Keys are matched case-insensitively.
const RARITY_STYLE: Record<string, { text: string; border: string; bg: string; ring: string }> = {
  mythic: { text: "text-rose-300", border: "border-rose-400/40", bg: "bg-rose-500/10", ring: "ring-rose-400/50" },
  legend: { text: "text-[var(--forge-gold-bright)]", border: "border-[var(--forge-gold)]/45", bg: "bg-[var(--forge-gold)]/10", ring: "ring-[var(--forge-gold)]/60" },
  epic: { text: "text-violet-300", border: "border-violet-400/40", bg: "bg-violet-500/10", ring: "ring-violet-400/50" },
  rare: { text: "text-sky-300", border: "border-sky-400/40", bg: "bg-sky-500/10", ring: "ring-sky-400/50" },
  uncommon: { text: "text-emerald-300", border: "border-emerald-400/40", bg: "bg-emerald-500/10", ring: "ring-emerald-400/50" },
  common: { text: "text-zinc-300", border: "border-white/15", bg: "bg-white/[0.04]", ring: "ring-white/25" },
};

export function rarityStyle(rarity: string | null | undefined) {
  return RARITY_STYLE[(rarity || "").toLowerCase()] || RARITY_STYLE.common!;
}
