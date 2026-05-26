"use client";

import { useEffect, useRef, useState } from "react";
import { Reveal, SectionLabel, useReveal } from "./LandingHelpers";

// ═══════════════════════════════════════════════════════════
// SCENE COMPONENTS — animated mockups inside the video frame
// ═══════════════════════════════════════════════════════════

function OnboardScene({ active }: { active: boolean }) {
  return (
    <div className="absolute inset-0 bg-gradient-to-br from-[#0a0a0d] via-[#0c0c10] to-[#0e0e14] flex items-center justify-center px-8 py-10">
      {/* Decor grid */}
      <div className="absolute inset-0 opacity-30 bg-grid" />
      <div className="absolute inset-0" style={{
        background: "radial-gradient(ellipse 70% 50% at 50% 60%, oklch(0.62 0.035 234 / 0.18), transparent 70%)",
      }} />

      <div className="relative w-full max-w-xs">
        <div className="text-[9px] text-white/45 uppercase tracking-[0.22em] mb-3 font-medium">
          Create your guild
        </div>
        <div className="space-y-2">
          {[
            { label: "Guild name", value: "Iron Wolves" },
            { label: "Faction",    value: "Order" },
            { label: "Region",     value: "PH-East" },
          ].map((f, i) => (
            <div
              key={f.label}
              className="rounded-md border border-white/[0.08] bg-white/[0.025] p-2.5"
              style={
                active
                  ? {
                      animation: `slide-up 0.6s cubic-bezier(0.16,1,0.3,1) ${
                        0.3 + i * 0.35
                      }s both`,
                    }
                  : undefined
              }
            >
              <div className="text-[7px] text-white/40 uppercase tracking-widest mb-1">
                {f.label}
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-1.5 rounded bg-white/65" style={{ width: `${50 + i * 18}%` }} />
                {active && i === 2 && (
                  <span className="inline-block h-3 w-px bg-white/80 animate-pulse" />
                )}
              </div>
            </div>
          ))}
          <div
            className="mt-3 h-7 rounded-md bg-white text-black text-[10px] font-semibold flex items-center justify-center"
            style={active ? { animation: "scale-in 0.5s cubic-bezier(0.16,1,0.3,1) 1.6s both" } : undefined}
          >
            Create guild →
          </div>
        </div>
      </div>
    </div>
  );
}

