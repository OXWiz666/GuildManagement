"use client";

import { useMemo, useState } from "react";

export interface CalendarChip {
  id: string;
  kind: "boss" | "activity";
  timeLabel: string;
  title: string;
  subtitle?: string;
  badgeClass: string;
  dot: string;
  /** Boss portrait — only ever set for kind "boss". Activities render a
   *  fixed calendar glyph instead, so the two kinds stay visually distinct
   *  at a glance. */
  iconUrl?: string;
  onClick?: () => void;
}

export interface GuildOfDayInfo {
  name: string;
  badgeClass: string;
  dot: string;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MAX_CHIPS_PER_DAY = 6;

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

export function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function startOfWeek(d: Date): Date {
  const date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  date.setDate(date.getDate() - date.getDay());
  return date;
}

/** Fixed calendar glyph for activity chips — the same icon Guild Activities
 *  used in the sidebar before it moved into this tab, so it still reads as
 *  "an activity" at a glance next to a boss's actual portrait. */
function ActivityGlyph({ color }: { color: string }) {
  return (
    <svg className="h-full w-full p-[3px]" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function ChipIcon({ chip, size }: { chip: CalendarChip; size: number }) {
  const px = `${size}px`;
  if (chip.kind === "boss" && chip.iconUrl) {
    return (
      <span
        className="shrink-0 overflow-hidden rounded-md border border-white/10 bg-black/40"
        style={{ height: px, width: px }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- external Supabase Storage URLs, matches the rest of the boss-rotation avatars */}
        <img src={chip.iconUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
      </span>
    );
  }
  return (
    <span
      className="shrink-0 overflow-hidden rounded-md border border-white/10"
      style={{ height: px, width: px, backgroundColor: `${chip.dot}22` }}
    >
      <ActivityGlyph color={chip.dot} />
    </span>
  );
}

/**
 * The one calendar view for the whole Boss Rotation page — bigger than the
 * monthly grids it replaced, navigable a week at a time, and generic over
 * whatever chips the caller hands it (boss spawns, guild activities, or
 * both), plus an optional Faction Schedule "guild of the day" strip that's
 * read-only unless `onGuildStripClick` is supplied.
 */
export default function WeeklyCalendar({
  chipsByDate,
  guildOfDay,
  onGuildStripClick,
  onDayAdd,
  addLabel = "Add",
  initialDate,
}: {
  chipsByDate: Map<string, CalendarChip[]>;
  guildOfDay?: (dateKey: string) => GuildOfDayInfo | null;
  onGuildStripClick?: (dateKey: string) => void;
  onDayAdd?: (dateKey: string) => void;
  addLabel?: string;
  initialDate?: Date;
}) {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(initialDate ?? new Date()));
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);

  const days = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const d = new Date(weekStart);
        d.setDate(weekStart.getDate() + i);
        return d;
      }),
    [weekStart],
  );

  const todayKey = toDateKey(new Date());

  const rangeLabel = useMemo(() => {
    const end = days[6]!;
    const sameMonth = weekStart.getMonth() === end.getMonth();
    const startLabel = weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const endLabel = end.toLocaleDateString(
      "en-US",
      sameMonth ? { day: "numeric", year: "numeric" } : { month: "short", day: "numeric", year: "numeric" },
    );
    return `${startLabel} – ${endLabel}`;
  }, [days, weekStart]);

  function shiftWeek(delta: number) {
    setWeekStart((prev) => {
      const next = new Date(prev);
      next.setDate(prev.getDate() + delta * 7);
      return next;
    });
  }

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.015] p-5 sm:p-6 animate-scale-in">
      <div className="flex items-center justify-between mb-5">
        <button
          type="button"
          onClick={() => shiftWeek(-1)}
          aria-label="Previous week"
          className="h-9 w-9 inline-flex items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.03] text-white/60 hover:text-white hover:border-amber-500/25 transition-colors cursor-pointer focus-ring"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <div className="flex items-center gap-2.5">
          <h3 className="text-base font-bold text-white">{rangeLabel}</h3>
          <button
            type="button"
            onClick={() => setWeekStart(startOfWeek(new Date()))}
            className="h-7 px-2.5 inline-flex items-center rounded-lg border border-white/[0.08] bg-white/[0.02] text-[10px] font-semibold uppercase tracking-wide text-white/55 hover:text-white hover:bg-white/[0.05] cursor-pointer"
          >
            This week
          </button>
        </div>
        <button
          type="button"
          onClick={() => shiftWeek(1)}
          aria-label="Next week"
          className="h-9 w-9 inline-flex items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.03] text-white/60 hover:text-white hover:border-amber-500/25 transition-colors cursor-pointer focus-ring"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M9 18l6-6-6-6" /></svg>
        </button>
      </div>

      <div className="grid grid-cols-7 gap-2.5">
        {days.map((date) => {
          const key = toDateKey(date);
          const chips = chipsByDate.get(key) ?? [];
          const isToday = key === todayKey;
          const gOfDay = guildOfDay?.(key) ?? null;
          const overflow = chips.length - MAX_CHIPS_PER_DAY;

          return (
            <div
              key={key}
              className={`min-h-[340px] sm:min-h-[420px] rounded-xl border flex flex-col ${
                isToday ? "border-[var(--forge-gold)]/40 bg-[var(--forge-glow)]/10" : "border-white/[0.06] bg-white/[0.01]"
              }`}
            >
              <div className="flex items-center justify-between gap-1.5 px-2.5 pt-2.5">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-[10px] uppercase tracking-wider text-white/30 font-bold">{WEEKDAYS[date.getDay()]}</span>
                  <span className={`text-[15px] font-bold ${isToday ? "text-[var(--forge-gold-bright)]" : "text-white/70"}`}>
                    {date.getDate()}
                  </span>
                </div>
                {onDayAdd && (
                  <button
                    type="button"
                    onClick={() => onDayAdd(key)}
                    aria-label={`${addLabel} for ${key}`}
                    title={addLabel}
                    className="h-6 w-6 inline-flex items-center justify-center rounded-md text-white/30 hover:text-[var(--forge-gold)] hover:bg-white/[0.05] cursor-pointer"
                  >
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                  </button>
                )}
              </div>

              {gOfDay ? (
                <button
                  type="button"
                  onClick={() => onGuildStripClick?.(key)}
                  disabled={!onGuildStripClick}
                  title={onGuildStripClick ? "Click to change" : undefined}
                  className={`mx-2.5 mt-2 flex items-center gap-1.5 px-2 py-1 rounded-md border text-[10px] font-bold truncate ${gOfDay.badgeClass} ${
                    onGuildStripClick ? "cursor-pointer hover:opacity-90" : "cursor-default"
                  }`}
                >
                  <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: gOfDay.dot }} />
                  <span className="truncate">{gOfDay.name}</span>
                </button>
              ) : (
                onGuildStripClick && (
                  <button
                    type="button"
                    onClick={() => onGuildStripClick(key)}
                    className="mx-2.5 mt-2 px-2 py-1 rounded-md border border-dashed border-white/10 text-[10px] text-white/25 hover:text-white/50 hover:border-white/20 cursor-pointer"
                  >
                    Unassigned
                  </button>
                )
              )}

              <div className="flex-1 min-h-0 mt-2 px-2.5 pb-2.5 space-y-1.5 overflow-y-auto">
                {chips.slice(0, MAX_CHIPS_PER_DAY).map((chip) => (
                  <button
                    key={chip.id}
                    type="button"
                    onClick={chip.onClick}
                    disabled={!chip.onClick}
                    title={chip.subtitle ? `${chip.title} · ${chip.subtitle}` : chip.title}
                    className={`w-full flex items-start gap-2 px-2 py-1.5 rounded-lg border text-left transition-colors ${chip.badgeClass} ${
                      chip.onClick ? "cursor-pointer hover:opacity-90" : "cursor-default"
                    }`}
                  >
                    <ChipIcon chip={chip} size={26} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-1.5">
                        <span className="text-[11px] font-bold truncate">{chip.title}</span>
                        <span className="shrink-0 font-mono text-[9px] opacity-70">{chip.timeLabel}</span>
                      </span>
                      {chip.subtitle && (
                        <span className="block text-[9px] opacity-65 truncate mt-0.5">{chip.subtitle}</span>
                      )}
                    </span>
                  </button>
                ))}
                {overflow > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedDayKey(key)}
                    className="w-full text-left text-[10px] font-semibold text-white/40 hover:text-white/70 px-2 cursor-pointer"
                  >
                    +{overflow} more
                  </button>
                )}
                {chips.length === 0 && !onDayAdd && <p className="text-[10px] text-white/15 px-2 pt-2">—</p>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Day detail modal — full chip list for days with overflow */}
      {selectedDayKey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setSelectedDayKey(null)}>
          <div className="absolute inset-0 bg-black/75 backdrop-blur-md" />
          <div
            className="relative w-full max-w-md glass-strong rounded-2xl border border-white/[0.08] shadow-2xl overflow-hidden z-50 animate-scale-in max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-white/[0.06] flex items-center justify-between gap-3 shrink-0">
              <h3 className="text-base font-bold text-white">
                {new Date(`${selectedDayKey}T00:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
              </h3>
              <button onClick={() => setSelectedDayKey(null)} className="text-white/40 hover:text-white/80 cursor-pointer shrink-0" aria-label="Close">
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-3 space-y-2 overflow-y-auto">
              {(chipsByDate.get(selectedDayKey) ?? []).map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => {
                    chip.onClick?.();
                    setSelectedDayKey(null);
                  }}
                  disabled={!chip.onClick}
                  className={`w-full flex items-center gap-3 rounded-xl border text-left p-3 transition-colors ${chip.badgeClass} ${
                    chip.onClick ? "cursor-pointer hover:opacity-90" : "cursor-default"
                  }`}
                >
                  <ChipIcon chip={chip} size={36} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold truncate">{chip.title}</span>
                    {chip.subtitle && <span className="block text-[11px] text-white/40 truncate">{chip.subtitle}</span>}
                  </span>
                  <span className="text-[11px] font-mono text-white/50 shrink-0">{chip.timeLabel}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
