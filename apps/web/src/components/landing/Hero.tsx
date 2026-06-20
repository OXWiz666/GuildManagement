"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Magnetic } from "./LandingHelpers";

// ═══════════════════════════════════════════════════════════
// BACKGROUND RUNES & EMBERS
// ═══════════════════════════════════════════════════════════

function CircularRunes() {
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      setScrollY(window.scrollY);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const rotationA = scrollY * 0.12;
  const rotationB = scrollY * -0.09;
  const morphScale = 1 + scrollY * 0.0003;
  const morphOpacity = Math.max(0, 0.045 - scrollY * 0.00006);
  const dashoffset = scrollY * 0.45;

  return (
    <div
      className="absolute left-1/2 top-1/2 w-[700px] h-[700px] pointer-events-none select-none scale-75 md:scale-100 -z-10 transition-all duration-300 ease-out"
      style={{
        transform: `translate3d(-50%, -50%, 0) scale(${morphScale})`,
        opacity: morphOpacity,
      }}
    >
      <svg
        viewBox="0 0 200 200"
        className="w-full h-full text-[#d4a853]"
      >
        <circle 
          cx="100" 
          cy="100" 
          r="95" 
          fill="none" 
          stroke="currentColor" 
          strokeWidth="0.3" 
          strokeDasharray="4, 5" 
          strokeDashoffset={dashoffset}
        />
        <circle 
          cx="100" 
          cy="100" 
          r="85" 
          fill="none" 
          stroke="currentColor" 
          strokeWidth="0.5" 
          strokeDasharray="30, 8, 4, 8" 
          strokeDashoffset={-dashoffset * 1.4}
        />
        <circle cx="100" cy="100" r="80" fill="none" stroke="currentColor" strokeWidth="0.15" />
        
        <polygon 
          points="100,15 173.6,142.5 26.4,142.5" 
          fill="none" 
          stroke="currentColor" 
          strokeWidth="0.3" 
          style={{
            transform: `rotate(${rotationA}deg)`,
            transformOrigin: "100px 100px",
          }}
          className="transition-transform duration-200 ease-out"
        />
        <polygon 
          points="100,185 173.6,57.5 26.4,57.5" 
          fill="none" 
          stroke="currentColor" 
          strokeWidth="0.3" 
          style={{
            transform: `rotate(${rotationB}deg)`,
            transformOrigin: "100px 100px",
          }}
          className="transition-transform duration-200 ease-out"
        />
        <circle 
          cx="100" 
          cy="100" 
          r="55" 
          fill="none" 
          stroke="currentColor" 
          strokeWidth="0.4" 
          strokeDasharray="2, 6" 
          strokeDashoffset={dashoffset * 0.8}
        />
        <circle 
          cx="100" 
          cy="100" 
          r="12" 
          fill="none" 
          stroke="currentColor" 
          strokeWidth="0.5" 
          style={{
            transform: `rotate(${rotationB * 1.8}deg)`,
            transformOrigin: "100px 100px",
          }}
        />
      </svg>
    </div>
  );
}

