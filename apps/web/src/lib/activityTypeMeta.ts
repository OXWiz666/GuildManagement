export interface ActivityTypeMeta {
  label: string;
  badge: string;
  dot: string;
}

type Swatch = Omit<ActivityTypeMeta, "label">;

// Named so a leader can pick a specific color per activity type (Register
// Activity), instead of only getting the hash-derived fallback below.
export const ACTIVITY_COLOR_OPTIONS: Record<string, Swatch> = {
  emerald: { badge: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300", dot: "#34d399" },
  red: { badge: "border-red-500/30 bg-red-500/10 text-red-300", dot: "#f87171" },
  violet: { badge: "border-violet-500/30 bg-violet-500/10 text-violet-300", dot: "#a78bfa" },
  amber: { badge: "border-amber-500/30 bg-amber-500/10 text-amber-300", dot: "#fbbf24" },
  sky: { badge: "border-sky-500/30 bg-sky-500/10 text-sky-300", dot: "#38bdf8" },
  pink: { badge: "border-pink-500/30 bg-pink-500/10 text-pink-300", dot: "#f472b6" },
  teal: { badge: "border-teal-500/30 bg-teal-500/10 text-teal-300", dot: "#2dd4bf" },
  orange: { badge: "border-orange-500/30 bg-orange-500/10 text-orange-300", dot: "#fb923c" },
};

export const ACTIVITY_COLOR_IDS = Object.keys(ACTIVITY_COLOR_OPTIONS);

const PALETTE: Swatch[] = Object.values(ACTIVITY_COLOR_OPTIONS);

const FALLBACK: ActivityTypeMeta = {
  label: "",
  badge: "border-white/15 bg-white/5 text-white/60",
  dot: "#9ca3af",
};

function hashKey(key: string): number {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return hash;
}

/** Assigns a badge/dot color pair to each activity type: the leader's chosen
 *  `color` when set, otherwise a deterministic hash of the key so custom,
 *  leader-registered activities still get a distinct, stable identity
 *  without manual color mapping. */
export function buildActivityTypeMeta(
  registeredActivities: Array<{ key: string; label: string; color?: string }>,
): Record<string, ActivityTypeMeta> {
  const meta: Record<string, ActivityTypeMeta> = {};
  for (const activity of registeredActivities) {
    const chosen = activity.color ? ACTIVITY_COLOR_OPTIONS[activity.color] : undefined;
    const palette = chosen ?? PALETTE[hashKey(activity.key) % PALETTE.length];
    meta[activity.key] = { ...palette, label: activity.label };
  }
  return meta;
}

/** Looks up meta for a type, falling back to a neutral badge showing the raw
 *  stored value for legacy/unregistered types (e.g. data predating a leader
 *  pruning that activity from the registry). */
export function resolveActivityTypeMeta(
  meta: Record<string, ActivityTypeMeta>,
  type: string,
): ActivityTypeMeta {
  return meta[type] ?? { ...FALLBACK, label: type };
}
