"use client";

import { type BossScheduleData } from "@/lib/api";
import Card from "@/components/ui/Card";

export interface ActiveSpawnsQueueProps {
  upcomingSpawns: BossScheduleData[];
  getCountdownText: (spawnTime: string) => { expired: boolean; text: string; danger?: boolean; warning?: boolean };
}

export default function ActiveSpawnsQueue({
  upcomingSpawns,
  getCountdownText,
}: ActiveSpawnsQueueProps) {
  return (
    <Card>
      <h3 className="font-bold text-white text-sm mb-3 border-b border-white/[0.05] pb-2 flex items-center justify-between">
        <span className="flex items-center gap-1.5">⚔️ Active Spawns Queue</span>
        <span className="text-[10px] text-white/40 font-normal">({upcomingSpawns.length} active)</span>
      </h3>

      {upcomingSpawns.length === 0 ? (
        <div className="text-center py-8 text-xs text-white/35 italic">
          No upcoming spawns scheduled.
        </div>
      ) : (
        <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1">
          {upcomingSpawns.map((item) => {
            const tick = getCountdownText(item.spawnTime);
            const isSpawned = item.status === "SPAWNED";

            return (
              <div
                key={item.id}
                className={`p-3 rounded-xl border text-[11px] space-y-2 relative transition-all duration-300 hover:scale-[1.02] hover:-translate-y-0.5 hover:shadow-[0_4px_12px_rgba(139,92,246,0.04)] ${
                  isSpawned || tick.expired
                    ? "bg-red-950/10 border-red-500/20"
                    : tick.warning
                      ? "bg-amber-950/10 border-amber-500/20"
                      : "bg-white/[0.015] border-white/[0.05]"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-white">{item.bossName}</span>
                  <span
                    className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-[#0a0a0e]/95 border border-zinc-800 ${
                      tick.expired || isSpawned
                        ? "text-red-400 animate-pulse border-red-500/20"
                        : tick.warning
                          ? "text-amber-400 border-amber-500/20"
                          : "text-white/85 border-white/[0.10]"
                    }`}
                  >
                    {tick.text}
                  </span>
                </div>
                <div className="text-[9px] text-white/40 space-y-1 pt-1 border-t border-white/[0.05] flex flex-col gap-0.5">
                  <p className="flex items-center gap-1">📍 <span className="truncate max-w-[120px]">{item.location}</span></p>
                  <p className="flex items-center gap-1">🕒 <span>{new Date(item.spawnTime).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span></p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
