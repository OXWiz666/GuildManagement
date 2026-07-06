"use client";

import type { SlotDebug } from "@/lib/equipment-match";

// Developer/tuning overlay: draws each detected slot box + tight crop over the uploaded
// screenshot, and lists the top-3 candidates per slot with scores. Lets us see where the
// scanner cropped and whether the correct item was even in contention — the fast path to
// tuning thresholds / crop insets from a real scan.

const REVIEW = 0.7; // matches PANEL_REVIEW
const ACCEPT = 0.55; // matches PANEL_ACCEPT

function colorFor(d: SlotDebug): string {
  if (d.empty || d.candidates.length === 0) return "#f87171"; // red
  const top = d.candidates[0]!.score;
  if (top >= REVIEW) return "#34d399"; // green — confident
  if (top >= ACCEPT) return "#fbbf24"; // amber — needs review
  return "#f87171"; // red — below accept
}

export default function ScanDebugOverlay({
  previewUrl,
  dims,
  debug,
  onClose,
}: {
  previewUrl: string;
  dims: { w: number; h: number };
  debug: SlotDebug[];
  onClose: () => void;
}) {
  const stroke = Math.max(1.5, dims.w * 0.002);
  const font = Math.max(9, dims.h * 0.016);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative mx-4 flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl glass-strong p-5">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--forge-gold-dim)]">
              Scan debug
            </p>
            <h3 className="text-base font-bold text-white">
              Detected boxes & candidates{" "}
              <span className="font-normal text-white/35">· {debug.length} slots located</span>
            </h3>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white" aria-label="Close">
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {debug.length === 0 ? (
          <p className="py-8 text-center text-sm text-white/50">
            No slots were located by geometry on this image (a fallback matcher was used, or it
            isn&apos;t a recognisable panel). Try the dedicated Equipment screen.
          </p>
        ) : (
          <div className="-mr-1 flex flex-col gap-4 overflow-y-auto pr-1">
            {/* Annotated screenshot */}
            <div className="relative w-full shrink-0 overflow-hidden rounded-lg border border-white/10">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={previewUrl} alt="scan" className="block h-auto w-full" />
              <svg
                viewBox={`0 0 ${dims.w} ${dims.h}`}
                preserveAspectRatio="none"
                className="pointer-events-none absolute inset-0 h-full w-full"
              >
                {debug.map((d) => {
                  const c = colorFor(d);
                  const top = d.candidates[0];
                  return (
                    <g key={d.slotType}>
                      <rect x={d.box.x} y={d.box.y} width={d.box.w} height={d.box.h} fill="none" stroke={c} strokeWidth={stroke} />
                      <rect
                        x={d.cropBox.x}
                        y={d.cropBox.y}
                        width={d.cropBox.w}
                        height={d.cropBox.h}
                        fill="none"
                        stroke="#22d3ee"
                        strokeWidth={stroke * 0.7}
                        strokeDasharray={`${stroke * 2},${stroke * 2}`}
                      />
                      <text x={d.box.x} y={d.box.y - stroke} fontSize={font} fill={c} fontWeight="700">
                        {d.slotType}
                        {top ? ` ${Math.round(top.score * 100)}%` : ""}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>

            <div className="flex items-center gap-4 text-[11px] text-white/50">
              <span className="flex items-center gap-1"><span className="inline-block h-2 w-4" style={{ background: "#34d399" }} /> confident</span>
              <span className="flex items-center gap-1"><span className="inline-block h-2 w-4" style={{ background: "#fbbf24" }} /> review</span>
              <span className="flex items-center gap-1"><span className="inline-block h-2 w-4" style={{ background: "#f87171" }} /> empty / below-accept</span>
              <span className="flex items-center gap-1"><span className="inline-block h-2 w-4 border-b-2 border-dashed" style={{ borderColor: "#22d3ee" }} /> tight crop matched</span>
            </div>

            {/* Per-slot top-3 candidates */}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {debug.map((d) => (
                <div key={`list-${d.slotType}`} className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-2.5">
                  <div className="mb-1.5 flex items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-white/70">{d.slotType}</span>
                    {d.rarity && <span className="text-[10px] text-white/40">{d.rarity}</span>}
                    {d.empty && <span className="text-[10px] text-red-300">EMPTY</span>}
                  </div>
                  <div className="flex gap-2">
                    {d.candidates.length === 0 && (
                      <span className="text-[11px] text-white/30">no candidates</span>
                    )}
                    {d.candidates.map((c, i) => (
                      <div
                        key={`${d.slotType}-${i}`}
                        className={`flex w-16 flex-col items-center rounded-md border p-1 ${
                          i === 0 ? "border-[var(--forge-gold)]/50 bg-[var(--forge-gold)]/[0.06]" : "border-white/[0.06]"
                        }`}
                        title={`${c.itemName}${c.rarity ? ` · ${c.rarity}` : ""} — ${(c.score * 100).toFixed(1)}%`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={c.iconUrl} alt={c.itemName} className="h-9 w-9 rounded object-cover" />
                        <span className="mt-0.5 w-full truncate text-center text-[9px] text-white/60">{c.itemName}</span>
                        <span className="font-mono text-[9px] text-emerald-300">{Math.round(c.score * 100)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
