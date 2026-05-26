"use client";

import { useEffect, useState, type ReactNode, type CSSProperties } from "react";

// ═══════════════════════════════════════════════════════════
// AUTH ANIM — mount-only stagger reveal for form sequences.
// (Auth pages live above the fold; no IntersectionObserver needed.)
// ═══════════════════════════════════════════════════════════

export function AuthStagger({
  children,
  baseDelay = 0,
  stagger = 90,
  className = "",
  distance = 16,
  duration = 720,
}: {
  children: ReactNode[] | ReactNode;
  baseDelay?: number;
  stagger?: number;
  className?: string;
  distance?: number;
  duration?: number;
}) {
  const arr = Array.isArray(children) ? children : [children];
  const [show, setShow] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() =>
      requestAnimationFrame(() => setShow(true)),
    );
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div className={className}>
      {arr.map((child, i) => {
        const delay = baseDelay + i * stagger;
        const hidden: CSSProperties = {
          opacity: 0,
          transform: `translateY(${distance}px)`,
          filter: "blur(4px)",
        };
        const shown: CSSProperties = {
          opacity: 1,
          transform: "translateY(0)",
          filter: "blur(0)",
        };
        return (
          <div
            key={i}
            style={{
              transition: [
                `opacity ${duration}ms cubic-bezier(0.16,1,0.3,1) ${delay}ms`,
                `transform ${duration}ms cubic-bezier(0.16,1,0.3,1) ${delay}ms`,
                `filter ${duration}ms cubic-bezier(0.16,1,0.3,1) ${delay}ms`,
              ].join(", "),
              ...(show ? shown : hidden),
            }}
          >
            {child}
          </div>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// MAGNETIC PRESS — subtle cursor magnetism + press feedback
// ═══════════════════════════════════════════════════════════

export function MagneticPress({
  children,
  className = "",
  strength = 8,
}: {
  children: ReactNode;
  className?: string;
  strength?: number;
}) {
  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left - r.width / 2) / r.width;
    const y = (e.clientY - r.top - r.height / 2) / r.height;
    el.style.transform = `translate(${x * strength}px, ${y * strength}px)`;
  };
  const onLeave = (e: React.MouseEvent<HTMLDivElement>) => {
    e.currentTarget.style.transform = "";
  };
  return (
    <div
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      className={className}
      style={{ transition: "transform 380ms cubic-bezier(0.16,1,0.3,1)" }}
    >
      {children}
    </div>
  );
}
