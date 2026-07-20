"use client";

import { useMemo, useState } from "react";
import { getBossImageUrl } from "@guild/shared";

export interface AttendanceHistoryItem {
  sessionId: string;
  title: string;
  type: "GUILD" | "FACTION";
  createdAt: string;
  expiresAt: string;
  status: "CONFIRMED" | "PENDING" | "MISSED" | "UNCHECKED";
  joinedAt: string | null;
  bossName: string | null;
  bossImageUrl: string | null;
  location: string | null;
  spawnTime: string | null;
}

export interface AttendanceHistoryListProps {
  history: AttendanceHistoryItem[];
}

type AttendanceHistoryView = "list" | "timeline" | "calendar";

const STATUS_STYLES: Record<
  AttendanceHistoryItem["status"],
  { label: string; color: string; dot: string; calendar: string }
> = {
  CONFIRMED: {
    label: "Present",
    color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/25",
    dot: "bg-emerald-300",
    calendar: "border-emerald-400/20 bg-emerald-500/[0.07] text-emerald-100",
  },
  PENDING: {
    label: "Pending",
    color: "text-amber-400 bg-amber-500/10 border-amber-500/25",
    dot: "bg-amber-300",
    calendar: "border-amber-400/20 bg-amber-500/[0.07] text-amber-100",
  },
  MISSED: {
    label: "Missed",
    color: "text-rose-400 bg-rose-500/10 border-rose-500/25",
    dot: "bg-rose-300",
    calendar: "border-rose-400/20 bg-rose-500/[0.08] text-rose-100",
  },
  UNCHECKED: {
    label: "Open",
    color: "text-white/50 bg-white/[0.04] border-white/[0.1]",
    dot: "bg-white/35",
    calendar: "border-white/[0.08] bg-white/[0.035] text-white/65",
  },
};

function itemDate(item: AttendanceHistoryItem) {
  return item.spawnTime || item.createdAt;
}

