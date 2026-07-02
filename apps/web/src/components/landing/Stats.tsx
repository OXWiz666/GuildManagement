"use client";

import { useState, useEffect, type ReactNode } from "react";
import { useReveal } from "./LandingHelpers";

function useCountUp(target: number, enabled: boolean, duration = 1800) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min((now - t0) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 4);
      setCount(Math.round(eased * target));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [enabled, target, duration]);
  return count;
}

type Stat = {
  label: string;
  value: number;
  suffix: string;
  decimal?: number;
  icon: ReactNode;
};

const STATS: Stat[] = [
  {
    label: "Active guilds",
    value: 20,
    suffix: "+",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M12 2.5 21 6v6c0 5-3.8 8.4-9 10-5.2-1.6-9-5-9-10V6z" />
      </svg>
    ),
  },
  {
    label: "Members managed",
    value: 150,
    suffix: "+",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      </svg>
    ),
  },
  {
    label: "Transactions logged",
    value: 1000,
    suffix: "+",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M3 10h18M7 15h5" />
      </svg>
    ),
  },
  {
    label: "Platform uptime",
    value: 100,
    suffix: "%",
    decimal: 0,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M3 12h4l2 6 4-13 2 7h6" />
      </svg>
    ),
  },
];

function StatItem({ stat, index, enabled }: { stat: Stat; index: number; enabled: boolean }) {
  const count = useCountUp(stat.value, enabled, 1600 + index * 180);
  const display = stat.decimal
    ? count.toFixed(stat.decimal)
    : count >= 1000
    ? `${Math.floor(count / 1000)}K`
    : count.toString();

  return (
    <div
      className="group relative flex flex-col items-center px-6 py-8 text-center lg:items-start lg:text-left"
      style={{
        transition: "opacity 0.7s cubic-bezier(0.16,1,0.3,1), transform 0.7s cubic-bezier(0.16,1,0.3,1)",
        transitionDelay: `${index * 90}ms`,
        opacity: enabled ? 1 : 0,
        transform: enabled ? "translateY(0)" : "translateY(20px)",
      }}
    >
      <span className="mb-4 grid h-9 w-9 place-items-center rounded-lg border border-[#d4a853]/15 bg-white/[0.02] text-[#f5c542] transition-all duration-300 group-hover:border-[#d4a853]/40 group-hover:bg-[#d4a853]/[0.06] [&_svg]:h-[18px] [&_svg]:w-[18px]">
        {stat.icon}
      </span>
      <div className="flex items-baseline gap-1.5">
        <div className="font-mono text-4xl font-bold tabular-nums tracking-tight text-gold-sheen sm:text-5xl">
          {display}
        </div>
        <span className="text-2xl font-medium text-[#f5c542]/70">{stat.suffix}</span>
      </div>
      <div className="mt-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#8B8F98]">
        {stat.label}
      </div>
    </div>
  );
}

export default function Stats() {
  const { ref, visible } = useReveal();
  return (
    <section id="stats" ref={ref} className="relative bg-[#050608] py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="card-obsidian relative overflow-hidden rounded-3xl">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#d4a853]/40 to-transparent" />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{ background: "radial-gradient(ellipse 70% 60% at 50% 0%, rgba(212,168,83,0.05), transparent 70%)" }}
          />
          <div className="relative grid grid-cols-2 divide-white/[0.05] lg:grid-cols-4 lg:divide-x [&>*:nth-child(1)]:border-b [&>*:nth-child(2)]:border-b lg:[&>*]:border-b-0 [&>*]:border-white/[0.05] [&>*:nth-child(odd)]:border-r lg:[&>*:nth-child(odd)]:border-r-0">
            {STATS.map((stat, i) => (
              <StatItem key={stat.label} stat={stat} index={i} enabled={visible} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
