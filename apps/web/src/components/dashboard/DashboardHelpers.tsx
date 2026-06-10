"use client";

import {
  useEffect,
  useState,
  useRef,
  useCallback,
  Children,
  type ReactNode,
  type CSSProperties,
} from "react";
import { useToast } from "@/components/ui/Toast";

// ═══════════════════════════════════════════════════════════
// USE-REVEAL — IntersectionObserver-driven visibility
// ═══════════════════════════════════════════════════════════

export function useReveal(threshold = 0.1, once = true) {
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
      { threshold, rootMargin: "0px 0px -6% 0px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold, once]);
  return { ref, visible };
}

// ═══════════════════════════════════════════════════════════
// REVEAL — scroll-in fade + lift
// ═══════════════════════════════════════════════════════════

export function Reveal({
  children,
  delay = 0,
  className = "",
  from = "bottom",
  distance = 24,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  from?: "bottom" | "left" | "right" | "scale";
  distance?: number;
}) {
  const { ref, visible } = useReveal(0.08);

  const hidden: CSSProperties =
    from === "left"
      ? { opacity: 0, transform: `translateX(-${distance}px)` }
      : from === "right"
        ? { opacity: 0, transform: `translateX(${distance}px)` }
        : from === "scale"
          ? { opacity: 0, transform: "scale(0.96)" }
          : { opacity: 0, transform: `translateY(${distance}px)` };

  const shown: CSSProperties = {
    opacity: 1,
    transform: "translate(0) scale(1)",
  };

  return (
    <div
      ref={ref}
      className={className}
      style={{
        transition: [
          `opacity 720ms cubic-bezier(0.16,1,0.3,1) ${delay}ms`,
          `transform 720ms cubic-bezier(0.16,1,0.3,1) ${delay}ms`,
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
  stagger = 70,
  className = "",
  from = "bottom",
  distance = 18,
}: {
  children: ReactNode;
  baseDelay?: number;
  stagger?: number;
  className?: string;
  from?: "bottom" | "left" | "right";
  distance?: number;
}) {
  const { ref, visible } = useReveal(0.06);
  const childrenArray = Children.toArray(children);
  return (
    <div ref={ref} className={className}>
      {childrenArray.map((child, i) => {
        const delay = baseDelay + i * stagger;
        const hidden: CSSProperties =
          from === "left"
            ? { opacity: 0, transform: `translateX(-${distance}px)` }
            : from === "right"
              ? { opacity: 0, transform: `translateX(${distance}px)` }
              : { opacity: 0, transform: `translateY(${distance}px)` };
        const shown: CSSProperties = {
          opacity: 1,
          transform: "translate(0)",
        };
        return (
          <div
            key={i}
            style={{
              transition: [
                `opacity 680ms cubic-bezier(0.16,1,0.3,1) ${delay}ms`,
                `transform 680ms cubic-bezier(0.16,1,0.3,1) ${delay}ms`,
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
// COUNT UP — animate numeric value
// ═══════════════════════════════════════════════════════════

export function useCountUp(
  target: number,
  enabled: boolean,
  duration = 1300,
) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!enabled) {
      const id = requestAnimationFrame(() => {
        setValue((prev) => (prev !== 0 ? 0 : prev));
      });
      return () => cancelAnimationFrame(id);
    }
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min((now - t0) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 4);
      setValue(eased * target);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, enabled, duration]);
  return value;
}

// ═══════════════════════════════════════════════════════════
// TILT CARD — gentle 3D hover with mouse-follow sheen
// ═══════════════════════════════════════════════════════════

export function TiltCard({
  children,
  className = "",
  intensity = 5,
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
      el.style.transition = "transform 130ms ease-out";
      el.style.transform = `perspective(1100px) rotateX(${-y}deg) rotateY(${x}deg) translateY(-2px)`;
      if (shine) {
        shine.style.opacity = "1";
        shine.style.background = `radial-gradient(circle at ${px * 100}% ${py * 100}%, oklch(1 0 0 / 0.07) 0%, transparent 55%)`;
      }
    },
    [intensity],
  );

  const onLeave = useCallback(() => {
    const el = cardRef.current;
    const shine = shineRef.current;
    if (el) {
      el.style.transition = "transform 600ms cubic-bezier(0.16,1,0.3,1)";
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
// MAGNETIC — subtle cursor attraction
// ═══════════════════════════════════════════════════════════

export function Magnetic({
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

// ═══════════════════════════════════════════════════════════
// SPARKLINE — animated SVG mini chart
// ═══════════════════════════════════════════════════════════

export function Sparkline({
  data,
  className = "",
  tone = "neutral",
  height = 28,
  fill = true,
}: {
  data: number[];
  className?: string;
  tone?: "neutral" | "positive" | "warning" | "negative";
  height?: number;
  fill?: boolean;
}) {
  const { ref, visible } = useReveal(0.2);

  const width = 100;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;

  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - ((v - min) / range) * (height - 4) - 2;
      return { x, y };
    });

  const path = points
    .map((p, i) => (i === 0 ? `M${p.x},${p.y}` : `L${p.x},${p.y}`))
    .join(" ");

  const areaPath = `${path} L${width},${height} L0,${height} Z`;

  const colors: Record<string, { stroke: string; fillStop: string }> = {
    neutral: {
      stroke: "oklch(0.92 0.005 240)",
      fillStop: "oklch(0.85 0.02 240)",
    },
    positive: {
      stroke: "oklch(0.78 0.13 162)",
      fillStop: "oklch(0.70 0.13 162)",
    },
    warning: {
      stroke: "oklch(0.85 0.14 80)",
      fillStop: "oklch(0.78 0.13 80)",
    },
    negative: {
      stroke: "oklch(0.72 0.18 22)",
      fillStop: "oklch(0.62 0.18 22)",
    },
  };
  const c = colors[tone] || colors.neutral!;

  return (
    <div ref={ref} className={className}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        style={{ height }}
        preserveAspectRatio="none"
      >
        {fill && (
          <defs>
            <linearGradient id={`spark-${tone}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={c.fillStop} stopOpacity="0.32" />
              <stop offset="100%" stopColor={c.fillStop} stopOpacity="0" />
            </linearGradient>
          </defs>
        )}
        {fill && (
          <path
            d={areaPath}
            fill={`url(#spark-${tone})`}
            style={{
              opacity: visible ? 1 : 0,
              transition: "opacity 800ms ease 200ms",
            }}
          />
        )}
        <path
          d={path}
          fill="none"
          stroke={c.stroke}
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            strokeDasharray: 400,
            strokeDashoffset: visible ? 0 : 400,
            transition:
              "stroke-dashoffset 1400ms cubic-bezier(0.16,1,0.3,1) 100ms",
          }}
        />
        {/* End-dot */}
        {points.length > 0 && (
          <circle
            cx={points[points.length - 1]!.x}
            cy={points[points.length - 1]!.y}
            r="1.8"
            fill={c.stroke}
            style={{
              opacity: visible ? 1 : 0,
              transition: "opacity 400ms ease 1300ms",
            }}
          />
        )}
      </svg>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// LIVE DOT — pulsing status indicator
// ═══════════════════════════════════════════════════════════

export function LiveDot({
  tone = "emerald",
  size = 6,
  className = "",
}: {
  tone?: "emerald" | "amber" | "red" | "neutral";
  size?: number;
  className?: string;
}) {
  const colorMap: Record<string, string> = {
    emerald: "#34d399",
    amber: "#fbbf24",
    red: "#f87171",
    neutral: "#a1a1aa",
  };
  const color = colorMap[tone] || colorMap.emerald!;
  return (
    <span
      className={`relative inline-block ${className}`}
      style={{ width: size, height: size }}
    >
      <span
        className="absolute inset-0 rounded-full"
        style={{ backgroundColor: color }}
      />
      <span
        className="absolute inset-0 rounded-full animate-ping"
        style={{ backgroundColor: color, opacity: 0.6 }}
      />
    </span>
  );
}

// ═══════════════════════════════════════════════════════════
// SECTION HEADER — refined section header
// ═══════════════════════════════════════════════════════════

export function SectionHeader({
  eyebrow,
  title,
  meta,
}: {
  eyebrow: string;
  title?: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-4 mb-5">
      <div className="min-w-0">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[10px] text-white/40 uppercase tracking-[0.22em]">
            {eyebrow}
          </span>
          <span className="h-px w-8 bg-gradient-to-r from-white/15 to-transparent" />
        </div>
        {title && (
          <h2 className="text-base font-semibold text-white tracking-tight">
            {title}
          </h2>
        )}
      </div>
      {meta && <div className="text-[11px] text-white/40 font-mono">{meta}</div>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// MODULE HEADER — top-of-page H1 with eyebrow + reveal
// ═══════════════════════════════════════════════════════════

export function ModuleHeader({
  eyebrow,
  title,
  description,
  right,
}: {
  eyebrow: string;
  title: string;
  description?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <Reveal>
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-6 border-b border-white/[0.06]">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[10px] text-white/40 uppercase tracking-[0.24em]">
              {eyebrow}
            </span>
            <span className="h-px w-12 bg-gradient-to-r from-white/15 to-transparent" />
          </div>
          <h1 className="text-[26px] sm:text-[30px] leading-tight font-semibold text-white tracking-tight">
            {title}
            <span className="text-white/40">.</span>
          </h1>
          {description && (
            <p className="text-sm text-white/50 mt-2 leading-relaxed">
              {description}
            </p>
          )}
        </div>
        {right && <div className="shrink-0">{right}</div>}
      </div>
    </Reveal>
  );
}

// ═══════════════════════════════════════════════════════════
// MODULE TABS — animated underline indicator
// ═══════════════════════════════════════════════════════════

export function ModuleTabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: Array<{ value: T; label: string; count?: number }>;
  active: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="relative flex border-b border-white/[0.06] gap-1 overflow-x-auto">
      {tabs.map((tab) => {
        const isActive = active === tab.value;
        return (
          <button
            key={tab.value}
            onClick={() => onChange(tab.value)}
            className={`group relative px-4 py-3 text-[13px] font-medium transition-all duration-300 cursor-pointer whitespace-nowrap ${
              isActive ? "text-white" : "text-white/45 hover:text-white/85"
            }`}
          >
            <span className="inline-flex items-center gap-2">
              {tab.label}
              {typeof tab.count === "number" && (
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition-colors duration-300 ${
                    isActive
                      ? "bg-white/[0.12] text-white"
                      : "bg-white/[0.04] text-white/40 group-hover:bg-white/[0.08]"
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </span>
            {/* Active indicator with glow */}
            {isActive && (
              <>
                <span className="absolute bottom-0 inset-x-3 h-px bg-white" />
                <span
                  className="absolute bottom-0 inset-x-3 h-px"
                  style={{
                    boxShadow: "0 0 8px 1px rgba(255,255,255,0.45)",
                  }}
                />
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// IMAGE URL FIELD — URL input with live preview + validation
// Reusable for any image URL form input (avatar, boss image, screenshot)
// ═══════════════════════════════════════════════════════════

export function ImageUrlField({
  label,
  value,
  onChange,
  placeholder = "https://example.com/image.png",
  shape = "circle",
  fallbackInitial,
  helperText,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  shape?: "circle" | "square";
  fallbackInitial?: string;
  helperText?: ReactNode;
}) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    setFailed(false);
    setLoaded(false);
  }

  useEffect(() => {
    const trimmed = value.trim();
    if (trimmed.includes("wallpapers.com") && !trimmed.match(/\.(jpg|jpeg|png|webp|gif)/i)) {
      if (trimmed.toLowerCase().includes("anime")) {
        onChange("https://images.unsplash.com/photo-1578632767115-351597cf2477?q=80&w=256&auto=format&fit=crop");
      } else {
        onChange("https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=256&auto=format&fit=crop");
      }
    }
  }, [value, onChange]);

  const trimmed = value.trim();
  const isBase64 = trimmed.startsWith("data:image/");
  const looksValid =
    trimmed.length > 0 &&
    (/^https?:\/\//i.test(trimmed) ||
      isBase64 ||
      trimmed.startsWith("/"));

  const status: "empty" | "loading" | "loaded" | "invalid" | "failed" =
    !trimmed
      ? "empty"
      : !looksValid
        ? "invalid"
        : failed
          ? "failed"
          : loaded
            ? "loaded"
            : "loading";

  const statusMeta: Record<
    typeof status,
    { color: string; bg: string; label: string }
  > = {
    empty: {
      color: "text-white/40",
      bg: "bg-white/[0.04] border-white/[0.06]",
      label: "Empty",
    },
    invalid: {
      color: "text-red-300",
      bg: "bg-red-500/[0.06] border-red-500/20",
      label: "Invalid URL",
    },
    loading: {
      color: "text-amber-300",
      bg: "bg-amber-500/[0.06] border-amber-500/20",
      label: "Loading…",
    },
    loaded: {
      color: "text-emerald-300",
      bg: "bg-emerald-500/[0.06] border-emerald-500/20",
      label: isBase64 ? "Local Image Loaded" : "Loaded",
    },
    failed: {
      color: "text-red-300",
      bg: "bg-red-500/[0.06] border-red-500/20",
      label: "Failed to load",
    },
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          onChange(event.target.result as string);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const previewRadius = shape === "circle" ? "rounded-full" : "rounded-xl";
  const displayInputValue = isBase64 ? "Profile Picture" : value;

  return (
    <div>
      <label className="block text-[10px] font-medium text-white/50 uppercase tracking-[0.18em] mb-2">
        {label}
      </label>
      <div className="flex items-center gap-4">
        {/* Preview tile */}
        <div
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            const file = e.dataTransfer.files?.[0];
            if (file) {
              const reader = new FileReader();
              reader.onload = (event) => {
                if (event.target?.result) {
                  onChange(event.target.result as string);
                }
              };
              reader.readAsDataURL(file);
            }
          }}
          className={`relative h-16 w-16 shrink-0 overflow-hidden border bg-white/[0.04] cursor-pointer transition-all group ${
            isDragging
              ? "border-amber-500 bg-amber-500/[0.05] scale-105"
              : "border-white/[0.08] hover:border-white/20"
          } ${previewRadius}`}
          title="Click or drag image to upload"
        >
          <div className="absolute inset-0 flex items-center justify-center text-[13px] font-semibold text-white/40 group-hover:opacity-0 transition-opacity">
            {fallbackInitial || (
              <svg
                className="h-6 w-6"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
            )}
          </div>
          {trimmed && looksValid && !failed && (
            <img
              src={trimmed}
              alt="preview"
              referrerPolicy="no-referrer"
              loading="lazy"
              decoding="async"
              onLoad={() => setLoaded(true)}
              onError={() => setFailed(true)}
              className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ${
                loaded ? "opacity-100" : "opacity-0"
              }`}
            />
          )}

          {/* Hover Overlay */}
          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-[10px] text-white font-medium gap-1">
            <svg
              className="h-4 w-4 text-white/80"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <span>Upload</span>
          </div>

          {status === "loading" && (
            <div
              aria-hidden
              className="absolute inset-0 pointer-events-none"
              style={{
                background:
                  "linear-gradient(90deg, transparent, oklch(1 0 0 / 0.06), transparent)",
                animation: "shimmer 1.6s linear infinite",
              }}
            />
          )}
        </div>

        <div className="flex-1 min-w-0 space-y-2">
          <div className="relative flex gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                value={displayInputValue}
                onChange={(e) => onChange(e.target.value)}
                placeholder={isBase64 ? "Profile Picture" : placeholder}
                spellCheck={false}
                autoComplete="off"
                className="w-full px-3.5 py-2.5 pr-9 rounded-lg bg-white/[0.03] border border-white/[0.08] text-[12px] text-white placeholder:text-white/25 focus:outline-none focus:border-white/25 transition-colors font-mono"
              />
              {trimmed && (
                <button
                  type="button"
                  onClick={() => onChange("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 rounded-md text-white/40 hover:text-white hover:bg-white/[0.06] transition-colors flex items-center justify-center"
                  aria-label="Clear"
                >
                  <svg
                    className="h-3.5 w-3.5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="shrink-0 px-3.5 py-2.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-[12px] text-white/75 hover:text-white hover:bg-white/[0.08] hover:border-white/20 transition-all flex items-center gap-2 cursor-pointer font-medium"
            >
              <svg
                className="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
              >
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              Upload
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span
              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-medium border ${statusMeta[status].bg} ${statusMeta[status].color}`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  status === "loaded"
                    ? "bg-emerald-400"
                    : status === "loading"
                      ? "bg-amber-400 animate-pulse"
                      : status === "invalid" || status === "failed"
                        ? "bg-red-400"
                        : "bg-white/40"
                }`}
              />
              {statusMeta[status].label}
            </span>
            {helperText && (
              <span className="text-[10px] text-white/35">{helperText}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function AvatarUploadField({
  label,
  value,
  onChange,
  fallbackInitial,
  helperText,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  fallbackInitial?: string;
  helperText?: ReactNode;
}) {
  const { addToast } = useToast();
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    setFailed(false);
    setLoaded(false);
  }

  const trimmed = value?.trim() || "";
  const isBase64 = trimmed.startsWith("data:image/");
  const looksValid = trimmed.length > 0 && (/^https?:\/\//i.test(trimmed) || isBase64 || trimmed.startsWith("/"));

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith("image/")) {
        addToast("error", "Please upload a valid image file (PNG, JPG, WEBP).");
        return;
      }
      if (file.size > 2 * 1024 * 1024) {
        addToast("error", "Image file size must be less than 2MB.");
        return;
      }
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          onChange(event.target.result as string);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="flex flex-col items-center sm:items-start gap-3">
      <label className="block text-[10px] font-medium text-white/50 uppercase tracking-[0.18em]">
        {label}
      </label>
      <div className="flex flex-col sm:flex-row items-center gap-5">
        {/* Standalone Circular Uploader Tile */}
        <div
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            const file = e.dataTransfer.files?.[0];
            if (file) {
              if (!file.type.startsWith("image/")) {
                addToast("error", "Please upload a valid image file (PNG, JPG, WEBP).");
                return;
              }
              if (file.size > 2 * 1024 * 1024) {
                addToast("error", "Image file size must be less than 2MB.");
                return;
              }
              const reader = new FileReader();
              reader.onload = (event) => {
                if (event.target?.result) {
                  onChange(event.target.result as string);
                }
              };
              reader.readAsDataURL(file);
            }
          }}
          className={`relative h-24 w-24 shrink-0 overflow-hidden border bg-zinc-900/50 cursor-pointer transition-all duration-300 group rounded-full ${
            isDragging
              ? "border-amber-500 bg-amber-500/[0.08] scale-105 shadow-[0_0_15px_rgba(245,158,11,0.25)]"
              : "border-white/[0.08] hover:border-white/20 hover:scale-[1.02] shadow-lg"
          }`}
          title="Click or drag image to upload avatar"
        >
          {/* Fallback Initials */}
          <div className="absolute inset-0 flex items-center justify-center text-[22px] font-bold text-white/40 group-hover:opacity-0 transition-opacity select-none tracking-tight">
            {fallbackInitial || (
              <svg
                className="h-8 w-8 text-white/30"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            )}
          </div>

          {/* Actual Avatar Image */}
          {trimmed && looksValid && !failed && (
            <img
              src={trimmed}
              alt="Avatar preview"
              referrerPolicy="no-referrer"
              loading="lazy"
              decoding="async"
              onLoad={() => setLoaded(true)}
              onError={() => setFailed(true)}
              className={`absolute inset-0 h-full w-full object-cover transition-all duration-500 group-hover:scale-105 ${
                loaded ? "opacity-100" : "opacity-0"
              }`}
            />
          )}

          {/* Premium Hover Overlay */}
          <div className="absolute inset-0 bg-black/65 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col items-center justify-center text-[10px] text-white font-medium gap-1.5 select-none">
            <svg
              className="h-5 w-5 text-white/90 animate-bounce"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <span className="tracking-wide">Upload Photo</span>
          </div>

          {/* Shimmer loading state */}
          {!loaded && trimmed && looksValid && !failed && (
            <div
              aria-hidden
              className="absolute inset-0 pointer-events-none"
              style={{
                background:
                  "linear-gradient(90deg, transparent, oklch(1 0 0 / 0.08), transparent)",
                animation: "shimmer 1.6s linear infinite",
              }}
            />
          )}
        </div>

        {/* Info panel */}
        <div className="flex flex-col items-center sm:items-start text-center sm:text-left space-y-1.5">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-3.5 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-[11px] font-semibold text-white/80 hover:text-white hover:bg-white/[0.08] hover:border-white/20 transition-all flex items-center gap-1.5 cursor-pointer"
            >
              Choose File
            </button>
            {trimmed && (
              <button
                type="button"
                onClick={() => onChange("")}
                className="px-3.5 py-2 rounded-lg bg-red-500/[0.06] border border-red-500/15 text-[11px] font-semibold text-red-400 hover:text-red-300 hover:bg-red-500/[0.12] hover:border-red-500/30 transition-all cursor-pointer"
              >
                Remove
              </button>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />
          <p className="text-[10px] text-white/35 max-w-[220px] leading-normal">
            {helperText || "Drag & drop or click avatar to import a local image from your PC."}
          </p>
        </div>
      </div>
    </div>
  );
}
