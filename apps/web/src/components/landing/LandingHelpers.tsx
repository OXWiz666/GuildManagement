"use client";

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  type ReactNode,
  type CSSProperties,
} from "react";

// ═══════════════════════════════════════════════════════════
// REVEAL HOOK
// ═══════════════════════════════════════════════════════════

export function useReveal(threshold = 0.12, once = true) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          if (once) obs.disconnect();
        } else if (!once) {
          setVisible(false);
        }
      },
      { threshold, rootMargin: "0px 0px -8% 0px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold, once]);
  return { ref, visible };
}

// ═══════════════════════════════════════════════════════════
// REVEAL — fades + lifts on scroll-in (no blur on text for clarity)
// ═══════════════════════════════════════════════════════════

/**
 * Reads `prefers-reduced-motion` after mount. Returns `false` on the server and
 * on the first client render so SSR and hydration always match, then updates to
 * the real preference (and stays in sync if it changes).
 */
function useReducedMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduce(mq.matches);
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, []);
  return reduce;
}

export function Reveal({
  children,
  delay = 0,
  className = "",
  from = "bottom",
  distance = 32,
  blur = 0,
  duration = 800,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  /** "morph" combines a scale + blur dissolve for a fluid reveal of visual blocks. */
  from?: "bottom" | "left" | "right" | "scale" | "morph";
  distance?: number;
  /** Adds a blur-to-sharp morph. Auto-on for from="morph". */
  blur?: number;
  duration?: number;
}) {
  const { ref, visible } = useReveal(0.08);
  const reduce = useReducedMotion();
  const blurPx = from === "morph" && blur === 0 ? 12 : blur;

  const hidden: CSSProperties =
    from === "left"
      ? { opacity: 0, transform: `translateX(-${distance}px)` }
      : from === "right"
      ? { opacity: 0, transform: `translateX(${distance}px)` }
      : from === "scale"
      ? { opacity: 0, transform: "scale(0.94)" }
      : from === "morph"
      ? { opacity: 0, transform: `translateY(${distance * 0.6}px) scale(0.96)`, filter: `blur(${blurPx}px)` }
      : { opacity: 0, transform: `translateY(${distance}px)`, ...(blurPx ? { filter: `blur(${blurPx}px)` } : {}) };

  const shown: CSSProperties = {
    opacity: 1,
    transform: "translate(0) scale(1)",
    filter: "blur(0px)",
  };

  // Reduced motion: render the resolved state with no transition.
  if (reduce) {
    return (
      <div ref={ref} className={className} style={shown}>
        {children}
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className={className}
      style={{
        willChange: "transform, opacity, filter",
        transition: [
          `opacity ${duration}ms cubic-bezier(0.16,1,0.3,1) ${delay}ms`,
          `transform ${duration}ms cubic-bezier(0.16,1,0.3,1) ${delay}ms`,
          `filter ${duration}ms cubic-bezier(0.16,1,0.3,1) ${delay}ms`,
        ].join(", "),
        ...(visible ? shown : hidden),
      }}
    >
      {children}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// SECTION REVEAL — fades + lifts a whole <section> as it scrolls
// into view. Once the entrance finishes it drops the transform so
// it never establishes a containing block for inner `sticky`/`fixed`
// descendants (HowItWorks' sticky stage, InteractivePreview's toast).
// ═══════════════════════════════════════════════════════════

export function SectionReveal({
  children,
  className = "",
  from = "bottom",
  distance = 44,
  duration = 850,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  from?: "bottom" | "left" | "right";
  distance?: number;
  duration?: number;
  delay?: number;
}) {
  const { ref, visible } = useReveal(0.06);
  const reduce = useReducedMotion();
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    if (!visible) return;
    const t = window.setTimeout(() => setSettled(true), duration + delay + 80);
    return () => window.clearTimeout(t);
  }, [visible, duration, delay]);

  // Reduced motion (or after the entrance settles): plain, transform-free render.
  if (reduce || settled) {
    return (
      <div ref={ref} className={className}>
        {children}
      </div>
    );
  }

  const hidden: CSSProperties =
    from === "left"
      ? { opacity: 0, transform: `translate3d(-${distance}px, 0, 0)` }
      : from === "right"
      ? { opacity: 0, transform: `translate3d(${distance}px, 0, 0)` }
      : { opacity: 0, transform: `translate3d(0, ${distance}px, 0)` };

  const shown: CSSProperties = { opacity: 1, transform: "translate3d(0, 0, 0)" };

  return (
    <div
      ref={ref}
      className={className}
      style={{
        willChange: "transform, opacity",
        transition: [
          `opacity ${duration}ms cubic-bezier(0.16,1,0.3,1) ${delay}ms`,
          `transform ${duration}ms cubic-bezier(0.16,1,0.3,1) ${delay}ms`,
        ].join(", "),
        ...(visible ? shown : hidden),
      }}
    >
      {children}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// STAGGER REVEAL
// ═══════════════════════════════════════════════════════════

export function StaggerReveal({
  children,
  baseDelay = 0,
  stagger = 80,
  className = "",
  from = "bottom",
  distance = 28,
}: {
  children: ReactNode[];
  baseDelay?: number;
  stagger?: number;
  className?: string;
  from?: "bottom" | "left" | "right";
  distance?: number;
}) {
  const { ref, visible } = useReveal(0.08);
  return (
    <div ref={ref} className={className}>
      {(children as ReactNode[]).map((child, i) => {
        const delay = baseDelay + i * stagger;
        const hidden: CSSProperties =
          from === "left"
            ? { opacity: 0, transform: `translateX(-${distance}px)` }
            : from === "right"
            ? { opacity: 0, transform: `translateX(${distance}px)` }
            : { opacity: 0, transform: `translateY(${distance}px)` };
        const shown: CSSProperties = { opacity: 1, transform: "translate(0)" };
        return (
          <div
            key={i}
            style={{
              transition: [
                `opacity 750ms cubic-bezier(0.16,1,0.3,1) ${delay}ms`,
                `transform 750ms cubic-bezier(0.16,1,0.3,1) ${delay}ms`,
              ].join(", "),
              ...(visible ? shown : hidden),
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
// TILT CARD — gentle 3D tilt (reduced from before, more refined)
// ═══════════════════════════════════════════════════════════

export function TiltCard({
  children,
  className = "",
  intensity = 6,
}: {
  children: ReactNode;
  className?: string;
  intensity?: number;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const shineRef = useRef<HTMLDivElement>(null);

  const onMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const el = cardRef.current;
      const shine = shineRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width;
      const py = (e.clientY - r.top) / r.height;
      const x = (px - 0.5) * intensity;
      const y = (py - 0.5) * intensity;
      el.style.transition = "transform 120ms ease-out";
      el.style.transform = `perspective(1100px) rotateX(${-y}deg) rotateY(${x}deg)`;
      if (shine) {
        shine.style.opacity = "1";
        shine.style.background = `radial-gradient(circle at ${px * 100}% ${py * 100}%, oklch(1 0 0 / 0.06) 0%, transparent 50%)`;
      }
    },
    [intensity]
  );

  const onLeave = useCallback(() => {
    const el = cardRef.current;
    const shine = shineRef.current;
    if (el) {
      el.style.transition = "transform 700ms cubic-bezier(0.16,1,0.3,1)";
      el.style.transform = "";
    }
    if (shine) shine.style.opacity = "0";
  }, []);

  return (
    <div
      ref={cardRef}
      className={`relative ${className}`}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      style={{ willChange: "transform", transformStyle: "preserve-3d" }}
    >
      <div
        ref={shineRef}
        className="absolute inset-0 rounded-[inherit] pointer-events-none transition-opacity duration-500"
        style={{ opacity: 0 }}
      />
      {children}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// SPOTLIGHT CARD — soft gold glow that tracks the cursor.
// Renders an overlay div (not a pseudo-element) so it composes
// cleanly with `.card-obsidian` which already owns ::before.
// ═══════════════════════════════════════════════════════════

export function SpotlightCard({
  children,
  className = "",
  radius = 260,
  style,
}: {
  children: ReactNode;
  className?: string;
  radius?: number;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);

  const onMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const el = ref.current;
      const glow = glowRef.current;
      if (!el || !glow) return;
      const r = el.getBoundingClientRect();
      glow.style.opacity = "1";
      glow.style.background = `radial-gradient(${radius}px circle at ${e.clientX - r.left}px ${e.clientY - r.top}px, rgba(245,197,66,0.10), transparent 68%)`;
    },
    [radius]
  );

  const onLeave = useCallback(() => {
    if (glowRef.current) glowRef.current.style.opacity = "0";
  }, []);

  return (
    <div ref={ref} onMouseMove={onMove} onMouseLeave={onLeave} className={`relative ${className}`} style={style}>
      <div
        ref={glowRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[inherit] transition-opacity duration-300 z-10"
        style={{ opacity: 0 }}
      />
      {children}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// SCROLL PROGRESS BAR (thin top indicator)
// ═══════════════════════════════════════════════════════════

export function ScrollProgress() {
  const barRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const h = document.documentElement;
      const max = h.scrollHeight - h.clientHeight;
      const p = max > 0 ? window.scrollY / max : 0;
      if (barRef.current) {
        barRef.current.style.transform = `scaleX(${p})`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div className="fixed top-0 inset-x-0 h-px z-[60] pointer-events-none">
      <div
        ref={barRef}
        className="h-full origin-left"
        style={{
          background:
            "linear-gradient(90deg, transparent, oklch(0.78 0.024 78 / 0.65), oklch(0.92 0.005 240 / 0.85), oklch(0.78 0.024 78 / 0.65), transparent)",
          transform: "scaleX(0)",
        }}
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// PARALLAX LAYER — scroll-driven translate
// ═══════════════════════════════════════════════════════════

export function ParallaxLayer({
  children,
  speed = 0.2,
  className = "",
}: {
  children: ReactNode;
  speed?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    const update = () => {
      if (ref.current) {
        const rect = ref.current.getBoundingClientRect();
        const offset = (rect.top + rect.height / 2 - window.innerHeight / 2) * speed;
        ref.current.style.transform = `translate3d(0, ${offset}px, 0)`;
      }
    };
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(update);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    update();
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [speed]);
  return (
    <div ref={ref} className={className} style={{ willChange: "transform" }}>
      {children}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// MAGNETIC BUTTON — subtle cursor attraction
// ═══════════════════════════════════════════════════════════

export function Magnetic({
  children,
  className = "",
  strength = 12,
}: {
  children: ReactNode;
  className?: string;
  strength?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left - r.width / 2) / r.width;
    const y = (e.clientY - r.top - r.height / 2) / r.height;
    el.style.transform = `translate(${x * strength}px, ${y * strength}px)`;
  };
  const onLeave = () => {
    if (ref.current) ref.current.style.transform = "";
  };
  return (
    <div
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      className={className}
      style={{ transition: "transform 400ms cubic-bezier(0.16,1,0.3,1)" }}
    >
      {children}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// SCROLL 3D — element-relative scroll progress drives 3D transform
// progress: 0 → 1 as element travels from below viewport to above
// ═══════════════════════════════════════════════════════════

export function useElementScrollProgress() {
  const ref = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const tick = () => {
      const r = el.getBoundingClientRect();
      const wh = window.innerHeight;
      // 0 when top of element is at bottom of viewport, 1 when bottom is at top
      const total = r.height + wh;
      const passed = wh - r.top;
      const p = Math.max(0, Math.min(1, passed / total));
      setProgress(p);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return { ref, progress };
}

export function Scroll3D({
  children,
  className = "",
  rotateX = 12,
  rotateY = 0,
  scaleFrom = 0.92,
  liftFrom = 60,
}: {
  children: ReactNode;
  className?: string;
  rotateX?: number;
  rotateY?: number;
  scaleFrom?: number;
  liftFrom?: number;
}) {
  const innerRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const inner = innerRef.current;
    if (!wrap || !inner) return;
    let raf = 0;

    const update = () => {
      const r = wrap.getBoundingClientRect();
      const wh = window.innerHeight;
      const center = r.top + r.height / 2 - wh / 2;
      const norm = Math.max(-1, Math.min(1, center / (wh * 0.7)));
      const dist = Math.abs(norm);

      const rx = rotateX * norm;
      const ry = rotateY * norm;
      const s = 1 - (1 - scaleFrom) * dist;
      const ty = norm * liftFrom;

      inner.style.transform = `perspective(1400px) rotateX(${rx}deg) rotateY(${ry}deg) scale(${s}) translateY(${ty}px)`;
      inner.style.opacity = `${1 - dist * 0.15}`;
    };
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(update);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    update();
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [rotateX, rotateY, scaleFrom, liftFrom]);

  return (
    <div ref={wrapRef} className={className} style={{ perspective: 1400 }}>
      <div ref={innerRef} style={{ willChange: "transform", transformStyle: "preserve-3d" }}>
        {children}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// SECTION LABEL — refined section header decorator
// ═══════════════════════════════════════════════════════════

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="inline-flex items-center gap-3 text-[11px] font-medium text-white/50 uppercase tracking-[0.22em]">
      <span className="h-px w-8 bg-white/20" />
      {children}
      <span className="h-px w-8 bg-white/20" />
    </div>
  );
}
