"use client";

import { useEffect, useState } from "react";
import Badge from "@/components/ui/Badge";
import { Reveal, SectionLabel, useReveal, ParallaxLayer } from "./LandingHelpers";

// ═══════════════════════════════════════════════════════════
// SHARED — small count-up hook
// ═══════════════════════════════════════════════════════════

function useCountUp(target: number, enabled: boolean, duration = 1500) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min((now - t0) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 4);
      setCount(Math.round(eased * target));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [enabled, target, duration]);
  return count;
}

// ═══════════════════════════════════════════════════════════
// 1. MULTI-GUILD — cycle "active" row every 2.4s
// ═══════════════════════════════════════════════════════════

const GUILDS = [
  { name: "Mavis08", role: "GUILD_LEADER" },
  { name: "Dragz",   role: "OFFICER"      },
  { name: "Hou13",   role: "MEMBER"       },
];

function MultiGuildVisual() {
  const { ref, visible } = useReveal(0.2);
  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => {
    if (!visible) return;
    const id = setInterval(
      () => setActiveIdx((i) => (i + 1) % GUILDS.length),
      2400
    );
    return () => clearInterval(id);
  }, [visible]);

  return (
    <div ref={ref} className="mt-6 space-y-2">
      {GUILDS.map((g, i) => {
        const active = i === activeIdx;
        return (
          <div
            key={g.name}
            className="relative flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-500 overflow-hidden"
            style={{
              background: active ? "oklch(1 0 0 / 0.06)" : "oklch(1 0 0 / 0.02)",
              border: active ? "1px solid oklch(1 0 0 / 0.10)" : "1px solid oklch(1 0 0 / 0.04)",
              transform: active ? "translateX(0)" : "translateX(0) scale(0.985)",
            }}
          >
            {/* Active sweep highlight */}
            {active && (
              <div
                aria-hidden
                className="absolute inset-0 pointer-events-none"
                style={{
                  background:
                    "linear-gradient(90deg, transparent, oklch(1 0 0 / 0.06), transparent)",
                  animation: "shimmer 2.4s linear infinite",
                }}
              />
            )}
            <div className="relative h-7 w-7 rounded-md bg-white/[0.06] border border-white/10 flex items-center justify-center text-[11px] font-medium text-white/80">
              {g.name[0]}
            </div>
            <span className="relative text-xs text-white/85 flex-1">{g.name}</span>
            <div className="relative">
              <Badge role={g.role} size="sm" />
            </div>
            {active && (
              <span className="relative h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// 2. AUDIT LEDGER — rotating transaction feed (newest slides in)
// ═══════════════════════════════════════════════════════════

const TRANSACTIONS = [
  { type: "credit", label: "Logs request",      amount: "Completed", color: "text-emerald-400" },
  { type: "debit",  label: "Guild balance",     amount: "₱ 1,200",   color: "text-white"       },
  { type: "credit", label: "Attendance bonus",  amount: "+50 pts",   color: "text-white/70"    },
  { type: "credit", label: "Field boss kill",   amount: "+100 DKP",  color: "text-emerald-400" },
  { type: "debit",  label: "Bid won · Sword",   amount: "-450 DKP",  color: "text-red-300"     },
];

function AuditVisual() {
  const { ref, visible } = useReveal(0.2);
  const [items, setItems] = useState(TRANSACTIONS.slice(0, 3));
  const [feedIdx, setFeedIdx] = useState(3);

  useEffect(() => {
    if (!visible) return;
    const id = setInterval(() => {
      setItems((prev) => {
        const next = TRANSACTIONS[feedIdx % TRANSACTIONS.length]!;
        setFeedIdx((f) => f + 1);
        return [next, ...prev.slice(0, 2)];
      });
    }, 3200);
    return () => clearInterval(id);
  }, [visible, feedIdx]);

  return (
    <div ref={ref} className="mt-6 space-y-1.5">
      {items.map((t, i) => (
        <div
          key={`${t.label}-${feedIdx}-${i}`}
          className="flex items-center gap-2 px-3 py-2 rounded-md bg-white/[0.02] border border-white/[0.04] text-xs"
          style={
            i === 0
              ? { animation: "slide-down 0.5s cubic-bezier(0.16,1,0.3,1) both" }
              : undefined
          }
        >
          <div className={`h-1 w-1 rounded-full ${t.type === "credit" ? "bg-emerald-400" : "bg-red-400/80"}`} />
          <span className="text-white/55 flex-1">{t.label}</span>
          <span className={`font-medium tabular-nums ${t.color}`}>{t.amount}</span>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// 3. BOSS ALERTS — live countdown on Secreta
// ═══════════════════════════════════════════════════════════

function BossVisual() {
  const { ref, visible } = useReveal(0.2);
  const [seconds, setSeconds] = useState(259); // 04:19

  useEffect(() => {
    if (!visible) return;
    const id = setInterval(() => {
      setSeconds((s) => (s > 0 ? s - 1 : 600));
    }, 1000);
    return () => clearInterval(id);
  }, [visible]);

  const formatLiveTime = (s: number) => {
    const m = Math.floor(s / 60).toString().padStart(2, "0");
    const sec = (s % 60).toString().padStart(2, "0");
    return `00:${m}:${sec}`;
  };

  const isCritical = seconds < 60;

  return (
    <div ref={ref} className="mt-6 space-y-2">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] text-white/40 uppercase tracking-widest">Active spawns</span>
        <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/[0.08] text-red-300 border border-red-500/20 font-medium flex items-center gap-1">
          <span className="h-1 w-1 rounded-full bg-red-400 animate-ping" />
          LIVE
        </span>
      </div>
      {[
        { name: "Titore",  timer: "02:14:45", live: false },
        { name: "Secreta", timer: formatLiveTime(seconds), live: true },
        { name: "Baron",   timer: "05:40:12", live: false },
      ].map((boss, i) => (
        <div
          key={i}
          className="flex items-center justify-between px-3 py-2 rounded-md border text-xs transition-colors duration-500"
          style={{
            background: boss.live
              ? isCritical
                ? "oklch(0.62 0.18 22 / 0.10)"
                : "oklch(0.62 0.18 22 / 0.06)"
              : "oklch(1 0 0 / 0.02)",
            borderColor: boss.live
              ? isCritical
                ? "oklch(0.62 0.18 22 / 0.35)"
                : "oklch(0.62 0.18 22 / 0.20)"
              : "oklch(1 0 0 / 0.04)",
          }}
        >
          <div className="flex items-center gap-2">
            <span className={`h-1 w-1 rounded-full ${boss.live ? "bg-red-400 animate-ping" : "bg-white/30"}`} />
            <span className="text-white/80 font-medium">{boss.name}</span>
          </div>
          <span
            className={`font-mono tabular-nums ${
              boss.live ? (isCritical ? "text-red-200 font-semibold" : "text-red-300") : "text-white/55"
            }`}
          >
            {boss.timer}
          </span>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// 4. RBAC — staggered pulse wave through badges
// ═══════════════════════════════════════════════════════════

const ROLES = [
  "ADMIN", "ALLIANCE_LEADER", "GUILD_LEADER", "OFFICER",
  "CORE_MEMBER", "ELITE_MEMBER", "MEMBER", "RECRUIT",
];

function RbacVisual() {
  return (
    <div className="mt-6 flex flex-wrap gap-1.5">
      {ROLES.map((role, i) => (
        <div
          key={role}
          style={{ animation: `pulse-soft 3.6s ease-in-out ${i * 220}ms infinite` }}
        >
          <Badge role={role} size="sm" />
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// 5. LIVE ATTENDANCE
// ═══════════════════════════════════════════════════════════

const CHECK_INS = [
  { name: "Dragz",   action: "checked in",  time: "now" },
  { name: "Hou13",   action: "joined raid", time: "1m"  },
  { name: "Mavis08", action: "checked in",  time: "3m"  },
  { name: "Wiz",     action: "joined raid", time: "4m"  },
  { name: "Daylili", action: "checked in",  time: "6m"  },
];

function AttendanceVisual() {
  const { ref, visible } = useReveal(0.2);
  const [tick, setTick] = useState(0);
  const count = useCountUp(18, visible, 1400);

  useEffect(() => {
    if (!visible) return;
    const id = setInterval(() => setTick((t) => t + 1), 2200);
    return () => clearInterval(id);
  }, [visible]);

  const current = CHECK_INS[tick % CHECK_INS.length]!;

  return (
    <div ref={ref} className="mt-6 space-y-3.5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="relative inline-flex h-2 w-2">
            <span className="absolute inset-0 rounded-full bg-emerald-400 opacity-75 animate-ping" />
            <span className="relative h-2 w-2 rounded-full bg-emerald-400" />
          </span>
          <span className="text-[10px] text-emerald-300/90 uppercase tracking-[0.2em] font-medium">
            Live
          </span>
        </div>
        <span className="text-xs text-white/55 tabular-nums">
          <span className="text-white font-semibold">{count}</span>
          <span className="text-white/35"> / 24 present</span>
        </span>
      </div>

      {/* Progress */}
      <div className="space-y-1.5">
        <div className="relative h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
          <div
            className="h-full rounded-full"
            style={{
              width: visible ? "75%" : "0%",
              background: "linear-gradient(90deg, oklch(0.70 0.13 162 / 0.7), oklch(0.82 0.10 162))",
              transition: "width 1.6s cubic-bezier(0.16,1,0.3,1) 100ms",
              boxShadow: "0 0 12px oklch(0.70 0.13 162 / 0.35)",
            }}
          />
          <div
            className="absolute inset-y-0 w-1/3"
            style={{
              background:
                "linear-gradient(90deg, transparent, oklch(1 0 0 / 0.25), transparent)",
              animation: "shimmer 2.4s linear infinite",
            }}
          />
        </div>
        <div className="flex items-center justify-between text-[9px] text-white/35 uppercase tracking-[0.18em]">
          <span>Raid attendance</span>
          <span className="tabular-nums">75%</span>
        </div>
      </div>

      {/* 24 slots — staggered scale-in + pulse */}
      <div className="grid grid-cols-12 gap-1">
        {Array.from({ length: 24 }).map((_, i) => {
          const online = i < 18;
          return (
            <div
              key={i}
              className="relative aspect-square rounded-md flex items-center justify-center transition-all duration-500"
              style={{
                background: online ? "oklch(0.70 0.13 162 / 0.16)" : "oklch(1 0 0 / 0.02)",
                border: online
                  ? "1px solid oklch(0.70 0.13 162 / 0.35)"
                  : "1px solid oklch(1 0 0 / 0.04)",
                opacity: visible ? 1 : 0,
                transform: visible ? "scale(1)" : "scale(0.6)",
                transitionDelay: `${i * 22}ms`,
              }}
            >
              {online && (
                <div
                  className="h-1 w-1 rounded-full bg-emerald-400"
                  style={{ animation: `pulse-soft 2.4s ease-in-out ${i * 80}ms infinite` }}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Ticker */}
      <div className="relative rounded-md border border-white/[0.06] bg-white/[0.02] px-3 py-2 overflow-hidden h-9">
        <div
          key={tick}
          className="flex items-center gap-2 text-xs h-full"
          style={{ animation: "slide-up 0.45s cubic-bezier(0.16,1,0.3,1) both" }}
        >
          <div className="h-4 w-4 rounded-full bg-gradient-to-br from-white/30 to-white/10 shrink-0 flex items-center justify-center text-[8px] font-semibold text-white/80">
            {current.name[0]}
          </div>
          <span className="text-white/85 font-medium">{current.name}</span>
          <span className="text-white/45">{current.action}</span>
          <span className="ml-auto text-white/35 font-mono text-[10px]">{current.time}</span>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// 6. GUILD POINTS — animated bars + count-up numbers
// ═══════════════════════════════════════════════════════════

const POINTS_MEMBERS = [
  { name: "Dragz", pts: 8450, pct: 100 },
  { name: "Wiz",   pts: 6200, pct: 73  },
  { name: "Hou13", pts: 4100, pct: 48  },
];

function PointsRow({
  name,
  pts,
  pct,
  index,
  visible,
}: {
  name: string;
  pts: number;
  pct: number;
  index: number;
  visible: boolean;
}) {
  const value = useCountUp(pts, visible, 1500 + index * 180);
  return (
    <div className="flex items-center gap-3 text-xs">
      <span className="text-white/60 w-16 truncate">{name}</span>
      <div className="flex-1 h-1 rounded-full bg-white/[0.06] overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-white/70 to-white/40"
          style={{
            width: visible ? `${pct}%` : "0%",
            transition: `width 1.6s cubic-bezier(0.16,1,0.3,1) ${index * 180}ms`,
          }}
        />
      </div>
      <span className="text-white/80 font-medium tabular-nums w-12 text-right">
        {value.toLocaleString()}
      </span>
    </div>
  );
}

function GuildPointsVisual() {
  const { ref, visible } = useReveal(0.2);
  return (
    <div ref={ref} className="mt-6 space-y-2.5">
      {POINTS_MEMBERS.map((m, i) => (
        <PointsRow key={m.name} {...m} index={i} visible={visible} />
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// 7. DKP BIDDING — live countdown + bumping bid
// ═══════════════════════════════════════════════════════════

function BiddingVisual() {
  const { ref, visible } = useReveal(0.2);
  const [time, setTime] = useState(45);
  const [bid, setBid] = useState(450);
  const [bidKey, setBidKey] = useState(0);

  useEffect(() => {
    if (!visible) return;
    const id = setInterval(() => {
      setTime((t) => {
        if (t <= 1) {
          setBid(450 + Math.floor(Math.random() * 6) * 25);
          setBidKey((k) => k + 1);
          return 60;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    const id = setInterval(() => {
      setBid((b) => b + 25 + Math.floor(Math.random() * 75));
      setBidKey((k) => k + 1);
    }, 4200);
    return () => clearInterval(id);
  }, [visible]);

  const isClose = time < 10;

  return (
    <div ref={ref} className="mt-6 rounded-lg border border-white/[0.05] bg-white/[0.02] p-3 space-y-3">
      <div className="flex items-center justify-between text-xs pb-3 border-b border-white/[0.04]">
        <div className="flex items-center gap-2">
          <span className="h-1 w-1 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-white/55">Raid attendance</span>
        </div>
        <span className="text-emerald-400 font-medium tabular-nums">96%</span>
      </div>
      <div>
        <div className="flex items-center justify-between text-[10px] text-white/35 mb-1.5">
          <span>Auction · Greatsword</span>
          <span
            className={`font-mono tabular-nums transition-colors ${
              isClose ? "text-red-300" : "text-white/60"
            }`}
          >
            00:{time.toString().padStart(2, "0")}s
          </span>
        </div>
        <div className="flex items-center justify-between text-xs bg-white/[0.04] px-3 py-2 rounded-md border border-white/[0.06]">
          <span className="text-white/80">Dragz (lead)</span>
          <span
            key={bidKey}
            className="text-white font-semibold tabular-nums"
            style={{ animation: "scale-in 0.45s cubic-bezier(0.16,1,0.3,1) both" }}
          >
            {bid} DKP
          </span>
        </div>
        {/* Time bar */}
        <div className="mt-2 h-0.5 rounded-full bg-white/[0.05] overflow-hidden">
          <div
            className="h-full rounded-full"
            style={{
              width: `${(time / 60) * 100}%`,
              background: isClose ? "oklch(0.62 0.18 22)" : "oklch(0.78 0.024 78)",
              transition: "width 1s linear, background 0.3s",
            }}
          />
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// FEATURES DATA
// ═══════════════════════════════════════════════════════════

const FEATURES = [
  {
    title: "Multi-guild orchestration",
    desc: "One account. Unlimited guilds. Fully isolated balances, roles, and audit trails per faction.",
    wide: true,
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
      </svg>
    ),
    visual: <MultiGuildVisual />,
  },
  {
    title: "Immutable audit ledger",
    desc: "Append-only history. Every transaction permanently logged — tamper-proof and auditable.",
    wide: false,
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
        <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
      </svg>
    ),
    visual: <AuditVisual />,
  },
  {
    title: "Real-time boss alerts",
    desc: "Precise countdown timers and instant push notifications. Never miss a spawn.",
    wide: false,
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    ),
    visual: <BossVisual />,
  },
  {
    title: "Role-based access control",
    desc: "Granular permissions from Admin to Recruit. Each tier unlocks exactly what it needs.",
    wide: true,
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ),
    visual: <RbacVisual />,
  },
  {
    title: "Live guild attendance",
    desc: "Real-time check-ins and raid roll-call. Watch who's online, who's late, who's locked in.",
    wide: false,
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 11h-6M20 8v6" />
      </svg>
    ),
    visual: <AttendanceVisual />,
  },
  {
    title: "Fair guild points",
    desc: "Track attendance and contribution. Rank members by engagement — automatically.",
    wide: false,
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
      </svg>
    ),
    visual: <GuildPointsVisual />,
  },
  {
    title: "Smart DKP bidding",
    desc: "Discord-connected attendance and transparent bidding for raid loot.",
    wide: false,
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2" />
        <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
        <path d="M9 14l2 2 4-4" />
      </svg>
    ),
    visual: <BiddingVisual />,
  },
];

// Per-card scroll-translation speeds — small magnitudes, staggered
const SCROLL_SPEEDS = [0.04, -0.06, 0.05, -0.04, 0.06, -0.05, 0.05];

export default function Features() {
  return (
    <section id="features" className="py-32 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <Reveal className="text-center mb-20">
          <SectionLabel>Features</SectionLabel>
          <h2 className="mt-6 text-4xl sm:text-5xl lg:text-[56px] leading-[1.05] font-semibold text-white tracking-[-0.022em] max-w-3xl mx-auto">
            Everything your guild needs.
            <span className="block text-white/40">Nothing it doesn&apos;t.</span>
          </h2>
          <p className="mt-6 text-base text-white/50 max-w-xl mx-auto leading-relaxed">
            Purpose-built for gaming guilds — not a spreadsheet, not a Discord bot.
          </p>
        </Reveal>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-white/[0.05] rounded-2xl overflow-hidden border border-white/[0.06]">
          {FEATURES.map((feature, i) => (
            <ParallaxLayer
              key={feature.title}
              speed={SCROLL_SPEEDS[i] ?? 0.04}
              className={`bg-[#0b0b0d] ${feature.wide ? "md:col-span-2" : ""}`}
            >
              <Reveal delay={i * 60}>
                <div className="relative p-7 lg:p-8 h-full group transition-colors hover:bg-white/[0.015]">
                  {/* Icon row */}
                  <div className="flex items-center gap-3 mb-5">
                    <div className="h-9 w-9 rounded-md border border-white/[0.10] bg-white/[0.03] flex items-center justify-center text-white/80 transition-all duration-500 group-hover:border-white/20 group-hover:bg-white/[0.06] group-hover:text-white">
                      {feature.icon}
                    </div>
                    <span className="text-[10px] uppercase tracking-[0.2em] text-white/35 font-mono">
                      0{i + 1}
                    </span>
                  </div>

                  <h3 className="text-lg font-semibold text-white tracking-tight mb-2">
                    {feature.title}
                  </h3>
                  <p className="text-sm text-white/50 leading-relaxed max-w-sm">
                    {feature.desc}
                  </p>

                  {feature.visual}
                </div>
              </Reveal>
            </ParallaxLayer>
          ))}
        </div>
      </div>
    </section>
  );
}
