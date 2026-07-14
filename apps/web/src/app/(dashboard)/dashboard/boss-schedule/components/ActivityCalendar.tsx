"use client";

import { useEffect, useMemo, useState } from "react";
import type { GuildActivityData } from "@/lib/api";
import { resolveActivityTypeMeta, type ActivityTypeMeta } from "@/lib/activityTypeMeta";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MAX_CHIPS_PER_DAY = 3;

function toDateKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function buildMonthGrid(viewMonth: Date): Date[] {
  const first = startOfMonth(viewMonth);
  const gridStart = new Date(first);
  gridStart.setDate(first.getDate() - first.getDay());
  return Array.from({ length: 42 }, (_, i) => {
    const day = new Date(gridStart);
    day.setDate(gridStart.getDate() + i);
    return day;
  });
}

export default function ActivityCalendar({
  activities,
  typeMeta,
  now,
  selectedDate,
  onSelectDate,
}: {
  activities: GuildActivityData[];
  typeMeta: Record<string, ActivityTypeMeta>;
  now: number;
  selectedDate: string;
  onSelectDate: (date: string) => void;
}) {
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(new Date(`${selectedDate}T00:00:00`)));

  useEffect(() => {
    const selected = new Date(`${selectedDate}T00:00:00`);
    if (selected.getFullYear() !== viewMonth.getFullYear() || selected.getMonth() !== viewMonth.getMonth()) {
      setViewMonth(startOfMonth(selected));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);

  const byDate = useMemo(() => {
    const map = new Map<string, GuildActivityData[]>();
    for (const activity of activities) {
      const key = toDateKey(new Date(activity.scheduledAt));
      const list = map.get(key) ?? [];
      list.push(activity);
      map.set(key, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
    }
    return map;
  }, [activities]);

  const grid = useMemo(() => buildMonthGrid(viewMonth), [viewMonth]);
  const todayKey = toDateKey(new Date(now));
  const monthLabel = viewMonth.toLocaleString("en-US", { month: "long", year: "numeric" });

  function shiftMonth(delta: number) {
    setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1));
  }

  function goToday() {
    const today = new Date(now);
    setViewMonth(startOfMonth(today));
    onSelectDate(toDateKey(today));
  }

  return (
    <div className="rounded-2xl border border-[var(--metal-border)] bg-[var(--obsidian-elevated)]/40 p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[15px] font-bold text-white">{monthLabel}</h3>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => shiftMonth(-1)}
            aria-label="Previous month"
            className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.02] text-white/60 hover:text-white hover:bg-white/[0.05] cursor-pointer"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6" /></svg>
          </button>
          <button
            onClick={goToday}
            className="h-8 px-3 inline-flex items-center rounded-lg border border-white/[0.08] bg-white/[0.02] text-[11px] font-semibold uppercase tracking-wide text-white/60 hover:text-white hover:bg-white/[0.05] cursor-pointer"
          >
            Today
          </button>
          <button
            onClick={() => shiftMonth(1)}
            aria-label="Next month"
            className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.02] text-white/60 hover:text-white hover:bg-white/[0.05] cursor-pointer"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6" /></svg>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1.5 mb-1.5">
        {WEEKDAYS.map((d) => (
          <div key={d} className="text-center text-[10px] font-bold uppercase tracking-wider text-white/35 py-1">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1.5">
        {grid.map((day) => {
          const key = toDateKey(day);
          const inMonth = day.getMonth() === viewMonth.getMonth();
          const isToday = key === todayKey;
          const isSelected = key === selectedDate;
          const dayActivities = byDate.get(key) ?? [];
          const overflow = dayActivities.length - MAX_CHIPS_PER_DAY;

          return (
            <button
              key={key}
              onClick={() => onSelectDate(key)}
              className={`group relative flex flex-col items-stretch text-left rounded-xl border p-1.5 min-h-[76px] sm:min-h-[92px] transition-all cursor-pointer ${
                isSelected
                  ? "border-[var(--forge-gold)]/45 bg-[var(--forge-glow)]"
                  : inMonth
                    ? "border-white/[0.06] bg-white/[0.015] hover:border-white/15 hover:bg-white/[0.03]"
                    : "border-white/[0.03] bg-transparent opacity-40 hover:opacity-70"
              }`}
            >
              <span
                className={`text-[11px] font-bold h-5 w-5 inline-flex items-center justify-center rounded-full ${
                  isToday
                    ? "bg-[var(--forge-gold)] text-black"
                    : isSelected
                      ? "text-[var(--forge-gold-bright)]"
                      : "text-white/55"
                }`}
              >
                {day.getDate()}
              </span>
              <div className="mt-1 space-y-0.5 overflow-hidden">
                {dayActivities.slice(0, MAX_CHIPS_PER_DAY).map((a) => {
                  const meta = resolveActivityTypeMeta(typeMeta, a.type);
                  return (
                    <div key={a.id} className="flex items-center gap-1 min-w-0">
                      <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: meta.dot }} />
                      <span className="text-[10px] text-white/65 truncate">{a.title}</span>
                    </div>
                  );
                })}
                {overflow > 0 && (
                  <span className="text-[9px] font-semibold text-white/35">+{overflow} more</span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
