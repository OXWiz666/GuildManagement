"use client";

import { type ReactNode } from "react";
import { useReveal, useCountUp } from "@/components/dashboard/DashboardHelpers";

type Tone = "gold" | "cyan" | "emerald" | "rose" | "neutral";

const TONES: Record<
  Tone,
  { text: string; ring: string; chipBg: string; chipText: string; glow: string }
> = {
  gold: {
    text: "text-white",
    ring: "group-hover:border-[var(--forge-gold)]/25",
    chipBg: "bg-[var(--forge-gold)]/10 border-[var(--forge-gold)]/20",
    chipText: "text-[var(--forge-gold-bright)]",
    glow: "from-[var(--forge-gold)]/[0.10]",
  },
  cyan: {
    text: "text-cyan-300",
    ring: "group-hover:border-cyan-400/25",
    chipBg: "bg-cyan-500/10 border-cyan-400/20",
    chipText: "text-cyan-300",
    glow: "from-cyan-500/[0.10]",
  },
  emerald: {
    text: "text-emerald-300",
    ring: "group-hover:border-emerald-400/25",
    chipBg: "bg-emerald-500/10 border-emerald-400/20",
    chipText: "text-emerald-300",
    glow: "from-emerald-500/[0.10]",
  },
  rose: {
    text: "text-rose-300",
    ring: "group-hover:border-rose-400/25",
    chipBg: "bg-rose-500/10 border-rose-400/20",
    chipText: "text-rose-300",
    glow: "from-rose-500/[0.10]",
  },
  neutral: {
    text: "text-white",
    ring: "group-hover:border-white/20",
    chipBg: "bg-white/[0.06] border-white/[0.10]",
    chipText: "text-white/70",
    glow: "from-white/[0.06]",
  },
};

interface MarketStatCardProps {
  label: string;
  symbol?: string;
  value: number;
  hint?: ReactNode;
  secondary?: ReactNode;
  tone?: Tone;
  icon: ReactNode;
  delay?: number;
  /** Whole numbers (points, counts) skip the 2-decimal money format. */
  integer?: boolean;
}

export default function MarketStatCard({
  label,
  symbol,
  value,
  hint,
  secondary,
  tone = "neutral",
  icon,
  delay = 0,
  integer = false,
}: MarketStatCardProps) {
  const { ref, visible } = useReveal(0.2);
  const animated = useCountUp(value, visible, 1100);
  const t = TONES[tone];

  const formatted = integer
    ? Math.round(animated).toLocaleString("en-US")
    : animated.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });

  return (
    <div
      ref={ref}
      style={{
        transition: `opacity 640ms cubic-bezier(0.16,1,0.3,1) ${delay}ms, transform 640ms cubic-bezier(0.16,1,0.3,1) ${delay}ms`,
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(16px)",
      }}
      className={`group relative overflow-hidden rounded-2xl border border-white/[0.06] bg-[#0c0d12]/50 backdrop-blur p-5 transition-colors duration-300 ${t.ring}`}
    >
      {/* Ambient corner glow */}
      <div
        aria-hidden
        className={`pointer-events-none absolute -top-10 -right-10 h-28 w-28 rounded-full bg-gradient-to-br ${t.glow} to-transparent blur-2xl opacity-70 transition-opacity duration-500 group-hover:opacity-100`}
      />

      <div className="relative z-10 flex items-start justify-between gap-3">
        <p className="text-[10px] text-white/45 uppercase tracking-[0.16em] font-bold leading-tight max-w-[70%]">
          {label}
        </p>
        <span
          className={`shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-xl border ${t.chipBg} ${t.chipText} transition-transform duration-300 group-hover:scale-110`}
        >
          {icon}
        </span>
      </div>

      <h3
        className={`relative z-10 mt-3 text-xl sm:text-2xl font-bold font-mono tracking-tight ${t.text}`}
      >
        {symbol && <span className="text-white/40 text-base mr-1">{symbol}</span>}
        {formatted}
      </h3>

      {secondary && (
        <p className="relative z-10 text-[11px] font-semibold font-mono text-white/45 mt-1">
          {secondary}
        </p>
      )}
      {hint && <p className="relative z-10 text-[10px] text-white/35 mt-1.5">{hint}</p>}
    </div>
  );
}