function FloatingEmbers() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div className="absolute inset-0 pointer-events-none overflow-hidden select-none -z-10" />;
  }

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden select-none -z-10">
      {Array.from({ length: 18 }).map((_, i) => {
        const size = Math.random() * 3.5 + 1.5; // 1.5px to 5px
        const left = Math.random() * 100;
        const top = Math.random() * 70 + 25;
        const delay = Math.random() * 6;
        const duration = Math.random() * 6 + 8; // 8s to 14s
        const driftX = (Math.random() - 0.5) * 40;
        return (
          <div
            key={i}
            className="absolute rounded-full bg-[#f5c542]/20 blur-[0.5px] animate-particle"
            style={{
              width: size,
              height: size,
              left: `${left}%`,
              top: `${top}%`,
              animationDelay: `${delay}s`,
              animationDuration: `${duration}s`,
              "--drift-x": `${driftX}px`,
            } as React.CSSProperties}
          />
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// 3D DASHBOARD CARD — Premium Obsidian Guild Command theme
// ═══════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════
// 3D DASHBOARD CARD — Premium Obsidian Guild Command theme
// ═══════════════════════════════════════════════════════════

interface DashboardCard3DProps {
  isBackground?: boolean;
}

function DashboardCard3D({ isBackground = false }: DashboardCard3DProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  // Dynamic animated states
  const [bossIndex, setBossIndex] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(258); // 04m 18s = 258s
  const [raidersCount, setRaidersCount] = useState(24);

  const bosses = [
    { name: "Titore in Deadman's Land 2F", queue: "BZDK", next: "Catena" },
    { name: "Catena in Seraphim Spire", queue: "GCASH-SPLIT", next: "Serus" },
    { name: "Serus in Obsidian Cavern", queue: "ALLIANCE-L", next: "Titore" },
  ];

  useEffect(() => {
    // Timer countdown
    const timer = setInterval(() => {
      setSecondsLeft((s) => (s <= 10 ? 300 : s - 1));
    }, 1000);

    // Cycle bosses
    const cycle = setInterval(() => {
      setBossIndex((i) => (i + 1) % bosses.length);
      // Randomize raider online count slightly
      setRaidersCount((c) => {
        const delta = Math.random() > 0.5 ? 1 : -1;
        const next = c + delta;
        return next >= 21 && next <= 27 ? next : c;
      });
    }, 5000);

    return () => {
      clearInterval(timer);
      clearInterval(cycle);
    };
  }, []);

  const formatTimer = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, "0")}m ${s.toString().padStart(2, "0")}s`;
  };

  useEffect(() => {
    const wrap = wrapRef.current;
    const card = cardRef.current;
    if (!wrap || !card) return;

    let mx = 0, my = 0;
    let tx = 0, ty = 0;
    let sy = 0;
    let raf = 0;

    const onMove = (e: MouseEvent) => {
      const r = wrap.getBoundingClientRect();
      mx = ((e.clientX - r.left) / r.width - 0.5) * 2;
      my = ((e.clientY - r.top) / r.height - 0.5) * 2;
    };

    const onLeave = () => { mx = 0; my = 0; };

    const onScroll = () => {
      const r = wrap.getBoundingClientRect();
      const center = r.top + r.height / 2 - window.innerHeight / 2;
      sy = Math.max(-1, Math.min(1, center / window.innerHeight));
    };

    const tick = () => {
      tx += (mx - tx) * 0.08;
      ty += (my - ty) * 0.08;
      // base tilt + scroll tilt
      const rotX = (isBackground ? 22 : 10) + ty * -12 + sy * -9;
      const rotY = (isBackground ? -18 : -8) + tx * 15 + sy * 5;
      const rotZ = tx * 1.5 + sy * -1.5;
      const ty2 = sy * (isBackground ? -130 : 50); // Glides upward on scroll when in background
      const tz = sy * -25;
      const scale = (isBackground ? 1.15 : 1) - Math.abs(sy) * 0.05;
      card.style.transform = `perspective(1600px) rotateX(${rotX}deg) rotateY(${rotY}deg) rotateZ(${rotZ}deg) translate3d(0, ${ty2}px, ${tz}px) scale(${scale})`;
      raf = requestAnimationFrame(tick);
    };

    wrap.addEventListener("mousemove", onMove);
    wrap.addEventListener("mouseleave", onLeave);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    raf = requestAnimationFrame(tick);

    return () => {
      wrap.removeEventListener("mousemove", onMove);
      wrap.removeEventListener("mouseleave", onLeave);
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [isBackground]);

  return (
    <div
      ref={wrapRef}
      className={`relative w-full transition-opacity duration-700 ${
        isBackground ? "max-w-4xl opacity-35 hover:opacity-55" : "max-w-xl"
      }`}
      style={{ perspective: 1600, transformStyle: "preserve-3d" }}
    >
      {/* Reflective bottom drop-shadow */}
      <div
        className="absolute -bottom-12 left-1/2 -translate-x-1/2 w-[85%] h-14 rounded-[100%] pointer-events-none"
        style={{
          background: "radial-gradient(ellipse 50% 60% at 50% 50%, rgba(0, 0, 0, 0.8) 0%, transparent 75%)",
          filter: "blur(20px)",
        }}
      />
      {/* Golden atmospheric glow background */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          transform: "translateZ(-70px) scale(1.03)",
          background: "radial-gradient(circle 350px at 50% 50%, rgba(212, 168, 83, 0.07) 0%, transparent 100%)",
          filter: "blur(50px)",
        }}
      />

      <div
        ref={cardRef}
        className="relative rounded-2xl overflow-hidden card-obsidian"
        style={{
          willChange: "transform",
          transition: "transform 80ms linear",
          boxShadow: "0 30px 70px -15px rgba(0,0,0,0.85), 0 0 1px 1px rgba(255, 255, 255, 0.03)",
        }}
      >
        {/* Top edge gold highlight */}
        <div
          className="absolute inset-x-0 top-0 h-px z-10"
          style={{
            background: "linear-gradient(90deg, transparent, rgba(212, 168, 83, 0.35), transparent)",
          }}
        />

        {/* Chrome Bar */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[#1E232B] bg-[#0b0d10]/90">
          <div className="flex gap-1.5 shrink-0">
            <div className="h-2 w-2 rounded-full bg-red-500/30" />
            <div className="h-2 w-2 rounded-full bg-[#f5c542]/30" />
            <div className="h-2 w-2 rounded-full bg-emerald-500/30" />
          </div>
          <div className="flex-1 mx-3 h-5 rounded border border-white/[0.03] bg-white/[0.01] text-[10px] text-white/35 flex items-center justify-center font-mono tracking-wider">
            ops.forgekeep.io/Kurakortz
          </div>
          <div className="h-3 w-3 text-[#d4a853] animate-pulse">
            ✦
          </div>
        </div>

        {/* Mockup Dashboard Content */}
        <div className="flex" style={{ height: 370 }}>
          {/* Sidebar */}
          <div className="w-36 flex flex-col flex-shrink-0 border-r border-[#1E232B] p-3 bg-[#08080a]/60">
            <div className="flex items-center gap-2.5 mb-5 pb-2 border-b border-white/[0.04]">
              <div className="h-6 w-6 rounded border border-[#d4a853]/30 bg-[#d4a853]/5 flex items-center justify-center">
                <svg className="h-3.5 w-3.5 text-[#f5c542]" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2L2 7l10 5 10-5-10-5z" />
                </svg>
              </div>
              <span className="text-[10px] font-bold text-white tracking-wider">Kurakortz</span>
            </div>

            {/* Nav list */}
            {[
              { label: "Dashboard", active: true, dot: "bg-[#f5c542]" },
              { label: "Boss Rotation", active: false, dot: "bg-white/20" },
              { label: "Attendance", active: false, dot: "bg-white/20" },
              { label: "Guild Treasury", active: false, dot: "bg-white/20" },
              { label: "Audit Ledger", active: false, dot: "bg-white/20" },
            ].map((item, i) => (
              <div
                key={i}
                className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg mb-1 transition-all ${
                  item.active ? "bg-white/[0.05] border border-white/[0.05] text-[#f5c542]" : "text-white/45 hover:text-white/80"
                }`}
              >
                <div className={`h-1.5 w-1.5 rounded-full ${item.dot} ${item.active ? "shadow-[0_0_6px_#f5c542]" : ""}`} />
                <span className="text-[10.5px] font-medium tracking-wide">{item.label}</span>
              </div>
            ))}

            <div className="flex-1" />
            
            {/* Bottom active profile info */}
            <div className="pt-2 border-t border-white/[0.04] flex items-center gap-2">
              <div className="h-6 w-6 rounded-full bg-gradient-to-br from-[#d4a853]/30 to-[#a78332]/10 border border-[#d4a853]/20 flex items-center justify-center text-[10px] text-white font-bold">
                W
              </div>
              <div className="min-w-0">
                <p className="text-[10px] text-white/80 font-bold leading-none truncate">Wiz (Officer)</p>
                <p className="text-[8px] text-emerald-400 font-bold mt-0.5 tracking-wider uppercase font-mono">ONLINE</p>
              </div>
            </div>
          </div>

          {/* Main Panel */}
          <div className="flex-1 p-4 bg-[#0B0D10]/40 overflow-hidden flex flex-col justify-between">
            {/* Upper Content: Header & Grid */}
            <div className="space-y-3.5">
              {/* Header block */}
              <div className="flex items-center justify-between pb-2 border-b border-white/[0.04]">
                <div>
                  <h4 className="text-[12px] font-bold text-white tracking-wide uppercase">Guild Commands</h4>
                  <p className="text-[9px] text-white/35">Guild Overview</p>
                </div>
                <div className="px-2 py-0.5 rounded border border-[#10D99A]/30 bg-[#10D99A]/5 text-[9px] text-[#10D99A] font-bold tracking-wider uppercase">
                  Raid Ready
                </div>
              </div>

              {/* Metrics */}
              <div className="grid grid-cols-3 gap-2">
                {[
                  { value: "₱ 25.4K", label: "TREASURY", clr: "text-white" },
                  { value: "8,450 GP", label: "GP WALLET", clr: "text-[#f5c542]" },
                  { value: `${raidersCount} / 30`, label: "RAIDERS", clr: "text-[#10D99A]" },
                ].map((m, i) => (
                  <div key={i} className="rounded-lg p-2 border border-white/[0.05] bg-white/[0.01] relative">
                    <span className="text-[7px] text-white/35 block uppercase tracking-widest font-mono">{m.label}</span>
                    <span className={`text-[12px] font-bold mt-1 block font-mono ${m.clr}`}>{m.value}</span>
                  </div>
                ))}
              </div>

              {/* Spawn Activity Alert Card */}
              <div className="rounded-lg border border-[#d4a853]/20 bg-[#d4a853]/5 p-2.5 flex items-center justify-between transition-all duration-500">
                <div className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#f5c542] animate-pulse shadow-[0_0_8px_#f5c542]" />
                  <div>
                    <span className="text-[8px] text-[#f5c542] font-extrabold uppercase tracking-wider block">Spawn Alert</span>
                    <span className="text-[10px] text-white font-bold block transition-all duration-300">{bosses[bossIndex].name}</span>
                  </div>
                </div>
                <div className="text-right font-mono">
                  <span className="text-[11px] font-bold text-[#f5c542] block">{formatTimer(secondsLeft)}</span>
                  <span className="text-[7px] text-white/40 block">QUEUE: {bosses[bossIndex].queue}</span>
                </div>
              </div>
            </div>

            {/* Activity sparkline graph */}
            <div className="rounded-lg border border-white/[0.05] bg-white/[0.01] p-2.5">
              <div className="flex items-center justify-between text-[8px] uppercase tracking-wider text-white/40 mb-1.5 font-mono">
                <span>Boss Attendance</span>
                <span className="text-[#10D99A]">Avg 92%</span>
              </div>
              <svg viewBox="0 0 200 30" className="w-full h-7">
                <defs>
                  <linearGradient id="glow-grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f5c542" stopOpacity="0.3" />
                    <stop offset="100%" stopColor="#f5c542" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path
                  d="M0,25 Q15,22 30,24 T60,12 T90,18 T120,6 T150,15 T180,8 T200,5 L200,30 L0,30 Z"
                  fill="url(#glow-grad)"
                />
                <path
                  d="M0,25 Q15,22 30,24 T60,12 T90,18 T120,6 T150,15 T180,8 T200,5"
                  fill="none"
                  stroke="#d4a853"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* Floating orbital status cards */}
      <div
        className="absolute -top-3 -right-4 glass-obsidian rounded-xl px-3 py-2 shadow-[0_10px_30px_rgba(0,0,0,0.8)] border border-[#d4a853]/25 hidden sm:block z-20"
        style={{ animation: "float 6s ease-in-out infinite" }}
      >
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-red-500 animate-ping" />
          <div>
            <div className="text-[7px] uppercase tracking-[0.15em] text-[#d4a853] font-bold">NEXT BOSS SPAWN</div>
            <div className="text-[11px] font-semibold text-white tracking-tight">
              {bosses[bossIndex].next} · {formatTimer(Math.max(10, secondsLeft - 90))}
            </div>
          </div>
        </div>
      </div>

      <div
        className="absolute -bottom-3 -left-6 glass-obsidian rounded-xl px-3.5 py-2.5 shadow-[0_10px_30px_rgba(0,0,0,0.8)] border border-[#10D99A]/25 hidden sm:block z-20"
        style={{ animation: "float-reverse 7s ease-in-out infinite" }}
      >
        <div className="flex items-center gap-2.5">
          <div className="h-2 w-2 rounded-full bg-[#10D99A] shadow-[0_0_8px_#10D99A]" />
          <div>
            <div className="text-[7px] uppercase tracking-[0.15em] text-white/40 font-bold">GUILD STATUS</div>
            <div className="text-[11px] font-semibold text-white tracking-tight">{raidersCount} Members Active</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// MAIN HERO SECTION
