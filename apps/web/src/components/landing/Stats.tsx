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
    <div className="lg:px-10 first:pl-0 last:pr-0">
      <div className="flex items-baseline gap-1.5">
        <div className="text-3xl sm:text-4xl font-semibold text-white tracking-tight tabular-nums">
          {display}
        </div>
        <span className="text-2xl font-light text-white/35">{stat.suffix}</span>
      </div>
      <div className="text-xs text-white/45 mt-2 uppercase tracking-[0.16em]">
        {stat.label}
      </div>
    </div>
  );
}

export default function Stats() {
  const { ref, visible } = useReveal();
  return (
    <section ref={ref} className="py-16 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="hr-shine mb-12" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-0 lg:divide-x lg:divide-white/[0.06]">
          {STATS.map((stat, i) => (
            <StatItem key={stat.label} stat={stat} index={i} enabled={visible} />
          ))}
        </div>
        <div className="hr-shine mt-12" />
      </div>
    </section>
  );
}
