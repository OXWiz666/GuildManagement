"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Magnetic } from "./LandingHelpers";
import { TAGLINE } from "@/components/common/Logo";

// ═══════════════════════════════════════════════════════════
// HERO BACKDROP — atmospheric base beneath the portal: a top
// forge-glow wash, drifting aurora tint, hairline rune grid,
// and an edge vignette so the scene never reads as a flat fill.
// ═══════════════════════════════════════════════════════════
function HeroBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      {/* Top forge-glow + floor shadow */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 95% 62% at 50% -8%, rgba(212,168,83,0.14) 0%, transparent 60%), radial-gradient(ellipse 80% 45% at 50% 108%, rgba(8,8,14,0.8) 0%, transparent 72%)",
        }}
      />

      {/* Drifting aurora tint */}
      <div className="aurora-mesh-soft" style={{ opacity: 1 }} />

      {/* Hairline rune grid, faded toward the edges */}
      <div className="absolute inset-0 bg-grid bg-grid-fade" style={{ opacity: 0.9 }} />

      {/* Horizon line + faint reflection under the headline */}
      <div
        className="absolute inset-x-0 top-[58%] h-px"
        style={{ background: "linear-gradient(90deg, transparent, rgba(212,168,83,0.22), transparent)" }}
      />

      {/* Edge vignette */}
      <div
        className="absolute inset-0"
        style={{ boxShadow: "inset 0 0 220px 70px rgba(5,6,8,0.9)" }}
      />

      {/* Noise grain for texture */}
      <div className="noise-overlay" />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// FORGE PORTAL — layered radial glow + twin rune rings that
// orbit slowly behind the headline. Pure decoration (depth).
// ═══════════════════════════════════════════════════════════
function ForgePortal() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      {/* Falling light shaft from above */}
      <div
        className="light-shaft absolute left-1/2 top-0 -translate-x-1/2 h-[70%] w-[420px] origin-top"
        style={{
          background:
            "linear-gradient(180deg, rgba(245,197,66,0.10) 0%, rgba(212,168,83,0.04) 40%, transparent 78%)",
          filter: "blur(18px)",
        }}
      />

      {/* Core portal glow */}
      <div
        className="forge-portal absolute left-1/2 top-[46%] h-[560px] w-[560px] rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(245,197,66,0.14) 0%, rgba(212,168,83,0.06) 34%, transparent 66%)",
          filter: "blur(30px)",
        }}
      />

      {/* Rune rings */}
      <div className="absolute left-1/2 top-[46%] h-[640px] w-[640px] -translate-x-1/2 -translate-y-1/2 opacity-[0.07]">
        <svg viewBox="0 0 200 200" className="rune-orbit h-full w-full text-[#d4a853]">
          <circle cx="100" cy="100" r="96" fill="none" stroke="currentColor" strokeWidth="0.25" strokeDasharray="1 6" />
          <circle cx="100" cy="100" r="82" fill="none" stroke="currentColor" strokeWidth="0.4" strokeDasharray="34 10 6 10" />
        </svg>
      </div>
      <div className="absolute left-1/2 top-[46%] h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 opacity-[0.06]">
        <svg viewBox="0 0 200 200" className="rune-orbit-rev h-full w-full text-[#f5c542]">
          <polygon points="100,18 170,142 30,142" fill="none" stroke="currentColor" strokeWidth="0.3" />
          <polygon points="100,182 170,58 30,58" fill="none" stroke="currentColor" strokeWidth="0.3" />
          <circle cx="100" cy="100" r="66" fill="none" stroke="currentColor" strokeWidth="0.3" strokeDasharray="2 5" />
        </svg>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// EMBER FIELD — rising sparks localized to the hero.
