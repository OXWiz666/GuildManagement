"use client";

import { useEffect, useRef, useState } from "react";
import { Reveal, SectionLabel } from "./LandingHelpers";

// ═══════════════════════════════════════════════════════════
// HIGH-FIDELITY SCENES INSIDE VIDEO MOCKUP
// ═══════════════════════════════════════════════════════════

// Scene 1: Guild Creation
function OnboardScene({ active }: { active: boolean }) {
  return (
    <div className="absolute inset-0 bg-[#0B0D10] flex flex-col justify-center px-8 py-6 select-none overflow-hidden">
      <div className="absolute inset-0 opacity-20 bg-grid" />
      <div className="absolute inset-0" style={{
        background: "radial-gradient(ellipse at 50% 50%, rgba(245,158,11,0.06) 0%, transparent 75%)",
      }} />

      <div className="relative space-y-3 max-w-xs mx-auto">
        <span className="text-[8px] font-bold text-[#f5c542] uppercase tracking-[0.2em] block">STEP 01: GUILD CONFIGURATION</span>
        <h4 className="text-sm font-bold text-white tracking-wide">Set Up Guild</h4>
        
        <div className="space-y-2.5">
          {[
            { label: "Guild Title", val: "Kurakortz" },
            { label: "Raid Region", val: "PH-East (Asia)" },
          ].map((f, i) => (
            <div
              key={f.label}
              className="rounded-lg border border-white/[0.05] bg-black/40 p-2.5"
              style={active ? { animation: `slide-up 0.5s cubic-bezier(0.16,1,0.3,1) ${0.3 + i * 0.3}s both` } : { opacity: 0 }}
            >
              <div className="text-[7.5px] uppercase tracking-wider text-white/35 font-mono">{f.label}</div>
              <span className="text-xs font-bold text-white/80 block mt-0.5">{f.val}</span>
            </div>
          ))}
          <div
            className="h-8 rounded-lg bg-gradient-to-r from-[#d4a853] to-[#f5c542] text-black text-[10.5px] font-bold flex items-center justify-center shadow-[0_0_12px_rgba(212,168,83,0.2)] hover:opacity-90"
            style={active ? { animation: "scale-in 0.4s cubic-bezier(0.16,1,0.3,1) 1s both" } : { opacity: 0 }}
          >
            Create Guild Workspace →
          </div>
        </div>
      </div>
    </div>
  );
}

