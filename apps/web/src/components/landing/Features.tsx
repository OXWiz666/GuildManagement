"use client";

import { useEffect, useState } from "react";
import Badge from "@/components/ui/Badge";
import { Reveal, SpotlightCard } from "./LandingHelpers";

// ═══════════════════════════════════════════════════════════
// INLINE FEATURES VISUAL COMPONENTS
// ═══════════════════════════════════════════════════════════

// 1. MEMBER MANAGEMENT
function MemberManagementVisual() {
  const members = [
    { name: "Dragz", role: "GUILD_LEADER", class: "Bow", online: true },
    { name: "Wiz", role: "OFFICER", class: "Staff", online: true },
    { name: "Hou13", role: "CORE_MEMBER", class: "Greatsword", online: false },
  ];
  return (
    <div className="mt-5 space-y-2 select-none">
      {members.map((m) => (
        <div key={m.name} className="flex items-center justify-between px-3 py-2 rounded-lg border border-white/[0.04] bg-white/[0.01] text-[11px] transition-colors hover:border-[#d4a853]/25 hover:bg-white/[0.03]">
          <div className="flex items-center gap-2">
            <span className={`h-1.5 w-1.5 rounded-full ${m.online ? "bg-[#10D99A] shadow-[0_0_6px_#10D99A]" : "bg-white/25"}`} />
            <span className="font-bold text-white/80">{m.name}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/[0.04] text-white/40 uppercase font-mono">{m.class}</span>
            <Badge role={m.role} size="sm" />
          </div>
        </div>
      ))}
    </div>
  );
}

