"use client";

import { useEffect, useMemo, useState } from "react";
import { dashboardApi, type LowBossRotationResponse } from "@/lib/api";
import { useQuery, queryClient } from "@/lib/query";
import { useToast } from "@/components/ui/Toast";
import Button from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { getGuildColor } from "../utils/helpers";

type Mode = "WEEKLY" | "MONTHLY";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const EMPTY: LowBossRotationResponse = {
  canManage: false,
  viewerRole: "MEMBER",
  mode: "MONTHLY",
  lowBossNames: [],
  weekly: {},
  days: {},
  guilds: [],
  bosses: [],
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}
function monthKeyOf(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}
function dateKey(year: number, month0: number, day: number) {
  return `${year}-${pad2(month0 + 1)}-${pad2(day)}`;
}

/**
 * Day-based low-boss rotation: the guild assigned to a day takes ALL flagged
 * "low" bosses that day. Faction leaders flag the low bosses, choose a WEEKLY or
 * MONTHLY cadence, auto-rotate the guild order, and override any day.
 */
export default function LowBossSchedule({ guildId }: { guildId: string }) {
  const { addToast } = useToast();
  const key = `boss_low_rotation:${guildId}`;

  const { data, isLoading } = useQuery<LowBossRotationResponse>(
    key,
    async () => {
      const res = await dashboardApi.getLowBossRotation(guildId);
      return res.success && res.data ? res.data : EMPTY;
    },
    { persist: true, staleTime: 15000, enabled: !!guildId },
  );

  const canManage = data?.canManage ?? false;
  const guilds = useMemo(() => data?.guilds ?? [], [data]);
  const bosses = useMemo(() => data?.bosses ?? [], [data]);
  const guildMap = useMemo(() => new Map(guilds.map((g) => [g.id, g])), [guilds]);

  const [mode, setMode] = useState<Mode>("MONTHLY");
  const [lowBossNames, setLowBossNames] = useState<string[]>([]);
  const [weekly, setWeekly] = useState<Record<string, string>>({});
  const [days, setDays] = useState<Record<string, string>>({});
  const [monthCursor, setMonthCursor] = useState<Date>(() => new Date());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!data) return;
    setMode(data.mode);
    setLowBossNames([...data.lowBossNames]);
    setWeekly({ ...data.weekly });
    setDays({ ...data.days });
  }, [data]);

  const baseline = data ?? EMPTY;

  const dirty = useMemo(() => {
    if (!data) return false;
    if (mode !== data.mode) return true;
    const lowSame =
      lowBossNames.length === data.lowBossNames.length &&
      lowBossNames.every((n) => data.lowBossNames.includes(n));
    if (!lowSame) return true;
    if (JSON.stringify(weekly) !== JSON.stringify(baseline.weekly)) return true;
    // days
    const baseDays = baseline.days;
    const keys = new Set([...Object.keys(days), ...Object.keys(baseDays)]);
    for (const k of keys) if (days[k] !== baseDays[k]) return true;
    return false;
  }, [data, mode, lowBossNames, weekly, days, baseline]);

  function toggleLowBoss(name: string) {
    if (!canManage) return;
    setLowBossNames((prev) => (prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]));
  }

  function cycleDay(k: string) {
    if (!canManage) return;
    const order = guilds.map((g) => g.id);
    if (order.length === 0) return;
    setDays((prev) => {
      const next = { ...prev };
      const cur = prev[k];
      const idx = cur ? order.indexOf(cur) : -1;
      const nextIdx = idx + 1;
      if (nextIdx >= order.length) delete next[k];
      else next[k] = order[nextIdx]!;
      return next;
    });
  }

  function setWeekday(wd: number, guildIdVal: string) {
    if (!canManage) return;
    setWeekly((prev) => {
      const next = { ...prev };
      if (!guildIdVal) delete next[String(wd)];
      else next[String(wd)] = guildIdVal;
      return next;
    });
  }

  function autoFill() {
    if (!canManage || guilds.length === 0) return;
    const order = guilds.map((g) => g.id);
    if (mode === "WEEKLY") {
      const next: Record<string, string> = {};
      for (let wd = 0; wd < 7; wd++) next[String(wd)] = order[wd % order.length]!;
      setWeekly(next);
    } else {
      const year = monthCursor.getFullYear();
      const month0 = monthCursor.getMonth();
      const daysInMonth = new Date(year, month0 + 1, 0).getDate();
      setDays((prev) => {
        const next = { ...prev };
        for (let day = 1; day <= daysInMonth; day++) {
          next[dateKey(year, month0, day)] = order[(day - 1) % order.length]!;
        }
        return next;
      });
    }
  }

  function clearMonth() {
    if (!canManage) return;
    const year = monthCursor.getFullYear();
    const month0 = monthCursor.getMonth();
    const daysInMonth = new Date(year, month0 + 1, 0).getDate();
    setDays((prev) => {
      const next = { ...prev };
      for (let day = 1; day <= daysInMonth; day++) delete next[dateKey(year, month0, day)];
      return next;
    });
  }

  function reset() {
    if (!data) return;
    setMode(data.mode);
    setLowBossNames([...data.lowBossNames]);
    setWeekly({ ...data.weekly });
    setDays({ ...data.days });
  }

  async function save() {
    if (!dirty || saving || !data) return;
    setSaving(true);
    // Build a days patch (null clears removed dates).
    const daysPatch: Record<string, string | null> = {};
    const baseDays = data.days;
    for (const k of Object.keys(baseDays)) if (!(k in days)) daysPatch[k] = null;
    for (const [k, v] of Object.entries(days)) if (baseDays[k] !== v) daysPatch[k] = v;
    try {
      const res = await dashboardApi.updateLowBossRotation(guildId, {
        mode,
        lowBossNames,
        weekly,
        daysPatch,
      });
      if (res.success) {
        addToast("success", "Low-boss schedule saved.");
        queryClient.invalidateQueries(key);
      } else {
        addToast("error", res.error?.message || "Failed to save schedule");
      }
    } catch {
      addToast("error", "Failed to save schedule");
    } finally {
      setSaving(false);
    }
  }

  // Monthly grid metadata
  const grid = useMemo(() => {
    const year = monthCursor.getFullYear();
    const month0 = monthCursor.getMonth();
    const firstWeekday = new Date(year, month0, 1).getDay();
    const daysInMonth = new Date(year, month0 + 1, 0).getDate();
    const cells: Array<{ day: number; key: string } | null> = [];
    for (let i = 0; i < firstWeekday; i++) cells.push(null);
    for (let day = 1; day <= daysInMonth; day++) cells.push({ day, key: dateKey(year, month0, day) });
    return { year, month0, cells };
  }, [monthCursor]);

  const monthLabel = monthCursor.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const todayKey = monthKeyOf(new Date()) === monthKeyOf(monthCursor)
    ? dateKey(monthCursor.getFullYear(), monthCursor.getMonth(), new Date().getDate())
    : "";

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-16 rounded-xl" />
        <Skeleton className="h-80 rounded-xl" />
      </div>
    );
  }

  if (guilds.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 rounded-xl bg-white/[0.015] border border-white/[0.05] p-8 text-center">
        <h3 className="text-sm font-semibold text-white/80">No active guilds</h3>
        <p className="text-xs text-white/45 mt-1">Add guilds to the faction to build a low-boss schedule.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Mode + actions */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="inline-flex items-center bg-[var(--obsidian-elevated)]/60 border border-[var(--metal-border)] rounded-lg p-1 gap-1">
            {(["MONTHLY", "WEEKLY"] as Mode[]).map((m) => (
              <button
                key={m}
                onClick={() => canManage && setMode(m)}
                disabled={!canManage}
                className={`px-3 py-1.5 text-[12px] font-semibold rounded-md transition-all ${canManage ? "cursor-pointer" : "cursor-default"} ${
                  mode === m
                    ? "bg-[var(--forge-glow)] border border-[var(--forge-gold)]/25 text-[var(--forge-gold-bright)]"
                    : "text-white/45 hover:text-white/75 border border-transparent"
                }`}
              >
                {m === "MONTHLY" ? "Monthly" : "Weekly"}
              </button>
            ))}
          </div>
          <p className="hidden sm:block text-[11px] text-white/40 max-w-[22rem]">
            The guild assigned to a day takes <span className="text-white/70">all low bosses</span> that day.
            {!canManage && " Read-only — only faction leaders can edit."}
          </p>
        </div>
        {canManage && (
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={autoFill}>Auto-fill</Button>
            <Button variant="ghost" size="sm" onClick={reset} disabled={!dirty || saving}>Reset</Button>
            <Button variant="accent" size="sm" onClick={save} isLoading={saving} disabled={!dirty}>Save</Button>
          </div>
        )}
      </div>

      {/* Low boss selector */}
      <div className="rounded-xl border border-[var(--metal-border)] bg-[var(--obsidian-elevated)]/40 p-3.5">
        <div className="flex items-center justify-between mb-2.5">
          <span className="text-[10px] uppercase tracking-[0.18em] font-bold text-white/40">
            Low bosses <span className="text-white/25">({lowBossNames.length} selected)</span>
          </span>
        </div>
        {lowBossNames.length === 0 && (
          <p className="text-[11px] text-amber-300/70 mb-2">Flag which bosses this day rotation covers.</p>
        )}
        <div className="flex flex-wrap gap-1.5">
          {bosses.map((b) => {
            const on = lowBossNames.includes(b.bossName);
            return (
              <button
                key={b.bossName}
                onClick={() => toggleLowBoss(b.bossName)}
                disabled={!canManage}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition-all ${
                  on
                    ? "border-[var(--forge-gold)]/40 bg-[var(--forge-glow)] text-[var(--forge-gold-bright)]"
                    : "border-white/[0.06] bg-white/[0.02] text-white/35"
                } ${canManage ? "cursor-pointer hover:opacity-90" : "cursor-default"}`}
              >
                <span className="text-[9px] opacity-60 font-mono">L{b.level}</span>
                {b.bossName}
              </button>
            );
          })}
        </div>
      </div>

      {/* Weekly view */}
      {mode === "WEEKLY" && (
        <div className="rounded-xl border border-[var(--metal-border)] bg-[var(--obsidian-elevated)]/40 p-3.5">
          <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-white/40 mb-3">Weekly pattern (repeats every week)</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2">
            {WEEKDAYS.map((label, wd) => {
              const gId = weekly[String(wd)] || "";
              const g = gId ? guildMap.get(gId) : null;
              const color = getGuildColor(g?.name || "");
              return (
                <div key={wd} className="flex items-center justify-between gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[11px] font-semibold text-white/55 w-8">{label}</span>
                    {g && <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: color.dot }} />}
                  </div>
                  <select
                    value={gId}
                    onChange={(e) => setWeekday(wd, e.target.value)}
                    disabled={!canManage}
                    className={`min-w-0 flex-1 max-w-[140px] px-2 py-1 rounded-md bg-[var(--obsidian-elevated)]/70 border border-[var(--metal-border)] text-[11px] focus:outline-none focus:border-[var(--forge-gold)]/40 ${g ? color.text : "text-white/50"} ${canManage ? "cursor-pointer" : ""}`}
                  >
                    <option className="bg-[#0c0d12] text-white/60" value="">Unassigned</option>
                    {guilds.map((gg) => (
                      <option className="bg-[#0c0d12] text-white" key={gg.id} value={gg.id}>{gg.name}</option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Monthly view */}
      {mode === "MONTHLY" && (
        <div className="rounded-xl border border-[var(--metal-border)] bg-[var(--obsidian-elevated)]/40 p-3.5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setMonthCursor((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
                className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.03] text-white/60 hover:text-white cursor-pointer"
                aria-label="Previous month"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M15 18l-6-6 6-6" /></svg>
              </button>
              <span className="text-sm font-semibold text-white min-w-[140px] text-center">{monthLabel}</span>
              <button
                onClick={() => setMonthCursor((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
                className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.03] text-white/60 hover:text-white cursor-pointer"
                aria-label="Next month"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M9 18l6-6-6-6" /></svg>
              </button>
            </div>
            {canManage && (
              <button onClick={clearMonth} className="text-[10px] uppercase tracking-wide text-white/40 hover:text-white/70 cursor-pointer">Clear month</button>
            )}
          </div>

          {canManage && (
            <p className="text-[10px] text-white/35 mb-2">Click a day to cycle its assigned guild.</p>
          )}

          <div className="grid grid-cols-7 gap-1">
            {WEEKDAYS.map((w) => (
              <div key={w} className="text-center text-[10px] font-bold uppercase tracking-wide text-white/30 py-1">{w}</div>
            ))}
            {grid.cells.map((cell, i) => {
              if (!cell) return <div key={`b${i}`} />;
              const gId = days[cell.key];
              const g = gId ? guildMap.get(gId) : null;
              const color = getGuildColor(g?.name || "");
              const isToday = cell.key === todayKey;
              return (
                <button
                  key={cell.key}
                  onClick={() => cycleDay(cell.key)}
                  disabled={!canManage}
                  className={`min-h-[62px] rounded-lg border p-1.5 flex flex-col items-start justify-start text-left transition-all ${
                    g ? `${color.border} ${color.bg}` : "border-white/[0.06] bg-white/[0.015]"
                  } ${canManage ? "cursor-pointer hover:border-[var(--forge-gold)]/30" : "cursor-default"} ${isToday ? "ring-1 ring-[var(--forge-gold)]/50" : ""}`}
                >
                  <span className={`text-[11px] font-bold ${isToday ? "text-[var(--forge-gold-bright)]" : "text-white/55"}`}>{cell.day}</span>
                  {g && (
                    <span className="mt-1 flex items-center gap-1 min-w-0 w-full">
                      <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: color.dot }} />
                      <span className={`text-[10px] font-semibold truncate ${color.text}`}>{g.name}</span>
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
