"use client";

import { useEffect, useRef } from "react";

// ═══════════════════════════════════════════════════════════
// DASHBOARD DECOR — Obsidian forge ambient glow + drifting
// gold orbs behind content. Subtle so it doesn't fight with
// foreground data, but adds MMORPG atmosphere.
// ═══════════════════════════════════════════════════════════

export default function DashboardDecor() {
  const orbARef = useRef<HTMLDivElement>(null);
  const orbBRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let raf = 0;
    let mx = 0,
      my = 0;
    let tx = 0,
      ty = 0;

    const onMove = (e: MouseEvent) => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      mx = (e.clientX / w - 0.5) * 2;
      my = (e.clientY / h - 0.5) * 2;
    };

    const tick = () => {
      tx += (mx - tx) * 0.05;
      ty += (my - ty) * 0.05;
      if (orbARef.current) {
        orbARef.current.style.transform = `translate3d(${tx * 20}px, ${ty * 18}px, 0)`;
      }
      if (orbBRef.current) {
        orbBRef.current.style.transform = `translate3d(${tx * -28}px, ${ty * -22}px, 0)`;
      }
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
      aria-hidden
      className="absolute inset-0 overflow-hidden pointer-events-none -z-0"
    >
      {/* Top forge-light halo — warm gold radial */}
      <div
        className="absolute -top-40 left-1/2 -translate-x-1/2 pointer-events-none"
        style={{
          width: 920,
          height: 540,
          background:
            "radial-gradient(ellipse 55% 45% at 50% 50%, rgba(212,168,83,0.10) 0%, rgba(167,131,50,0.04) 40%, transparent 70%)",
          filter: "blur(42px)",
          opacity: 0.8,
        }}
      />
      {/* Secondary subtle blue-obsidian halo for depth */}
      <div
        className="absolute -top-32 left-1/2 -translate-x-1/2 pointer-events-none"
        style={{
          width: 700,
          height: 400,
          background:
            "radial-gradient(ellipse 60% 50% at 50% 50%, oklch(0.30 0.03 280 / 0.12) 0%, transparent 70%)",
          filter: "blur(50px)",
          opacity: 0.6,
        }}
      />
      {/* Drift orb A — warm gold */}
      <div
        ref={orbARef}
        className="absolute will-change-transform"
        style={{
          top: "12%",
          left: "8%",
          width: 380,
          height: 380,
          background:
            "radial-gradient(circle, rgba(212,168,83,0.07) 0%, transparent 65%)",
          filter: "blur(55px)",
          transition: "transform 240ms linear",
        }}
      />
      {/* Drift orb B — cooler gold-amber */}
      <div
        ref={orbBRef}
        className="absolute will-change-transform"
        style={{
          bottom: "8%",
          right: "6%",
          width: 340,
          height: 340,
          background:
            "radial-gradient(circle, rgba(167,131,50,0.06) 0%, transparent 65%)",
          filter: "blur(60px)",
          transition: "transform 240ms linear",
        }}
      />
      {/* Hairline grid (gold-tinted, very subtle) */}
      <div
        className="absolute inset-0 bg-grid bg-grid-fade"
        style={{ opacity: 0.45 }}
      />
    </div>
  );
}
