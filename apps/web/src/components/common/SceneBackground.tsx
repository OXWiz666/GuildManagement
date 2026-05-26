"use client";

import { useEffect, useRef } from "react";

/**
 * SceneBackground — shared atmospheric background for landing & auth.
 *
 * Layers (back → front):
 *  1. Vignette base
 *  2. Aurora mesh (slow drifting blurred gradients)
 *  3. Floating depth orbs with mouse + scroll parallax (3D feel)
 *  4. Hairline grid with radial fade
 *  5. Noise grain overlay
 *
 * Pure CSS animations + lightweight RAF parallax. No WebGL/Canvas to keep bundle small.
 */
export default function SceneBackground({
  intensity = "default",
  showGrid = true,
}: {
  intensity?: "default" | "subtle" | "strong";
  showGrid?: boolean;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const orbARef = useRef<HTMLDivElement>(null);
  const orbBRef = useRef<HTMLDivElement>(null);
  const orbCRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let raf = 0;
    let mx = 0, my = 0;
    let tx = 0, ty = 0;

    const handleMove = (e: MouseEvent) => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      mx = (e.clientX / w - 0.5) * 2;
      my = (e.clientY / h - 0.5) * 2;
    };

    const handleScroll = () => {
      const y = window.scrollY;
      if (orbARef.current) orbARef.current.style.setProperty("--scroll-y", `${y * 0.15}px`);
      if (orbBRef.current) orbBRef.current.style.setProperty("--scroll-y", `${y * 0.28}px`);
      if (orbCRef.current) orbCRef.current.style.setProperty("--scroll-y", `${y * 0.08}px`);
    };

    const tick = () => {
      // smooth-lerp toward mouse
      tx += (mx - tx) * 0.06;
      ty += (my - ty) * 0.06;

      if (orbARef.current) {
        orbARef.current.style.setProperty("--mx", `${tx * 30}px`);
        orbARef.current.style.setProperty("--my", `${ty * 30}px`);
      }
      if (orbBRef.current) {
        orbBRef.current.style.setProperty("--mx", `${tx * -50}px`);
        orbBRef.current.style.setProperty("--my", `${ty * -45}px`);
      }
      if (orbCRef.current) {
        orbCRef.current.style.setProperty("--mx", `${tx * 18}px`);
        orbCRef.current.style.setProperty("--my", `${ty * 22}px`);
      }
      raf = requestAnimationFrame(tick);
    };

    window.addEventListener("mousemove", handleMove, { passive: true });
    window.addEventListener("scroll", handleScroll, { passive: true });
    raf = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("scroll", handleScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  const opacityScale =
    intensity === "subtle" ? 0.6 : intensity === "strong" ? 1.15 : 1;

  return (
    <div
      ref={rootRef}
      aria-hidden
      className="fixed inset-0 overflow-hidden pointer-events-none -z-10"
      style={{ background: "radial-gradient(ellipse at 50% -10%, oklch(0.16 0 0) 0%, #08080a 55%, #06060a 100%)" }}
    >
      {/* ── Aurora mesh ─────────────────────────────────── */}
      <div className="absolute inset-0" style={{ opacity: 0.85 * opacityScale }}>
        <div className="aurora-mesh" />
      </div>
      <div className="absolute inset-0" style={{ opacity: 0.6 * opacityScale }}>
        <div className="aurora-mesh-soft" />
      </div>

      {/* ── Depth orbs (3D parallax) ──────────────────── */}
      <div
        ref={orbARef}
        className="absolute will-change-transform"
        style={{
          top: "12%",
          left: "10%",
          width: 520,
          height: 520,
          transform: "translate3d(var(--mx, 0), calc(var(--my, 0) + var(--scroll-y, 0px)), 0)",
          transition: "transform 200ms linear",
          background:
            "radial-gradient(circle, oklch(0.45 0.05 232 / 0.16) 0%, transparent 65%)",
          filter: "blur(60px)",
          opacity: 0.9 * opacityScale,
        }}
      />
      <div
        ref={orbBRef}
        className="absolute will-change-transform"
        style={{
          top: "55%",
          right: "8%",
          width: 460,
          height: 460,
          transform: "translate3d(var(--mx, 0), calc(var(--my, 0) + var(--scroll-y, 0px)), 0)",
          transition: "transform 200ms linear",
          background:
            "radial-gradient(circle, oklch(0.58 0.04 76 / 0.12) 0%, transparent 65%)",
          filter: "blur(70px)",
          opacity: 0.8 * opacityScale,
        }}
      />
      <div
        ref={orbCRef}
        className="absolute will-change-transform"
        style={{
          top: "75%",
          left: "35%",
          width: 380,
          height: 380,
          transform: "translate3d(var(--mx, 0), calc(var(--my, 0) + var(--scroll-y, 0px)), 0)",
          transition: "transform 220ms linear",
          background:
            "radial-gradient(circle, oklch(0.36 0.02 230 / 0.16) 0%, transparent 65%)",
          filter: "blur(80px)",
          opacity: 0.75 * opacityScale,
        }}
      />

      {/* ── Hairline grid ─────────────────────────────── */}
      {showGrid && (
        <div className="absolute inset-0 bg-grid bg-grid-fade" style={{ opacity: 0.7 }} />
      )}

      {/* ── Noise grain ───────────────────────────────── */}
      <div className="noise-overlay" />

      {/* ── Bottom vignette ───────────────────────────── */}
      <div
        className="absolute inset-x-0 bottom-0 h-1/3 pointer-events-none"
        style={{ background: "linear-gradient(to bottom, transparent, #08080a 90%)" }}
      />
    </div>
  );
}
