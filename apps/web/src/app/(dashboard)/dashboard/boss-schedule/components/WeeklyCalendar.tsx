"use client";

import { useState } from "react";
import { type BossScheduleData } from "@/lib/api";
import Button from "@/components/ui/Button";

export interface WeeklyCalendarProps {
  anchorDate: Date;
  setAnchorDate: (d: Date) => void;
  selectedDate: Date | null;
  setSelectedDate: (d: Date) => void;
  daysOfWeek: Date[];
  getEventsForDay: (date: Date) => BossScheduleData[];
  getCountdownText: (spawnTime: string) => { expired: boolean; text: string; danger?: boolean; warning?: boolean };
  isOfficer: boolean;
  isLoading: boolean;
  setShowAddModal: (val: boolean) => void;
  setSpawnDate: (val: string) => void;
  setSpawnTime: (val: string) => void;
  setShowKillModal: (val: BossScheduleData | null) => void;
  setKillTimeInput: (val: string) => void;
}

export default function WeeklyCalendar({
  anchorDate,
  setAnchorDate,
  selectedDate,
  setSelectedDate,
  daysOfWeek,
  getEventsForDay,
  getCountdownText,
  isOfficer,
  isLoading,
  setShowAddModal,
  setSpawnDate,
  setSpawnTime,
  setShowKillModal,
  setKillTimeInput,
}: WeeklyCalendarProps) {
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [focusedDay, setFocusedDay] = useState<Date | null>(null);

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 shadow-sm">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between mb-6 gap-4">
        <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
          📅 Field Boss Weekly Schedule
          {isLoading && <span className="text-xs text-white/85 animate-pulse font-normal">(Syncing...)</span>}
        </h2>
        
        <div className="flex flex-wrap items-center gap-3">
          {/* Segmented View Mode Toggle */}
          <div className="flex items-center bg-white/[0.03] p-1 rounded-xl border border-white/[0.06]">
            <button
              type="button"
              onClick={() => setViewMode("grid")}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                viewMode === "grid"
                  ? "bg-white text-black shadow-sm font-black"
                  : "text-white/60 hover:text-white hover:bg-white/[0.02]"
              }`}
            >
              📅 Grid View
            </button>
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                viewMode === "list"
                  ? "bg-white text-black shadow-sm font-black"
                  : "text-white/60 hover:text-white hover:bg-white/[0.02]"
              }`}
            >
              📋 Timeline List Agenda
            </button>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => {
              const newDate = new Date(anchorDate);
              newDate.setDate(anchorDate.getDate() - 7);
              setAnchorDate(newDate);
            }}>
              ◀ Prev Week
            </Button>
            <Button variant="secondary" size="sm" onClick={() => {
              setAnchorDate(new Date());
              setSelectedDate(new Date());
            }}>
              Today
            </Button>
            <Button variant="secondary" size="sm" onClick={() => {
              const newDate = new Date(anchorDate);
              newDate.setDate(anchorDate.getDate() + 7);
              setAnchorDate(newDate);
            }}>
              Next Week ▶
            </Button>
          </div>
        </div>
      </div>

      {/* Grid Box Layout */}
      {viewMode === "grid" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-4">
          {daysOfWeek.map((dayDate) => {
            const events = getEventsForDay(dayDate);
            
            const isToday =
              new Date().getDate() === dayDate.getDate() &&
              new Date().getMonth() === dayDate.getMonth() &&
              new Date().getFullYear() === dayDate.getFullYear();

            const isSelected = selectedDate &&
              selectedDate.getDate() === dayDate.getDate() &&
              selectedDate.getMonth() === dayDate.getMonth() &&
              selectedDate.getFullYear() === dayDate.getFullYear();

            return (
              <div
                key={dayDate.toISOString()}
                onClick={() => setSelectedDate(dayDate)}
                className={`rounded-2xl border p-4 cursor-pointer transition-all flex flex-col min-h-[420px] relative ${
                  isSelected
                    ? "bg-white/[0.05] border-primary-500/40 shadow-[0_0_15px_rgba(139,92,246,0.15)] animate-scale-in"
                    : isToday
                      ? "bg-emerald-500/5 border-emerald-500/35 hover:bg-emerald-500/10"
                      : "bg-[#13131c]/50 border-white/[0.05] hover:border-white/10 hover:bg-[#13131c]/80"
                }`}
              >
                {/* Column Header */}
                <div className="border-b border-white/[0.05] pb-2 mb-3">
                  <div className="flex items-center justify-between">
                    <span className={`text-[10px] font-bold tracking-wider uppercase ${isToday ? "text-emerald-400" : "text-white/40"}`}>
                      {dayDate.toLocaleDateString("en-US", { weekday: "short" })}
                      {isToday && <span className="ml-1.5 px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 text-[8px] font-semibold border border-emerald-500/20">TODAY</span>}
                    </span>
                    
                    {isOfficer && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          const formattedYear = dayDate.getFullYear();
                          const formattedMonth = String(dayDate.getMonth() + 1).padStart(2, "0");
                          const formattedDay = String(dayDate.getDate()).padStart(2, "0");
                          setSpawnDate(`${formattedYear}-${formattedMonth}-${formattedDay}`);
                          setSpawnTime(new Date().toTimeString().substring(0, 5));
                          setShowAddModal(true);
                        }}
                        title="Schedule Boss for this date"
                        className="h-5 w-5 rounded bg-white/[0.04] border border-white/10 text-white/50 hover:text-white hover:bg-primary-500/25 flex items-center justify-center text-xs transition-colors"
                      >
                        +
                      </button>
                    )}
                  </div>
                  <p className={`text-xs font-semibold mt-1 truncate ${isSelected ? "text-white/85 font-bold" : "text-white/70"}`}>
                    {dayDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </p>
                </div>

                {/* Scrollable list of events for this day */}
                <div className="flex-1 overflow-y-auto space-y-3 pr-1 custom-scrollbar">
                  {events.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center border border-dashed border-white/[0.05] rounded-xl p-4 text-center text-[10px] text-white/40 opacity-60 hover:opacity-100 transition-opacity">
                      <p>No active spawns</p>
                      {isOfficer && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            const formattedYear = dayDate.getFullYear();
                            const formattedMonth = String(dayDate.getMonth() + 1).padStart(2, "0");
                            const formattedDay = String(dayDate.getDate()).padStart(2, "0");
                            setSpawnDate(`${formattedYear}-${formattedMonth}-${formattedDay}`);
                            setSpawnTime(new Date().toTimeString().substring(0, 5));
                            setShowAddModal(true);
                          }}
                          className="mt-2 text-white/85 hover:underline text-[9px] font-semibold"
                        >
                          + Schedule one
                        </button>
                      )}
                    </div>
                  ) : (
                    <>
                      {/* Show capped spawns list to prevent vertical blowout */}
                      {events.slice(0, 3).map((item) => {
                        const tick = getCountdownText(item.spawnTime);
                        const isFaction = item.guildId === null;
                        const isKilled = item.status === "KILLED";
                        const isSpawned = item.status === "SPAWNED";

                        return (
                          <div
                            key={item.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedDate(dayDate);
                            }}
                            className={`p-2.5 rounded-xl border text-left flex flex-col gap-1.5 transition-all cursor-pointer duration-300 ease-out ${
                              isKilled
                                ? "bg-white/[0.01] border-white/[0.05] opacity-40 hover:opacity-75 hover:scale-[1.01]"
                                : isSpawned || tick.expired
                                  ? "bg-red-950/15 border-red-500/30 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.05)] hover:scale-[1.03] hover:border-red-500/50"
                                  : tick.warning
                                    ? "bg-amber-950/15 border-amber-500/30 hover:scale-[1.03] hover:border-amber-500/50"
                                    : "bg-white/[0.02] border-white/[0.05] hover:border-primary-500/30 hover:bg-white/[0.04] hover:scale-[1.03] hover:-translate-y-0.5 hover:shadow-[0_4px_12px_rgba(139,92,246,0.05)]"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-1.5">
                              <div className="min-w-0">
                                <h4 className="font-semibold text-white text-[11px] truncate leading-tight">
                                  {item.bossName}
                                </h4>
                                <p className="text-[9px] text-white/40 truncate mt-0.5 font-mono">
                                  📍 {item.location}
                                </p>
                              </div>
                              {isKilled ? (
                                <span className="px-1 py-0.5 rounded text-[8px] font-bold bg-white/[0.04] border border-white/10 text-white/55">
                                  DEAD
                                </span>
                              ) : (
                                <span
                                  className={`text-[9px] font-mono font-bold whitespace-nowrap ${
                                    tick.expired || isSpawned
                                      ? "text-red-400 animate-pulse"
                                      : tick.warning
                                        ? "text-amber-400"
                                        : "text-white/85"
                                  }`}
                                >
                                  {tick.text}
                                </span>
                              )}
                            </div>

                            <div className="flex items-center justify-between border-t border-white/[0.05] pt-1.5 text-[8px] text-white/40 mt-1">
                              <span className="font-mono">
                                🕒 {new Date(item.spawnTime).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                              </span>
                              {item.guildTurn && isFaction && (
                                <span className="text-amber-400/85 font-semibold truncate max-w-[70px]" title={`Guild Turn: ${item.guildTurn}`}>
                                  🛡️ {item.guildTurn}
                                </span>
                              )}
                            </div>

                            {/* Direct Kill Log button on Calendar Cell */}
                            {isOfficer && !isKilled && (tick.expired || tick.warning || isSpawned) && (
                              <div className="mt-1">
                                <Button
                                  variant="danger"
                                  size="xs"
                                  fullWidth
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setShowKillModal(item);
                                    setKillTimeInput(new Date().toLocaleTimeString("en-US", { hour12: false }).substring(0, 5));
                                  }}
                                >
                                  Log Kill
                                </Button>
                              </div>
                            )}
                          </div>
                        );
                      })}

                      {/* Dynamic cap indicator dialog launcher */}
                      {events.length > 3 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setFocusedDay(dayDate);
                          }}
                          className="mt-2 py-2.5 rounded-xl border border-primary-500/20 bg-primary-500/5 hover:bg-primary-500/10 hover:border-primary-500/30 transition-all flex items-center justify-center gap-1.5 w-full text-[10px] font-bold text-primary-300 uppercase tracking-wider shadow-sm shadow-primary-500/5 cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
                        >
                          ✦ +{events.length - 3} More Targets
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Detailed Agenda List Layout */
        <div className="space-y-4 animate-fade-in">
          {daysOfWeek.map((dayDate) => {
            const events = getEventsForDay(dayDate);
            const isToday =
              new Date().getDate() === dayDate.getDate() &&
              new Date().getMonth() === dayDate.getMonth() &&
              new Date().getFullYear() === dayDate.getFullYear();

            const isSelected = selectedDate &&
              selectedDate.getDate() === dayDate.getDate() &&
              selectedDate.getMonth() === dayDate.getMonth() &&
              selectedDate.getFullYear() === dayDate.getFullYear();

            return (
              <div
                key={dayDate.toISOString()}
                onClick={() => setSelectedDate(dayDate)}
                className={`rounded-2xl border p-5 cursor-pointer transition-all flex flex-col md:flex-row md:items-center justify-between gap-6 relative ${
                  isSelected
                    ? "bg-white/[0.05] border-primary-500/40 shadow-[0_0_15px_rgba(139,92,246,0.15)]"
                    : isToday
                      ? "bg-emerald-500/5 border-emerald-500/35 hover:bg-emerald-500/10"
                      : "bg-[#13131c]/50 border-white/[0.05] hover:border-white/10 hover:bg-[#13131c]/80"
                }`}
              >
                {/* Day Info Header */}
                <div className="md:w-48 border-b md:border-b-0 md:border-r border-white/[0.05] pb-3 md:pb-0 md:pr-6 shrink-0 flex flex-col justify-center">
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-bold tracking-widest uppercase ${isToday ? "text-emerald-400" : "text-white/40"}`}>
                      {dayDate.toLocaleDateString("en-US", { weekday: "long" })}
                    </span>
                    {isToday && (
                      <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 text-[8px] font-semibold border border-emerald-500/20">
                        TODAY
                      </span>
                    )}
                  </div>
                  <p className={`text-base font-extrabold mt-1 text-white`}>
                    {dayDate.toLocaleDateString("en-US", { month: "long", day: "numeric" })}
                  </p>
                  <p className="text-[10px] text-white/40 mt-1 font-mono font-bold">{events.length} targets scheduled</p>
                </div>

                {/* Horizontal spacious spawns list */}
                <div className="flex-1 min-w-0">
                  {events.length === 0 ? (
                    <div className="flex items-center gap-3 border border-dashed border-white/[0.05] rounded-xl p-4 text-white/35 justify-center">
                      <span className="text-xs">No active boss spawns scheduled</span>
                      {isOfficer && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            const formattedYear = dayDate.getFullYear();
                            const formattedMonth = String(dayDate.getMonth() + 1).padStart(2, "0");
                            const formattedDay = String(dayDate.getDate()).padStart(2, "0");
                            setSpawnDate(`${formattedYear}-${formattedMonth}-${formattedDay}`);
                            setSpawnTime(new Date().toTimeString().substring(0, 5));
                            setShowAddModal(true);
                          }}
                          className="text-xs text-primary-300 font-bold hover:underline"
                        >
                          + Schedule Spawn
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                      {events.map((item) => {
                        const tick = getCountdownText(item.spawnTime);
                        const isFaction = item.guildId === null;
                        const isKilled = item.status === "KILLED";
                        const isSpawned = item.status === "SPAWNED";

                        return (
                          <div
                            key={item.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedDate(dayDate);
                            }}
                            className={`p-3 rounded-xl border flex flex-col justify-between gap-2.5 transition-all cursor-pointer ${
                              isKilled
                                ? "bg-white/[0.01] border-white/[0.05] opacity-40 hover:opacity-75"
                                : isSpawned || tick.expired
                                  ? "bg-red-950/15 border-red-500/35 shadow-[0_0_8px_rgba(239,68,68,0.08)]"
                                  : tick.warning
                                    ? "bg-amber-950/15 border-amber-500/35"
                                    : "bg-white/[0.02] border-white/[0.06] hover:border-primary-500/40 hover:bg-white/[0.04]"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <h4 className="font-semibold text-white text-xs truncate leading-snug">
                                  {item.bossName}
                                </h4>
                                <p className="text-[10px] text-white/40 truncate mt-0.5 font-mono">
                                  📍 {item.location}
                                </p>
                              </div>
                              {isKilled ? (
                                <span className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-white/[0.04] border border-white/10 text-white/50">
                                  DEAD
                                </span>
                              ) : (
                                <span
                                  className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-black/30 border border-white/[0.04] whitespace-nowrap ${
                                    tick.expired || isSpawned
                                      ? "text-red-400 animate-pulse border-red-500/20"
                                      : tick.warning
                                        ? "text-amber-400 border-amber-500/20"
                                        : "text-white/85"
                                  }`}
                                >
                                  {tick.text}
                                </span>
                              )}
                            </div>

                            <div className="flex items-center justify-between border-t border-white/[0.04] pt-2 text-[9px] text-white/40">
                              <span className="font-mono">
                                🕒 {new Date(item.spawnTime).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                              </span>
                              {item.guildTurn && isFaction && (
                                <span className="text-amber-400/85 font-semibold truncate" title={`Guild Turn: ${item.guildTurn}`}>
                                  🛡️ {item.guildTurn}
                                </span>
                              )}
                            </div>

                            {/* Log Kill button inside Detailed Row */}
                            {isOfficer && !isKilled && (tick.expired || tick.warning || isSpawned) && (
                              <div className="pt-1.5 border-t border-white/[0.04]">
                                <Button
                                  variant="danger"
                                  size="xs"
                                  fullWidth
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setShowKillModal(item);
                                    setKillTimeInput(new Date().toLocaleTimeString("en-US", { hour12: false }).substring(0, 5));
                                  }}
                                >
                                  Log Kill
                                </Button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* FOCUSED DAY OVERLAY DIALOG MODAL */}
      {focusedDay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div 
            className="absolute inset-0 bg-black/85 backdrop-blur-md" 
            onClick={() => setFocusedDay(null)} 
          />
          <div className="relative border border-white/[0.08] bg-[#0c0d10] rounded-3xl p-6 max-w-2xl w-full mx-4 shadow-2xl z-50 overflow-hidden animate-scale-in text-white/85">
            <div className="flex items-center justify-between mb-5 border-b border-white/[0.08] pb-3">
              <div>
                <span className="text-[10px] font-bold text-primary-400 uppercase tracking-widest">
                  Daily Agenda details
                </span>
                <h3 className="text-lg font-bold text-white mt-1">
                  Boss Spawns on {focusedDay.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setFocusedDay(null)}
                className="h-8 w-8 rounded-full bg-white/[0.04] border border-white/10 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 max-h-[450px] overflow-y-auto pr-1 custom-scrollbar">
              {getEventsForDay(focusedDay).map((item) => {
                const tick = getCountdownText(item.spawnTime);
                const isFaction = item.guildId === null;
                const isKilled = item.status === "KILLED";
                const isSpawned = item.status === "SPAWNED";

                return (
                  <div
                    key={item.id}
                    className={`p-4 rounded-xl bg-white/[0.02] border flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all ${
                      isKilled
                        ? "border-white/[0.04] opacity-50"
                        : isSpawned || tick.expired
                          ? "border-red-500/30 bg-red-950/5 animate-pulse"
                          : tick.warning
                            ? "border-amber-500/30 bg-amber-950/5"
                            : "border-white/[0.06] hover:border-white/15"
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-white text-sm">
                          {item.bossName}
                        </h4>
                        <span className="text-[9px] font-bold text-white/40 tracking-wider uppercase bg-white/[0.04] px-1.5 py-0.5 rounded border border-white/[0.06]">
                          📍 {item.location}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-2.5 text-[10px] font-mono">
                        <span className="text-white/55 bg-zinc-950 border border-white/[0.06] px-2 py-0.5 rounded">
                          🕒 {new Date(item.spawnTime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                        </span>
                        {item.guildTurn && isFaction && (
                          <span className="text-amber-500 font-bold bg-amber-500/5 border border-amber-500/10 px-2 py-0.5 rounded">
                            🛡️ {item.guildTurn}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-4 shrink-0 justify-between sm:justify-end border-t border-white/[0.04] sm:border-t-0 pt-3 sm:pt-0">
                      <div className="text-left sm:text-right shrink-0">
                        {isKilled ? (
                          <span className="text-[9px] font-bold text-zinc-500 bg-white/[0.04] border border-white/[0.06] px-2 py-0.5 rounded uppercase">
                            Dead
                          </span>
                        ) : (
                          <span
                            className={`text-xs font-mono font-bold tracking-tight ${
                              tick.expired || isSpawned
                                ? "text-red-400"
                                : tick.warning
                                  ? "text-amber-400"
                                  : "text-white"
                            }`}
                          >
                            {tick.expired ? "SPAWNED LIVE" : tick.text}
                          </span>
                        )}
                      </div>

                      <div className="shrink-0">
                        {isOfficer && !isKilled && (tick.expired || tick.warning || isSpawned) && (
                          <Button
                            variant="danger"
                            size="xs"
                            onClick={() => {
                              setFocusedDay(null);
                              setShowKillModal(item);
                              setKillTimeInput(new Date().toLocaleTimeString("en-US", { hour12: false }).substring(0, 5));
                            }}
                          >
                            Log Kill
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
