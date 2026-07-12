// Color keys must stay in sync with MEMBER_CATEGORY_COLORS in
// packages/core/src/services/memberCategory.service.ts.

export const CATEGORY_COLORS = [
  "slate",
  "amber",
  "cyan",
  "emerald",
  "violet",
  "rose",
  "sky",
  "orange",
] as const;

export type CategoryColor = (typeof CATEGORY_COLORS)[number];

// Badge styling per color (background + text + border), matching the tone of
// the role Badge component.
const BADGE_STYLES: Record<string, string> = {
  slate: "bg-slate-500/10 text-slate-300 border-slate-400/25",
  amber: "bg-amber-500/10 text-amber-400 border-amber-500/25",
  cyan: "bg-cyan-500/10 text-cyan-400 border-cyan-500/25",
  emerald: "bg-emerald-500/10 text-emerald-400 border-emerald-500/25",
  violet: "bg-violet-500/10 text-violet-400 border-violet-500/25",
  rose: "bg-rose-500/10 text-rose-400 border-rose-500/25",
  sky: "bg-sky-500/10 text-sky-400 border-sky-500/25",
  orange: "bg-orange-500/10 text-orange-400 border-orange-500/25",
};

// A solid swatch for the color picker.
const SWATCH_STYLES: Record<string, string> = {
  slate: "bg-slate-400",
  amber: "bg-amber-400",
  cyan: "bg-cyan-400",
  emerald: "bg-emerald-400",
  violet: "bg-violet-400",
  rose: "bg-rose-400",
  sky: "bg-sky-400",
  orange: "bg-orange-400",
};

export function categoryBadgeClass(color: string): string {
  return BADGE_STYLES[color] ?? BADGE_STYLES.slate;
}

export function categorySwatchClass(color: string): string {
  return SWATCH_STYLES[color] ?? SWATCH_STYLES.slate;
}