function itemTime(item: AttendanceHistoryItem) {
  return new Date(itemDate(item)).getTime();
}

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function dateKey(date: Date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function startOfWeek(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function dateLabel(iso: string) {
  const date = new Date(iso);
  const key = date.toDateString();
  const todayKey = new Date().toDateString();
  const yesterdayKey = new Date(Date.now() - 86400000).toDateString();
  if (key === todayKey) return "Today";
  if (key === yesterdayKey) return "Yesterday";
  return date.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", year: "numeric" });
}

function compactDateLabel(date: Date) {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function groupByDate(items: AttendanceHistoryItem[]) {
  const groups: Array<{ key: string; label: string; items: AttendanceHistoryItem[] }> = [];
  const sorted = [...items].sort((a, b) => itemTime(b) - itemTime(a));

  for (const item of sorted) {
    const iso = itemDate(item);
    const key = new Date(iso).toDateString();
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(item);
    else groups.push({ key, label: dateLabel(iso), items: [item] });
  }
  return groups;
}

function bossDisplay(item: AttendanceHistoryItem) {
  const bossName = item.bossName || item.title;
  return {
    bossName,
    imageSrc: item.bossImageUrl || getBossImageUrl(bossName),
    spawnDate: itemDate(item),
  };
}

function ViewSwitcher({
  value,
  onChange,
}: {
  value: AttendanceHistoryView;
  onChange: (value: AttendanceHistoryView) => void;
}) {
  const options: Array<{ value: AttendanceHistoryView; label: string }> = [
    { value: "list", label: "List" },
    { value: "timeline", label: "Timeline" },
    { value: "calendar", label: "Calendar" },
  ];

  return (
    <div className="inline-flex rounded-xl border border-white/[0.08] bg-black/20 p-1">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={active}
            className={`rounded-lg px-3 py-1.5 text-[11px] font-bold transition-colors cursor-pointer ${
              active ? "bg-white text-black" : "text-white/45 hover:bg-white/[0.05] hover:text-white/80"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function HistoryRecord({
  item,
  compact = false,
}: {
  item: AttendanceHistoryItem;
  compact?: boolean;
}) {
  const style = STATUS_STYLES[item.status];
  const { bossName, imageSrc, spawnDate } = bossDisplay(item);
  const isChecked = item.status === "CONFIRMED" || item.status === "PENDING";

  if (compact) {
    return (
      <div className={`rounded-lg border px-2 py-2 ${style.calendar}`}>
        <div className="flex items-center gap-2">
          <img
            src={imageSrc}
            alt={bossName}
            className="h-7 w-7 shrink-0 rounded-md border border-white/10 object-cover"
            loading="lazy"
          />
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center justify-between gap-2">
              <p className="truncate text-[11px] font-bold">{bossName}</p>
              <span className="shrink-0 font-mono text-[9px] opacity-70">{timeLabel(spawnDate)}</span>
            </div>
            <p className="mt-0.5 truncate text-[9px] opacity-65">{style.label}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-white/[0.05] bg-white/[0.015] px-2.5 py-2">
      <img
        src={imageSrc}
        alt={bossName}
        className="h-8 w-8 shrink-0 rounded-md border border-white/[0.08] object-cover"
        loading="lazy"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[11px] font-semibold text-white">{bossName}</p>
        <p className="mt-0.5 truncate text-[9px] text-white/40">
          {timeLabel(spawnDate)}
          {item.location ? ` / ${item.location}` : ""}
        </p>
      </div>
      <span className={`inline-flex shrink-0 items-center rounded-md border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${style.color}`}>
        {style.label}
      </span>
      <svg
        aria-label={isChecked ? "Checked in" : "Not checked in"}
        className={`h-3.5 w-3.5 shrink-0 ${isChecked ? "text-emerald-400" : "text-white/15"}`}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
      >
        <polyline points="20 6 9 17 4 12" />
      </svg>
    </div>
  );
}

function HistoryListView({ groups }: { groups: ReturnType<typeof groupByDate> }) {
  if (groups.length === 0) {
    return (
      <div className="py-16 text-center text-xs italic text-zinc-650">
        No attendance records yet. Your check-ins will appear here once you start claiming raids.
      </div>
    );
  }

  return (
    <div className="max-h-[420px] space-y-5 overflow-y-auto pr-1 custom-scrollbar">
      {groups.map((group) => (
        <div key={group.key}>
          <div className="mb-2 flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--forge-gold-dim)]">
              {group.label}
            </span>
            <span className="h-px flex-1 bg-white/[0.06]" />
            <span className="font-mono text-[9px] text-white/30">{group.items.length}</span>
          </div>

          <div className="space-y-1.5">
            {group.items.map((item) => (
              <HistoryRecord key={item.sessionId} item={item} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function HistoryTimelineView({ groups }: { groups: ReturnType<typeof groupByDate> }) {
  if (groups.length === 0) {
    return <div className="py-16 text-center text-xs italic text-zinc-650">No history to plot yet.</div>;
  }

  return (
    <div className="max-h-[640px] overflow-y-auto pr-1 custom-scrollbar">
      <div className="space-y-7">
        {groups.map((group) => (
          <section key={group.key} className="grid gap-3 md:grid-cols-[155px_minmax(0,1fr)]">
            <div className="md:sticky md:top-0 md:self-start">
              <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-white/55">{group.label}</p>
              <p className="mt-1 font-mono text-[10px] text-cyan-300/65">
                {group.items.length} record{group.items.length === 1 ? "" : "s"}
              </p>
            </div>

            <div className="relative space-y-2.5 border-l border-cyan-300/15 pl-5">
              {group.items.map((item, index) => {
                const style = STATUS_STYLES[item.status];
                return (
                  <div key={item.sessionId} className="relative">
                    <span
                      className={`absolute -left-[25px] top-4 h-2.5 w-2.5 rounded-full border border-cyan-100/35 ${style.dot} ${
                        index === 0 ? "shadow-[0_0_16px_rgba(103,232,249,0.45)]" : ""
                      }`}
                    />
                    <HistoryRecord item={item} />
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function HistoryCalendarView({ history }: { history: AttendanceHistoryItem[] }) {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)), [weekStart]);
  const weekEnd = weekDays[6]!;
  const todayKey = dateKey(new Date());

  const recordsByDay = useMemo(() => {
    const grouped = new Map<string, AttendanceHistoryItem[]>();
    for (const day of weekDays) grouped.set(dateKey(day), []);
    for (const item of history) {
      const key = dateKey(new Date(itemDate(item)));
      const bucket = grouped.get(key);
      if (bucket) bucket.push(item);
    }
    for (const bucket of grouped.values()) {
      bucket.sort((a, b) => itemTime(a) - itemTime(b));
    }
    return grouped;
  }, [history, weekDays]);

  const visibleCount = weekDays.reduce((total, day) => total + (recordsByDay.get(dateKey(day))?.length ?? 0), 0);

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--forge-gold)]">Weekly Calendar</p>
          <p className="mt-1 text-[12px] font-semibold text-white/70">
            {compactDateLabel(weekStart)} -{" "}
            {weekEnd.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setWeekStart(addDays(weekStart, -7))}
            aria-label="Previous week"
            className="h-8 w-8 rounded-lg border border-white/[0.08] bg-white/[0.03] text-white/65 transition-colors hover:bg-white/[0.06] hover:text-white cursor-pointer"
          >
            &lt;
          </button>
          <button
            type="button"
            onClick={() => setWeekStart(startOfWeek(new Date()))}
            className="h-8 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 text-[11px] font-bold text-white/70 transition-colors hover:bg-white/[0.06] hover:text-white cursor-pointer"
          >
            This Week
          </button>
          <button
            type="button"
            onClick={() => setWeekStart(addDays(weekStart, 7))}
            aria-label="Next week"
            className="h-8 w-8 rounded-lg border border-white/[0.08] bg-white/[0.03] text-white/65 transition-colors hover:bg-white/[0.06] hover:text-white cursor-pointer"
          >
            &gt;
          </button>
        </div>
      </div>

      <div className="mb-3 flex justify-end">
        <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 font-mono text-[10px] text-white/45">
          {visibleCount} records
        </span>
      </div>

      <div className="grid gap-3 lg:grid-cols-7">
        {weekDays.map((day) => {
          const key = dateKey(day);
          const records = recordsByDay.get(key) ?? [];
          const isToday = key === todayKey;

          return (
            <div
              key={key}
              className={`min-h-[220px] rounded-xl border p-3 ${
                isToday
                  ? "border-[var(--forge-gold)]/35 bg-[var(--forge-gold)]/[0.045]"
                  : "border-white/[0.06] bg-white/[0.018]"
              }`}
            >
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-white/70">
                    {day.toLocaleDateString("en-US", { weekday: "short" })}
                  </p>
                  <p className="text-[10px] text-white/35">{compactDateLabel(day)}</p>
                </div>
                <span className="font-mono text-[10px] text-white/35">{records.length}</span>
              </div>

              {records.length === 0 ? (
                <div className="grid h-32 place-items-center rounded-lg border border-dashed border-white/[0.06] text-center text-[11px] italic text-white/25">
                  No records
                </div>
              ) : (
                <div className="space-y-2">
                  {records.map((item) => (
                    <HistoryRecord key={item.sessionId} item={item} compact />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function AttendanceHistoryList({ history }: AttendanceHistoryListProps) {
  const [view, setView] = useState<AttendanceHistoryView>("list");
  const groups = useMemo(() => groupByDate(history), [history]);

  return (
    <div className="h-full rounded-2xl border border-white/[0.06] bg-white/[0.01] p-5">
      <div className="mb-4 flex flex-col gap-3 border-b border-white/[0.06] pb-3.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-white">Your Attendance History</h3>
          <span className="rounded bg-white/[0.04] px-2 py-0.5 font-mono text-[10px] font-bold text-white/55">
            {history.length}
          </span>
        </div>
        <ViewSwitcher value={view} onChange={setView} />
      </div>

      {view === "list" && <HistoryListView groups={groups} />}
      {view === "timeline" && <HistoryTimelineView groups={groups} />}
      {view === "calendar" && <HistoryCalendarView history={history} />}
    </div>
  );
}
