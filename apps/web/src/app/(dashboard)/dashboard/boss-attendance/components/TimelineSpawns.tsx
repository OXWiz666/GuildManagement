"use client";

import { type BossScheduleData } from "@/lib/api";

export interface TimelineSpawnsProps {
  selectedDate: Date | null;
  dayEvents: BossScheduleData[];
  getUserRecordStatus: (item: BossScheduleData) => {
    status: string;
    label: string;
    color: string;
    dotColor: string;
  };
  getCountdownText: (spawnTime: string) => {
    expired: boolean;
    text: string;
    danger?: boolean;
    warning?: boolean;
  };
  isOfficer: boolean;
  onCheckInClick: (item: BossScheduleData) => void;
  onCreateSessionClick: (item: BossScheduleData) => void;
}

export default function TimelineSpawns({
  selectedDate,
  dayEvents,
  getUserRecordStatus,
  getCountdownText,
  isOfficer,
  onCheckInClick,
  onCreateSessionClick,
}: TimelineSpawnsProps) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.01] p-5 shadow-sm">
      <div className="flex items-center justify-between border-b border-white/[0.06] pb-3.5 mb-4">
        <div>
          <h3 className="text-xs font-bold text-white uppercase tracking-wider">
            Timeline Spawns
          </h3>
          <p className="text-xs text-white/40 mt-0.5">
            {selectedDate ? selectedDate.toLocaleDateString("en-US", { weekday: "short", month: "long", day: "numeric" }) : "Highlight a day above"}
          </p>
        </div>
        {selectedDate && (
          <span className="text-[10px] font-mono font-bold bg-white/[0.04] border border-white/[0.06] px-2 py-0.5 rounded text-white/55">
            {dayEvents.length} Target{dayEvents.length === 1 ? "" : "s"} Scheduled
          </span>
        )}
      </div>

      {!selectedDate ? (
        <div className="text-center py-12 text-xs text-zinc-650 italic">
          Highlight a calendar date above to list timeline targets.
        </div>
      ) : dayEvents.length === 0 ? (
        <div className="text-center py-12 text-xs text-zinc-650 italic">
          No boss spawns scheduled for this selected day.
        </div>
      ) : (
        <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1 custom-scrollbar">
          {dayEvents.map((item) => {
            const userStatus = getUserRecordStatus(item);
            const tick = getCountdownText(item.spawnTime);
            const isKilled = item.status === "KILLED";
            const isSpawned = item.status === "SPAWNED";

            return (
              <div
                key={item.id}
                className={`p-4 rounded-xl bg-white/[0.03] border flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all duration-300 ease-out hover:scale-[1.02] hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(139,92,246,0.06)] ${
                  isKilled
                    ? "border-white/[0.01] opacity-40 hover:opacity-75"
                    : userStatus.status === "ACTIVE_CHECKIN"
                      ? "border-violet-500/35 bg-violet-950/10 shadow-[0_0_12px_rgba(139,92,246,0.08)] animate-pulse"
                      : tick.warning
                        ? "border-amber-500/30 bg-amber-950/10 shadow-[0_0_10px_rgba(245,158,11,0.06)]"
                        : "border-white/[0.06] hover:border-white/[0.15]"
                }`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2.5">
                    {/* Live status halo next to boss name */}
                    <span className="relative flex h-2 w-2 shrink-0">
                      {userStatus.status === "ACTIVE_CHECKIN" && (
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75"></span>
                      )}
                      <span className={`relative inline-flex rounded-full h-2 w-2 ${
                        isKilled
                          ? "bg-zinc-600"
                          : userStatus.status === "ACTIVE_CHECKIN"
                            ? "bg-violet-400 animate-pulse"
                            : tick.warning
                              ? "bg-amber-400 animate-pulse"
                              : "bg-cyan-400"
                      }`}></span>
                    </span>

                    <h4 className="font-bold text-white text-sm truncate leading-snug">
                      {item.bossName}
                    </h4>
                    <span className="text-[9px] font-bold text-white/40 tracking-wider uppercase bg-white/[0.04] px-1.5 py-0.5 rounded border border-white/[0.06]">
                      LV {(item as any).level || "100"}
                    </span>
                  </div>
                  <p className="text-[11px] text-white/45 truncate mt-1">
                    📍 {item.location}
                  </p>
                  <div className="flex items-center gap-1.5 mt-2.5 text-[10px] font-mono">
                    <span className="text-white/55 bg-zinc-950 border border-white/[0.06] px-2 py-0.5 rounded">
                      {new Date(item.spawnTime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}
                    </span>
                    {item.guildTurn && (
                      <span className="text-amber-500 font-bold bg-amber-500/5 border border-amber-500/10 px-2 py-0.5 rounded">
                        🛡️ {item.guildTurn}
                      </span>
                    )}
                  </div>
                </div>

                {/* Right Side: spawn state timer and actions */}
                <div className="flex items-center gap-4 shrink-0 justify-between sm:justify-end border-t border-white/[0.012] sm:border-t-0 pt-3 sm:pt-0">
                  <div className="text-left sm:text-right shrink-0">
                    {isKilled ? (
                      <span className="text-[9px] font-bold text-zinc-650 bg-white/[0.04] border border-white/[0.06] px-2 py-0.5 rounded uppercase">
                        Killed
                      </span>
                    ) : (
                      <span
                        className={`text-xs font-mono font-bold tracking-tight ${
                          tick.expired || isSpawned
                            ? "text-rose-400 animate-pulse"
                            : tick.warning
                              ? "text-amber-400"
                              : "text-white"
                        }`}
                      >
                        {tick.expired ? "SPAWNED LIVE" : tick.text}
                      </span>
                    )}

                    {/* Minimalist attendance state badge */}
                    <div className={`text-[9px] font-bold px-2 py-0.5 rounded border mt-2 block sm:w-max ml-auto ${userStatus.color}`}>
                      {userStatus.label}
                    </div>
                  </div>

                  {/* Interactive triggers */}
                  <div className="shrink-0">
                    {userStatus.status === "ACTIVE_CHECKIN" && (
                      <button
                        type="button"
                        onClick={() => onCheckInClick(item)}
                        className="px-3.5 py-2 bg-violet-600 hover:bg-violet-700 active:scale-95 text-xs font-bold text-white rounded-lg transition-all cursor-pointer shadow-lg shadow-violet-500/15"
                      >
                        Check In
                      </button>
                    )}

                    {isOfficer && (!item.attendanceSessions || item.attendanceSessions.length === 0) && (
                      <button
                        type="button"
                        onClick={() => onCreateSessionClick(item)}
                        className="px-3 py-1.5 border border-white/[0.06] bg-white/[0.03] hover:bg-white/[0.06] hover:text-white text-xs font-bold text-white/55 rounded-lg transition-all cursor-pointer"
                      >
                        Open Portal
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
