"use client";

export function rarityColor(rarity: string | null): string {
  switch ((rarity || "").toLowerCase()) {
    case "mythic":
      return "#e0457b";
    case "legend":
    case "legendary":
      return "#d4a853";
    case "epic":
      return "#a972e6";
    case "rare":
      return "#4d9be6";
    case "uncommon":
      return "#3fb27f";
    default:
      return "#8a8f98";
  }
}

export interface SlotCardProps {
  label: string;
  itemName: string | null;
  iconUrl: string | null;
  rarity: string | null;
  confidence: number | null; // 0..1, null when no item
  needsReview: boolean;
  onClick?: () => void;
  readOnly?: boolean;
}

export default function SlotCard({
  label,
  itemName,
  iconUrl,
  rarity,
  confidence,
  needsReview,
  onClick,
  readOnly,
}: SlotCardProps) {
  const pct = confidence == null ? null : Math.round(confidence * 100);
  const color = rarityColor(rarity);
  const empty = !itemName;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={readOnly}
      className={`group relative flex w-full items-center gap-3 rounded-xl border p-2.5 text-left transition-all
        ${readOnly ? "cursor-default" : "cursor-pointer hover:border-white/20 hover:bg-white/[0.03]"}
        ${needsReview ? "border-amber-400/40 bg-amber-400/[0.04]" : "border-white/[0.08] bg-white/[0.02]"}`}
    >
      {/* Icon */}
      <div
        className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-black/30"
        style={{ borderColor: empty ? "rgba(255,255,255,0.08)" : `${color}66` }}
      >
        {iconUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={iconUrl} alt={itemName || label} className="h-full w-full object-cover" />
        ) : (
          <svg className="h-5 w-5 text-white/20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="4" y="4" width="16" height="16" rx="2" />
            <path d="M8 12h8" />
          </svg>
        )}
      </div>

      {/* Text */}
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-white/35">{label}</p>
        <p className={`truncate text-sm font-medium ${empty ? "text-white/30" : "text-white/90"}`}>
          {itemName || "Empty"}
        </p>
        {pct != null && (
          <div className="mt-1 flex items-center gap-1.5">
            <div className="h-1 w-14 overflow-hidden rounded-full bg-white/[0.08]">
              <div
                className="h-full rounded-full"
                style={{ width: `${pct}%`, background: needsReview ? "#f5b841" : "#3fb27f" }}
              />
            </div>
            <span className="font-mono text-[10px] text-white/40">{pct}%</span>
          </div>
        )}
      </div>

      {/* Needs review badge */}
      {needsReview && (
        <span className="shrink-0 rounded-md bg-amber-400/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-300">
          Review
        </span>
      )}
    </button>
  );
}
