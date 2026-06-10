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
