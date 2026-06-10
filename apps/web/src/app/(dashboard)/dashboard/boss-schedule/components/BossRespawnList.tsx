"use client";

import { useState, useEffect } from "react";
import { type BossScheduleData, type BossData } from "@/lib/api";
import Card from "@/components/ui/Card";
import { getNextBossSpawnTime, getBossImageUrl } from "@guild/shared";

export interface BossRespawnListProps {
  killedHistory: BossScheduleData[];
  bosses: BossData[];
}

export default function BossRespawnList({ killedHistory, bosses }: BossRespawnListProps) {
  const [now, setNow] = useState(Date.now());

  // Tick clock every second
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Filter killedHistory to only keep the latest entry for each unique boss name (case-insensitive)
  const uniqueHistoryMap = new Map<string, BossScheduleData>();
  for (const item of killedHistory) {
    const key = item.bossName.toLowerCase();
    const existing = uniqueHistoryMap.get(key);
    
    const itemTime = item.killedAt ? new Date(item.killedAt).getTime() : new Date(item.spawnTime).getTime();
    
    if (!existing) {
      uniqueHistoryMap.set(key, item);
    } else {
      const existingTime = existing.killedAt ? new Date(existing.killedAt).getTime() : new Date(existing.spawnTime).getTime();
      if (itemTime > existingTime) {
        uniqueHistoryMap.set(key, item);
      }
    }
  }

  const uniqueHistory = Array.from(uniqueHistoryMap.values());

  // Compute active respawns (where status is KILLED)
  const activeRespawns = uniqueHistory.map((item) => {
    const killedDate = item.killedAt ? new Date(item.killedAt) : new Date(item.spawnTime);
    const expectedRespawn = getNextBossSpawnTime(item.bossName, killedDate);
    const timeRemaining = expectedRespawn.getTime() - now;
    
    // Find boss level and cooldown in registry
    const registryBoss = bosses.find((b) => b.name.toLowerCase() === item.bossName.toLowerCase());
    const level = registryBoss?.level || 100;
    const cooldownText = registryBoss?.cooldownHours ? `${registryBoss.cooldownHours}h respawn` : "Fixed Schedule";

    // Formatted countdown
    let countdownText = "RESPAWNED / READY";
    let isExpired = false;
    let isWarning = false;

    if (timeRemaining > 0) {
      const hrs = Math.floor(timeRemaining / (3600 * 1000));
      const mins = Math.floor((timeRemaining % (3600 * 1000)) / (60 * 1000));
      const secs = Math.floor((timeRemaining % (60 * 1000)) / 1000);
      countdownText = `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
      isWarning = timeRemaining <= 15 * 60 * 1000; // 15 mins or less
    } else {
      isExpired = true;
    }

    return {
      ...item,
      level,
      cooldownText,
      killedDate,
      expectedRespawn,
      countdownText,
      isExpired,
      isWarning,
    };
  }).sort((a, b) => a.expectedRespawn.getTime() - b.expectedRespawn.getTime());

  return (
    <Card className="relative overflow-hidden border border-white/[0.06] bg-[#0c0d12]/60 backdrop-blur-md shadow-2xl p-6 rounded-3xl">
      {/* Decorative background glow */}
      <div className="absolute top-0 right-0 h-40 w-40 rounded-full bg-violet-500/10 blur-[80px] pointer-events-none" />
      <div className="absolute bottom-0 left-0 h-40 w-40 rounded-full bg-cyan-500/5 blur-[80px] pointer-events-none" />

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-white/[0.08] pb-4 mb-5 gap-3">
        <div>
          <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <span>⏱️</span> Boss Respawn Tracker
          </h3>
          <p className="text-[11px] text-white/45 mt-1 leading-relaxed max-w-xl">
            Live expectations for defeated bosses.
          </p>
        </div>
        <div className="flex items-center gap-2.5 self-start md:self-center">
          <span className="px-2 py-0.75 rounded-full bg-white/[0.04] border border-white/[0.08] text-[10px] text-white/60 font-semibold font-mono">
            {activeRespawns.length} Defeated Bosses
          </span>
        </div>
      </div>

      {/* Content */}
      {activeRespawns.length === 0 ? (
        <div className="text-center py-16 text-zinc-600 text-xs italic">
          No bosses have been recorded as killed. Defeat bosses and record their death to track active cooldowns here.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {activeRespawns.map((log) => {
            const bossImage = log.bossImageUrl || getBossImageUrl(log.bossName);

            return (
              <div
                key={log.id}
                className={`group relative p-4 rounded-2xl bg-white/[0.02] border transition-all duration-300 flex flex-col justify-between gap-3 ${
                  log.isExpired
                    ? "border-emerald-500/30 bg-emerald-500/[0.015] shadow-[0_0_15px_rgba(16,185,129,0.03)]"
                    : log.isWarning
                      ? "border-amber-500/30 bg-amber-500/[0.015] animate-pulse"
                      : "border-white/[0.06] hover:border-white/[0.12] hover:bg-white/[0.04]"
                }`}
              >
                {/* Upper Section */}
                <div className="space-y-3">
                  <div className="flex gap-3 items-start">
                    {/* Boss Picture */}
                    <img
                      src={bossImage}
                      alt={log.bossName}
                      className="h-12 w-12 rounded-xl object-cover border border-white/10 group-hover:scale-105 transition-transform duration-300 shadow shrink-0"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="font-extrabold text-white text-xs truncate leading-snug group-hover:text-primary-300 transition-colors">
                          {log.bossName}
                        </h4>
                        <span className="px-1 py-0.25 rounded bg-white/[0.04] text-[8px] font-bold text-white/55 border border-white/[0.06] shrink-0 font-mono">
                          Lv {log.level}
                        </span>
                      </div>
                      <p className="text-[10px] text-white/40 truncate mt-1">
                        📍 {log.location}
                      </p>
                    </div>
                  </div>

                  {/* Killed/Spawn Details */}
                  <div className="bg-[#0b0c10]/40 rounded-xl p-2.5 border border-white/[0.04] text-[10px] space-y-1.5 font-mono text-white/50">
                    <div className="flex justify-between items-center">
                      <span>Killed:</span>
                      <span className="text-white/70 font-semibold">
                        {log.killedDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span>Cooldown:</span>
                      <span className="text-primary-400 font-semibold">{log.cooldownText}</span>
                    </div>
                    <div className="flex justify-between items-center border-t border-white/[0.04] pt-1.5 mt-1.5">
                      <span>Expected:</span>
                      <span className="text-white/85 font-semibold">
                        {log.expectedRespawn.toLocaleDateString("en-US", { month: "short", day: "numeric" })}{" "}
                        {log.expectedRespawn.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Lower Action/Countdown Section */}
                <div className="mt-1">
                  <div
                    className={`py-2 rounded-xl text-center border font-mono font-bold text-[11px] shadow-inner transition-all flex items-center justify-center gap-1.5 ${
                      log.isExpired
                        ? "bg-emerald-500/5 border-emerald-500/20 text-emerald-400"
                        : log.isWarning
                          ? "bg-amber-500/5 border-amber-500/20 text-amber-400"
                          : "bg-white/[0.02] border-white/5 text-cyan-400"
                    }`}
                  >
                    {log.isExpired ? (
                      <>
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        <span>EXPECTED RESPAWN</span>
                      </>
                    ) : (
                      <>
                        <span className={`h-1.5 w-1.5 rounded-full ${log.isWarning ? "bg-amber-400 animate-ping" : "bg-cyan-400"}`} />
                        <span>{log.countdownText}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
