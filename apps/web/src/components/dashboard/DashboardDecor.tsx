"use client";

import { useEffect, useRef } from "react";

// ═══════════════════════════════════════════════════════════
// DASHBOARD DECOR — ambient halo + drifting orbs behind content.
// Subtle so it doesn't fight with foreground data.
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
      {/* Top halo */}
      <div
        className="absolute -top-40 left-1/2 -translate-x-1/2 pointer-events-none"
        style={{
          width: 880,
          height: 520,
          background:
            "radial-gradient(ellipse 60% 50% at 50% 50%, oklch(0.62 0.035 234 / 0.16) 0%, transparent 70%)",
          filter: "blur(38px)",
          opacity: 0.7,
        }}
      />
      {/* Drift orb A */}
      <div
        ref={orbARef}
        className="absolute will-change-transform"
        style={{
          top: "12%",
          left: "8%",
          width: 360,
          height: 360,
          background:
            "radial-gradient(circle, oklch(0.62 0.035 234 / 0.10) 0%, transparent 65%)",
          filter: "blur(50px)",
          transition: "transform 240ms linear",
        }}
      />
      {/* Drift orb B (platinum) */}
      <div
        ref={orbBRef}
        className="absolute will-change-transform"
        style={{
          bottom: "8%",
          right: "6%",
          width: 320,
          height: 320,
          background:
            "radial-gradient(circle, oklch(0.78 0.024 78 / 0.08) 0%, transparent 65%)",
          filter: "blur(56px)",
          transition: "transform 240ms linear",
        }}
      />
      {/* Hairline grid (very subtle) */}
      <div
        className="absolute inset-0 bg-grid bg-grid-fade"
        style={{ opacity: 0.4 }}
      />
    </div>
  );
}
