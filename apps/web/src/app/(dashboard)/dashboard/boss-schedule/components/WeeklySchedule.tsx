"use client";

import { useState } from "react";
import { type BossScheduleData, type BossData } from "@/lib/api";
import { getBossImageUrl } from "@guild/shared";

type ViewMode = "week" | "list" | "timeline";

export interface WeeklyScheduleProps {
  anchorDate: Date;
  setAnchorDate: (d: Date) => void;
  selectedDate: Date | null;
  setSelectedDate: (d: Date) => void;
  daysOfWeek: Date[];
  weekRangeLabel: string;
  bosses: BossData[];
  getEventsForDay: (date: Date) => BossScheduleData[];
  getCountdownText: (
    spawnTime: string,
    ctx?: { bossName?: string; status?: string },
  ) => { expired: boolean; live?: boolean; text: string; liveText?: string; danger?: boolean; warning?: boolean };
  isOfficer: boolean;
  isLoading: boolean;
  onAddForDate: (date: Date) => void;
  onLogKill: (item: BossScheduleData) => void;
  onEditSchedule?: (item: BossScheduleData) => void;
  onDeleteSchedule?: (scheduleId: string) => void;
}

function isSameDay(a: Date, b: Date) {
  return a.getDate() === b.getDate() && a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
}