// 2. BOSS ROTATION
function BossRotationVisual() {
  const [activeIdx, setActiveIdx] = useState(0);
  const queue = ["VALHALLA", "BZDK", "SAUSAGE"];

  useEffect(() => {
    const id = setInterval(() => {
      setActiveIdx((i) => (i + 1) % queue.length);
    }, 2800);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="mt-5 space-y-2 select-none">
      <span className="text-[8px] font-extrabold uppercase tracking-widest text-[#f5c542] block">Current Priority Queue</span>
      {queue.map((q, idx) => {
        const active = idx === activeIdx;
        return (
          <div
            key={q}
            className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs transition-all duration-300 border ${
              active
                ? "bg-[#d4a853]/10 border-[#d4a853]/35 text-[#f5c542] shadow-[0_0_12px_rgba(212,168,83,0.08)]"
                : "bg-white/[0.01] border-white/[0.04] text-white/40"
            }`}
          >
            <span className="font-semibold">{idx + 1}. {q}</span>
            {active && (
              <span className="text-[8px] font-extrabold uppercase tracking-widest px-1.5 py-0.5 bg-[#f5c542]/20 border border-[#f5c542]/30 rounded">
                Active Claim
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// 3. BOSS SCHEDULE
function BossScheduleVisual() {
  const spawns = [
    { name: "Titore", zone: "Deadman 2F", time: "READY", live: true },
    { name: "Catena", zone: "Deadman 3F", time: "02h 14m", live: false },
    { name: "Ego", zone: "Ulan Canyon", time: "05h 40m", live: false },
  ];
  return (
    <div className="mt-5 space-y-2 select-none">
      {spawns.map((s) => (
        <div key={s.name} className="flex items-center justify-between px-3 py-2 rounded-lg border border-white/[0.04] bg-white/[0.01] text-[11px]">
          <div className="flex items-center gap-2">
            <span className={`h-1.5 w-1.5 rounded-full ${s.live ? "bg-red-500 animate-pulse" : "bg-white/20"}`} />
            <div>
              <span className="font-bold text-white/80 block">{s.name}</span>
              <span className="text-[9px] text-white/35 block font-mono">{s.zone}</span>
            </div>
          </div>
          <span className={`font-mono font-bold text-xs ${s.live ? "text-red-400" : "text-white/60"}`}>
            {s.time}
          </span>
        </div>
      ))}
    </div>
  );
}

// 4. ATTENDANCE SYSTEM
function AttendanceVisual() {
  return (
    <div className="mt-5 space-y-3.5 select-none">
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-white/50">Raider check-ins</span>
        <span className="font-mono text-emerald-400 font-bold">92% Average</span>
      </div>
      <div className="relative h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
        <div className="h-full rounded-full bg-gradient-to-r from-[#10D99A]/80 to-[#10D99A]" style={{ width: "92%" }} />
      </div>
      {/* Visual representation of checked-in grid */}
      <div className="grid grid-cols-8 gap-1 pt-1">
        {Array.from({ length: 16 }).map((_, i) => (
          <div
            key={i}
            className={`aspect-square rounded border transition-all ${
              i < 13
                ? "bg-[#10D99A]/15 border-[#10D99A]/40"
                : "bg-white/[0.02] border-white/[0.06]"
            }`}
          />
        ))}
      </div>
    </div>
  );
}

// 5. GUILD POINTS TRACKING
function PointsVisual() {
  const standings = [
    { name: "Dragz", dkp: 8450, pct: 100 },
    { name: "Wiz", dkp: 6200, pct: 73 },
    { name: "Hou13", dkp: 4100, pct: 48 },
  ];
  return (
    <div className="mt-5 space-y-2.5 select-none">
      {standings.map((s) => (
        <div key={s.name} className="space-y-1">
          <div className="flex justify-between text-[11px]">
            <span className="text-white/70 font-semibold">{s.name}</span>
            <span className="text-[#f5c542] font-mono font-bold">{s.dkp} GP</span>
          </div>
          <div className="h-1 rounded-full bg-white/[0.05] overflow-hidden">
            <div className="h-full bg-gradient-to-r from-[#d4a853] to-[#f5c542]" style={{ width: `${s.pct}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// 6. TREASURY & PAYOUTS
function TreasuryVisual() {
  return (
    <div className="mt-5 space-y-3 select-none">
      <div className="rounded-lg border border-white/[0.05] bg-white/[0.02] p-2.5">
        <span className="text-[7.5px] uppercase tracking-wider text-white/35 font-mono">Treasury Wallet Balance</span>
        <div className="flex items-baseline gap-2 mt-1">
          <span className="text-lg font-bold text-white font-mono">₱ 25,450.00</span>
          <span className="text-[9px] text-[#10D99A] font-bold">+₱ 1,080.00 Split</span>
        </div>
      </div>
      <div className="flex items-center justify-between text-[10px] text-white/50 border-t border-white/[0.04] pt-2">
        <span>GCash Payout Gateway</span>
        <span className="text-emerald-400 font-bold uppercase tracking-wider font-mono">Verified</span>
      </div>
    </div>
  );
}

// 7. AUDIT LOGS
function AuditLogsVisual() {
  const logs = [
    { action: "Boss Kill logged Titore", hash: "0x8f3a", time: "2m ago" },
    { action: "Treasury payout to Wiz", hash: "0x7a2d", time: "15m ago" },
  ];
  return (
    <div className="mt-5 space-y-2 select-none">
      {logs.map((l, i) => (
        <div key={i} className="p-2 rounded bg-white/[0.01] border border-white/[0.03] text-[10px] flex items-center justify-between font-mono">
          <div className="min-w-0">
            <span className="text-white/60 block truncate">{l.action}</span>
            <span className="text-white/30 block text-[8px]">{l.hash} · Encrypted</span>
          </div>
          <span className="text-white/35 shrink-0 text-right">{l.time}</span>
        </div>
      ))}
    </div>
  );
}

// 8. OFFICER & LEADER TOOLS
function LeaderToolsVisual() {
  return (
    <div className="mt-5 space-y-2 select-none text-[11px]">
      <div className="flex items-center justify-between p-2 rounded bg-white/[0.01] border border-white/[0.03]">
        <span className="text-white/70">Raid Lock Status</span>
        <span className="h-2 w-7 rounded-full bg-[#10D99A]/20 border border-[#10D99A]/30 flex items-center px-0.5">
          <span className="h-1.5 w-1.5 rounded-full bg-[#10D99A] translate-x-4.5" />
        </span>
      </div>
      <div className="flex items-center justify-between p-2 rounded bg-white/[0.01] border border-white/[0.03]">
        <span className="text-white/70">Activity Points Multiplier</span>
        <span className="font-bold text-[#f5c542] font-mono text-[10px]">1.5</span>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// MAIN FEATURES COMPONENT
// ═══════════════════════════════════════════════════════════

// Bento composition — 8 tiles arranged with rhythm (3 / 2 / 3 across three
// rows on a 6-col grid). `span` sets the desktop column width so the grid
// breathes instead of reading as eight identical cards.
type FeatureTile = {
  title: string;
  desc: string;
  visual: React.ReactNode;
  span: string;
  feature?: boolean;
  icon: React.ReactNode;
};

const FEATURES: FeatureTile[] = [
  {
    title: "Member Management",
    desc: "Profiles, class, and role tiers for the whole roster in one place.",
    visual: <MemberManagementVisual />,
    span: "lg:col-span-2",
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
      </svg>
    ),
  },
  {
    title: "Smart Boss Rotations",
    desc: "Priority queues cycle upcoming claims so loot stays fair.",
    visual: <BossRotationVisual />,
    span: "lg:col-span-2",
    icon: (
      <svg
        className="block h-5 w-5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M7 7h5V2" />
        <path d="M17 17h-5v5" />
        <path d="M17.66 6.34A8 8 0 0 0 7 7" />
        <path d="M6.34 17.66A8 8 0 0 0 17 17" />
      </svg>
    ),
  },
  {
    title: "Live Spawn Scheduling",
    desc: "Countdown timers, respawn windows, and field locations, live.",
    visual: <BossScheduleVisual />,
    span: "lg:col-span-2",
    feature: true,
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    ),
  },
  {
    title: "Attendance Code Verifications",
    desc: "Random passcode check-ins turn raid turnout into fair, tamper-proof guild points.",
    visual: <AttendanceVisual />,
    span: "lg:col-span-3",
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    title: "Guild Points Ledger",
    desc: "Reward engagement automatically with points synced to participation logs.",
    visual: <PointsVisual />,
    span: "lg:col-span-3",
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
      </svg>
    ),
  },
  {
    title: "Guild Treasury",
    desc: "Balance logs, fair payouts, and member item auctions.",
    visual: <TreasuryVisual />,
    span: "lg:col-span-2",
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="2" y="4" width="20" height="16" rx="2" />
        <line x1="12" y1="4" x2="12" y2="20" />
      </svg>
    ),
  },
  {
    title: "Verifiable Audit History",
    desc: "Append-only logs stamped with hash signatures. Nothing gets rewritten.",
    visual: <AuditLogsVisual />,
    span: "lg:col-span-2",
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
      </svg>
    ),
  },
  {
    title: "Command Console Tools",
    desc: "Officer overrides, raid locks, and multiplier controls.",
    visual: <LeaderToolsVisual />,
    span: "lg:col-span-2",
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
      </svg>
    ),
  },
];

export default function Features() {
  return (
    <section id="features" className="relative bg-[#050608] py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">

        {/* Section header — headline only, no eyebrow */}
        <Reveal className="mb-16 max-w-3xl">
          <h2 className="font-fantasy text-4xl font-semibold tracking-[-0.022em] text-white sm:text-5xl">
            Every guild system,
            <br className="hidden sm:block" /> <span className="text-gold-sheen">one keep.</span>
          </h2>
          <p className="mt-5 max-w-lg text-[15px] leading-relaxed text-[#8B8F98]">
            Retire the tangle of spreadsheets and Discord pins. Boss timers,
            attendance, points, and treasury run from a single, audited dashboard.
          </p>
        </Reveal>

        {/* Bento grid */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-6">
          {FEATURES.map((feature, i) => (
            <Reveal key={feature.title} delay={(i % 3) * 90} from="morph" className={`h-full ${feature.span}`}>
              <SpotlightCard
                className={`group card-obsidian flex h-full flex-col justify-between rounded-2xl p-6 transition-all duration-300 hover:-translate-y-1 hover:border-[#d4a853]/25 hover:shadow-[0_16px_40px_-12px_rgba(212,168,83,0.12)] ${
                  feature.feature ? "edge-forge" : ""
                }`}
              >
                {feature.feature && (
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-0 rounded-2xl"
                    style={{ background: "radial-gradient(ellipse 80% 60% at 50% 0%, rgba(212,168,83,0.07), transparent 65%)" }}
                  />
                )}

                <div className="relative">
                  <div className="mb-4 flex items-center justify-between">
                    <div className="grid h-10 w-10 place-items-center rounded-xl border border-[#d4a853]/15 bg-white/[0.02] text-[#f5c542] transition-all duration-300 group-hover:border-[#d4a853]/40 group-hover:bg-[#d4a853]/[0.06]">
                      {feature.icon}
                    </div>
                    <span className="font-mono text-[9px] font-bold text-white/20">0{i + 1}</span>
                  </div>

                  <h3 className="mb-1.5 text-[15px] font-bold tracking-tight text-white transition-colors group-hover:text-[#f5c542]">
                    {feature.title}
                  </h3>
                  <p className="max-w-sm text-[13px] leading-relaxed text-[#8B8F98]">
                    {feature.desc}
                  </p>
                </div>

                <div className="relative mt-5 border-t border-white/[0.04] pt-4">
                  {feature.visual}
                </div>
              </SpotlightCard>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
