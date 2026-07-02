"use client";

export interface ScheduleStatsProps {
  upcomingCount: number;
  nextLabel: string;
  thisWeekCount: number;
  weekRangeLabel: string;
  thisMonthKills: number;
  monthLabel: string;
  attendanceRate: number | null;
}

interface StatDef {
  icon: React.ReactNode;
  value: string;
  label: string;
  sub: string;
  tone: "emerald" | "gold" | "rose" | "violet";
}

const TONES: Record<StatDef["tone"], { ring: string; text: string; glow: string }> = {
  emerald: { ring: "border-emerald-500/25 bg-emerald-500/[0.07]", text: "text-emerald-400", glow: "shadow-[0_0_20px_rgba(16,185,129,0.08)]" },
  gold: { ring: "border-[var(--forge-gold)]/25 bg-[var(--forge-glow)]", text: "text-[var(--forge-gold-bright)]", glow: "shadow-[0_0_20px_rgba(212,168,83,0.1)]" },
  rose: { ring: "border-rose-500/25 bg-rose-500/[0.07]", text: "text-rose-400", glow: "shadow-[0_0_20px_rgba(244,63,94,0.07)]" },
  violet: { ring: "border-violet-500/25 bg-violet-500/[0.07]", text: "text-violet-300", glow: "shadow-[0_0_20px_rgba(139,92,246,0.08)]" },
};

export default function ScheduleStats({
  upcomingCount,
  nextLabel,
  thisWeekCount,
  weekRangeLabel,
  thisMonthKills,
  monthLabel,
  attendanceRate,
}: ScheduleStatsProps) {
  const stats: StatDef[] = [
    {
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
          <path d="M12 2a7 7 0 00-7 7c0 2.5 1.5 4 1.5 5.5V17a1 1 0 001 1h9a1 1 0 001-1v-2.5c0-1.5 1.5-3 1.5-5.5a7 7 0 00-7-7z" />
          <circle cx="9" cy="9" r="1.2" fill="currentColor" stroke="none" />
          <circle cx="15" cy="9" r="1.2" fill="currentColor" stroke="none" />
          <path d="M9 21h6" />
        </svg>
      ),
      value: String(upcomingCount),
      label: "Upcoming Spawns",
      sub: nextLabel,
      tone: "emerald",
    },
    {
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
          <rect x="3" y="4.5" width="18" height="16" rx="2" />
          <path d="M3 9h18M8 2.5v4M16 2.5v4" />
        </svg>
      ),
      value: String(thisWeekCount),
      label: "This Week",
      sub: weekRangeLabel,
      tone: "gold",
    },
    {
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
          <path d="M14.5 3.5l6 6-9 9-3 1 1-3 9-9z" transform="rotate(0)" />
          <path d="M4 20l4-4M6 14l4 4" />
        </svg>
      ),
      value: String(thisMonthKills),
      label: "This Month",
      sub: monthLabel,
      tone: "rose",
    },
    {
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
          <circle cx="9" cy="8" r="3" />
          <path d="M3.5 19a5.5 5.5 0 0111 0M16 6.5a3 3 0 010 5.5M18 19a5 5 0 00-3.5-4.7" />
        </svg>
      ),
      value: attendanceRate === null ? "--" : `${attendanceRate}%`,
      label: "Attendance Rate",
      sub: "This Week",
      tone: "violet",
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
      {stats.map((s) => {
        const tone = TONES[s.tone];
        return (
          <div
            key={s.label}
            className={`group rounded-2xl border border-[var(--metal-border)] bg-[var(--obsidian-elevated)]/40 p-4 transition-all duration-300 hover:border-white/15 ${tone.glow}`}
          >
            <div className="flex items-start gap-3">
              <div className={`h-10 w-10 rounded-xl border flex items-center justify-center shrink-0 ${tone.ring} ${tone.text}`}>
                {s.icon}
              </div>
              <div className="min-w-0">
                <p className={`text-2xl font-bold leading-none tracking-tight ${tone.text}`}>{s.value}</p>
                <p className="text-[11px] font-semibold text-white/80 mt-1.5">{s.label}</p>
              </div>
            </div>
            <p className="text-[10px] text-white/40 mt-3 truncate font-medium">{s.sub}</p>
          </div>
        );
      })}
    </div>
  );
}
