"use client";

export default function ScanProgress({
  progress,
  previewUrl,
}: {
  progress: number;
  previewUrl: string | null;
}) {
  const pct = Math.round(progress * 100);
  return (
    <div className="card-obsidian rounded-2xl p-6">
      <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
        {previewUrl && (
          <div className="relative h-36 w-36 shrink-0 overflow-hidden rounded-xl border border-white/[0.08]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewUrl} alt="Equipment screenshot" className="h-full w-full object-cover opacity-70" />
            <div className="absolute inset-0 animate-pulse bg-[var(--forge-gold)]/5" />
            {/* scanning sweep */}
            <div
              className="absolute inset-x-0 h-10 bg-gradient-to-b from-transparent via-[var(--forge-gold)]/30 to-transparent"
              style={{ top: `${pct}%`, transform: "translateY(-50%)", transition: "top .3s linear" }}
            />
          </div>
        )}
        <div className="w-full min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--forge-gold)]/60" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[var(--forge-gold)]" />
            </span>
            <p className="text-sm font-semibold text-white">Matching equipment…</p>
          </div>
          <p className="mt-1 text-xs text-white/45">
            Comparing each slot&apos;s icon against the guild icon library. Runs entirely in your browser.
          </p>
          <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-white/[0.06]">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[var(--forge-gold-dim)] to-[var(--forge-gold)] transition-[width] duration-300"
              style={{ width: `${Math.max(5, pct)}%` }}
            />
          </div>
          <p className="mt-1.5 text-right font-mono text-[11px] text-white/40">{pct}%</p>
        </div>
      </div>
    </div>
  );
}
