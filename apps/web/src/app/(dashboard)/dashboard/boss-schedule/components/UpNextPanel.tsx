"use client";

import { useState } from "react";
import { type BossScheduleData, type BossData } from "@/lib/api";
import { getBossImageUrl, getRealtimeBossTimer } from "@guild/shared";

export interface UpNextPanelProps {
  upcomingSpawns: BossScheduleData[];
  killedHistory: BossScheduleData[];
  bosses: BossData[];
  currentTime: number;
  onSetReminder: (bossName: string, minutes: number) => void;
}

const REMINDER_OPTIONS = [5, 15, 30, 60];

export default function UpNextPanel({
  upcomingSpawns,
  killedHistory,
  bosses,
  currentTime,
  onSetReminder,
}: UpNextPanelProps) {
  const queue = upcomingSpawns.slice(0, 6);
  const [index, setIndex] = useState(0);
  const [reminder, setReminder] = useState(15);

  const safeIndex = queue.length ? Math.min(index, queue.length - 1) : 0;
  const item = queue[safeIndex] || null;

  if (!item) {
    return (
      <aside className="rounded-2xl border border-[var(--metal-border)] bg-[var(--obsidian-elevated)]/40 p-5">
        <p className="text-[10px] font-bold text-[var(--forge-gold)] uppercase tracking-widest">Up Next</p>
        <div className="text-center py-16 text-xs text-white/35 italic">No upcoming spawns to preview.</div>
      </aside>
    );
  }

  const registry = bosses.find((b) => b.name.toLowerCase() === item.bossName.toLowerCase());
  const level = registry?.level ?? null;
  const isWorld = registry?.type === "FIXED_SCHEDULE";
  const respawn = registry?.cooldownHours ? `${registry.cooldownHours}h` : "Fixed";
  const minParticipants = level === null ? 8 : level >= 100 ? 15 : level >= 85 ? 10 : 6;
  const recPower = level === null ? 100000 : level * 2500;

  // Real-time respawn timer — an overdue spawn rolls forward to the boss's next
  // real respawn instead of freezing on "LIVE".
  const timer = getRealtimeBossTimer(item.bossName, item.spawnTime, currentTime, { status: item.status });
  const remaining = Math.max(0, timer.nextSpawn - currentTime);
  const cd = {
    live: timer.live,
    h: Math.floor(remaining / 3600000),
    m: Math.floor((remaining % 3600000) / 60000),
    s: Math.floor((remaining % 60000) / 1000),
  };

  // Predicted fill toward spawn within the boss cooldown window (or 24h fallback)
  const windowMs = (registry?.cooldownHours ?? 24) * 3600000;
  const pct = cd.live ? 100 : Math.max(4, Math.min(99, Math.round((1 - Math.min(remaining, windowMs) / windowMs) * 100)));

  const winners = killedHistory.slice(0, 3);

  return (
    <aside className="rounded-2xl border border-[var(--metal-border)] bg-[var(--obsidian-elevated)]/40 overflow-hidden">
      {/* Header + carousel controls */}
      <div className="flex items-center justify-between px-5 pt-4">
        <p className="text-[10px] font-bold text-[var(--forge-gold)] uppercase tracking-widest">Up Next</p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIndex((i) => (i - 1 + queue.length) % queue.length)}
            aria-label="Previous boss"
            className="h-6 w-6 rounded-md border border-[var(--metal-border)] text-white/50 hover:text-[var(--forge-gold)] hover:border-[var(--forge-gold)]/30 transition-colors cursor-pointer text-xs"
          >
            ‹
          </button>
          <span className="text-[10px] font-mono text-white/40">
            {safeIndex + 1}/{queue.length}
          </span>
          <button
            type="button"
            onClick={() => setIndex((i) => (i + 1) % queue.length)}
            aria-label="Next boss"
            className="h-6 w-6 rounded-md border border-[var(--metal-border)] text-white/50 hover:text-[var(--forge-gold)] hover:border-[var(--forge-gold)]/30 transition-colors cursor-pointer text-xs"
          >
            ›
          </button>
        </div>
      </div>

      {/* Hero boss art */}
      <div className="relative mx-5 mt-4 rounded-xl overflow-hidden border border-white/10 aspect-[16/10]">
        <img
          src={item.bossImageUrl || getBossImageUrl(item.bossName)}
          alt={item.bossName}
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[var(--obsidian-deep)] via-[var(--obsidian-deep)]/30 to-transparent" />
        {cd.live && (
          <span className="absolute top-2.5 left-2.5 inline-flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider text-rose-300 bg-rose-500/20 border border-rose-500/40 px-2 py-1 rounded-md backdrop-blur-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-400 animate-ping" /> Live
          </span>
        )}
        <div className="absolute bottom-0 inset-x-0 p-3.5">
          <h3 className="text-lg font-bold text-white font-fantasy leading-tight">{item.bossName}</h3>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-[var(--forge-glow)] border border-[var(--forge-gold)]/30 text-[var(--forge-gold-bright)] uppercase tracking-wider">
              {isWorld ? "World Boss" : "Field Boss"}
            </span>
            <span className="text-[10px] text-white/55 truncate">📍 {item.location}</span>
          </div>
        </div>
      </div>

      {/* Spawn-in countdown */}
      <div className="px-5 mt-4">
        <p className="text-[9px] font-bold text-white/40 uppercase tracking-[0.2em]">{cd.live ? "Live · Up Time" : "Spawn In"}</p>
        {cd.live ? (
          <p className="mt-1 font-mono text-3xl font-bold text-rose-400 tracking-wider tabular-nums">
            {timer.liveElapsedText}
          </p>
        ) : (
          <div className="mt-1 flex items-end gap-1 font-mono">
            <CountUnit value={cd.h} unit="h" />
            <CountUnit value={cd.m} unit="m" />
            <CountUnit value={cd.s} unit="s" />
          </div>
        )}
        <p className="text-[10px] text-white/40 mt-1.5">
          {cd.live ? "Spawned " : "Next "}
          {new Date(cd.live ? item.spawnTime : timer.nextSpawn).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" })}
        </p>
        <div className="mt-2.5 flex items-center gap-2">
          <div className="h-1.5 flex-1 rounded-full bg-white/[0.06] overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[var(--forge-gold-dim)] to-[var(--forge-gold-bright)]"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-[9px] font-mono text-white/40 shrink-0">{pct}% predicted</span>
        </div>
      </div>

      {/* Details */}
      <div className="px-5 mt-4">
        <p className="text-[9px] font-bold text-white/40 uppercase tracking-[0.2em] mb-2">Details</p>
        <dl className="space-y-1.5">
          <DetailRow label="Level" value={level !== null ? String(level) : "—"} />
          <DetailRow label="Boss Type" value={isWorld ? "World Boss" : "Field Boss"} />
          <DetailRow label="Respawn Time" value={respawn} />
          <DetailRow label="Min. Participants" value={String(minParticipants)} />
          <DetailRow label="Recommended Power" value={`${recPower.toLocaleString()}+`} />
        </dl>
      </div>

      {/* Reminder */}
      <div className="px-5 mt-4">
        <p className="text-[9px] font-bold text-white/40 uppercase tracking-[0.2em] mb-2">Reminder</p>
        <select
          value={reminder}
          onChange={(e) => setReminder(Number(e.target.value))}
          className="w-full h-9 px-3 rounded-lg bg-[var(--obsidian-deep)]/60 border border-[var(--metal-border)] text-[12px] text-white/85 focus:outline-none focus:border-[var(--forge-gold)]/35 cursor-pointer"
        >
          {REMINDER_OPTIONS.map((m) => (
            <option key={m} value={m} className="bg-[#0c0d12]">
              {m} minutes before
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => onSetReminder(item.bossName, reminder)}
          className="mt-2 w-full h-9 rounded-lg bg-gradient-to-r from-[var(--forge-gold)] to-[var(--forge-gold-bright)] text-[var(--obsidian-deep)] text-[12px] font-bold inline-flex items-center justify-center gap-1.5 hover:brightness-110 transition-all cursor-pointer"
        >
          🔔 Set Reminder
        </button>
      </div>

      {/* Recent winners */}
      <div className="px-5 mt-4 pb-5">
        <p className="text-[9px] font-bold text-white/40 uppercase tracking-[0.2em] mb-2">Recent Winners</p>
        {winners.length === 0 ? (
          <p className="text-[11px] text-white/35 italic">No recorded kills yet.</p>
        ) : (
          <ol className="space-y-1.5">
            {winners.map((w, i) => (
              <li key={w.id} className="flex items-center justify-between gap-2 text-[11px]">
                <span className="flex items-center gap-2 min-w-0">
                  <span className="text-white/30 font-mono">{i + 1}.</span>
                  <span className="text-white/80 font-medium truncate">{w.guildTurnGuildName || w.guildTurn || "Unknown"}</span>
                </span>
                <span className="text-white/35 font-mono shrink-0">
                  {new Date(w.killedAt || w.spawnTime).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </aside>
  );
}

function CountUnit({ value, unit }: { value: number; unit: string }) {
  return (
    <span className="inline-flex items-baseline">
      <span className="text-3xl font-bold text-white tabular-nums tracking-tight">{String(value).padStart(2, "0")}</span>
      <span className="text-sm font-semibold text-[var(--forge-gold)] ml-0.5 mr-1.5">{unit}</span>
    </span>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-[11px] border-b border-white/[0.04] pb-1.5">
      <dt className="text-white/45">{label}</dt>
      <dd className="text-white/85 font-semibold text-right">{value}</dd>
    </div>
  );
}