// ═══════════════════════════════════════════════════════════

export default function Hero() {
  return (
    <section id="hero" className="relative min-h-screen flex flex-col justify-between pt-36 pb-16 overflow-hidden bg-[#050608]">
      {/* Background visual components */}
      <CircularRunes />
      <FloatingEmbers />

      {/* Radial vignette backing */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none -z-20"
        style={{
          background: "radial-gradient(ellipse at 50% 30%, rgba(245,158,11,0.035) 0%, transparent 60%)",
        }}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full relative z-10 flex flex-col items-center justify-center text-center">
        
        {/* Main centered headlines area */}
        <div className="max-w-4xl mx-auto text-center space-y-8 relative z-20 flex flex-col items-center pb-24">
          
          {/* Eyebrow badge */}
          <div
            className="inline-flex items-center gap-2 pl-1 pr-3.5 text-white/75 animate-fade-in"
          >
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#10D99A]/10 border border-[#10D99A]/20 text-[10px] uppercase tracking-wider font-extrabold text-[#10D99A]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#10D99A] shadow-[0_0_6px_#10D99A]" />
              Open Beta
            </span>
          </div>

          {/* Headline */}
          <div
            className="space-y-3"
            style={{
              animation: "slide-up 0.8s cubic-bezier(0.16,1,0.3,1) both",
              animationDelay: "120ms",
            }}
          >
            <h1 className="text-[48px] sm:text-[64px] lg:text-[78px] leading-[0.92] font-semibold text-white tracking-[-0.03em] font-fantasy">
              Manage your <span className="text-gold-gradient block sm:inline-block">guild</span> transparently.
              
            </h1>
          </div>

          {/* Subtitle */}
          <p
            className="text-[16px] sm:text-[18px] text-[#8B8F98] leading-relaxed max-w-2xl mx-auto"
            style={{
              animation: "slide-up 0.8s cubic-bezier(0.16,1,0.3,1) both",
              animationDelay: "240ms",
            }}
          >
            A management platform for MMORPG guilds. Track your Boss Schedules, Boss Attendance, Item Drop History, Alliance Boss Cycles, and Guild Treasury for Transparency — all in one clean interface.
          </p>

          {/* CTAs */}
          <div
            className="flex flex-col sm:flex-row gap-4 justify-center items-center pt-2"
            style={{
              animation: "slide-up 0.8s cubic-bezier(0.16,1,0.3,1) both",
              animationDelay: "360ms",
            }}
          >
            <Magnetic strength={6}>
              <Link
                href="/register"
                className="group inline-flex items-center justify-center gap-2 px-8 h-12 rounded-full font-bold text-[13px] bg-gradient-to-r from-[#d4a853] to-[#f5c542] text-[#08080c] shadow-[0_0_15px_rgba(212,168,83,0.25)] hover:shadow-[0_0_25px_rgba(212,168,83,0.45)] hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer"
              >
                Start Free Trial
                <svg
                  className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                >
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </Link>
            </Magnetic>

            <Magnetic strength={4}>
              <a
                href="#preview"
                className="inline-flex items-center justify-center gap-2 px-8 h-12 rounded-full font-bold text-[13px] text-white/80 border border-white/[0.08] hover:border-[#d4a853]/45 bg-[#0b0d10]/40 hover:bg-[#0b0d10]/70 hover:text-[#f5c542] hover:shadow-[0_0_12px_rgba(212,168,83,0.1)] transition-all"
              >
                <svg
                  className="h-3.5 w-3.5 text-[#d4a853]"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="12" cy="12" r="10" />
                  <polygon points="10 8 16 12 10 16 10 8" fill="currentColor" stroke="none" />
                </svg>
                Free Trial
              </a>
            </Magnetic>
          </div>

          {/* Quick benefit bullet list */}
          <div
            className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2.5 pt-4 border-t border-white/[0.04]"
            style={{
              animation: "fade-in 0.8s ease both",
              animationDelay: "520ms",
            }}
          >
            {[
              "No credit card required",
              "5 minute deployment",
              "Free 30-day trial",
            ].map((item) => (
              <span key={item} className="flex items-center gap-2 text-xs text-[#8B8F98]/70">
                <svg
                  className="h-3.5 w-3.5 text-[#f5c542]/70 shrink-0"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                {item}
              </span>
            ))}
          </div>
        </div>

        {/* Massive Centered Background Animated HUD Dashboard */}
        <div 
          className="absolute top-[48%] left-1/2 -translate-x-1/2 w-full max-w-5xl px-4 pointer-events-none -z-10 select-none hidden lg:block"
          style={{
            animation: "scale-in 1.2s cubic-bezier(0.16,1,0.3,1) both",
            animationDelay: "450ms",
            perspective: 2000,
          }}
        >
          {/* Edge gradients/vignettes to seamlessly blend card borders */}
          <div className="absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-[#050608] via-[#050608]/90 to-transparent z-25 pointer-events-none" />
          <div className="absolute inset-0 bg-gradient-to-b from-[#050608] via-transparent to-transparent z-25 pointer-events-none" style={{ height: "30%" }} />
          <div className="absolute inset-y-0 left-0 w-28 bg-gradient-to-r from-[#050608] to-transparent z-25 pointer-events-none" />
          <div className="absolute inset-y-0 right-0 w-28 bg-gradient-to-l from-[#050608] to-transparent z-25 pointer-events-none" />
          
          <DashboardCard3D isBackground />
        </div>
      </div>
    </section>
  );
}
