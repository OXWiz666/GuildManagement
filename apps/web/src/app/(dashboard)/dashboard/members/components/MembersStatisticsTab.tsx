"use client";

import { useId, useMemo, useState } from "react";
import { dashboardApi, type GuildStatsSummary, type MemberStatsBoardRow } from "@/lib/api";
import { useQuery } from "@/lib/query";
import { Skeleton } from "@/components/ui/Skeleton";
import Avatar from "@/components/ui/Avatar";

export interface MembersStatisticsTabProps {
  guildId: string;
}

// Catmull-Rom → cubic Bezier smoothing, the standard trick for turning a
// jagged polyline into the organic curve a "real" sparkline reads as.
function smoothPath(points: Array<[number, number]>): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M${points[0][0]},${points[0][1]}`;
  let d = `M${points[0][0]},${points[0][1]}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] || points[i];
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    const p3 = points[i + 2] || p2;
    const cp1x = p1[0] + (p2[0] - p0[0]) / 6;
    const cp1y = p1[1] + (p2[1] - p0[1]) / 6;
    const cp2x = p2[0] - (p3[0] - p1[0]) / 6;
    const cp2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C${cp1x},${cp1y} ${cp2x},${cp2y} ${p2[0]},${p2[1]}`;
  }
  return d;
}

/** Smooth area+line sparkline — a real plotted curve (gradient fill under a
 *  rounded line, zero-baseline aware) instead of a bar list. */
function Sparkline({ values, color }: { values: number[]; color: string }) {
  const gradId = useId();
  const width = 100;
  const height = 40;

  if (values.length < 2) {
    return <div style={{ height }} />;
  }

  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const range = max - min || 1;
  const stepX = width / (values.length - 1);
  const pad = 4;
  const points: Array<[number, number]> = values.map((v, i) => [
    i * stepX,
    height - pad - ((v - min) / range) * (height - pad * 2),
  ]);

  const linePath = smoothPath(points);
  const areaPath = `${linePath} L${points[points.length - 1]![0]},${height} L${points[0]![0]},${height} Z`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradId})`} stroke="none" />
      <path
        d={linePath}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function Badge({ tone, children }: { tone: "up" | "down" | "flat"; children: React.ReactNode }) {
  const cls =
    tone === "up"
      ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
      : tone === "down"
        ? "text-rose-400 bg-rose-500/10 border-rose-500/20"
        : "text-white/50 bg-white/[0.05] border-white/10";
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-bold ${cls}`}>
      {children}
    </span>
  );
}

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  sublabel: string;
  bigValue: string;
  badge: React.ReactNode;
  sparklineValues: number[];
  color: string;
}

function StatCard({ icon, label, sublabel, bigValue, badge, sparklineValues, color }: StatCardProps) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 flex flex-col overflow-hidden">
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="h-7 w-7 rounded-lg flex items-center justify-center shrink-0"
            style={{ backgroundColor: `${color}1f`, color }}
          >
            {icon}
          </span>
          <div className="min-w-0">
            <p className="text-[12px] font-semibold text-white truncate">{label}</p>
            <p className="text-[10px] text-white/35 truncate">{sublabel}</p>
          </div>
        </div>
        {badge}
      </div>

      <p className="text-[26px] font-bold tracking-tight text-white mt-2 mb-1">{bigValue}</p>

      <div className="mt-auto -mx-1">
        <Sparkline values={sparklineValues} color={color} />
      </div>
    </div>
  );
}

function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / previous) * 100);
}

function ChangeBadge({ current, previous }: { current: number; previous: number }) {
  const change = pctChange(current, previous);
  if (change === null) {
    return <Badge tone="up">New</Badge>;
  }
  if (change === 0) {
    return <Badge tone="flat">0%</Badge>;
  }
  return <Badge tone={change > 0 ? "up" : "down"}>{change > 0 ? "+" : ""}{change}%</Badge>;
}

const ICONS = {
  pulse: (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12h4l3 8 4-16 3 8h4" />
    </svg>
  ),
  coin: (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v10M9 9.5c0-1.4 1.3-2.5 3-2.5s3 1.1 3 2.5-1.3 2-3 2-3 .6-3 2 1.3 2.5 3 2.5 3-1.1 3-2.5" />
    </svg>
  ),
  trending: (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 17l6-6 4 4 8-8" />
      <path d="M15 7h6v6" />
    </svg>
  ),
  swords: (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 20L20 4M20 4h-5M20 4v5" />
      <path d="M20 20L4 4M4 4h5M4 4v5" />
    </svg>
  ),
  flame: (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2s5 5.5 5 10a5 5 0 01-10 0c0-1.5 1-2.5 1-2.5s.5 2 2 2c0-3 2-4 2-6.5C12 3.5 12 2 12 2z" />
    </svg>
  ),
};

/** Roster-wide Member Statistics — five KPI cards (guild-wide big number +
 *  real current-vs-previous-30d badge where one exists, plus a smooth
 *  per-member sparkline), replacing the earlier ranked-bar small multiples.
 *  Full sortable table underneath for exact per-member figures. */
export default function MembersStatisticsTab({ guildId }: MembersStatisticsTabProps) {
  const [search, setSearch] = useState("");

  const { data: board, isLoading: isLoadingBoard } = useQuery<MemberStatsBoardRow[]>(
    guildId ? `member_stats_board:${guildId}` : "member_stats_board_empty",
    async () => {
      const result = await dashboardApi.getMemberStatsBoard(guildId);
      return result.success && result.data ? result.data.members : [];
    },
    { persist: true, staleTime: 20000, enabled: !!guildId },
  );

  const { data: summary, isLoading: isLoadingSummary } = useQuery<GuildStatsSummary | null>(
    guildId ? `guild_stats_summary:${guildId}` : "guild_stats_summary_empty",
    async () => {
      const result = await dashboardApi.getGuildStatsSummary(guildId);
      return result.success && result.data ? result.data : null;
    },
    { persist: true, staleTime: 60000, enabled: !!guildId },
  );

  const members = useMemo(() => board || [], [board]);
  const isLoading = isLoadingBoard || isLoadingSummary;

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return members;
    return members.filter((m) => m.displayName.toLowerCase().includes(needle));
  }, [members, search]);

  const cpGrowthTotal = useMemo(() => members.reduce((sum, m) => sum + (m.cpGrowth ?? 0), 0), [members]);
  const cpGrowingCount = useMemo(() => members.filter((m) => (m.cpGrowth ?? 0) > 0).length, [members]);
  const activeStreakCount = useMemo(() => members.filter((m) => m.currentStreak > 0).length, [members]);

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-40 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-80 rounded-2xl" />
      </div>
    );
  }

  if (members.length === 0) {
    return (
      <div className="text-center py-12 text-white/40 text-sm">No members to show statistics for yet.</div>
    );
  }

  return (
    <div className="space-y-5">
      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        <StatCard
          icon={ICONS.pulse}
          label="Attendance Rate"
          sublabel={`vs previous ${summary?.windowDays ?? 30}d`}
          bigValue={`${summary?.attendanceRate.current ?? 0}%`}
          badge={<ChangeBadge current={summary?.attendanceRate.current ?? 0} previous={summary?.attendanceRate.previous ?? 0} />}
          sparklineValues={members.map((m) => m.presenceRate)}
          color="#38bdf8"
        />
        <StatCard
          icon={ICONS.coin}
          label="Activity Points"
          sublabel={`vs previous ${summary?.windowDays ?? 30}d`}
          bigValue={(summary?.activityPoints.current ?? 0).toLocaleString()}
          badge={<ChangeBadge current={summary?.activityPoints.current ?? 0} previous={summary?.activityPoints.previous ?? 0} />}
          sparklineValues={members.map((m) => m.totalPoints)}
          color="#f5c451"
        />
        <StatCard
          icon={ICONS.trending}
          label="CP Growth"
          sublabel={`Last 30 days`}
          bigValue={`${cpGrowthTotal > 0 ? "+" : ""}${cpGrowthTotal.toLocaleString()}`}
          badge={<Badge tone={cpGrowingCount > 0 ? "up" : "flat"}>{cpGrowingCount}/{members.length} growing</Badge>}
          sparklineValues={members.map((m) => m.cpGrowth ?? 0)}
          color="#34d399"
        />
        <StatCard
          icon={ICONS.swords}
          label="Raid Participation"
          sublabel={`vs previous ${summary?.windowDays ?? 30}d`}
          bigValue={(summary?.raidParticipation.current ?? 0).toLocaleString()}
          badge={<ChangeBadge current={summary?.raidParticipation.current ?? 0} previous={summary?.raidParticipation.previous ?? 0} />}
          sparklineValues={members.map((m) => m.participationCount)}
          color="#a78bfa"
        />
        <StatCard
          icon={ICONS.flame}
          label="Current Streak"
          sublabel="Active members"
          bigValue={`${activeStreakCount}`}
          badge={<Badge tone={activeStreakCount > 0 ? "up" : "flat"}>of {members.length}</Badge>}
          sparklineValues={members.map((m) => m.currentStreak)}
          color="#fb923c"
        />
      </div>

      {/* Full table */}
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/[0.06] bg-white/[0.025] px-4 py-3">
          <h3 className="text-sm font-semibold text-white">All members</h3>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search member..."
            className="w-full sm:w-48 px-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.08] text-[12px] text-white placeholder:text-white/35 focus:outline-none focus:border-white/25"
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-left">
            <thead>
              <tr className="border-b border-white/[0.06] bg-white/[0.02]">
                <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.16em] text-white/40">Member</th>
                <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.16em] text-white/40">CP Growth (30d)</th>
                <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.16em] text-white/40">Attendance Rate</th>
                <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.16em] text-white/40">Current Streak</th>
                <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.16em] text-white/40">Raid Participation</th>
                <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.16em] text-white/40">Activity Points</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.05]">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-[12px] text-white/35 italic">
                    No members match &quot;{search}&quot;.
                  </td>
                </tr>
              ) : (
                filtered.map((m) => (
                  <tr key={m.userId} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Avatar name={m.displayName} src={m.avatarUrl} size="sm" />
                        <span className="text-[13px] font-semibold text-white truncate">{m.displayName}</span>
                      </div>
                    </td>
                    <td
                      className={`px-4 py-2.5 text-[12px] font-mono font-semibold whitespace-nowrap ${
                        m.cpGrowth === null
                          ? "text-white/30"
                          : m.cpGrowth > 0
                            ? "text-emerald-400"
                            : m.cpGrowth < 0
                              ? "text-rose-400"
                              : "text-white/60"
                      }`}
                    >
                      {m.cpGrowth === null ? "—" : `${m.cpGrowth > 0 ? "+" : ""}${m.cpGrowth.toLocaleString()}`}
                    </td>
                    <td className="px-4 py-2.5 text-[12px] font-mono font-semibold text-sky-400 whitespace-nowrap">
                      {m.presenceRate}%
                    </td>
                    <td className="px-4 py-2.5 text-[12px] font-mono font-semibold text-amber-400 whitespace-nowrap">
                      {m.currentStreak}
                    </td>
                    <td className="px-4 py-2.5 text-[12px] font-mono font-semibold text-violet-400 whitespace-nowrap">
                      {m.participationCount}
                    </td>
                    <td className="px-4 py-2.5 text-[12px] font-mono font-semibold text-[var(--forge-gold-bright,#f5c451)] whitespace-nowrap">
                      {m.totalPoints.toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