export default function WeeklySchedule({
  anchorDate,
  setAnchorDate,
  selectedDate,
  setSelectedDate,
  daysOfWeek,
  weekRangeLabel,
  bosses,
  getEventsForDay,
  getCountdownText,
  isOfficer,
  isLoading,
  onAddForDate,
  onLogKill,
  onEditSchedule,
  onDeleteSchedule,
}: WeeklyScheduleProps) {
  const [view, setView] = useState<ViewMode>("week");
  const [focusedDay, setFocusedDay] = useState<Date | null>(null);

  const levelFor = (name: string) =>
    bosses.find((b) => b.name.toLowerCase() === name.toLowerCase())?.level ?? null;

  const shiftWeek = (deltaDays: number) => {
    const d = new Date(anchorDate);
    d.setDate(anchorDate.getDate() + deltaDays);
    setAnchorDate(d);
  };

  const views: Array<{ id: ViewMode; label: string; icon: string }> = [
    { id: "week", label: "Week", icon: "▦" },
    { id: "list", label: "List", icon: "≣" },
    { id: "timeline", label: "Timeline", icon: "⊟" },
  ];

  return (
    <div className="rounded-2xl border border-[var(--metal-border)] bg-[var(--obsidian-elevated)]/40 p-4 sm:p-5">
      {/* Panel header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-white/[0.06] pb-4 mb-5">
        <h2 className="text-xs font-bold text-white uppercase tracking-[0.14em] flex items-center gap-2">
          <span className="text-[var(--forge-gold)]">🗓</span> Weekly Schedule
          {isLoading && <span className="text-[10px] text-white/40 font-normal normal-case animate-pulse">syncing…</span>}
        </h2>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* View toggle */}
          <div className="inline-flex items-center bg-[var(--obsidian-deep)]/60 border border-[var(--metal-border)] rounded-lg p-0.5">
            {views.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => setView(v.id)}
                className={`px-2.5 py-1.5 rounded-md text-[11px] font-semibold transition-all cursor-pointer inline-flex items-center gap-1.5 ${
                  view === v.id
                    ? "bg-[var(--forge-glow)] border border-[var(--forge-gold)]/25 text-[var(--forge-gold-bright)]"
                    : "text-white/45 hover:text-white/80 border border-transparent"
                }`}
              >
                <span className="text-[10px]">{v.icon}</span>
                {v.label}
              </button>
            ))}
          </div>

          {/* Week navigation */}
          <div className="inline-flex items-center gap-1">
            <button
              type="button"
              onClick={() => shiftWeek(-7)}
              aria-label="Previous week"
              className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-[var(--metal-border)] bg-white/[0.02] text-white/55 hover:text-[var(--forge-gold)] hover:border-[var(--forge-gold)]/30 transition-colors cursor-pointer"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={() => {
                setAnchorDate(new Date());
                setSelectedDate(new Date());
              }}
              className="h-8 px-3 inline-flex items-center justify-center rounded-lg border border-[var(--metal-border)] bg-white/[0.02] text-[11px] font-semibold text-white/70 hover:text-white hover:border-[var(--forge-gold)]/30 transition-colors cursor-pointer"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => shiftWeek(7)}
              aria-label="Next week"
              className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-[var(--metal-border)] bg-white/[0.02] text-white/55 hover:text-[var(--forge-gold)] hover:border-[var(--forge-gold)]/30 transition-colors cursor-pointer"
            >
              ›
            </button>
            <span className="ml-1.5 text-[11px] font-mono text-white/45 hidden sm:inline">{weekRangeLabel}</span>
          </div>
        </div>
      </div>

      {view === "week" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3">
          {daysOfWeek.map((day) => {
            const events = getEventsForDay(day);
            const today = isSameDay(new Date(), day);
            const selected = selectedDate && isSameDay(selectedDate, day);

            return (
              <div
                key={day.toISOString()}
                onClick={() => {
                  setSelectedDate(day);
                  setFocusedDay(day);
                }}
                className={`rounded-xl border p-3 cursor-pointer transition-all flex flex-col min-h-[400px] ${
                  today
                    ? "border-[var(--forge-gold)]/40 bg-[var(--forge-glow)]/30 shadow-[0_0_18px_rgba(212,168,83,0.08)]"
                    : selected
                      ? "border-white/20 bg-white/[0.04]"
                      : "border-white/[0.05] bg-[var(--obsidian-deep)]/40 hover:border-white/12 hover:bg-white/[0.02]"
                }`}
              >
                <div className="flex items-center justify-between border-b border-white/[0.06] pb-2 mb-2.5">
                  <div>
                    <p className={`text-[10px] font-bold uppercase tracking-wider ${today ? "text-[var(--forge-gold-bright)]" : "text-white/40"}`}>
                      {day.toLocaleDateString("en-US", { weekday: "short" })}
                    </p>
                    <p className="text-xs font-semibold text-white/80 mt-0.5">
                      {day.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </p>
                  </div>
                  {today ? (
                    <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-[var(--forge-gold)]/15 text-[var(--forge-gold-bright)] border border-[var(--forge-gold)]/25 uppercase">
                      Live
                    </span>
                  ) : isOfficer ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onAddForDate(day);
                      }}
                      title="Schedule a boss"
                      className="h-5 w-5 rounded border border-[var(--metal-border)] text-white/45 hover:text-[var(--forge-gold)] hover:border-[var(--forge-gold)]/30 flex items-center justify-center text-xs transition-colors"
                    >
                      +
                    </button>
                  ) : null}
                </div>

                <div className="flex-1 overflow-y-auto space-y-2 pr-0.5 custom-scrollbar">
                  {events.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center gap-1.5 py-6">
                      <span className="text-lg opacity-20">🗡</span>
                      <p className="text-[10px] text-white/30 italic px-2">No spawns scheduled</p>
                    </div>
                  ) : (
                    <>
                      {events.slice(0, 3).map((item) => (
                        <BossCard
                          key={item.id}
                          item={item}
                          level={levelFor(item.bossName)}
                          tick={getCountdownText(item.spawnTime, { bossName: item.bossName, status: item.status })}
                          isOfficer={isOfficer}
                          onLogKill={onLogKill}
                        />
                      ))}
                      {events.length > 3 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setFocusedDay(day);
                          }}
                          className="w-full py-2 rounded-lg border border-[var(--metal-border)] bg-white/[0.02] hover:bg-[var(--forge-glow)]/30 hover:border-[var(--forge-gold)]/25 text-[10px] font-bold text-white/55 hover:text-[var(--forge-gold-bright)] transition-all cursor-pointer"
                        >
                          + {events.length - 3} More
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {view === "list" && (
        <div className="space-y-3">
          {daysOfWeek.map((day) => {
            const events = getEventsForDay(day);
            const today = isSameDay(new Date(), day);
            return (
              <div
                key={day.toISOString()}
                className={`rounded-xl border p-4 flex flex-col md:flex-row gap-4 ${
                  today ? "border-[var(--forge-gold)]/30 bg-[var(--forge-glow)]/20" : "border-white/[0.05] bg-[var(--obsidian-deep)]/40"
                }`}
              >
                <div className="md:w-40 shrink-0 md:border-r border-white/[0.06] md:pr-4">
                  <p className={`text-[10px] font-bold uppercase tracking-wider ${today ? "text-[var(--forge-gold-bright)]" : "text-white/40"}`}>
                    {day.toLocaleDateString("en-US", { weekday: "long" })}
                  </p>
                  <p className="text-base font-bold text-white mt-0.5">
                    {day.toLocaleDateString("en-US", { month: "long", day: "numeric" })}
                  </p>
                  <p className="text-[10px] text-white/40 mt-1 font-mono">{events.length} scheduled</p>
                </div>
                <div className="flex-1 min-w-0">
                  {events.length === 0 ? (
                    <div className="h-full flex items-center text-xs text-white/30 italic">No boss spawns this day.</div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
                      {events.map((item) => (
                        <BossCard
                          key={item.id}
                          item={item}
                          level={levelFor(item.bossName)}
                          tick={getCountdownText(item.spawnTime, { bossName: item.bossName, status: item.status })}
                          isOfficer={isOfficer}
                          onLogKill={onLogKill}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {view === "timeline" && (
        <div className="relative pl-4">
          <div className="absolute left-[7px] top-1 bottom-1 w-px bg-gradient-to-b from-[var(--forge-gold)]/30 via-white/10 to-transparent" />
          <div className="space-y-5">
            {daysOfWeek.map((day) => {
              const events = getEventsForDay(day);
              if (events.length === 0) return null;
              const today = isSameDay(new Date(), day);
              return (
                <div key={day.toISOString()} className="relative">
                  <span
                    className={`absolute -left-[13px] top-1 h-3.5 w-3.5 rounded-full border-2 ${
                      today ? "bg-[var(--forge-gold)] border-[var(--forge-gold-bright)]" : "bg-[var(--obsidian-deep)] border-white/25"
                    }`}
                  />
                  <p className={`text-[11px] font-bold uppercase tracking-wider mb-2 ${today ? "text-[var(--forge-gold-bright)]" : "text-white/55"}`}>
                    {day.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
                    {events.map((item) => (
                      <BossCard
                        key={item.id}
                        item={item}
                        level={levelFor(item.bossName)}
                        tick={getCountdownText(item.spawnTime, { bossName: item.bossName, status: item.status })}
                        isOfficer={isOfficer}
                        onLogKill={onLogKill}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Focused day modal (for "+N More") */}
      {focusedDay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setFocusedDay(null)} />
          <div className="relative w-full max-w-2xl rounded-2xl border border-[var(--metal-border)] bg-[var(--obsidian-surface)] shadow-[0_40px_90px_-25px_rgba(0,0,0,0.8)] p-5 animate-scale-in">
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-3 mb-4">
              <div>
                <p className="text-[10px] font-bold text-[var(--forge-gold)] uppercase tracking-widest">Daily Agenda</p>
                <h3 className="text-base font-bold text-white mt-0.5">
                  {focusedDay.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setFocusedDay(null)}
                className="h-8 w-8 rounded-full border border-[var(--metal-border)] text-white/55 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>
            {getEventsForDay(focusedDay).length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 py-14 text-center">
                <span className="text-3xl opacity-20">🗡</span>
                <p className="text-xs text-white/40">No boss spawns scheduled for this day.</p>
                {isOfficer && (
                  <button
                    type="button"
                    onClick={() => {
                      const d = focusedDay;
                      setFocusedDay(null);
                      onAddForDate(d);
                    }}
                    className="px-4 py-2 rounded-lg bg-gradient-to-r from-[var(--forge-gold)] to-[var(--forge-gold-bright)] text-[var(--obsidian-deep)] text-[12px] font-bold hover:brightness-110 transition-all cursor-pointer"
                  >
                    + Schedule a Boss
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[440px] overflow-y-auto pr-1 custom-scrollbar">
                {getEventsForDay(focusedDay).map((item) => (
                  <BossCard
                    key={item.id}
                    item={item}
                    level={levelFor(item.bossName)}
                    tick={getCountdownText(item.spawnTime, { bossName: item.bossName, status: item.status })}
                    isOfficer={isOfficer}
                    onLogKill={(it) => {
                      setFocusedDay(null);
                      onLogKill(it);
                    }}
                    onEdit={onEditSchedule ? (it) => { setFocusedDay(null); onEditSchedule(it); } : undefined}
                    onDelete={onDeleteSchedule ? (id) => { setFocusedDay(null); onDeleteSchedule(id); } : undefined}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function BossCard({
  item,
  level,
  tick,
  isOfficer,
  onLogKill,
  onEdit,
  onDelete,
}: {
  item: BossScheduleData;
  level: number | null;
  tick: { expired: boolean; live?: boolean; text: string; liveText?: string; warning?: boolean };
  isOfficer: boolean;
  onLogKill: (item: BossScheduleData) => void;
  onEdit?: (item: BossScheduleData) => void;
  onDelete?: (id: string) => void;
}) {
  const isKilled = item.status === "KILLED";
  const isLive = !isKilled && (tick.live ?? tick.expired);
  const session = item.attendanceSessions?.[0];
  const checkInOpen = !!session && session.isActive && new Date(session.expiresAt).getTime() > Date.now();

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className={`group rounded-xl border p-2.5 transition-all duration-300 ${
        isKilled
          ? "border-white/[0.04] bg-white/[0.01] opacity-50 hover:opacity-80"
          : isLive
            ? "border-rose-500/35 bg-rose-500/[0.06] shadow-[0_0_14px_rgba(244,63,94,0.06)]"
            : tick.warning
              ? "border-[var(--forge-gold)]/30 bg-[var(--forge-glow)]/30"
              : "border-white/[0.06] bg-white/[0.02] hover:border-white/15"
      }`}
    >
      <div className="flex items-start gap-2.5">
        <div className="relative shrink-0">
          <img
            src={item.bossImageUrl || getBossImageUrl(item.bossName)}
            alt={item.bossName}
            className="h-10 w-10 rounded-lg object-cover border border-white/10 group-hover:scale-105 transition-transform"
            loading="lazy"
          />
          {isLive && (
            <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-rose-500 border border-[var(--obsidian-deep)] animate-pulse" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h4 className="text-[12px] font-bold text-white truncate leading-tight">{item.bossName}</h4>
            {level !== null && (
              <span className="text-[8px] font-bold px-1 py-0.5 rounded bg-[var(--forge-glow)] border border-[var(--forge-gold)]/25 text-[var(--forge-gold-bright)] shrink-0 font-fantasy">
                {level}
              </span>
            )}
          </div>
          <p className="text-[9px] text-white/40 truncate mt-0.5">📍 {item.location}</p>
          {isLive ? (
            <span className="inline-flex items-center gap-1.5 mt-1 text-[10px] font-mono font-bold text-rose-400">
              <span className="h-1.5 w-1.5 rounded-full bg-rose-400 animate-ping shrink-0" />
              <span className="uppercase tracking-wider text-[9px]">Live</span>
              <span className="tabular-nums">{tick.liveText}</span>
            </span>
          ) : isKilled ? (
            <span className="inline-block mt-1 text-[9px] font-bold uppercase tracking-wider text-white/40">Killed</span>
          ) : (
            <span className={`inline-block mt-1 text-[11px] font-mono font-bold tabular-nums ${tick.warning ? "text-[var(--forge-gold-bright)]" : "text-white/80"}`}>
              {tick.text}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-white/[0.05] mt-2 pt-1.5">
        <span className="text-[9px] font-mono text-white/45">
          {new Date(item.spawnTime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
        </span>
        <div className="flex items-center gap-1.5">
          {checkInOpen && (
            <span className="inline-flex items-center gap-1 text-[8px] font-bold text-violet-300">
              <span className="h-1.5 w-1.5 rounded-full bg-violet-400 animate-pulse" /> Check-in
            </span>
          )}
          {item.guildTurn && (
            <span className="text-[8px] text-[var(--forge-gold)] font-semibold truncate max-w-[64px]" title={item.guildTurn}>
              🛡 {item.guildTurn}
            </span>
          )}
        </div>
      </div>

      {isOfficer && !isKilled && (
        <button
          type="button"
          onClick={() => onLogKill(item)}
          className={`mt-2 w-full py-1.5 rounded-lg border text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
            isLive
              ? "bg-rose-500/10 border-rose-500/25 text-rose-300 hover:bg-rose-500/20 hover:text-white"
              : "bg-white/[0.02] border-[var(--metal-border)] text-white/55 hover:text-rose-300 hover:border-rose-500/25"
          }`}
        >
          Log Kill
        </button>
      )}
      {isOfficer && (onEdit || onDelete) && (
        <div className="mt-1.5 flex gap-1.5">
          {onEdit && (
            <button
              type="button"
              onClick={() => onEdit(item)}
              className="flex-1 py-1.5 rounded-lg bg-white/[0.02] border border-[var(--metal-border)] text-[10px] font-bold text-white/55 hover:text-[var(--forge-gold-bright)] hover:border-[var(--forge-gold)]/30 transition-all cursor-pointer"
            >
              Edit
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={() => onDelete(item.id)}
              className="flex-1 py-1.5 rounded-lg bg-white/[0.02] border border-[var(--metal-border)] text-[10px] font-bold text-white/45 hover:text-rose-300 hover:border-rose-500/25 transition-all cursor-pointer"
            >
              Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
}
