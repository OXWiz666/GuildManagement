import { memo, useEffect, useState } from "react";
import type { BossScheduleData, BossCommitmentData } from "@/lib/api";
import { getBossImageUrl, getRealtimeBossTimer } from "@guild/shared";
import { getGuildColor } from "../utils/helpers";
import { dayKeyLabel } from "../utils/viewEntry";
import BossCommitButton from "./BossCommitButton";
import BossAvatar from "./BossAvatar";

const UpcomingCard = memo(function UpcomingCard({
  schedule,
  guildId,
  index = 0,
  commitmentsBatch,
}: {
  schedule: BossScheduleData;
  guildId: string;
  index?: number;
  commitmentsBatch?: Record<string, BossCommitmentData> | null;
}) {
  // Ticks on its own for the same reason RotationCard does — see there.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tickId = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tickId);
  }, []);

  // Real-time countdown that projects forward along the boss's actual respawn
  // cycle, so a passed spawn shows a live future countdown instead of "LIVE".
  const timer = getRealtimeBossTimer(schedule.bossName, schedule.spawnTime, now, { status: schedule.status });
  const tick = { text: timer.text, warning: timer.warning, expired: timer.live };
  const color = getGuildColor(schedule.guildTurnGuildName || schedule.guildTurn || "");
  const spawnLabel = new Date(timer.nextSpawn).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  const isLive = timer.live;
  const dayLabel = dayKeyLabel(schedule.spawnTime).label;
  const isToday = dayLabel === "Today";

  return (
    <article
      className={`group relative rounded-2xl border bg-[var(--obsidian-elevated)]/40 flex flex-col transition-colors duration-300 animate-[fadeInUp_0.5s_ease-out_forwards] ${
        isLive
          ? "border-emerald-500/25 hover:border-emerald-500/45"
          : tick.warning
            ? "border-[var(--forge-gold)]/20 hover:border-[var(--forge-gold)]/40"
            : "border-[var(--metal-border)] hover:border-white/15"
      }`}
      style={{ animationDelay: `${index * 40}ms` }}
    >
      <div className="p-4 flex flex-col gap-3 flex-1">
        <div className="flex items-start gap-3">
          <div className="relative h-11 w-11 shrink-0 rounded-xl overflow-hidden ring-1 ring-white/10">
            <BossAvatar src={schedule.bossImageUrl || getBossImageUrl(schedule.bossName)} name={schedule.bossName} />
          </div>
          <div className="min-w-0 flex-1 pt-0.5">
            <div className="flex items-center gap-1.5">
              <h3 className="text-sm font-bold text-white truncate">{schedule.bossName}</h3>
              {isToday && (
                <span className="shrink-0 px-1.5 py-0.5 rounded-full text-[8px] font-extrabold uppercase tracking-wider bg-[var(--forge-gold)]/15 text-[var(--forge-gold-bright)] border border-[var(--forge-gold)]/30">
                  Today
                </span>
              )}
            </div>
            <div className="flex items-center gap-1 text-white/40 mt-1">
              <svg className="h-3 w-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2a8 8 0 00-8 8c0 5.25 8 12 8 12s8-6.75 8-12a8 8 0 00-8-8z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              <span className="text-[11px] truncate">{schedule.location}</span>
            </div>
          </div>
          <span
            className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${
              isLive ? "bg-emerald-400 animate-pulse" : tick.warning ? "bg-[var(--forge-gold)]" : "bg-white/15"
            }`}
            aria-hidden="true"
          />
        </div>

        {/* Timer — one flat block, matching Guild Rotation's card */}
        <div
          className={`rounded-xl px-3 py-2.5 ${
            isLive ? "bg-emerald-500/[0.07]" : tick.warning ? "bg-[var(--forge-gold)]/[0.07]" : "bg-white/[0.025]"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[9px] uppercase tracking-[0.16em] font-bold text-white/30">
              {isLive ? "Live now" : tick.warning ? "Spawning soon" : "Upcoming"}
            </span>
            <span className="text-[9px] text-white/30 font-mono">{spawnLabel}</span>
          </div>
          <p
            className={`mt-1 font-mono text-lg font-bold leading-none tracking-wide ${
              isLive ? "text-emerald-400" : tick.warning ? "text-[var(--forge-gold-bright)]" : "text-white/85"
            }`}
          >
            {isLive ? "LIVE" : tick.text}
          </p>
        </div>

        {/* Taking guild + status */}
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 min-w-0 text-[11px]">
            <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: color.dot }} />
            <span className={`font-semibold truncate ${color.text}`}>
              {schedule.guildTurnGuildName || schedule.guildTurn || "Unassigned"}
            </span>
          </span>
          <span className="text-[9px] font-bold uppercase tracking-wider text-white/35 shrink-0">{schedule.status}</span>
        </div>

        {/* War-planning headcount for this specific upcoming spawn */}
        <div className="mt-auto">
          <BossCommitButton
            guildId={guildId}
            scheduleId={schedule.id}
            bossName={schedule.bossName}
            initialData={commitmentsBatch?.[schedule.id]}
          />
        </div>
      </div>
    </article>
  );
});

export default UpcomingCard;
