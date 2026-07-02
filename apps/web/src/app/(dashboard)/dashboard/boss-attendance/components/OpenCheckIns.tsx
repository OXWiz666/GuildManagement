"use client";

import { type BossScheduleData } from "@/lib/api";
import { getBossImageUrl } from "@guild/shared";

export interface OpenCheckInsProps {
  openCheckIns: BossScheduleData[];
  getUserRecordStatus: (item: BossScheduleData) => {
    status: string;
    label: string;
    color: string;
    dotColor: string;
  };
  getCountdownText: (expiresAt: string) => { expired: boolean; text: string; warning?: boolean };
  checkingInId: string | null;
  onCheckIn: (item: BossScheduleData) => void;
  isOfficer?: boolean;
  onEditBoss?: (item: BossScheduleData) => void;
}

/**
 * Member-facing list of bosses whose check-in window is currently open. Replaces
 * the old code-entry flow: members claim presence with a single click — no code
 * to type. A window opens automatically the moment an officer logs a boss kill.
 */
export default function OpenCheckIns({
  openCheckIns,
  getUserRecordStatus,
  getCountdownText,
  checkingInId,
  onCheckIn,
  isOfficer = false,
  onEditBoss,
}: OpenCheckInsProps) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.01] p-5 shadow-sm">
      <div className="flex items-center justify-between border-b border-white/[0.06] pb-3.5 mb-4">
        <div>
          <h3 className="text-xs font-bold text-white uppercase tracking-wider">Open Check-Ins</h3>
          <p className="text-xs text-white/40 mt-0.5">
            Bosses killed recently — tap to claim your attendance before the window closes.
          </p>
        </div>
        <span className="text-[10px] font-mono font-bold bg-white/[0.04] border border-white/[0.06] px-2 py-0.5 rounded text-white/55">
          {openCheckIns.length} Open
        </span>
      </div>

      {openCheckIns.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center py-12 gap-2">
          <span className="text-2xl opacity-30">⌛</span>
          <p className="text-xs text-zinc-650 italic max-w-xs">
            No check-ins open right now. When an officer logs a boss kill in Boss Schedule, a check-in
            opens here automatically.
          </p>
        </div>
      ) : (
        <div className="space-y-3 max-h-[480px] overflow-y-auto pr-1 custom-scrollbar">
          {openCheckIns.map((item) => {
            const userStatus = getUserRecordStatus(item);
            const session = item.attendanceSessions?.[0];
            const tick = session ? getCountdownText(session.expiresAt) : { expired: true, text: "CLOSED", warning: false };
            const canCheckIn = userStatus.status === "ACTIVE_CHECKIN" && !tick.expired;
            const isPresent = userStatus.status === "PRESENT";
            const isPending = userStatus.status === "PENDING";

            return (
              <div
                key={item.id}
                className={`p-4 rounded-xl bg-white/[0.03] border flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all duration-300 ${
                  isPresent
                    ? "border-emerald-500/25 bg-emerald-950/10"
                    : isPending
                      ? "border-amber-500/25 bg-amber-950/10"
                      : "border-violet-500/30 bg-violet-950/10 shadow-[0_0_14px_rgba(139,92,246,0.07)]"
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <img
                    src={item.bossImageUrl || getBossImageUrl(item.bossName)}
                    alt={item.bossName}
                    className="h-10 w-10 rounded-lg object-cover border border-white/10 shrink-0 shadow-sm"
                    loading="lazy"
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-white text-sm truncate leading-snug">{item.bossName}</h4>
                      <span className={`text-[9px] font-bold px-2 py-0.5 rounded border ${userStatus.color}`}>
                        {userStatus.label}
                      </span>
                    </div>
                    <p className="text-[11px] text-white/45 truncate mt-1">📍 {item.location}</p>
                    <div className="flex items-center gap-1.5 mt-2 text-[10px]">
                      <span className="text-white/40">Closes in</span>
                      <span
                        className={`font-mono font-bold tracking-tight ${
                          tick.expired ? "text-rose-400" : tick.warning ? "text-amber-400" : "text-white/80"
                        }`}
                      >
                        {tick.expired ? "CLOSED" : tick.text}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="shrink-0 flex items-center justify-end gap-2">
                  {isOfficer && onEditBoss && (
                    <button
                      type="button"
                      onClick={() => onEditBoss(item)}
                      className="px-3 py-2 text-xs font-bold text-white/55 hover:text-[var(--forge-gold-bright)] bg-white/[0.02] border border-white/[0.08] hover:border-[var(--forge-gold)]/30 rounded-lg transition-all cursor-pointer"
                    >
                      Edit
                    </button>
                  )}
                  {isPresent ? (
                    <span className="px-3.5 py-2 text-xs font-bold text-emerald-400 bg-emerald-500/5 border border-emerald-500/15 rounded-lg inline-flex items-center gap-1.5">
                      ✓ Present
                    </span>
                  ) : isPending ? (
                    <span className="px-3.5 py-2 text-xs font-bold text-amber-400 bg-amber-500/5 border border-amber-500/15 rounded-lg">
                      Awaiting verify
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onCheckIn(item)}
                      disabled={!canCheckIn || checkingInId === item.id}
                      className="px-4 py-2 bg-violet-600 hover:bg-violet-700 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed text-xs font-bold text-white rounded-lg transition-all cursor-pointer shadow-lg shadow-violet-500/15"
                    >
                      {checkingInId === item.id ? "Checking in…" : "Check In"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