// Scene 2: Member Invites
function InviteScene({ active }: { active: boolean }) {
  const invites = [
    { name: "Dragz", role: "Leader", status: "Joined" },
    { name: "Wiz", role: "Officer", status: "Joined" },
    { name: "Mavis08", role: "Officer", status: "Pending" },
  ];
  return (
    <div className="absolute inset-0 bg-[#0B0D10] flex flex-col justify-center px-8 py-6 select-none overflow-hidden">
      <div className="absolute inset-0 opacity-20 bg-grid" />
      <div className="absolute inset-0" style={{
        background: "radial-gradient(circle 250px at 50% 50%, rgba(16,217,154,0.04) 0%, transparent 100%)",
      }} />

      <div className="relative space-y-3 max-w-xs mx-auto w-full">
        <span className="text-[8px] font-bold text-[#10D99A] uppercase tracking-[0.2em] block">STEP 02: GUILD MEMBER </span>
        <h4 className="text-sm font-bold text-white tracking-wide">Invite Online Members</h4>

        <div className="space-y-2">
          {invites.map((inv, i) => (
            <div
              key={inv.name}
              className="flex items-center justify-between p-2 rounded-lg border border-white/[0.04] bg-black/40 text-xs"
              style={active ? { animation: `slide-up 0.5s cubic-bezier(0.16,1,0.3,1) ${0.2 + i * 0.25}s both` } : { opacity: 0 }}
            >
              <div className="flex items-center gap-2">
                <span className="h-5 w-5 rounded-full bg-white/[0.03] border border-white/10 flex items-center justify-center text-[10px] text-white font-bold">{inv.name[0]}</span>
                <span className="font-semibold text-white/80">{inv.name}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[8px] text-white/40 uppercase font-mono">{inv.role}</span>
                <span className={`text-[9px] font-bold ${inv.status === "Joined" ? "text-emerald-400" : "text-[#f5c542] animate-pulse"}`}>
                  {inv.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Scene 3: Operations Tracking
function OperationsScene({ active }: { active: boolean }) {
  return (
    <div className="absolute inset-0 bg-[#0B0D10] flex flex-col justify-center px-8 py-6 select-none overflow-hidden">
      <div className="absolute inset-0 opacity-20 bg-grid" />
      <div className="absolute inset-0" style={{
        background: "radial-gradient(ellipse at 50% 50%, rgba(212,168,83,0.05) 0%, transparent 75%)",
      }} />

      <div className="relative space-y-3 max-w-xs mx-auto w-full">
        <span className="text-[8px] font-bold text-[#f5c542] uppercase tracking-[0.2em] block">STEP 03: LIVE OPERATIONS</span>
        <h4 className="text-sm font-bold text-white tracking-wide">Command Live Raids</h4>

        <div className="space-y-2">
          {[
            { label: "Catena Spawning Cooldown", val: "02m 14s", active: true },
            { label: "Active Guild Loot Auction", val: "Serus Sword (350 GP)", active: false },
          ].map((item, i) => (
            <div
              key={i}
              className={`p-2.5 rounded-lg border ${item.active ? "border-[#d4a853]/25 bg-[#d4a853]/5 text-[#f5c542]" : "border-white/[0.04] bg-black/40 text-white/60"}`}
              style={active ? { animation: `slide-up 0.5s cubic-bezier(0.16,1,0.3,1) ${0.3 + i * 0.3}s both` } : { opacity: 0 }}
            >
              <div className="text-[7.5px] uppercase tracking-wider text-white/35 font-mono">{item.label}</div>
              <span className="text-[11px] font-bold block mt-0.5">{item.val}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Scene 4: Coordination Splits
function CoordinationScene({ active }: { active: boolean }) {
  return (
    <div className="absolute inset-0 bg-[#0B0D10] flex flex-col justify-center px-8 py-6 select-none overflow-hidden">
      <div className="absolute inset-0 opacity-20 bg-grid" />
      <div className="absolute inset-0" style={{
        background: "radial-gradient(circle 250px at 50% 50%, rgba(16,217,154,0.05) 0%, transparent 100%)",
      }} />

      <div className="relative space-y-3 max-w-xs mx-auto w-full">
        <span className="text-[8px] font-bold text-[#10D99A] uppercase tracking-[0.2em] block">STEP 04: TREASURY PAYOUTS</span>
        <h4 className="text-sm font-bold text-white tracking-wide">GCash Splits Distributed</h4>

        <div className="space-y-2.5">
          <div
            className="rounded-lg border border-[#10D99A]/20 bg-[#10D99A]/5 p-3 flex items-center justify-between"
            style={active ? { animation: "scale-in 0.4s cubic-bezier(0.16,1,0.3,1) 0.3s both" } : { opacity: 0 }}
          >
            <div>
              <span className="text-[8px] text-[#10D99A] font-bold uppercase tracking-wider block">GCash Split Status</span>
              <span className="text-xs font-bold text-white mt-0.5 block">₱ 1,080.00 Dividends</span>
            </div>
            <span className="text-[10px] font-mono text-emerald-400 font-bold uppercase tracking-wider">SUCCESS ✓</span>
          </div>

          <div
            className="p-2 rounded bg-black/40 border border-white/[0.04] text-[9.5px] font-mono flex items-center justify-between text-white/40"
            style={active ? { animation: "fade-in 0.6s ease 0.8s both" } : { opacity: 0 }}
          >
            <span>Txn verification: 0x8f3a...</span>
            <span className="text-emerald-400">Verifiable</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// VIDEO PREVIEW WRAPPER
// ═══════════════════════════════════════════════════════════

interface VideoPreviewProps {
  title: string;
  duration: string;
  scene: "onboard" | "invite" | "operations" | "coordination";
  active: boolean;
}

function VideoPreview({ title, duration, scene, active }: VideoPreviewProps) {
  const [progress, setProgress] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [hovering, setHovering] = useState(false);

  const [mStr = "0", sStr = "0"] = duration.split(":");
  const totalSecs = parseInt(mStr, 10) * 60 + parseInt(sStr, 10);

  useEffect(() => {
    if (!playing || !active) return;
    const id = setInterval(() => {
      setProgress((p) => (p >= 100 ? 0 : p + 0.5));
    }, 90);
    return () => clearInterval(id);
  }, [playing, active]);

  const currentSecs = Math.floor((progress / 100) * totalSecs);
  const fmt = (sec: number) =>
    `${Math.floor(sec / 60)}:${(sec % 60).toString().padStart(2, "0")}`;

  return (
    <div
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      className="group relative rounded-2xl overflow-hidden border border-white/[0.08] bg-black aspect-video shadow-[0_20px_50px_rgba(0,0,0,0.85)] cursor-pointer"
    >
      {/* Scene Content */}
      <div className="absolute inset-0">
        {scene === "onboard" && <OnboardScene active={active && playing} />}
        {scene === "invite" && <InviteScene active={active && playing} />}
        {scene === "operations" && <OperationsScene active={active && playing} />}
        {scene === "coordination" && <CoordinationScene active={active && playing} />}
      </div>

      {/* Video Overlay Top Bar */}
      <div
        className="absolute top-0 inset-x-0 p-3 flex items-center justify-between transition-opacity duration-300 z-10"
        style={{
          background: "linear-gradient(to bottom, rgba(0,0,0,0.65), transparent)",
          opacity: hovering ? 1 : 0.85,
        }}
      >
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-500/30 text-[8px] font-extrabold text-red-100 uppercase tracking-widest">
            <span className="h-1 w-1 rounded-full bg-red-500 animate-ping" />
            REC
          </span>
          <span className="text-[10px] text-white/80 font-bold tracking-wide truncate max-w-[150px]">{title}</span>
        </div>
        <span className="text-[8px] text-white/40 font-mono tracking-widest">1080p HD</span>
      </div>

      {/* Center Play Button Toggle */}
      <button
        type="button"
        onClick={() => setPlaying(!playing)}
        className="absolute inset-0 flex items-center justify-center z-10"
        aria-label={playing ? "Pause" : "Play"}
      >
        <div
          className="relative transition-all duration-300"
          style={{
            opacity: playing ? (hovering ? 1 : 0) : 1,
            transform: `scale(${playing && !hovering ? 0.9 : 1})`,
          }}
        >
          <div className="relative h-12 w-12 rounded-full bg-white text-black flex items-center justify-center shadow-2xl transition-transform duration-200 hover:scale-105">
            {playing ? (
              <svg className="h-4.5 w-4.5" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="5" width="4" height="14" rx="1" />
                <rect x="14" y="5" width="4" height="14" rx="1" />
              </svg>
            ) : (
              <svg className="h-4.5 w-4.5 ml-0.5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </div>
        </div>
      </button>

      {/* Video Timeline Scrubber */}
      <div
        className="absolute bottom-0 inset-x-0 p-3 transition-opacity duration-300 z-10"
        style={{
          background: "linear-gradient(to top, rgba(0,0,0,0.85), transparent)",
          opacity: hovering || !playing ? 1 : 0.7,
        }}
      >
        <div className="relative h-1 bg-white/10 rounded-full overflow-hidden mb-2">
          <div className="absolute inset-y-0 left-0 bg-[#f5c542] rounded-full" style={{ width: `${progress}%` }} />
        </div>
        <div className="flex items-center justify-between text-[9px] font-mono text-white/60">
          <span>{fmt(currentSecs)} <span className="text-white/30">/ {duration}</span></span>
          <span className="tracking-widest">VOL 100%</span>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// MAIN HOW IT WORKS SCROLL MECHANICS
// ═══════════════════════════════════════════════════════════

const STEPS = [
  {
    step: "01",
    title: "Create your guild",
    desc: "Set up your guild workspace, roles, and member structure in minutes.",
    detail: "Choose your game template or customize your guild faction from scratch. Configure roster tiers and assign base roles that match your raid guidelines.",
    videoTitle: "Create Workspace Portal",
    videoDuration: "1:42",
    scene: "onboard" as const,
  },
  {
    step: "02",
    title: "Invite your members",
    desc: "Bring in leaders, officers, and members with role-based access.",
    detail: "Share secure invitation URLs that automatically map to preconfigured roles. Sync membership listings to sync ranks and synchronize active rosters.",
    videoTitle: "Secure Invite Dashboard",
    videoDuration: "2:05",
    scene: "invite" as const,
  },
  {
    step: "03",
    title: "Manage operations",
    desc: "Track boss schedules, attendance, guild points, treasury, and activities from one dashboard.",
    visual: <OperationsScene active={true} />,
    detail: "Maintain live countdown spawns for major field bosses, automate check-ins, record raid attendance using random codes, and log auction bids.",
    videoTitle: "Operations Controls Overview",
    videoDuration: "2:45",
    scene: "operations" as const,
  },
  {
    step: "04",
    title: "Stay coordinated",
    desc: "Keep everyone aligned with clear status tracking, alerts, and live updates.",
    detail: "Automate treasury payouts and GCash splits. Review tamper-proof ledger audit histories signed on-chain to verify complete transparency.",
    videoTitle: "Payouts & Coordination Audit",
    videoDuration: "1:22",
    scene: "coordination" as const,
  },
];

export default function HowItWorks() {
  const sectionRef = useRef<HTMLElement>(null);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const onScroll = () => {
      const rect = section.getBoundingClientRect();
      const total = rect.height - window.innerHeight;
      const scrolled = Math.max(0, Math.min(total, -rect.top));
      const p = total > 0 ? scrolled / total : 0;
      const idx = Math.min(STEPS.length - 1, Math.floor(p * STEPS.length));
      setActive(idx);
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <section
      id="how-it-works"
      ref={sectionRef}
      className="relative bg-[#050608]"
      style={{ minHeight: `${STEPS.length * 60 + 10}vh` }}
    >
      <div className="sticky top-0 min-h-screen flex items-center">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full py-20">
          
          {/* Section Header */}
          <Reveal className="text-center mb-14">
            <SectionLabel>Process Flow</SectionLabel>
            <h2 className="mt-5 text-3xl sm:text-4xl font-semibold text-white tracking-[-0.022em] font-fantasy">
              How it works
            </h2>
            <p className="mt-3 text-sm text-[#8B8F98] max-w-md mx-auto leading-relaxed">
              Command your guild operations with ease. Scroll through each step to see the flow in action.
            </p>
          </Reveal>

          {/* Interactive Scroll grid split */}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.2fr] gap-10 lg:gap-14 items-center">
            
            {/* Left: Button steps list */}
            <div className="space-y-2">
              {STEPS.map((s, i) => {
                const isSelected = active === i;
                return (
                  <button
                    key={s.step}
                    onClick={() => {
                      const section = sectionRef.current;
                      if (!section) return;
                      const target = section.offsetTop + (section.offsetHeight / STEPS.length) * i;
                      window.scrollTo({ top: target, behavior: "smooth" });
                    }}
                    className={`w-full text-left flex items-start gap-4 p-5 rounded-xl border transition-all duration-300 cursor-pointer ${
                      isSelected
                        ? "border-[#d4a853]/25 bg-[#d4a853]/5"
                        : "border-transparent hover:border-white/[0.04] hover:bg-white/[0.01]"
                    }`}
                  >
                    <span className={`text-[10px] font-mono font-bold tracking-[0.2em] mt-0.5 ${
                      isSelected ? "text-[#f5c542]" : "text-white/20"
                    }`}>
                      {s.step}
                    </span>
                    <div className="flex-1 min-w-0">
                      <h3 className={`text-base font-bold uppercase tracking-wide mb-1 transition-colors ${
                        isSelected ? "text-white" : "text-white/40"
                      }`}>
                        {s.title}
                      </h3>
                      <p className={`text-xs leading-relaxed transition-colors ${
                        isSelected ? "text-white/70" : "text-white/25"
                      }`}>
                        {s.desc}
                      </p>
                    </div>
                    
                    {/* Progress Indicator line */}
                    <div className="w-1 h-10 rounded-full bg-white/[0.04] overflow-hidden shrink-0 self-center">
                      <div
                        className="w-full bg-[#f5c542] transition-all duration-300"
                        style={{
                          height: isSelected ? "100%" : active > i ? "100%" : "0%",
                        }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Right: Mock scenes view */}
            <div className="relative min-h-[420px] lg:min-h-[460px]">
              {STEPS.map((s, i) => {
                const isSelected = active === i;
                return (
                  <div
                    key={s.step}
                    className="absolute inset-0 transition-all duration-500 ease-out"
                    style={{
                      opacity: isSelected ? 1 : 0,
                      transform: isSelected ? "translateY(0)" : "translateY(15px)",
                      pointerEvents: isSelected ? "auto" : "none",
                    }}
                  >
                    <div className="rounded-2xl border border-white/[0.08] bg-[#0b0d10]/50 p-5 lg:p-6 h-full backdrop-blur-md space-y-4 shadow-[0_25px_60px_rgba(0,0,0,0.95)] relative overflow-hidden card-obsidian">
                      {/* Video shell layout */}
                      <VideoPreview
                        title={`${s.step} · ${s.videoTitle}`}
                        duration={s.videoDuration}
                        scene={s.scene}
                        active={isSelected}
                      />

                      {/* Description Details */}
                      <div className="space-y-2 pt-2 px-1">
                        <div className="flex items-center justify-between border-b border-white/[0.04] pb-2">
                          <h4 className="text-sm font-bold text-white uppercase tracking-wider">
                            {s.title}
                          </h4>
                          <span className="text-[9px] font-mono text-white/35">
                            STEP {i + 1} OF {STEPS.length}
                          </span>
                        </div>
                        <p className="text-xs text-[#8B8F98] leading-relaxed">
                          {s.detail}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

          </div>

        </div>
      </div>
    </section>
  );
}
