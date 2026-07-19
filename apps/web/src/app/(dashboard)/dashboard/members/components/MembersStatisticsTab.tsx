"use client";

import { useId, useMemo, useState } from "react";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type PaginationState,
  type SortingState,
} from "@tanstack/react-table";
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
    return <div className="rounded-lg border border-white/[0.04] bg-white/[0.015]" style={{ height }} />;
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
      <path d="M0 31H100" stroke="rgba(255,255,255,0.08)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
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

function clampPercent(value: number, max: number) {
  if (max <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((value / max) * 100)));
}

function Badge({ tone, children }: { tone: "up" | "down" | "flat"; children: React.ReactNode }) {
  const cls =
    tone === "up"
      ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
      : tone === "down"
        ? "text-rose-400 bg-rose-500/10 border-rose-500/20"
        : "text-white/50 bg-white/[0.05] border-white/10";
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-bold shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] ${cls}`}>
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
  meterValue: number;
  meterMax: number;
  meterLabel: string;
  meterDetail: string;
}

function StatCard({
  icon,
  label,
  sublabel,
  bigValue,
  badge,
  sparklineValues,
  color,
  meterValue,
  meterMax,
  meterLabel,
  meterDetail,
}: StatCardProps) {
  const meterPercent = clampPercent(meterValue, meterMax);

  return (
    <div
      className="group relative min-h-[164px] rounded-2xl border border-white/[0.07] bg-[#0f1015] p-4 flex flex-col overflow-hidden shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-colors hover:border-white/[0.12]"
      style={{
        backgroundImage: `linear-gradient(135deg, ${color}14, rgba(255,255,255,0.015) 38%, rgba(0,0,0,0) 72%)`,
      }}
    >
      <div
        className="pointer-events-none absolute -right-12 -top-20 h-40 w-40 rounded-full blur-3xl opacity-0 transition-opacity duration-300 group-hover:opacity-60"
        style={{ backgroundColor: `${color}24` }}
      />

      <div className="relative flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0 border border-white/[0.06]"
            style={{ backgroundColor: `${color}20`, color }}
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

      <div className="relative mt-4 flex items-end justify-between gap-3">
        <p className="text-[30px] leading-none font-black tracking-tight text-white">{bigValue}</p>
        <div className="w-28 max-w-[44%] opacity-90">
          <Sparkline values={sparklineValues} color={color} />
        </div>
      </div>

      <div className="relative mt-auto pt-4 space-y-1.5">
        <div className="flex items-center justify-between gap-2 text-[10px]">
          <span className="font-semibold uppercase tracking-[0.14em] text-white/35">{meterLabel}</span>
          <span className="font-mono font-bold text-white/55">{meterDetail}</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
          <div
            className="h-full rounded-full transition-[width] duration-500"
            style={{
              width: `${meterPercent}%`,
              backgroundColor: color,
              boxShadow: `0 0 18px ${color}66`,
            }}
          />
        </div>
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

function cpGrowthClass(value: number | null) {
  if (value === null) return "text-white/30";
  if (value > 0) return "text-emerald-400";
  if (value < 0) return "text-rose-400";
  return "text-white/60";
}

function formatSigned(value: number | null) {
  if (value === null) return "--";
  return `${value > 0 ? "+" : ""}${value.toLocaleString()}`;
}

function MetricCell({ value, tone }: { value: string; tone: "sky" | "amber" | "violet" | "gold" }) {
  const cls = {
    sky: "text-sky-400",
    amber: "text-amber-400",
    violet: "text-violet-400",
    gold: "text-[var(--forge-gold-bright,#f5c451)]",
  }[tone];
  return <span className={`font-mono font-semibold ${cls}`}>{value}</span>;
}

function MiniBar({
  label,
  value,
  max,
  color,
  detail,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
  detail: string;
}) {
  const pct = clampPercent(value, max);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3 text-[11px]">
        <span className="font-semibold text-white/70">{label}</span>
        <span className="font-mono text-white/40">{detail}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{ width: `${pct}%`, backgroundColor: color, boxShadow: `0 0 16px ${color}55` }}
        />
      </div>
    </div>
  );
}

function RankedMember({
  rank,
  member,
  value,
  suffix,
  tone,
}: {
  rank: number;
  member: MemberStatsBoardRow;
  value: string;
  suffix: string;
  tone: "gold" | "emerald" | "amber";
}) {
  const toneClass = {
    gold: "text-[var(--forge-gold-bright,#f5c451)] bg-amber-500/10 border-amber-500/15",
    emerald: "text-emerald-300 bg-emerald-500/10 border-emerald-500/15",
    amber: "text-amber-300 bg-amber-500/10 border-amber-500/15",
  }[tone];
  return (
    <div className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.025] px-3 py-2">
      <span className={`flex h-7 w-7 items-center justify-center rounded-lg border text-[11px] font-black ${toneClass}`}>
        {rank}
      </span>
      <div className="flex min-w-0 items-center gap-2">
        <Avatar name={member.displayName} src={member.avatarUrl} size="sm" />
        <span className="truncate text-[12px] font-semibold text-white">{member.displayName}</span>
      </div>
      <span className="text-right font-mono text-[12px] font-bold text-white">
        {value}
        <span className="ml-1 text-[10px] font-semibold text-white/35">{suffix}</span>
      </span>
    </div>
  );
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
  const [sorting, setSorting] = useState<SortingState>([{ id: "totalPoints", desc: true }]);
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 10 });

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

  const cpGrowthTotal = useMemo(() => members.reduce((sum, m) => sum + (m.cpGrowth ?? 0), 0), [members]);
  const cpGrowingCount = useMemo(() => members.filter((m) => (m.cpGrowth ?? 0) > 0).length, [members]);
  const activeStreakCount = useMemo(() => members.filter((m) => m.currentStreak > 0).length, [members]);
  const attendanceBands = useMemo(() => ({
    excellent: members.filter((member) => member.presenceRate >= 80).length,
    steady: members.filter((member) => member.presenceRate >= 50 && member.presenceRate < 80).length,
    watch: members.filter((member) => member.presenceRate < 50).length,
  }), [members]);
  const topPoints = useMemo(() => [...members].sort((a, b) => b.totalPoints - a.totalPoints).slice(0, 3), [members]);
  const topGrowth = useMemo(() => [...members].sort((a, b) => (b.cpGrowth ?? -Infinity) - (a.cpGrowth ?? -Infinity)).slice(0, 3), [members]);
  const topStreaks = useMemo(() => [...members].sort((a, b) => b.currentStreak - a.currentStreak).slice(0, 3), [members]);
  const columns = useMemo<ColumnDef<MemberStatsBoardRow>[]>(
    () => [
      {
        accessorKey: "displayName",
        header: "Member",
        cell: ({ row }) => {
          const member = row.original;
          return (
            <div className="flex items-center gap-2.5 min-w-0">
              <Avatar name={member.displayName} src={member.avatarUrl} size="sm" />
              <span className="text-[13px] font-semibold text-white truncate">{member.displayName}</span>
            </div>
          );
        },
      },
      {
        accessorKey: "cpGrowth",
        header: "CP Growth (30d)",
        sortingFn: (a, b, id) => (a.getValue<number | null>(id) ?? Number.NEGATIVE_INFINITY) - (b.getValue<number | null>(id) ?? Number.NEGATIVE_INFINITY),
        cell: ({ getValue }) => {
          const value = getValue<number | null>();
          return <span className={`font-mono font-semibold ${cpGrowthClass(value)}`}>{formatSigned(value)}</span>;
        },
      },
      {
        accessorKey: "presenceRate",
        header: "Attendance Rate",
        cell: ({ getValue }) => <MetricCell value={`${getValue<number>()}%`} tone="sky" />,
      },
      {
        accessorKey: "currentStreak",
        header: "Current Streak",
        cell: ({ getValue }) => <MetricCell value={getValue<number>().toLocaleString()} tone="amber" />,
      },
      {
        accessorKey: "participationCount",
        header: "Raid Participation",
        cell: ({ getValue }) => <MetricCell value={getValue<number>().toLocaleString()} tone="violet" />,
      },
      {
        accessorKey: "totalPoints",
        header: "Activity Points",
        cell: ({ getValue }) => <MetricCell value={getValue<number>().toLocaleString()} tone="gold" />,
      },
    ],
    [],
  );
  // TanStack Table intentionally returns table functions; keep this hook local to the table surface.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: members,
    columns,
    state: {
      globalFilter: search,
      pagination,
      sorting,
    },
    onGlobalFilterChange: setSearch,
    onPaginationChange: setPagination,
    onSortingChange: setSorting,
    globalFilterFn: (row, _columnId, filterValue) => {
      const needle = String(filterValue).trim().toLowerCase();
      if (!needle) return true;
      const member = row.original;
      return [
        member.displayName,
        member.cpGrowth === null ? "" : String(member.cpGrowth),
        String(member.presenceRate),
        String(member.currentStreak),
        String(member.participationCount),
        String(member.totalPoints),
      ].some((value) => value.toLowerCase().includes(needle));
    },
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });
  const filteredRows = table.getFilteredRowModel().rows;
  const pagedRows = table.getRowModel().rows;

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
          meterValue={summary?.attendanceRate.current ?? 0}
          meterMax={100}
          meterLabel="Guild average"
          meterDetail={`${summary?.attendanceRate.previous ?? 0}% previous`}
        />
        <StatCard
          icon={ICONS.coin}
          label="Activity Points"
          sublabel={`vs previous ${summary?.windowDays ?? 30}d`}
          bigValue={(summary?.activityPoints.current ?? 0).toLocaleString()}
          badge={<ChangeBadge current={summary?.activityPoints.current ?? 0} previous={summary?.activityPoints.previous ?? 0} />}
          sparklineValues={members.map((m) => m.totalPoints)}
          color="#f5c451"
          meterValue={summary?.activityPoints.current ?? 0}
          meterMax={Math.max(summary?.activityPoints.current ?? 0, summary?.activityPoints.previous ?? 0, 1)}
          meterLabel="Window total"
          meterDetail={`${(summary?.activityPoints.previous ?? 0).toLocaleString()} previous`}
        />
        <StatCard
          icon={ICONS.trending}
          label="CP Growth"
          sublabel={`Last 30 days`}
          bigValue={`${cpGrowthTotal > 0 ? "+" : ""}${cpGrowthTotal.toLocaleString()}`}
          badge={<Badge tone={cpGrowingCount > 0 ? "up" : "flat"}>{cpGrowingCount}/{members.length} growing</Badge>}
          sparklineValues={members.map((m) => m.cpGrowth ?? 0)}
          color="#34d399"
          meterValue={cpGrowingCount}
          meterMax={members.length}
          meterLabel="Growing members"
          meterDetail={`${cpGrowingCount} of ${members.length}`}
        />
        <StatCard
          icon={ICONS.swords}
          label="Raid Participation"
          sublabel={`vs previous ${summary?.windowDays ?? 30}d`}
          bigValue={(summary?.raidParticipation.current ?? 0).toLocaleString()}
          badge={<ChangeBadge current={summary?.raidParticipation.current ?? 0} previous={summary?.raidParticipation.previous ?? 0} />}
          sparklineValues={members.map((m) => m.participationCount)}
          color="#a78bfa"
          meterValue={summary?.raidParticipation.current ?? 0}
          meterMax={Math.max(summary?.raidParticipation.current ?? 0, summary?.raidParticipation.previous ?? 0, 1)}
          meterLabel="Raid count"
          meterDetail={`${(summary?.raidParticipation.previous ?? 0).toLocaleString()} previous`}
        />
        <StatCard
          icon={ICONS.flame}
          label="Current Streak"
          sublabel="Active members"
          bigValue={`${activeStreakCount}`}
          badge={<Badge tone={activeStreakCount > 0 ? "up" : "flat"}>of {members.length}</Badge>}
          sparklineValues={members.map((m) => m.currentStreak)}
          color="#fb923c"
          meterValue={activeStreakCount}
          meterMax={members.length}
          meterLabel="Active streak"
          meterDetail={`${activeStreakCount} of ${members.length}`}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1.05fr_1.6fr]">
        <div className="rounded-2xl border border-white/[0.07] bg-[#0d0f13] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-white">Attendance Distribution</h3>
              <p className="mt-0.5 text-[11px] text-white/35">Active roster grouped by reliability</p>
            </div>
            <Badge tone="flat">{members.length} members</Badge>
          </div>
          <div className="space-y-3">
            <MiniBar label="Excellent" value={attendanceBands.excellent} max={members.length} color="#34d399" detail={`${attendanceBands.excellent} at 80%+`} />
            <MiniBar label="Steady" value={attendanceBands.steady} max={members.length} color="#38bdf8" detail={`${attendanceBands.steady} at 50-79%`} />
            <MiniBar label="Needs review" value={attendanceBands.watch} max={members.length} color="#fb7185" detail={`${attendanceBands.watch} below 50%`} />
          </div>
        </div>

        <div className="rounded-2xl border border-white/[0.07] bg-[#0d0f13] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-white">Roster Leaders</h3>
            <p className="mt-0.5 text-[11px] text-white/35">Top members by points, CP movement, and active streak</p>
          </div>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            <div className="space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/35">Activity Points</p>
              {topPoints.map((member, i) => (
                <RankedMember key={member.userId} rank={i + 1} member={member} value={member.totalPoints.toLocaleString()} suffix="pts" tone="gold" />
              ))}
            </div>
            <div className="space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/35">CP Momentum</p>
              {topGrowth.map((member, i) => (
                <RankedMember key={member.userId} rank={i + 1} member={member} value={formatSigned(member.cpGrowth)} suffix="CP" tone="emerald" />
              ))}
            </div>
            <div className="space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/35">Streak</p>
              {topStreaks.map((member, i) => (
                <RankedMember key={member.userId} rank={i + 1} member={member} value={member.currentStreak.toLocaleString()} suffix="runs" tone="amber" />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Full table */}
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-white/[0.06] bg-white/[0.025] px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold text-white">All members</h3>
            <p className="text-[11px] text-white/35 mt-0.5">
              {filteredRows.length.toLocaleString()} of {members.length.toLocaleString()} shown
            </p>
          </div>
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              table.setPageIndex(0);
            }}
            placeholder="Search member or metric..."
            className="w-full lg:w-64 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.08] text-[12px] text-white placeholder:text-white/35 focus:outline-none focus:border-white/25"
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-left">
            <thead>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id} className="border-b border-white/[0.06] bg-white/[0.02]">
                  {headerGroup.headers.map((header) => {
                    const sort = header.column.getIsSorted();
                    return (
                      <th key={header.id} className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.16em] text-white/40">
                        {header.isPlaceholder ? null : (
                          <button
                            type="button"
                            onClick={header.column.getToggleSortingHandler()}
                            className="inline-flex items-center gap-1.5 text-left hover:text-white/70 transition-colors cursor-pointer"
                          >
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            <span className="w-3 text-[9px] text-white/30">
                              {sort === "asc" ? "Asc" : sort === "desc" ? "Desc" : ""}
                            </span>
                          </button>
                        )}
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>
            <tbody className="divide-y divide-white/[0.05]">
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-[12px] text-white/35 italic">
                    No members match &quot;{search}&quot;.
                  </td>
                </tr>
              ) : (
                pagedRows.map((row) => (
                  <tr key={row.id} className="hover:bg-white/[0.025] transition-colors">
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-4 py-2.5 text-[12px] whitespace-nowrap">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="flex flex-col gap-3 border-t border-white/[0.06] bg-white/[0.015] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[11px] text-white/35">
            Showing {filteredRows.length === 0 ? 0 : pagination.pageIndex * pagination.pageSize + 1}-
            {Math.min(filteredRows.length, (pagination.pageIndex + 1) * pagination.pageSize)} of {filteredRows.length.toLocaleString()} rows
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={pagination.pageSize}
              onChange={(e) => table.setPageSize(Number(e.target.value))}
              className="h-8 rounded-lg border border-white/[0.08] bg-white/[0.03] px-2 text-[11px] font-semibold text-white/55 focus:outline-none focus:border-white/25"
            >
              {[10, 20, 50].map((size) => (
                <option key={size} className="bg-[#101014]" value={size}>
                  {size} / page
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={!table.getCanPreviousPage()}
              onClick={() => table.previousPage()}
              className="h-8 rounded-lg border border-white/[0.08] px-3 text-[11px] font-semibold text-white/55 transition-colors hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
            >
              Previous
            </button>
            <span className="h-8 rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5 text-[11px] font-semibold text-white/55">
              {table.getState().pagination.pageIndex + 1} / {Math.max(1, table.getPageCount())}
            </span>
            <button
              type="button"
              disabled={!table.getCanNextPage()}
              onClick={() => table.nextPage()}
              className="h-8 rounded-lg border border-white/[0.08] px-3 text-[11px] font-semibold text-white/55 transition-colors hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