// ═══════════════════════════════════════════════════════════
function EmberField() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <div aria-hidden className="pointer-events-none absolute inset-0 z-0" />;

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      {Array.from({ length: 16 }).map((_, i) => {
        const size = Math.random() * 2.4 + 1;
        return (
          <span
            key={i}
            className="ember absolute rounded-full bg-[#f5c542]/30 blur-[0.5px]"
            style={{
              width: size,
              height: size,
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 55 + 30}%`,
              animationDelay: `${Math.random() * 8}s`,
              animationDuration: `${Math.random() * 6 + 8}s`,
              "--drift-x": `${(Math.random() - 0.5) * 40}px`,
            } as React.CSSProperties}
          />
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// LIVE BOSS-TIMER CHIP — a real product motif ticking in real
// time, floated as a depth accent (not a fake full dashboard).
// ═══════════════════════════════════════════════════════════
function BossTimerChip({ className = "" }: { className?: string }) {
  const [secs, setSecs] = useState(134); // 02:14
  useEffect(() => {
    const id = setInterval(() => setSecs((s) => (s <= 0 ? 134 : s - 1)), 1000);
    return () => clearInterval(id);
  }, []);
  const mm = String(Math.floor(secs / 60)).padStart(2, "0");
  const ss = String(secs % 60).padStart(2, "0");

  return (
    <div
      className={`chip-float-a glass-obsidian edge-forge rounded-2xl px-4 py-3 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.9)] ${className}`}
      style={{ animation: "fade-in 0.9s ease both, chip-float-a 6.5s ease-in-out 0.9s infinite" }}
    >
      <div className="flex items-center gap-3">
        <span className="grid h-8 w-8 place-items-center rounded-lg border border-[#d4a853]/25 bg-[#d4a853]/[0.06] text-[#f5c542]">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" />
          </svg>
        </span>
        <div className="leading-tight text-left">
          <div className="text-[8px] font-bold uppercase tracking-[0.2em] text-white/40">Next spawn</div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-sm font-bold text-white">Catena</span>
            <span className="font-mono text-[13px] font-bold text-[#f5c542] tabular-nums">{mm}:{ss}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// PRESENCE CHIP — live attendance pulse depth accent.
// ═══════════════════════════════════════════════════════════
function PresenceChip({ className = "" }: { className?: string }) {
  return (
    <div
      className={`chip-float-b glass-obsidian edge-forge rounded-2xl px-4 py-3 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.9)] ${className}`}
      style={{ animation: "fade-in 0.9s ease 0.15s both, chip-float-b 7.5s ease-in-out 1.05s infinite" }}
    >
      <div className="flex items-center gap-3">
        <span className="relative grid h-8 w-8 place-items-center rounded-lg border border-[#10D99A]/25 bg-[#10D99A]/[0.06] text-[#10D99A]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#10D99A]" style={{ animation: "live-breathe 2.4s ease-in-out infinite" }} />
        </span>
        <div className="leading-tight text-left">
          <div className="text-[8px] font-bold uppercase tracking-[0.2em] text-white/40">Raid presence</div>
          <div className="flex items-baseline gap-1.5">
            <span className="font-mono text-[15px] font-bold text-[#10D99A]">92%</span>
            <span className="text-[10px] text-white/45">verified</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Hero() {
  const heroRef = useRef<HTMLElement>(null);

  return (
    <section
      ref={heroRef}
      id="hero"
      className="relative isolate min-h-[100dvh] flex flex-col items-center justify-center overflow-hidden bg-[#050608] px-4 pt-28 pb-16 sm:px-6"
    >
      <HeroBackdrop />
      <ForgePortal />
      <EmberField />

      {/* Floating live chips — desktop depth only */}
      <BossTimerChip className="absolute left-[8%] top-[26%] z-20 hidden xl:block" />
      <PresenceChip className="absolute right-[8%] top-[62%] z-20 hidden xl:block" />

      <div className="relative z-10 mx-auto flex w-full max-w-4xl flex-col items-center text-center">
        {/* Brand strip — the hero's single small text element */}
        <div
          className="mb-9 inline-flex items-center gap-3 rounded-full border border-white/[0.08] bg-white/[0.02] px-3 py-1.5 backdrop-blur-sm"
          style={{ animation: "fade-in 0.9s ease both" }}
        >
          <span className="inline-flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#10D99A]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#10D99A]" style={{ animation: "live-breathe 2.4s ease-in-out infinite" }} />
            Open Beta
          </span>
          <span className="h-3 w-px bg-white/12" />
          <span className="text-[11px] font-medium tracking-wide text-white/50">{TAGLINE}</span>
        </div>

        {/* Kinetic Cinzel headline — clip-reveal per line */}
        <h1 className="font-fantasy font-semibold tracking-[-0.02em] text-white">
          <span className="line-clip">
            <span
              className="line-rise block text-[46px] leading-[0.98] sm:text-[68px] lg:text-[84px]"
              style={{ "--i": 0, "--base": "220ms" } as React.CSSProperties}
            >
              Command your guild
            </span>
          </span>
          <span className="line-clip pb-2">
            <span
              className="line-rise block text-[46px] leading-[1.02] sm:text-[68px] lg:text-[84px]"
              style={{ "--i": 1, "--base": "220ms" } as React.CSSProperties}
            >
              from a single <span className="text-gold-sheen">keep.</span>
            </span>
          </span>
        </h1>

        {/* Subtext */}
        <p
          className="mt-7 max-w-xl text-[15px] leading-relaxed text-[#9CA0AB] sm:text-[17px]"
          style={{ animation: "slide-up 0.9s cubic-bezier(0.16,1,0.3,1) 0.62s both" }}
        >
          Boss timers, verified attendance, and an audited treasury. The command
          center competitive MMORPG guilds actually run on.
        </p>

        {/* CTAs */}
        <div
          className="mt-10 flex flex-col items-center gap-4 sm:flex-row"
          style={{ animation: "slide-up 0.9s cubic-bezier(0.16,1,0.3,1) 0.72s both" }}
        >
          <Magnetic strength={6}>
            <Link
              href="/register"
              className="beam-host group inline-flex h-12 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#d4a853] to-[#f5c542] px-8 text-[13px] font-bold text-[#08080c] shadow-[0_0_24px_rgba(212,168,83,0.3)] transition-all hover:scale-[1.02] hover:shadow-[0_0_38px_rgba(212,168,83,0.5)] active:scale-[0.98]"
            >
              <span className="beam" aria-hidden />
              Start free trial
              <svg className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </Link>
          </Magnetic>

          <Magnetic strength={4}>
            <a
              href="#preview"
              className="group inline-flex h-12 items-center justify-center gap-2 rounded-full border border-white/[0.1] bg-[#0b0d10]/40 px-7 text-[13px] font-bold text-white/80 backdrop-blur-sm transition-all hover:border-[#d4a853]/45 hover:bg-[#0b0d10]/70 hover:text-[#f5c542]"
            >
              <svg className="h-4 w-4 text-[#d4a853]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <polygon points="10 8 16 12 10 16 10 8" fill="currentColor" stroke="none" />
              </svg>
              See it live
            </a>
          </Magnetic>
        </div>
      </div>

      {/* Bottom fade into next section */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-[#050608]"
      />
    </section>
  );
}
