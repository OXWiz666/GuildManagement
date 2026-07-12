"use client";

import { adminApi, type OverviewSeriesPoint, type PlatformOverview } from "@/lib/api";
import { useQuery } from "@/lib/query";
import { Skeleton } from "@/components/ui/Skeleton";

// ─── Sparkline (self-contained SVG, no chart dependency) ──────────────
function Sparkline({ data, color = "var(--forge-gold-bright)", id }: { data: OverviewSeriesPoint[]; color?: string; id: string }) {
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
  const last = pts[pts.length - 1];

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id={`spark-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.22} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      {total > 0 && <path d={area} fill={`url(#spark-${id})`} />}
      <path d={line} fill="none" stroke={color} strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />
      {total > 0 && last && <circle cx={last[0]} cy={last[1]} r={2.4} fill={color} />}
    </svg>
  );
}

function num(n: number) {
  return n.toLocaleString();
}

// ─── Icons ────────────────────────────────────────────────────────────
type IconProps = { className?: string };
const I = {
  users: (p: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13A4 4 0 0 1 16 11" /></svg>
  ),
  pulse: (p: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg>
  ),
  dot: (p: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="3" fill="currentColor" /></svg>
  ),
  key: (p: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="7.5" cy="15.5" r="4.5" /><path d="M10.5 12.5L21 2M16 7l3 3M14 9l3 3" /></svg>
  ),
  shield: (p: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
  ),
  activity: (p: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M9 13h6M9 17h4" /></svg>
  ),
  crown: (p: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M3 7l4 5 5-7 5 7 4-5v11H3z" /></svg>
  ),
};

// ─── Stat card ────────────────────────────────────────────────────────
function StatCard({
  label,
  value,
  sub,
  icon,
  accent = "var(--forge-gold-bright)",
  soon,
  delay = 0,
}: {
  label: string;
  value: string;
  sub?: string;
  icon?: (p: IconProps) => React.ReactNode;
  accent?: string;
  soon?: boolean;
  delay?: number;
}) {
  const IconEl = icon;
  return (
    <div
      className="group animate-slide-up relative overflow-hidden rounded-2xl border border-white/[0.06] bg-[#0c0d12]/60 p-4 backdrop-blur transition-all duration-300 hover:-translate-y-0.5 hover:border-white/[0.12]"
      style={{ animationDelay: `${delay}ms` }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-100"
        style={{ background: soon ? "transparent" : accent }}
      />
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/40">{label}</p>
        {soon ? (
          <span className="rounded bg-white/[0.04] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white/30">
            Phase 4
          </span>
        ) : IconEl ? (
          <span
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/[0.06] bg-white/[0.03]"
            style={{ color: accent }}
          >
            <IconEl className="h-3.5 w-3.5" />
          </span>
        ) : null}
      </div>
      <p className={`mt-2 text-2xl font-black tracking-tight tabular-nums ${soon ? "text-white/30" : "text-white"}`}>{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-white/40">{sub}</p>}
    </div>
  );
}

function ChartCard({ title, series, color, id }: { title: string; series: OverviewSeriesPoint[]; color?: string; id: string }) {
  const total = series.reduce((a, b) => a + b.value, 0);
  return (
    <div className="animate-slide-up rounded-2xl border border-white/[0.06] bg-[#0c0d12]/60 p-4 backdrop-blur transition-colors duration-300 hover:border-white/[0.12]">
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="text-sm font-bold text-white">{title}</h3>
        <span className="font-mono text-xs text-white/45">{num(total)} total</span>
      </div>
      <Sparkline data={series} color={color} id={id} />
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
      {/* Hero header */}
      <div className="animate-slide-up relative overflow-hidden rounded-2xl border border-white/[0.07] bg-gradient-to-br from-[var(--forge-gold)]/[0.08] via-[#0c0d12]/60 to-[#0c0d12]/60 p-5 backdrop-blur">
        <span
          aria-hidden
          className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full opacity-40 blur-3xl"
          style={{ background: "radial-gradient(circle, rgba(212,168,83,0.35), transparent 70%)" }}
        />
        <div className="relative flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-[var(--forge-gold-bright)]">Command Center</p>
            <h2 className="mt-1 text-2xl font-black tracking-tight text-white">Platform Overview</h2>
            <p className="mt-1 text-sm text-white/50">Live metrics across every guild, user, and session.</p>
          </div>
          {data?.generatedAt && (
            <div className="flex items-center gap-2 rounded-xl border border-white/[0.06] bg-black/20 px-3 py-2">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
              </span>
              <span className="text-[11px] text-white/50">
                Live · updated {new Date(data.generatedAt).toLocaleTimeString()}
              </span>
            </div>
          )}
        </div>
      </div>

      {isLoading && !data ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full animate-pulse rounded-2xl" />
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
            <StatCard label="Total Users" value={num(c.totalUsers)} sub="Registered accounts" icon={I.users} delay={0} />
            <StatCard label="Active Today" value={num(c.activeUsersToday)} sub="Active in last 24h" icon={I.pulse} accent="#7dd3fc" delay={40} />
            <StatCard label="Online Now" value={num(c.onlineUsers)} sub="Active in last 5 min" icon={I.dot} accent="#34d399" delay={80} />
            <StatCard label="Active Sessions" value={num(c.activeSessions)} sub="Sessions in last 24h" icon={I.key} accent="#a5b4fc" delay={120} />
            <StatCard label="Total Guilds" value={num(c.totalGuilds)} sub={`${num(c.activeGuilds)} active`} icon={I.shield} delay={160} />
            <StatCard label="Active Guilds" value={num(c.activeGuilds)} sub="Not suspended/deleted" icon={I.shield} accent="#34d399" delay={200} />
            <StatCard label="Audit Events Today" value={num(c.auditEventsToday)} sub="Logged actions" icon={I.activity} accent="#a5b4fc" delay={240} />
            <StatCard label="Premium Guilds" value="—" sub="Billing not configured" icon={I.crown} soon delay={280} />
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
            <ChartCard title="User Growth · 30d" series={data.charts.userGrowth} id="users" />
            <ChartCard title="Guild Growth · 30d" series={data.charts.guildGrowth} color="#7dd3fc" id="guilds" />
            <ChartCard title="Login Activity · 14d" series={data.charts.loginActivity} color="#a5b4fc" id="logins" />
          </div>
        </>
      )}
    </div>
  );
}