function RaidScene({ active }: { active: boolean }) {
  return (
    <div className="absolute inset-0 bg-gradient-to-br from-[#0a0a0d] via-[#0c0c10] to-[#0e0e14] flex items-center justify-center px-6 py-6">
      <div className="absolute inset-0 opacity-30 bg-grid" />
      <div className="absolute inset-0" style={{
        background: "radial-gradient(ellipse 70% 50% at 50% 40%, oklch(0.62 0.18 22 / 0.10), transparent 70%)",
      }} />

      <div className="relative w-full max-w-sm space-y-2.5">
        <div className="flex items-center justify-between text-[9px] uppercase tracking-[0.22em]">
          <span className="text-white/45 font-medium">Auction · Serus Greatsword</span>
          <span className="inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded bg-red-500/15 border border-red-500/30 text-red-200">
            <span className="h-1 w-1 rounded-full bg-red-400 animate-ping" />
            LIVE
          </span>
        </div>

        {[
          { name: "Dragz",   bid: 450,   lead: true,  delay: 0.4 },
          { name: "Mavis08", bid: 425,   lead: false, delay: 0.8 },
          { name: "Hou13",   bid: 400,   lead: false, delay: 1.2 },
        ].map((b, i) => (
          <div
            key={b.name}
            className={`flex items-center justify-between px-3 py-2 rounded-md border text-xs ${
              b.lead
                ? "bg-white/[0.06] border-white/15"
                : "bg-white/[0.02] border-white/[0.04]"
            }`}
            style={
              active
                ? { animation: `slide-up 0.55s cubic-bezier(0.16,1,0.3,1) ${b.delay}s both` }
                : undefined
            }
          >
            <div className="flex items-center gap-2">
              <div className="h-5 w-5 rounded-full bg-gradient-to-br from-white/30 to-white/10 flex items-center justify-center text-[9px] font-semibold text-white/80">
                {b.name[0]}
              </div>
              <span className="text-white/85 font-medium">{b.name}</span>
              {b.lead && (
                <span className="text-[8px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 uppercase tracking-wider">
                  Lead
                </span>
              )}
            </div>
            <span className="text-white font-semibold tabular-nums font-mono">{b.bid} DKP</span>
          </div>
        ))}

        {/* Timer bar */}
        <div className="pt-2">
          <div className="flex items-center justify-between text-[9px] mb-1.5 text-white/40 font-mono uppercase tracking-widest">
            <span>Bid window</span>
            <span className="text-white/70 tabular-nums">00:12s</span>
          </div>
          <div className="h-1 rounded-full bg-white/[0.06] overflow-hidden">
            <div
              className="h-full"
              style={{
                width: active ? "20%" : "100%",
                background: "linear-gradient(90deg, oklch(0.62 0.18 22 / 0.8), oklch(0.78 0.18 22))",
                transition: "width 6s linear",
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function AuditScene({ active }: { active: boolean }) {
  return (
    <div className="absolute inset-0 bg-gradient-to-br from-[#0a0a0d] via-[#0c0c10] to-[#0e0e14] flex items-center justify-center px-6 py-6">
      <div className="absolute inset-0 opacity-30 bg-grid" />
      <div className="absolute inset-0" style={{
        background: "radial-gradient(ellipse 70% 50% at 50% 50%, oklch(0.70 0.13 162 / 0.10), transparent 70%)",
      }} />

      <div className="relative w-full max-w-sm">
        <div className="flex items-center justify-between text-[9px] uppercase tracking-[0.22em] mb-2.5">
          <span className="text-white/45 font-medium">Ledger · 30d</span>
          <span className="text-emerald-300/80">Hash-verified</span>
        </div>

        <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] overflow-hidden">
          <div className="grid grid-cols-[1fr_auto_auto] px-3 py-1.5 text-[8px] font-medium text-white/35 uppercase tracking-widest border-b border-white/[0.05]">
            <span>Description</span>
            <span className="text-right pr-3">Amount</span>
            <span className="text-right">Date</span>
          </div>
          {[
            { label: "Field Boss · Titore",   amount: "+100 DKP", date: "now",  color: "text-emerald-300", delay: 0.2 },
            { label: "Bid won · Serus Greatsword",  amount: "-450 DKP", date: "1m",   color: "text-red-300",     delay: 0.5 },
            { label: "Weekly attendance",     amount: "+50 DKP",  date: "3m",   color: "text-emerald-300", delay: 0.8 },
            { label: "Field Boss · Catena",   amount: "+100 DKP", date: "5m",   color: "text-emerald-300", delay: 1.1 },
            { label: "Guild bid fee (10%)",   amount: "-45 DKP",  date: "8m",   color: "text-amber-300",   delay: 1.4 },
          ].map((row, i) => (
            <div
              key={i}
              className={`grid grid-cols-[1fr_auto_auto] items-center px-3 py-1.5 text-[10px] gap-3 ${
                i > 0 ? "border-t border-white/[0.03]" : ""
              }`}
              style={
                active
                  ? { animation: `slide-up 0.5s cubic-bezier(0.16,1,0.3,1) ${row.delay}s both` }
                  : undefined
              }
            >
              <span className="text-white/70 truncate">{row.label}</span>
              <span className={`font-mono tabular-nums font-medium ${row.color}`}>{row.amount}</span>
              <span className="text-white/35 tabular-nums font-mono">{row.date}</span>
            </div>
          ))}
        </div>

        {/* Hash badge */}
        <div className="mt-2 flex items-center gap-1.5 text-[9px] font-mono text-white/35">
          <svg className="h-2.5 w-2.5 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span>0x8f3a · immutable</span>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// VIDEO PREVIEW — player UI with progress, controls, scene
// ═══════════════════════════════════════════════════════════

function VideoPreview({
  title,
  duration,
  scene,
  active,
}: {
  title: string;
  duration: string; // mm:ss
  scene: "onboard" | "raid" | "audit";
  active: boolean;
}) {
  const { ref, visible } = useReveal(0.15);
  const [progress, setProgress] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [hovering, setHovering] = useState(false);

  // Convert duration "1:42" → seconds
  const [mStr = "0", sStr = "0"] = duration.split(":");
  const totalSecs = parseInt(mStr, 10) * 60 + parseInt(sStr, 10);

  useEffect(() => {
    if (!playing || !visible || !active) return;
    const id = setInterval(() => {
      setProgress((p) => (p >= 100 ? 0 : p + 0.35));
    }, 80);
    return () => clearInterval(id);
  }, [playing, visible, active]);

  const currentSecs = Math.floor((progress / 100) * totalSecs);
  const fmt = (sec: number) =>
    `${Math.floor(sec / 60)}:${(sec % 60).toString().padStart(2, "0")}`;

  return (
    <div
      ref={ref}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      className="group relative rounded-xl overflow-hidden border border-white/[0.10] bg-black aspect-video shadow-[0_20px_60px_-15px_rgba(0,0,0,0.6)] cursor-pointer"
    >
      {/* Scene mockup */}
      <div className="absolute inset-0">
        {scene === "onboard" && <OnboardScene active={active && playing} />}
        {scene === "raid"    && <RaidScene    active={active && playing} />}
        {scene === "audit"   && <AuditScene   active={active && playing} />}
      </div>

      {/* Subtle scanline overlay for "video" feel */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none opacity-[0.06] mix-blend-overlay"
        style={{
          backgroundImage:
            "repeating-linear-gradient(180deg, transparent 0, transparent 2px, oklch(1 0 0) 2px, oklch(1 0 0) 3px)",
        }}
      />

      {/* Top bar */}
      <div
        className="absolute top-0 inset-x-0 p-3 flex items-center justify-between transition-opacity duration-300"
        style={{
          background: "linear-gradient(to bottom, rgba(0,0,0,0.55), transparent)",
          opacity: hovering ? 1 : 0.85,
        }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded bg-red-500/30 backdrop-blur text-[9px] font-semibold text-red-100 uppercase tracking-[0.15em]">
            <span className="h-1 w-1 rounded-full bg-red-400 animate-pulse" />
            REC
          </span>
          <span className="text-[11px] text-white/90 font-medium truncate">{title}</span>
        </div>
        <span className="text-[9px] text-white/55 font-mono uppercase tracking-widest shrink-0">
          1080p · HD
        </span>
      </div>

      {/* Center play overlay */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setPlaying((p) => !p);
        }}
        className="absolute inset-0 flex items-center justify-center"
        aria-label={playing ? "Pause" : "Play"}
      >
        <div
          className="relative transition-all duration-500"
          style={{
            opacity: playing ? (hovering ? 1 : 0) : 1,
            transform: `scale(${playing && !hovering ? 0.8 : 1})`,
          }}
        >
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background: "radial-gradient(circle, oklch(1 0 0 / 0.25), transparent 70%)",
              filter: "blur(16px)",
              transform: "scale(1.4)",
            }}
          />
          <div className="relative h-14 w-14 rounded-full bg-white/95 text-black flex items-center justify-center shadow-2xl backdrop-blur transition-transform duration-200 group-hover:scale-110">
            {playing ? (
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="5" width="4" height="14" rx="1" />
                <rect x="14" y="5" width="4" height="14" rx="1" />
              </svg>
            ) : (
              <svg className="h-5 w-5 ml-0.5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </div>
        </div>
      </button>

      {/* Bottom controls */}
      <div
        className="absolute bottom-0 inset-x-0 p-3 transition-opacity duration-300"
        style={{
          background: "linear-gradient(to top, rgba(0,0,0,0.75), transparent)",
          opacity: hovering || !playing ? 1 : 0.7,
        }}
      >
        {/* Progress bar */}
        <div className="relative h-1 bg-white/15 rounded-full overflow-hidden mb-2 group/bar">
          <div
            className="absolute inset-y-0 left-0 bg-white rounded-full"
            style={{ width: `${progress}%`, transition: "width 80ms linear" }}
          />
          {/* Buffered (lighter) */}
          <div
            className="absolute inset-y-0 left-0 bg-white/30 rounded-full"
            style={{ width: `${Math.min(progress + 18, 100)}%` }}
          />
          {/* Real fill */}
          <div
            className="absolute inset-y-0 left-0 bg-white rounded-full"
            style={{ width: `${progress}%`, transition: "width 80ms linear" }}
          />
          {/* Scrubber dot */}
          <div
            className="absolute h-2.5 w-2.5 rounded-full bg-white shadow-lg top-1/2 transition-opacity"
            style={{
              left: `${progress}%`,
              transform: "translate(-50%, -50%)",
              opacity: hovering ? 1 : 0,
            }}
          />
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-white/85 font-mono tabular-nums">
              {fmt(currentSecs)}
              <span className="text-white/40"> / {duration}</span>
            </span>
            {/* Volume */}
            <button className="text-white/60 hover:text-white transition-colors" aria-label="Volume">
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
              </svg>
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button className="text-white/60 hover:text-white transition-colors" aria-label="Settings">
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33h.01a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82v.01a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z" />
              </svg>
            </button>
            <button className="text-white/60 hover:text-white transition-colors" aria-label="Fullscreen">
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 8V3h5M21 8V3h-5M3 16v5h5M21 16v5h-5" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// HOW IT WORKS
// ═══════════════════════════════════════════════════════════

const STEPS = [
  {
    step: "01",
    title: "Create your guild",
    desc: "Sign up, create your guild, invite members with a share link. Roles auto-apply.",
    detail:
      "Onboarding takes under five minutes. Your guild is provisioned instantly with isolated data, a dedicated audit ledger, and role templates ready to customize.",
    videoTitle: "Onboarding tour",
    videoDuration: "1:42",
    scene: "onboard" as const,
  },
  {
    step: "02",
    title: "Run your raids",
    desc: "Log attendance, track boss kills, run smart GP bidding with custom rules.",
    detail:
      "Discord integration imports raid signups automatically. Bid windows close on schedule. Every winning bid is logged with a verifiable timestamp.",
    videoTitle: "Raid night flow",
    videoDuration: "2:15",
    scene: "raid" as const,
  },
  {
    step: "03",
    title: "Audit everything",
    desc: "Every action permanently logged. View the complete treasury history at any time.",
    detail:
      "The ledger is append-only and tamper-proof. Generate exports for officers, prove fair distribution, and trace every point earned or spent.",
    videoTitle: "Audit Guild's Treasury",
    videoDuration: "1:08",
    scene: "audit" as const,
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
      className="relative"
      style={{ minHeight: `${STEPS.length * 60 + 10}vh` }}
    >
      <div className="sticky top-0 min-h-screen flex items-center">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full py-16">
          <Reveal className="text-center mb-14">
            <SectionLabel>How it works</SectionLabel>
            <h2 className="mt-6 text-4xl sm:text-5xl font-semibold text-white tracking-[-0.022em]">
              Three steps to control.
            </h2>
            <p className="mt-4 text-sm text-white/45 max-w-md mx-auto">
              Watch the short tutorials as you scroll through each step.
            </p>
          </Reveal>

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.3fr] gap-10 lg:gap-16 items-start">
            {/* Left: Step list */}
            <div className="space-y-1">
              {STEPS.map((s, i) => (
                <button
                  key={s.step}
                  onClick={() => {
                    const section = sectionRef.current;
                    if (!section) return;
                    const target = section.offsetTop + (section.offsetHeight / STEPS.length) * i;
                    window.scrollTo({ top: target, behavior: "smooth" });
                  }}
                  className={`w-full text-left flex items-start gap-5 p-5 rounded-xl border transition-all duration-500 cursor-pointer ${
                    active === i
                      ? "border-white/[0.12] bg-white/[0.03]"
                      : "border-transparent hover:border-white/[0.05]"
                  }`}
                >
                  <div className="flex-shrink-0 mt-0.5">
                    <div
                      className={`text-[10px] font-mono uppercase tracking-[0.2em] transition-colors ${
                        active === i ? "text-white" : "text-white/30"
                      }`}
                    >
                      {s.step}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3
                      className={`text-xl font-semibold tracking-tight mb-1.5 transition-colors ${
                        active === i ? "text-white" : "text-white/45"
                      }`}
                    >
                      {s.title}
                    </h3>
                    <p
                      className={`text-sm leading-relaxed transition-colors ${
                        active === i ? "text-white/65" : "text-white/30"
                      }`}
                    >
                      {s.desc}
                    </p>
                  </div>
                  <div className="w-1 h-12 rounded-full bg-white/[0.04] overflow-hidden flex-shrink-0">
                    <div
                      className="w-full bg-white/80 transition-all duration-500"
                      style={{
                        height: active === i ? "100%" : active > i ? "100%" : "0%",
                      }}
                    />
                  </div>
                </button>
              ))}
            </div>

            {/* Right: Video tutorial + detail */}
            <div className="relative min-h-[480px]">
              {STEPS.map((s, i) => (
                <div
                  key={s.step}
                  className="absolute inset-0 transition-all duration-700 ease-out"
                  style={{
                    opacity: active === i ? 1 : 0,
                    transform: active === i ? "translateY(0)" : "translateY(20px)",
                    pointerEvents: active === i ? "auto" : "none",
                  }}
                >
                  <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 lg:p-6 h-full backdrop-blur space-y-4">
                    {/* Video player */}
                    <VideoPreview
                      title={`${s.step} · ${s.videoTitle}`}
                      duration={s.videoDuration}
                      scene={s.scene}
                      active={active === i}
                    />

                    {/* Detail */}
                    <div className="space-y-3 px-1 pt-2">
                      <div className="flex items-center justify-between">
                        <h4 className="text-lg font-semibold text-white tracking-tight">
                          {s.title}
                        </h4>
                        <span className="text-[10px] text-white/40 uppercase tracking-[0.18em] font-mono">
                          Step {i + 1} / {STEPS.length}
                        </span>
                      </div>
                      <p className="text-sm text-white/55 leading-relaxed">{s.detail}</p>

                      <div className="hr-shine my-3" />

                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-xs text-white/45">
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
