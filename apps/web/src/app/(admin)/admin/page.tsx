"use client";

import { adminApi, type OverviewSeriesPoint, type PlatformOverview } from "@/lib/api";
import { useQuery } from "@/lib/query";
import { Skeleton } from "@/components/ui/Skeleton";

// ─── Sparkline (self-contained SVG, no chart dependency) ──────────────
function Sparkline({ data, color = "var(--forge-gold-bright)" }: { data: OverviewSeriesPoint[]; color?: string }) {
  const w = 320;
  const h = 64;
  const pad = 4;
  const values = data.map((d) => d.value);
  const max = Math.max(1, ...values);
  const stepX = data.length > 1 ? (w - pad * 2) / (data.length - 1) : 0;
  const y = (v: number) => h - pad - (v / max) * (h - pad * 2);
  const pts = data.map((d, i) => [pad + i * stepX, y(d.value)] as const);
  const line = pts.map(([x, yy], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${yy.toFixed(1)}`).join(" ");
  const area = `${line} L${pad + (data.length - 1) * stepX},${h - pad} L${pad},${h - pad} Z`;
  const total = values.reduce((a, b) => a + b, 0);

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" preserveAspectRatio="none" aria-hidden>
      {total > 0 && <path d={area} fill={color} opacity={0.08} />}
      <path d={line} fill="none" stroke={color} strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function num(n: number) {
  return n.toLocaleString();
}

// ─── Stat card ────────────────────────────────────────────────────────
function StatCard({
  label,
  value,
  sub,
  soon,
}: {
  label: string;
  value: string;
  sub?: string;
  soon?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-[#0c0d12]/50 p-4 backdrop-blur">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/40">{label}</p>
        {soon && (
          <span className="rounded bg-white/[0.04] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white/30">
            Phase 4
          </span>
        )}
      </div>
      <p className={`mt-2 text-2xl font-black tracking-tight ${soon ? "text-white/30" : "text-white"}`}>{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-white/40">{sub}</p>}
    </div>
  );
}

function ChartCard({ title, series, color }: { title: string; series: OverviewSeriesPoint[]; color?: string }) {
  const total = series.reduce((a, b) => a + b.value, 0);
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-[#0c0d12]/50 p-4 backdrop-blur">
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="text-sm font-bold text-white">{title}</h3>
        <span className="font-mono text-xs text-white/45">{num(total)} total</span>
      </div>
      <Sparkline data={series} color={color} />
      <div className="mt-2 flex justify-between text-[10px] text-white/30">
        <span>{series[0]?.date}</span>
        <span>{series[series.length - 1]?.date}</span>
      </div>
    </div>
  );
}

export default function AdminOverviewPage() {
  const { data, isLoading } = useQuery<PlatformOverview | null>(
    "admin_overview",
    async () => {
      const res = await adminApi.getOverview();
      return res.success && res.data ? res.data : null;
    },
    { staleTime: 30000 },
  );

  const c = data?.cards;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-[var(--forge-gold-bright)]">Super Admin</p>
        <h1 className="mt-1 text-2xl font-black tracking-tight text-white">Platform Overview</h1>
        <p className="mt-1 text-sm text-white/50">Live metrics across the whole platform.</p>
      </div>

      {isLoading && !data ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : !c ? (
        <div className="rounded-2xl border border-dashed border-white/[0.08] py-16 text-center text-sm text-white/40">
          Could not load platform metrics.
        </div>
      ) : (
        <>
          {/* Real metrics */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Total Users" value={num(c.totalUsers)} sub="Registered accounts" />
            <StatCard label="Active Today" value={num(c.activeUsersToday)} sub="Users active in last 24h" />
            <StatCard label="Online Now" value={num(c.onlineUsers)} sub="Active in last 5 min" />
            <StatCard label="Active Sessions" value={num(c.activeSessions)} sub="Sessions in last 24h" />
            <StatCard label="Total Guilds" value={num(c.totalGuilds)} sub={`${num(c.activeGuilds)} active`} />
            <StatCard label="Active Guilds" value={num(c.activeGuilds)} sub="Not suspended/deleted" />
            <StatCard label="Audit Events Today" value={num(c.auditEventsToday)} sub="Logged actions" />
            <StatCard label="Premium Guilds" value="—" sub="Billing not configured" soon />
          </div>

          {/* Billing (not configured until Phase 4) */}
          <div>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-white/35">Billing · not configured</p>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard label="Total Revenue" value="—" soon />
              <StatCard label="Monthly Revenue" value="—" soon />
              <StatCard label="Active Subscriptions" value="—" soon />
              <StatCard label="Pending / Failed" value="—" soon />
            </div>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            <ChartCard title="User Growth · 30d" series={data.charts.userGrowth} />
            <ChartCard title="Guild Growth · 30d" series={data.charts.guildGrowth} color="#7dd3fc" />
            <ChartCard title="Login Activity · 14d" series={data.charts.loginActivity} color="#a5b4fc" />
          </div>

          <p className="text-right text-[10px] text-white/25">
            Updated {data.generatedAt ? new Date(data.generatedAt).toLocaleTimeString() : ""}
          </p>
        </>
      )}
    </div>
  );
}
