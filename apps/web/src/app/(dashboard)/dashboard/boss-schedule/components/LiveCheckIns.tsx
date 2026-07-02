"use client";

import { type BossScheduleData } from "@/lib/api";
import { getBossImageUrl } from "@guild/shared";

export interface LiveCheckInsProps {
  openCheckIns: BossScheduleData[];
  userId: string;
  currentTime: number;
  checkingInId: string | null;
  onCheckIn: (item: BossScheduleData) => void;
}

function formatCountdown(expiresAt: string, now: number) {
  const diff = new Date(expiresAt).getTime() - now;
  if (diff <= 0) return { expired: true, text: "CLOSED", warning: false };
  const mins = Math.floor(diff / 60000);
  const secs = Math.floor((diff % 60000) / 1000);
  return {
    expired: false,
    text: `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`,
    warning: diff <= 5 * 60 * 1000,
  };
}

/**
 * Live check-in strip for the Boss Schedule hub. When an officer logs a kill a
 * check-in window opens automatically — members claim attendance here with one
 * tap, right where the kill was recorded. No codes.
 */
export default function LiveCheckIns({
  openCheckIns,
  userId,
  currentTime,
  checkingInId,
  onCheckIn,
}: LiveCheckInsProps) {
  if (openCheckIns.length === 0) return null;

  return (
    <div className="rounded-2xl border border-violet-500/20 bg-violet-950/[0.07] p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-3">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-violet-400" />
        </span>
        <h3 className="text-xs font-bold text-white uppercase tracking-wider">Live Check-Ins</h3>
        <span className="text-[10px] text-white/40">Killed bosses open for attendance — tap to claim</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {openCheckIns.map((item) => {
          const session = item.attendanceSessions?.[0];
          const tick = session ? formatCountdown(session.expiresAt, currentTime) : { expired: true, text: "CLOSED", warning: false };
          const userRecord = session?.records?.find((r) => r.userId === userId);
          const isPresent = userRecord?.status === "CONFIRMED";
          const isPending = userRecord?.status === "PENDING";
          const canCheckIn = !userRecord && !tick.expired;

          return (
            <div
              key={item.id}
              className="flex items-center justify-between gap-3 rounded-xl bg-white/[0.03] border border-white/[0.06] px-3 py-2.5"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <img
                  src={item.bossImageUrl || getBossImageUrl(item.bossName)}
                  alt={item.bossName}
                  className="h-9 w-9 rounded-lg object-cover border border-white/10 shrink-0"
                  loading="lazy"
                />
                <div className="min-w-0">
                  <h4 className="text-xs font-bold text-white truncate">{item.bossName}</h4>
                  <p className="text-[10px] text-white/40 mt-0.5">
                    Closes{" "}
                    <span className={`font-mono font-bold ${tick.expired ? "text-rose-400" : tick.warning ? "text-amber-400" : "text-white/70"}`}>
                      {tick.text}
                    </span>
                  </p>
                </div>
              </div>

              {isPresent ? (
                <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/5 border border-emerald-500/15 px-2.5 py-1.5 rounded-lg shrink-0">
                  ✓ Present
                </span>
              ) : isPending ? (
                <span className="text-[10px] font-bold text-amber-400 bg-amber-500/5 border border-amber-500/15 px-2.5 py-1.5 rounded-lg shrink-0">
                  Pending
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => onCheckIn(item)}
                  disabled={!canCheckIn || checkingInId === item.id}
                  className="px-3 py-1.5 bg-violet-600 hover:bg-violet-700 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed text-[11px] font-bold text-white rounded-lg transition-all cursor-pointer shrink-0"
                >
                  {checkingInId === item.id ? "…" : "Check In"}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
