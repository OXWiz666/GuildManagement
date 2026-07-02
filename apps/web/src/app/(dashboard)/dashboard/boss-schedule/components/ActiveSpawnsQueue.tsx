"use client";

import { type BossScheduleData } from "@/lib/api";
import { getBossImageUrl } from "@guild/shared";

export interface ActiveSpawnsQueueProps {
  upcomingSpawns: BossScheduleData[];
  currentTime: number;
  getCountdownText: (
    spawnTime: string,
    ctx?: { bossName?: string; status?: string },
  ) => { expired: boolean; live?: boolean; text: string; liveText?: string; nextSpawn?: number; danger?: boolean; warning?: boolean };
}

// A believable "predicted" fill: how far the boss is through a ~24h window
// toward its next (projected) spawn. Live bosses read 100%.
function predictedProgress(targetMs: number, now: number) {
  const remaining = targetMs - now;
  if (remaining <= 0) return 100;
  const WINDOW = 24 * 60 * 60 * 1000;
  const pct = Math.round((1 - Math.min(remaining, WINDOW) / WINDOW) * 100);
  return Math.max(4, Math.min(99, pct));
}

export default function ActiveSpawnsQueue({ upcomingSpawns, currentTime, getCountdownText }: ActiveSpawnsQueueProps) {
  const queue = upcomingSpawns.slice(0, 6);

  return (
    <div className="rounded-2xl border border-[var(--metal-border)] bg-[var(--obsidian-elevated)]/40 p-5">
      <div className="flex items-center justify-between border-b border-white/[0.06] pb-3 mb-3">
        <h3 className="text-xs font-bold text-white uppercase tracking-[0.12em] flex items-center gap-2">
          <span className="text-[var(--forge-gold)]">⚔</span> Active Spawns Queue
        </h3>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 font-semibold">
          {upcomingSpawns.length} Active
        </span>
      </div>

      {queue.length === 0 ? (
        <div className="text-center py-8 text-xs text-white/35 italic">No upcoming spawns scheduled.</div>
      ) : (
        <div className="space-y-2.5">
          {queue.map((item) => {
            const tick = getCountdownText(item.spawnTime, { bossName: item.bossName, status: item.status });
            const isLive = tick.live ?? tick.expired;
            const pct = isLive ? 100 : predictedProgress(tick.nextSpawn ?? new Date(item.spawnTime).getTime(), currentTime);

            return (
              <div
                key={item.id}
                className={`rounded-xl border p-3 transition-all ${
                  isLive
                    ? "border-rose-500/25 bg-rose-500/[0.05]"
                    : tick.warning
                      ? "border-[var(--forge-gold)]/25 bg-[var(--forge-glow)]/40"
                      : "border-white/[0.06] bg-white/[0.015] hover:border-white/12"
                }`}
              >
                <div className="flex items-center gap-3">
                  <img
                    src={item.bossImageUrl || getBossImageUrl(item.bossName)}
                    alt={item.bossName}
                    className="h-9 w-9 rounded-lg object-cover border border-white/10 shrink-0"
                    loading="lazy"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-bold text-white truncate">{item.bossName}</p>
                      {isLive ? (
                        <span className="inline-flex items-center gap-1.5 text-[10px] font-mono font-bold text-rose-400">
                          <span className="h-1.5 w-1.5 rounded-full bg-rose-400 animate-ping shrink-0" />
                          <span className="uppercase tracking-wider text-[9px]">Live</span>
                          <span className="tabular-nums">{tick.liveText}</span>
                        </span>
                      ) : (
                        <span className={`text-[10px] font-mono font-bold tabular-nums ${tick.warning ? "text-[var(--forge-gold-bright)]" : "text-white/70"}`}>
                          {tick.text}
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-white/40 truncate mt-0.5">📍 {item.location}</p>
                  </div>
                </div>

                <div className="mt-2.5 flex items-center gap-2">
                  <div className="h-1.5 flex-1 rounded-full bg-white/[0.05] overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        isLive
                          ? "bg-gradient-to-r from-rose-500/70 to-rose-400"
                          : "bg-gradient-to-r from-[var(--forge-gold-dim)] to-[var(--forge-gold-bright)]"
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-[9px] font-mono text-white/40 shrink-0 w-16 text-right">{pct}% predicted</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
