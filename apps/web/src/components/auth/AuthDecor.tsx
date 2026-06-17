"use client";

import { useEffect, useRef } from "react";

// ═══════════════════════════════════════════════════════════
// AUTH DECOR — floating chips + ambient ornaments around the card
// Mouse-driven parallax + per-element float drift.
// ═══════════════════════════════════════════════════════════

const PARTICLES = [
  { left: "8%", top: "75%", delay: 0.5, size: 3, driftX: "20px" },
  { left: "88%", top: "70%", delay: 1.2, size: 4, driftX: "-25px" },
  { left: "20%", top: "85%", delay: 2.5, size: 2, driftX: "15px" },
  { left: "75%", top: "80%", delay: 3.8, size: 3, driftX: "-30px" },
  { left: "12%", top: "55%", delay: 4.1, size: 2.5, driftX: "10px" },
  { left: "82%", top: "45%", delay: 5.5, size: 2, driftX: "-15px" },
  { left: "28%", top: "35%", delay: 6.2, size: 3.5, driftX: "20px" },
  { left: "68%", top: "30%", delay: 7.0, size: 2.5, driftX: "-20px" },
  { left: "42%", top: "82%", delay: 8.3, size: 3, driftX: "5px" },
  { left: "58%", top: "68%", delay: 9.1, size: 2, driftX: "-10px" },
];

const FantasySigil = () => (
  <svg
    className="absolute w-[580px] h-[580px] opacity-[0.03] text-white pointer-events-none select-none"
    viewBox="0 0 200 200"
    fill="none"
    stroke="currentColor"
    strokeWidth="0.4"
    style={{
      animation: "spin-slow 180s linear infinite",
    }}
  >
    {/* Concentric rings */}
    <circle cx="100" cy="100" r="95" strokeDasharray="3 3" />
    <circle cx="100" cy="100" r="85" />
    <circle cx="100" cy="100" r="80" strokeDasharray="8 4" />
    <circle cx="100" cy="100" r="62" />
    <circle cx="100" cy="100" r="60" strokeDasharray="1 3" />
    <circle cx="100" cy="100" r="42" />
    
    {/* Intersecting geometries */}
    <polygon points="100,5 182,148 18,148" strokeWidth="0.25" strokeDasharray="1 1" />
    <polygon points="100,195 18,52 182,52" strokeWidth="0.25" strokeDasharray="1 1" />
    <path d="M100 5 V195 M5 100 H195" strokeWidth="0.15" strokeDasharray="3 3" />
    
    {/* Rune/tech nodes */}
    <circle cx="100" cy="5" r="1.5" fill="currentColor" />
    <circle cx="100" cy="195" r="1.5" fill="currentColor" />
    <circle cx="5" cy="100" r="1.5" fill="currentColor" />
    <circle cx="195" cy="100" r="1.5" fill="currentColor" />
  </svg>
);

export default function AuthDecor() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const root = rootRef.current;
    if (!root) return;

    let raf = 0;
    let mx = 0, my = 0;
    let tx = 0, ty = 0;

    const onMove = (e: MouseEvent) => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      mx = (e.clientX / w - 0.5) * 2;
      my = (e.clientY / h - 0.5) * 2;
    };

    const tick = () => {
      tx += (mx - tx) * 0.07;
      ty += (my - ty) * 0.07;
      root.style.setProperty("--ax", `${tx}`);
      root.style.setProperty("--ay", `${ty}`);
      raf = requestAnimationFrame(tick);
    };

    window.addEventListener("mousemove", onMove, { passive: true });
    raf = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener("mousemove", onMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div
      ref={rootRef}
      aria-hidden
      className="absolute inset-0 pointer-events-none hidden md:block overflow-hidden"
      style={{ perspective: 1400 }}
    >
      {/* ── Soft Emerald Glow Accent ───────────────────────────── */}
      <div
        className="absolute left-1/4 top-1/3 -translate-x-1/2 -translate-y-1/2 w-[350px] h-[350px] pointer-events-none"
        style={{
          background: "radial-gradient(circle, rgba(16, 217, 154, 0.04) 0%, transparent 70%)",
          filter: "blur(40px)",
        }}
      />
      <div
        className="absolute right-1/4 bottom-1/3 translate-x-1/2 translate-y-1/2 w-[300px] h-[300px] pointer-events-none"
        style={{
          background: "radial-gradient(circle, rgba(16, 217, 154, 0.03) 0%, transparent 70%)",
          filter: "blur(40px)",
        }}
      />

      {/* ── Concentric Sigil — behind everything ───────────────────── */}
      <div
        className="absolute left-1/2 top-1/2 pointer-events-none flex items-center justify-center"
        style={{
          width: 580,
          height: 580,
          marginLeft: -290,
          marginTop: -290,
          transform:
            "translate3d(calc(var(--ax, 0) * -12px), calc(var(--ay, 0) * -12px), -50px)",
          transition: "transform 280ms linear",
        }}
      >
        <FantasySigil />
      </div>

      {/* ── Orbiting rings — overlaying sigil ───────────────────── */}
      <div
        className="absolute left-1/2 top-1/2 pointer-events-none"
        style={{
          width: 560,
          height: 560,
          marginLeft: -280,
          marginTop: -280,
          transform:
            "translate3d(calc(var(--ax, 0) * -6px), calc(var(--ay, 0) * -6px), 0)",
          transition: "transform 280ms linear",
        }}
      >
        <div
          className="absolute inset-0 rounded-full border border-white/[0.03]"
          style={{ animation: "spin-slow 60s linear infinite" }}
        >
          <span
            className="absolute h-1 w-1 rounded-full bg-[#F5B841]/50 shadow-[0_0_8px_1px_rgba(245,184,65,0.3)]"
            style={{ top: -2, left: "50%", marginLeft: -2 }}
          />
        </div>
        <div
          className="absolute inset-12 rounded-full border border-[#10D99A]/[0.02]"
          style={{ animation: "spin-slow 90s linear infinite reverse" }}
        >
          <span
            className="absolute h-1 w-1 rounded-full bg-[#10D99A]/60 shadow-[0_0_8px_1px_rgba(16,217,154,0.4)]"
            style={{ bottom: -2, left: "30%" }}
          />
        </div>
      </div>

      {/* ── Subtle gold/orange particles ───────────────────────── */}
      <div className="absolute inset-0 z-0">
        {PARTICLES.map((p, idx) => (
          <span
            key={idx}
            className="absolute rounded-full bg-[#F5B841]/40 blur-[0.5px] animate-particle"
            style={{
              left: p.left,
              top: p.top,
              width: p.size,
              height: p.size,
              animationDelay: `${p.delay}s`,
              "--drift-x": p.driftX,
              boxShadow: "0 0 6px 1px rgba(245, 184, 65, 0.3)",
            } as any}
          />
        ))}
      </div>
    </div>
  );
}