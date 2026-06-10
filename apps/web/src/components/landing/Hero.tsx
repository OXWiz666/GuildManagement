"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { Magnetic } from "./LandingHelpers";

// ═══════════════════════════════════════════════════════════
// 3D DASHBOARD CARD — monochrome, scroll + mouse driven
// ═══════════════════════════════════════════════════════════

function DashboardCard3D() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

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
      // base tilt + amplified scroll tilt
      const rotX = 12 + ty * -10 + sy * -8;
      const rotY = -10 + tx * 14 + sy * 4;
      const rotZ = tx * 1.2 + sy * -1;
      const ty2 = sy * 60;
      const tz = sy * -30;
      const scale = 1 - Math.abs(sy) * 0.06;
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
  }, []);

  return (
    <div ref={wrapRef} className="relative w-full max-w-xl" style={{ perspective: 1600, transformStyle: "preserve-3d" }}>
      {/* Reflective floor shadow */}
      <div
        className="absolute -bottom-16 left-1/2 -translate-x-1/2 w-[85%] h-16 rounded-[100%] pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 50% 60% at 50% 50%, oklch(0 0 0 / 0.7) 0%, transparent 72%)",
          filter: "blur(22px)",
        }}
      />
      {/* Back glow plate */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          transform: "translateZ(-80px) scale(1.05)",
          background:
            "radial-gradient(ellipse at 50% 50%, oklch(0.45 0.04 232 / 0.18) 0%, transparent 65%)",
          filter: "blur(40px)",
        }}
      />

      <div
        ref={cardRef}
        className="relative rounded-2xl overflow-hidden"
        style={{
          willChange: "transform",
          transition: "transform 80ms linear",
          background: "linear-gradient(180deg, oklch(0.14 0 0) 0%, oklch(0.11 0 0) 100%)",
          border: "1px solid oklch(1 0 0 / 0.10)",
          boxShadow:
            "0 30px 60px -20px rgba(0,0,0,0.7), 0 0 0 1px oklch(1 0 0 / 0.04), inset 0 1px 0 oklch(1 0 0 / 0.06)",
        }}
      >
        {/* Top edge highlight */}
        <div
          className="absolute inset-x-0 top-0 h-px"
          style={{
            background: "linear-gradient(90deg, transparent, oklch(1 0 0 / 0.2), transparent)",
          }}
        />

        {/* Chrome bar */}
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/[0.06] bg-black/30">
          <div className="flex gap-1.5">
            <div className="h-2.5 w-2.5 rounded-full bg-white/15" />
            <div className="h-2.5 w-2.5 rounded-full bg-white/15" />
            <div className="h-2.5 w-2.5 rounded-full bg-white/15" />
          </div>
          <div className="flex-1 mx-3 h-5 rounded-md text-[10px] text-white/30 flex items-center justify-center font-mono">
            app.forgekeep.gg/dashboard
          </div>
          <div className="h-3.5 w-3.5 text-white/30">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
          </div>
        </div>

        {/* Content */}
        <div className="flex" style={{ height: 380 }}>
          {/* Sidebar */}
          <div className="w-36 flex flex-col flex-shrink-0 border-r border-white/[0.05] p-3 bg-black/20">
            <div className="flex items-center gap-2 mb-4">
              <div className="h-6 w-6 rounded-md border border-white/15 bg-white/[0.04] flex items-center justify-center">
                <svg className="h-3 w-3 text-white/70" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2L2 7l10 5 10-5-10-5z" />
                </svg>
              </div>
              <div className="h-1.5 w-14 rounded bg-white/25" />
            </div>

            {/* Guild switcher */}
            <div className="mb-4 px-2 py-2 rounded-lg border border-white/[0.08] bg-white/[0.02]">
              <div className="text-[7px] uppercase tracking-widest text-white/30 mb-1">Active</div>
              <div className="flex items-center gap-1.5">
                <div className="h-4 w-4 rounded bg-white/15" />
                <div className="h-1.5 w-12 rounded bg-white/35" />
              </div>
            </div>

            {/* Nav items */}
            {[
              { active: true,  w: "w-16" },
              { active: false, w: "w-12" },
              { active: false, w: "w-14" },
              { active: false, w: "w-10" },
              { active: false, w: "w-12" },
            ].map((item, i) => (
              <div
                key={i}
                className={`flex items-center gap-2 px-2 py-1.5 rounded-md mb-0.5 ${
                  item.active ? "bg-white/[0.06]" : ""
                }`}
              >
                <div className={`h-1 w-1 rounded-full ${item.active ? "bg-white" : "bg-white/15"}`} />
                <div className={`h-1.5 rounded ${item.active ? "bg-white/60" : "bg-white/15"} ${item.w}`} />
              </div>
            ))}
            <div className="flex-1" />
            <div className="pt-3 border-t border-white/[0.05] flex items-center gap-2">
              <div className="h-5 w-5 rounded-full bg-gradient-to-br from-white/30 to-white/10" />
              <div>
                <div className="h-1.5 w-12 rounded bg-white/30" />
                <div className="h-1 w-8 rounded bg-white/15 mt-0.5" />
              </div>
            </div>
          </div>

          {/* Main */}
          <div className="flex-1 p-4 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="h-2.5 w-32 rounded bg-white/40" />
                <div className="h-1.5 w-24 rounded bg-white/15 mt-1.5" />
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-6 px-3 rounded-md bg-white/10 border border-white/15 flex items-center">
                  <div className="h-1.5 w-10 rounded bg-white/60" />
                </div>
                <div className="h-6 w-6 rounded-full bg-gradient-to-br from-white/30 to-white/10" />
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-4 gap-2 mb-4">
              {[
                { v: "1,240",  l: "balance", up: true  },
                { v: "8,450",  l: "points",  up: true  },
                { v: "24",     l: "members", up: false },
                { v: "7",      l: "kills",   up: true  },
              ].map((s, i) => (
                <div
                  key={i}
                  className="rounded-lg p-2 border border-white/[0.06] bg-white/[0.02]"
                >
                  <div className="text-[7px] uppercase tracking-widest text-white/30">{s.l}</div>
                  <div className="text-[11px] font-semibold text-white mt-0.5 font-mono">{s.v}</div>
                  <div className="mt-1 h-0.5 w-full rounded bg-white/5 overflow-hidden">
                    <div
                      className={`h-full ${s.up ? "bg-emerald-400/70" : "bg-white/30"}`}
                      style={{ width: `${50 + i * 12}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Chart strip */}
            <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 mb-3">
              <div className="flex items-center justify-between mb-2">
                <div className="text-[8px] uppercase tracking-widest text-white/40">Activity · 30d</div>
                <div className="flex gap-1.5">
                  <div className="h-1 w-1 rounded-full bg-emerald-400/80" />
                  <div className="h-1 w-1 rounded-full bg-white/40" />
                </div>
              </div>
              {/* Mini sparkline (SVG) */}
              <svg viewBox="0 0 200 36" className="w-full h-9">
                <defs>
                  <linearGradient id="spark" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="oklch(0.85 0.02 240)" stopOpacity="0.45" />
                    <stop offset="100%" stopColor="oklch(0.85 0.02 240)" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path
                  d="M0,28 L20,22 L40,24 L60,16 L80,18 L100,10 L120,14 L140,8 L160,12 L180,6 L200,9 L200,36 L0,36 Z"
                  fill="url(#spark)"
                />
                <path
                  d="M0,28 L20,22 L40,24 L60,16 L80,18 L100,10 L120,14 L140,8 L160,12 L180,6 L200,9"
                  fill="none"
                  stroke="oklch(0.92 0.005 240)"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                />
              </svg>
            </div>

            {/* List */}
            <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] overflow-hidden">
              {[
                { online: true,  role: "leader"  },
                { online: true,  role: "officer" },
                { online: false, role: "member"  },
              ].map((m, i) => (
                <div
                  key={i}
                  className={`flex items-center gap-2 px-3 py-1.5 ${i > 0 ? "border-t border-white/[0.04]" : ""}`}
                >
                  <div className="relative">
                    <div className="h-4 w-4 rounded-full bg-gradient-to-br from-white/30 to-white/10" />
                    <div
                      className={`absolute -bottom-px -right-px h-1.5 w-1.5 rounded-full border border-black ${
                        m.online ? "bg-emerald-400" : "bg-white/20"
                      }`}
                    />
                  </div>
                  <div className="h-1.5 w-20 rounded bg-white/25 flex-1" />
                  <div className="text-[7px] uppercase tracking-widest text-white/40">{m.role}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Floating chips around mockup */}
      <div
        className="absolute -top-4 -right-4 glass rounded-xl px-3 py-2 border border-white/[0.08] hidden sm:block"
        style={{ animation: "float 6s ease-in-out infinite" }}
      >
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
          <div>
            <div className="text-[8px] uppercase tracking-widest text-white/40">Boss alert</div>
            <div className="text-[11px] font-medium text-white">Titore · 5m</div>
          </div>
        </div>
      </div>

      <div
        className="absolute -bottom-2 -left-6 glass rounded-xl px-3 py-2 border border-white/[0.08] hidden sm:block"
        style={{ animation: "float 7s ease-in-out infinite 2s" }}
      >
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <div>
            <div className="text-[8px] uppercase tracking-widest text-white/40">Live sync</div>
            <div className="text-[11px] font-medium text-white">24 online</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// HERO
// ═══════════════════════════════════════════════════════════

export default function Hero() {
  return (
    <section className="relative min-h-screen flex items-center pt-32 pb-20 overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
        <div className="grid grid-cols-1 lg:grid-cols-[1.05fr_1fr] gap-14 lg:gap-20 items-center">
          {/* Left: Text */}
          <div className="space-y-7">
            {/* Eyebrow badge */}
            <div
              className="inline-flex items-center gap-2.5 pl-1 pr-3.5 py-1 rounded-full border border-white/[0.08] bg-white/[0.03] backdrop-blur text-[11px] text-white/65 animate-fade-in"
            >
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-white/[0.06] text-[10px] uppercase tracking-widest font-medium text-white/80">
                <span className="h-1 w-1 rounded-full bg-emerald-400" />
                Open beta
              </span>
              <span>50+ guilds onboarded</span>
            </div>

            {/* Headline */}
            <div
              className="space-y-3"
              style={{
                animation: "slide-up 0.8s cubic-bezier(0.16,1,0.3,1) both",
                animationDelay: "120ms",
              }}
            >
              <h1 className="text-[44px] sm:text-[56px] lg:text-[72px] leading-[0.95] font-semibold text-white tracking-[-0.025em]">
                Command<br />
                <span className="relative inline-block">
                  <span className="text-white/55">your guild,</span>
                </span>
                <br />
                with precision.
              </h1>
            </div>

            {/* Subtitle */}
            <p
              className="text-[17px] text-white/55 leading-[1.55] max-w-lg"
              style={{
                animation: "slide-up 0.8s cubic-bezier(0.16,1,0.3,1) both",
                animationDelay: "240ms",
              }}
            >
              A real operations platform for serious MMORPG guilds.
              Members, Attendance, GP, Boss Alerts, Guild Treasury — in one calm interface.
            </p>

            {/* CTAs */}
            <div
              className="flex flex-col sm:flex-row gap-3 pt-2"
              style={{
                animation: "slide-up 0.8s cubic-bezier(0.16,1,0.3,1) both",
                animationDelay: "360ms",
              }}
            >
              <Magnetic strength={6}>
                <Link
                  href="/register"
                  className="group inline-flex items-center justify-center gap-2 px-6 h-12 rounded-full font-medium text-[14px] bg-white text-black hover:bg-white/90 transition-colors"
                >
                  Start Free Trial
                  <svg
                    className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                  >
                    <path d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                </Link>
              </Magnetic>

              <a
                href="#preview"
                className="inline-flex items-center justify-center gap-2 px-6 h-12 rounded-full font-medium text-[14px] text-white border border-white/[0.10] hover:border-white/25 bg-white/[0.02] hover:bg-white/[0.05] transition-all"
              >
                <svg
                  className="h-3.5 w-3.5 text-white/70"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="12" cy="12" r="10" />
                  <polygon points="10 8 16 12 10 16 10 8" fill="currentColor" stroke="none" />
                </svg>
                Try Demo!
              </a>
            </div>

            {/* Trust micro-row */}
            <div
              className="flex flex-wrap items-center gap-x-6 gap-y-2 pt-5"
              style={{
                animation: "fade-in 0.8s ease both",
                animationDelay: "520ms",
              }}
            >
              {[
                "No credit card",
                "5 min setup",
                "Free 30-day trial",
              ].map((t) => (
                <span key={t} className="flex items-center gap-2 text-xs text-white/40">
                  <svg
                    className="h-3 w-3 text-white/50"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                  >
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                  {t}
                </span>
              ))}
            </div>
          </div>

          {/* Right: 3D mockup */}
          <div
            className="hidden lg:flex justify-center"
            style={{
              animation: "scale-in 1s cubic-bezier(0.16,1,0.3,1) both",
              animationDelay: "320ms",
            }}
          >
            <DashboardCard3D />
          </div>
        </div>
      </div>

    </section>
  );
}
