"use client";

import { type BossScheduleData } from "@/lib/api";
import { getBossImageUrl } from "@guild/shared";

export interface RecentKillsProps {
  killedHistory: BossScheduleData[];
}

export default function RecentKills({ killedHistory }: RecentKillsProps) {
  const recent = killedHistory.slice(0, 6);

  return (
    <div className="rounded-2xl border border-[var(--metal-border)] bg-[var(--obsidian-elevated)]/40 p-5">
      <div className="flex items-center justify-between border-b border-white/[0.06] pb-3 mb-3">
        <h3 className="text-xs font-bold text-white uppercase tracking-[0.12em] flex items-center gap-2">
          <span className="text-rose-400">⚔</span> Recent Kills
        </h3>
        <span className="text-[10px] text-[var(--forge-gold)] font-semibold cursor-default">
          {killedHistory.length} total
        </span>
      </div>

      {recent.length === 0 ? (
        <div className="text-center py-8 text-xs text-white/35 italic">No boss kills recorded yet.</div>
      ) : (
        <ol className="space-y-1">
          {recent.map((kill, i) => (
            <li
              key={kill.id}
              className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-white/[0.025] transition-colors"
            >
              <span className="text-[11px] font-mono font-bold text-white/30 w-4 text-right shrink-0">{i + 1}.</span>
              <img
                src={kill.bossImageUrl || getBossImageUrl(kill.bossName)}
                alt={kill.bossName}
                className="h-7 w-7 rounded-md object-cover border border-white/10 shrink-0"
                loading="lazy"
              />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-white/90 truncate">{kill.bossName}</p>
                <p className="text-[10px] text-white/40 truncate">
                  Killed by{" "}
                  <span className="text-[var(--forge-gold)] font-medium">
                    {kill.guildTurnGuildName || kill.guildTurn || "Unknown"}
                  </span>
                </p>
              </div>
              <span className="text-[10px] font-mono text-white/45 shrink-0 text-right">
                {new Date(kill.killedAt || kill.spawnTime).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                <br />
                <span className="text-white/30">
                  {new Date(kill.killedAt || kill.spawnTime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                </span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
