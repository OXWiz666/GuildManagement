"use client";

import {
  useRef,
  useCallback,
  useEffect,
  useState,
  type ReactNode,
  type CSSProperties,
} from "react";

// ═══════════════════════════════════════════════════════════
// AUTH CARD — entrance reveal + gentle 3D tilt on hover.
// Disables tilt when an input is focused so typing feels stable.
// ═══════════════════════════════════════════════════════════

export default function AuthCard({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const shineRef = useRef<HTMLDivElement>(null);
  const [revealed, setRevealed] = useState(false);
  const focusActive = useRef(false);

  // Intro reveal
  useEffect(() => {
    const id = requestAnimationFrame(() =>
      requestAnimationFrame(() => setRevealed(true)),
    );
    return () => cancelAnimationFrame(id);
  }, []);

  // Suppress tilt while typing
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const onFocusIn = (e: FocusEvent) => {
      if (
        e.target instanceof HTMLElement &&
        ["INPUT", "TEXTAREA"].includes(e.target.tagName)
      ) {
        focusActive.current = true;
        resetTilt();
      }
    };
    const onFocusOut = (e: FocusEvent) => {
      if (
        e.target instanceof HTMLElement &&
        ["INPUT", "TEXTAREA"].includes(e.target.tagName)
      ) {
        focusActive.current = false;
      }
    };
    wrap.addEventListener("focusin", onFocusIn);
    wrap.addEventListener("focusout", onFocusOut);
    return () => {
      wrap.removeEventListener("focusin", onFocusIn);
      wrap.removeEventListener("focusout", onFocusOut);
    };
  }, []);

  const resetTilt = () => {
    const card = cardRef.current;
    const shine = shineRef.current;
    if (card) {
      card.style.transition = "transform 700ms cubic-bezier(0.16,1,0.3,1)";
      card.style.transform = "";
    }
    if (shine) shine.style.opacity = "0";
  };

  const onMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (focusActive.current) return;
    const card = cardRef.current;
    const shine = shineRef.current;
    if (!card) return;
    const r = card.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    const x = (px - 0.5) * 4; // intensity (degrees) — very subtle
    const y = (py - 0.5) * 4;
    card.style.transition = "transform 140ms ease-out";
    card.style.transform = `perspective(1200px) rotateX(${-y}deg) rotateY(${x}deg)`;
    if (shine) {
      shine.style.opacity = "1";
      shine.style.background = `radial-gradient(circle at ${px * 100}% ${py * 100}%, oklch(1 0 0 / 0.08) 0%, transparent 55%)`;
    }
  }, []);

  const onLeave = useCallback(() => resetTilt(), []);

  const hidden: CSSProperties = {
    opacity: 0,
    transform: "translateY(28px) scale(0.97)",
    filter: "blur(6px)",
  };
  const shown: CSSProperties = {
    opacity: 1,
    transform: "translateY(0) scale(1)",
    filter: "blur(0)",
  };

  return (
    <div
      ref={wrapRef}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      style={{
        transition:
          "opacity 900ms cubic-bezier(0.16,1,0.3,1), transform 900ms cubic-bezier(0.16,1,0.3,1), filter 900ms cubic-bezier(0.16,1,0.3,1)",
        transitionDelay: "120ms",
        ...(revealed ? shown : hidden),
        willChange: "transform",
      }}
    >
      <div
        ref={cardRef}
        className={`relative bg-[#0B0D10]/85 backdrop-blur-2xl rounded-2xl p-8 md:p-10 border border-[#1E232B] shadow-[0_40px_90px_-25px_rgba(0,0,0,0.85)] ${className}`}
        style={{ transformStyle: "preserve-3d", willChange: "transform" }}
      >
        {/* Animated top edge gradient */}
        <div
          className="absolute inset-x-8 top-0 h-px overflow-hidden"
          style={{
            background:
              "linear-gradient(90deg, transparent, rgba(245, 184, 65, 0.35), transparent)",
          }}
        />
        {/* Mouse-follow shine */}
        <div
          ref={shineRef}
          className="absolute inset-0 rounded-2xl pointer-events-none transition-opacity duration-500"
          style={{ opacity: 0 }}
        />
        {/* Corner accent — animated */}
        <span
          aria-hidden
          className="absolute top-4 right-4 h-1.5 w-1.5 rounded-full bg-[#10D99A] shadow-[0_0_10px_2px_rgba(16,217,154,0.6)]"
          style={{ animation: "pulse-soft 3s ease-in-out infinite" }}
        />
        {children}
      </div>
    </div>
  );
}
