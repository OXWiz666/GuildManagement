"use client";

import { type BossScheduleData } from "@/lib/api";
import Card from "@/components/ui/Card";

export interface KilledBossHistoryProps {
  killedHistory: BossScheduleData[];
}

export default function KilledBossHistory({ killedHistory }: KilledBossHistoryProps) {
  return (
    <Card>
      <h3 className="font-bold text-white text-sm mb-3 border-b border-white/[0.05] pb-2 flex items-center justify-between">
        <span className="flex items-center gap-1.5">💀 Killed Boss History logs</span>
        <span className="text-[10px] text-white/40 font-normal">({killedHistory.length} logs)</span>
      </h3>

      {killedHistory.length === 0 ? (
        <div className="text-center py-8 text-xs text-white/35 italic">
          No boss deaths recorded yet.
        </div>
      ) : (
        <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1">
          {killedHistory.map((log) => (
            <div
              key={log.id}
              className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.05] text-[11px] space-y-2.5 relative transition-all duration-300 hover:scale-[1.01]"
            >
              <div className="flex items-center justify-between gap-2 border-b border-white/[0.05] pb-2">
                <span className="font-bold text-gray-200 truncate">{log.bossName}</span>
                <span className="px-1.5 py-0.5 rounded bg-gray-500/10 border border-white/[0.05] text-[8px] font-bold text-white/50">
                  ARCHIVED
                </span>
              </div>
              
              <div className="text-[10px] text-zinc-500 space-y-1">
                <p className="flex items-center gap-1.5">🕒 <span className="text-zinc-400">Scheduled:</span> <span className="text-zinc-300 font-mono font-semibold">{new Date(log.spawnTime).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span></p>
                <p className="flex items-center gap-1.5">💀 <span className="text-zinc-400">Killed At:</span> <span className="text-emerald-400 font-mono font-bold">{new Date(log.killedAt!).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}</span></p>
                <p className="flex items-center gap-1.5">📍 <span className="text-zinc-400">Location:</span> <span className="text-zinc-300 font-semibold">{log.location}</span></p>
              </div>

              {log.lootDrop && (
                <div className="px-2.5 py-1.5 rounded-lg bg-primary-500/5 border border-primary-500/10 text-[9px] text-primary-300 flex items-center gap-1.5 font-medium animate-fade-in shadow-[0_0_8px_rgba(139,92,246,0.02)]">
                  🎁 Loot: <span className="text-white font-bold">{log.lootDrop}</span>
                </div>
              )}

              {log.screenshotUrl && (
                <div className="flex justify-end pt-0.5">
                  <a
                    href={log.screenshotUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[9px] text-zinc-500 hover:text-zinc-300 transition-colors font-medium border border-white/[0.05] bg-white/[0.01] px-2 py-0.5 rounded"
                  >
                    🖼️ View Proof
                  </a>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
