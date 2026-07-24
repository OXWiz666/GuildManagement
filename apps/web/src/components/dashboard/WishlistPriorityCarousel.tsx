"use client";

import { useEffect, useState } from "react";
import { WISHLIST_LABELS, WISHLIST_CATEGORY_LABELS } from "@guild/shared";
import { marketApi, type PriorityQueueEntry } from "@/lib/api";
import { useQuery } from "@/lib/query";
import { Reveal } from "@/components/dashboard/DashboardHelpers";

const TIER_TONE: Record<string, string> = {
  CORE: "text-[var(--forge-gold-bright)] border-[var(--forge-gold)]/30 bg-[var(--forge-gold)]/[0.08]",
  ELITE: "text-sky-300 border-sky-500/30 bg-sky-500/10",
  MEMBER: "text-white/60 border-white/15 bg-white/[0.04]",
};

function wishLabel(key: string, fallback?: string) {
  return WISHLIST_LABELS[key] || fallback || key;
}

export default function WishlistPriorityCarousel({ guildId }: { guildId: string }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  const { data } = useQuery(
    `market_priority:${guildId}`,
    async () => {
      const res = await marketApi.getPriorityQueue(guildId);
      return res.success && res.data ? res.data.queue : [];
    },
    { persist: true, staleTime: 15000 },
  );
  // Only members who actually have wishes belong in the priority sequence.
  const slides = ((data || []) as PriorityQueueEntry[])
    .filter((m) => (m.wishlist?.length ?? 0) > 0)
    .slice(0, 8);

  useEffect(() => {
    setIndex((prev) => (prev > slides.length - 1 ? 0 : prev));
  }, [slides.length]);

  useEffect(() => {
    if (paused || slides.length <= 1) return;
    const id = setInterval(() => setIndex((prev) => (prev + 1) % slides.length), 4600);
    return () => clearInterval(id);
  }, [paused, slides.length]);

  if (slides.length === 0) return null;

  const go = (n: number) => setIndex(((n % slides.length) + slides.length) % slides.length);

  return (
    <Reveal from="right">
      <section
        className="relative card-obsidian rounded-2xl p-5 overflow-hidden"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        <div className="flex items-center gap-2 mb-3">
          <span className="text-[10px] text-[var(--forge-gold-dim)] uppercase tracking-[0.22em] font-medium">
            Logs priority sequence
          </span>
          <span className="h-px flex-1 bg-gradient-to-r from-[var(--forge-gold)]/20 to-transparent" />
          {slides.length > 1 && (
            <span className="text-[10px] font-mono text-white/35 tabular-nums">
              {index + 1}/{slides.length}
            </span>
          )}
        </div>

        <div className="overflow-hidden">
          <div
            className="flex items-stretch"
            style={{
              transform: `translateX(${-index * 100}%)`,
              transition: "transform 0.55s cubic-bezier(0.22, 1, 0.36, 1)",
            }}
          >
            {slides.map((m) => {
              const total = m.wishlistSummary?.total ?? m.wishlist.length;
              const distributed = m.wishlistSummary?.distributed ?? 0;
              return (
                <div key={m.memberId} className="w-full shrink-0 min-h-[188px]">
                  <div className="flex items-center gap-3">
                    <div className="h-11 w-11 rounded-xl bg-[var(--obsidian-deep)] border border-[var(--metal-border)] flex items-center justify-center font-mono font-bold text-[var(--forge-gold-bright)] shrink-0">
                      #{m.position}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] font-semibold text-white truncate">{m.ign}</p>
                      <p className="text-[11px] text-white/40 truncate">{m.rankName}</p>
                    </div>
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide border shrink-0 ${TIER_TONE[m.tier] || TIER_TONE.MEMBER}`}>
                      {m.tier}
                    </span>
                  </div>

                  <div className="mt-3 pt-3 border-t border-white/[0.06]">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] uppercase tracking-[0.18em] text-white/35">Wishlist</span>
                      <span className="text-[10px] font-mono text-white/45">{distributed}/{total} distributed</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {m.wishlist.slice(0, 6).map((w) => {
                        const done = w.status === "DISTRIBUTED";
                        return (
                          <span
                            key={`${w.category}:${w.key}`}
                            className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] ${
                              done
                                ? "border-emerald-500/25 bg-emerald-500/[0.08] text-emerald-200/90"
                                : "border-white/[0.08] bg-white/[0.02] text-white/60"
                            }`}
                            title={done ? "Distributed" : "Pending"}
                          >
                            <span className={`h-1.5 w-1.5 rounded-full ${done ? "bg-emerald-400" : "bg-amber-400"}`} />
                            <span className="truncate max-w-[110px]">
                              {w.category === "MOUNT" ? w.label || WISHLIST_CATEGORY_LABELS.MOUNT : wishLabel(w.key)}
                            </span>
                          </span>
                        );
                      })}
                      {m.wishlist.length > 6 && (
                        <span className="text-[10px] text-white/35">+{m.wishlist.length - 6}</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {slides.length > 1 && (
          <div className="mt-4 flex items-center justify-between">
            <button
              type="button"
              aria-label="Previous member"
              onClick={() => go(index - 1)}
              className="h-7 w-7 inline-flex items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.03] text-white/55 hover:text-[var(--forge-gold)] hover:border-[var(--forge-gold)]/25 transition-colors cursor-pointer"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6" /></svg>
            </button>
            <div className="flex items-center gap-1.5">
              {slides.map((m, i) => (
                <button
                  key={m.memberId}
                  type="button"
                  aria-label={`Go to member ${i + 1}`}
                  onClick={() => setIndex(i)}
                  className={`h-1.5 rounded-full transition-all duration-300 cursor-pointer ${
                    i === index ? "w-5 bg-[var(--forge-gold)]" : "w-1.5 bg-white/20 hover:bg-white/40"
                  }`}
                />
              ))}
            </div>
            <button
              type="button"
              aria-label="Next member"
              onClick={() => go(index + 1)}
              className="h-7 w-7 inline-flex items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.03] text-white/55 hover:text-[var(--forge-gold)] hover:border-[var(--forge-gold)]/25 transition-colors cursor-pointer"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6" /></svg>
            </button>
          </div>
        )}
      </section>
    </Reveal>
  );
}
