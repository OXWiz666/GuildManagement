"use client";

import { useEffect, useRef, useState } from "react";
import { type AttendanceSessionSummary } from "@/lib/api";
import { Skeleton } from "@/components/ui/Skeleton";
import { getBossImageUrl } from "@guild/shared";

export interface AttendanceCoverflowProps {
  sessions: AttendanceSessionSummary[];
  isLoading: boolean;
  onSelect: (session: AttendanceSessionSummary) => void;
}

function sessionStatus(session: AttendanceSessionSummary, now: number) {
  const expired = new Date(session.expiresAt).getTime() <= now;
  if (session.isActive && !expired) {
    return { label: "Open", color: "text-violet-300 bg-violet-500/10 border-violet-500/25", pulse: true };
  }
  if (session.confirmedCount > 0) {
    return { label: "Completed", color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/25", pulse: false };
  }
  return { label: "Closed", color: "text-white/50 bg-white/[0.04] border-white/[0.1]", pulse: false };
}

/**
 * Netflix-row / coverflow-style browse of every boss attendance window, open
 * or closed — cards peek past the edge of the container and scroll/snap
 * horizontally. Tapping a card opens AttendanceSessionModal for the full
 * picture (your status, and for officers: roster + verification + reopen).
 */
export default function AttendanceCoverflow({ sessions, isLoading, onSelect }: AttendanceCoverflowProps) {
  const trackRef = useRef<HTMLDivElement>(null);

  // Ticks on its own — this used to come from the page's shared per-second
  // ticker, which meant the entire attendance page (stats cards, header,
  // etc.) re-rendered every second just so this row's session badges could
  // flip from "Open" to "Closed" the moment a window expires.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  function scrollBy(delta: number) {
    trackRef.current?.scrollBy({ left: delta, behavior: "smooth" });
  }

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.01] p-5">
      <div className="flex items-center justify-between border-b border-white/[0.06] pb-3.5 mb-4">
        <div>
          <h3 className="text-xs font-bold text-white uppercase tracking-wider">Boss Attendance</h3>
          <p className="text-xs text-white/40 mt-0.5">
            Every check-in window, live or closed — tap a boss to claim, verify, or review.
          </p>
        </div>
        <span className="text-[10px] font-mono font-bold bg-white/[0.04] border border-white/[0.06] px-2 py-0.5 rounded text-white/55 shrink-0">
          {sessions.length}
        </span>
      </div>

      {isLoading ? (
        <div className="flex gap-3">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-[188px] w-[160px] rounded-2xl shrink-0" />)}
        </div>
      ) : sessions.length === 0 ? (
        <div className="text-center py-12 text-xs text-zinc-650 italic">
          No attendance windows have been opened for this guild yet.
        </div>
      ) : (
        <div className="relative">
          <button
            type="button"
            onClick={() => scrollBy(-340)}
            aria-label="Scroll left"
            className="hidden sm:flex absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 z-20 h-9 w-9 rounded-full border border-white/[0.1] bg-black/60 backdrop-blur text-white/60 hover:text-white hover:border-white/25 items-center justify-center cursor-pointer transition-colors"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M15 18l-6-6 6-6" /></svg>
          </button>

          <div
            ref={trackRef}
            className="flex gap-3 overflow-x-auto pb-2 pt-1 px-1 snap-x snap-mandatory scroll-smooth custom-scrollbar"
          >
            {sessions.map((session) => {
              const boss = session.bossSchedule;
              const bossName = boss?.bossName || session.title;
              const imageSrc = boss?.bossImageUrl || getBossImageUrl(bossName);
              const dateSrc = boss?.spawnTime || session.createdAt;
              const status = sessionStatus(session, now);

              return (
                <button
                  type="button"
                  key={session.id}
                  onClick={() => onSelect(session)}
                  className="group relative shrink-0 w-[160px] snap-center rounded-2xl border border-white/[0.08] bg-[#0c0d12] overflow-hidden text-left cursor-pointer shadow-lg shadow-black/40 transition-all duration-300 hover:-translate-y-1 hover:scale-[1.04] hover:z-10 hover:border-[var(--forge-gold)]/40 hover:shadow-2xl hover:shadow-black/60 focus-ring"
                >
                  <div className="relative h-[100px] w-full bg-zinc-950 border-b border-white/[0.06]">
                    <img src={imageSrc} alt={bossName} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110" loading="lazy" />
                    <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-black/80 to-transparent" />
                    <p className="absolute bottom-1.5 left-2 right-2 text-[12px] font-bold text-white truncate">{bossName}</p>
                    {status.pulse && (
                      <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-violet-400 shadow-[0_0_8px_rgba(167,139,250,0.9)] animate-pulse" />
                    )}
                  </div>

                  <div className="p-2.5 space-y-1.5">
                    <p className="text-[10px] text-white/60 font-semibold">
                      {new Date(dateSrc).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </p>
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md border text-[9px] font-bold uppercase tracking-wider ${status.color}`}>
                      {status.label}
                    </span>
                    <div className="flex items-center gap-2 text-[10px] font-mono pt-0.5">
                      <span className="text-emerald-400">{session.confirmedCount}✓</span>
                      {session.pendingCount > 0 && <span className="text-amber-400">{session.pendingCount}⏳</span>}
                    </div>
                    {boss?.location && <p className="text-[9px] text-white/35 truncate">📍 {boss.location}</p>}
                  </div>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => scrollBy(340)}
            aria-label="Scroll right"
            className="hidden sm:flex absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 z-20 h-9 w-9 rounded-full border border-white/[0.1] bg-black/60 backdrop-blur text-white/60 hover:text-white hover:border-white/25 items-center justify-center cursor-pointer transition-colors"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M9 18l6-6-6-6" /></svg>
          </button>
        </div>
      )}
    </div>
  );
}
