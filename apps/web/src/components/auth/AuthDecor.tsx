"use client";

import { useEffect, useRef } from "react";

// ═══════════════════════════════════════════════════════════
// AUTH DECOR — floating chips + ambient ornaments around the card
// Mouse-driven parallax + per-element float drift.
// ═══════════════════════════════════════════════════════════

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
      className="absolute inset-0 pointer-events-none hidden md:block"
      style={{ perspective: 1400 }}
    >
      {/* ── Encrypted chip — top-left of card ───────────────────── */}
      <div
        className="absolute glass rounded-xl px-3 py-2 border border-white/[0.10] shadow-[0_12px_30px_-12px_rgba(0,0,0,0.6)]"
        style={{
          top: "calc(50% - 220px)",
          left: "calc(50% - 360px)",
          transform:
            "translate3d(calc(var(--ax, 0) * 16px), calc(var(--ay, 0) * 14px), 0)",
          transition: "transform 220ms linear",
          animation: "float 6s ease-in-out infinite",
        }}
      >
        <div className="flex items-center gap-2">
          <div className="relative h-6 w-6 rounded-lg border border-white/15 bg-white/[0.04] flex items-center justify-center">
            <svg
              className="h-3 w-3 text-white/80"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <rect x="3" y="11" width="18" height="11" rx="2" />
              <path d="M7 11V7a5 5 0 0110 0v4" />
            </svg>
            <span className="absolute -inset-0.5 rounded-lg border border-white/10 animate-ping" />
          </div>
          <div className="leading-tight">
            <div className="text-[8px] uppercase tracking-[0.22em] text-white/40">
              Layer
            </div>
            <div className="text-[11px] font-medium text-white">
              AES-256 · TLS 1.3
            </div>
          </div>
        </div>
      </div>

      {/* ── Live session pulse — top-right ──────────────────────── */}
      <div
        className="absolute glass rounded-xl px-3 py-2 border border-white/[0.10] shadow-[0_12px_30px_-12px_rgba(0,0,0,0.6)]"
        style={{
          top: "calc(50% - 180px)",
          right: "calc(50% - 380px)",
          transform:
            "translate3d(calc(var(--ax, 0) * -22px), calc(var(--ay, 0) * 12px), 0)",
          transition: "transform 220ms linear",
          animation: "float 7s ease-in-out infinite 1.2s",
        }}
      >
        <div className="flex items-center gap-2">
          <div className="relative">
            <span className="block h-2 w-2 rounded-full bg-emerald-400" />
            <span className="absolute inset-0 rounded-full bg-emerald-400 animate-ping" />
          </div>
          <div className="leading-tight">
            <div className="text-[8px] uppercase tracking-[0.22em] text-white/40">
              Cluster
            </div>
            <div className="text-[11px] font-medium text-white">
              EU-West · 12ms
            </div>
          </div>
        </div>
      </div>

      {/* ── Guild stat chip — bottom-left ───────────────────────── */}
      <div
        className="absolute glass rounded-xl px-3 py-2 border border-white/[0.10] shadow-[0_12px_30px_-12px_rgba(0,0,0,0.6)]"
        style={{
          bottom: "calc(50% - 240px)",
          left: "calc(50% - 380px)",
          transform:
            "translate3d(calc(var(--ax, 0) * 24px), calc(var(--ay, 0) * -18px), 0)",
          transition: "transform 220ms linear",
          animation: "float 8s ease-in-out infinite 2.4s",
        }}
      >
        <div className="flex items-center gap-2.5">
          <div className="h-7 w-7 rounded-lg border border-white/15 bg-gradient-to-br from-white/15 to-white/5 flex items-center justify-center">
            <svg
              className="h-3.5 w-3.5 text-white/80"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
            </svg>
          </div>
          <div className="leading-tight">
            <div className="text-[8px] uppercase tracking-[0.22em] text-white/40">
              Guilds
            </div>
            <div className="text-[11px] font-medium text-white font-mono">
              512 · onboarded
            </div>
          </div>
        </div>
      </div>

      {/* ── DKP / earnings chip — bottom-right ──────────────────── */}
      <div
        className="absolute glass rounded-xl px-3 py-2 border border-white/[0.10] shadow-[0_12px_30px_-12px_rgba(0,0,0,0.6)]"
        style={{
          bottom: "calc(50% - 200px)",
          right: "calc(50% - 360px)",
          transform:
            "translate3d(calc(var(--ax, 0) * -18px), calc(var(--ay, 0) * -22px), 0)",
          transition: "transform 220ms linear",
          animation: "float 6.5s ease-in-out infinite 0.8s",
        }}
      >
        <div className="flex items-center gap-2.5">
          <div className="h-7 w-7 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.08] flex items-center justify-center">
            <svg
              className="h-3.5 w-3.5 text-emerald-400"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M23 6l-9.5 9.5-5-5L1 18" />
              <path d="M17 6h6v6" />
            </svg>
          </div>
          <div className="leading-tight">
            <div className="text-[8px] uppercase tracking-[0.22em] text-white/40">
              Uptime · 90d
            </div>
            <div className="text-[11px] font-medium text-white font-mono">
              99.98%
            </div>
          </div>
        </div>
      </div>

      {/* ── Orbiting ring — behind everything ───────────────────── */}
      <div
        className="absolute left-1/2 top-1/2 pointer-events-none"
        style={{
          width: 560,
          height: 560,
          marginLeft: -280,
          marginTop: -280,
          transform:
            "translate3d(calc(var(--ax, 0) * -8px), calc(var(--ay, 0) * -8px), 0)",
          transition: "transform 280ms linear",
        }}
      >
        <div
          className="absolute inset-0 rounded-full border border-white/[0.05]"
          style={{ animation: "spin-slow 60s linear infinite" }}
        >
          <span
            className="absolute h-1.5 w-1.5 rounded-full bg-white/70 shadow-[0_0_12px_2px_rgba(255,255,255,0.45)]"
            style={{ top: -3, left: "50%", marginLeft: -3 }}
          />
        </div>
        <div
          className="absolute inset-8 rounded-full border border-white/[0.04]"
          style={{ animation: "spin-slow 90s linear infinite reverse" }}
        >
          <span
            className="absolute h-1 w-1 rounded-full bg-emerald-400/90 shadow-[0_0_10px_2px_rgba(52,211,153,0.55)]"
            style={{ bottom: -2, left: "30%" }}
          />
        </div>
      </div>
    </div>
  );
}
