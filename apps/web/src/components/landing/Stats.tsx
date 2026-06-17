"use client";

import { useState, useEffect } from "react";
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

const STATS = [
  { label: "Active guilds",        value: 500,   suffix: "+" },
  { label: "Members managed",      value: 10000, suffix: "+" },
  { label: "Transactions logged",  value: 50000, suffix: "+" },
  { label: "Platform uptime",      value: 99.9,  suffix: "%", decimal: 1 },
];

function StatItem({
  stat,
  index,
  enabled,
}: {
  stat: (typeof STATS)[number];
  index: number;
  enabled: boolean;
}) {
  const count = useCountUp(stat.value, enabled, 1600 + index * 180);
  const display =
    stat.decimal
      ? count.toFixed(stat.decimal)
      : count >= 1000
      ? `${Math.floor(count / 1000)}K`
      : count.toString();
  return (
    <div className="lg:px-10 first:pl-0 last:pr-0 text-center lg:text-left">
      <div className="flex items-baseline justify-center lg:justify-start gap-1.5">
        <div className="text-3xl sm:text-4xl font-bold text-gold-gradient tracking-tight tabular-nums font-mono">
          {display}
        </div>
        <span className="text-xl font-medium text-[#f5c542]/70">{stat.suffix}</span>
      </div>
      <div className="text-[10px] text-[#8B8F98] mt-2 uppercase tracking-[0.2em] font-semibold">
        {stat.label}
      </div>
    </div>
  );
}

export default function Stats() {
  const { ref, visible } = useReveal();
  return (
    <section id="stats" ref={ref} className="py-16 relative bg-[#050608]/40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="hr-shine mb-12 opacity-60" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-0 lg:divide-x lg:divide-white/[0.06]">
          {STATS.map((stat, i) => (
            <StatItem key={stat.label} stat={stat} index={i} enabled={visible} />
          ))}
        </div>
        <div className="hr-shine mt-12 opacity-60" />
      </div>
    </section>
  );
}
