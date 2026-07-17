"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  dashboardApi,
  activityApi,
  guildApi,
  type LowBossRotationResponse,
  type FactionGuildData,
  type BossScheduleData,
  type GuildActivitiesResponse,
  type ActivityPointRulesData,
} from "@/lib/api";
import { useQuery, queryClient } from "@/lib/query";
import { useToast } from "@/components/ui/Toast";
import Button from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { getGuildColor } from "../utils/helpers";
import { getDailyRotationIndex, SHORT_CYCLE_MAX_HOURS } from "@guild/shared";
import { buildActivityTypeMeta } from "@/lib/activityTypeMeta";
import WeeklyCalendar from "./WeeklyCalendar";
import { buildWeeklyChips, type CalendarBossEntry } from "../utils/calendarChips";

type Mode = "WEEKLY" | "MONTHLY" | "DAILY";

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
function dateKey(year: number, month0: number, day: number) {
  return `${year}-${pad2(month0 + 1)}-${pad2(day)}`;
}

const EMPTY_SCHEDULES: BossScheduleData[] = [];
const EMPTY_ACTIVITIES: GuildActivitiesResponse = { canManage: false, viewerRole: "MEMBER", activities: [] };
const EMPTY_ACTIVITY_RULES: ActivityPointRulesData = { activities: [] };

/**
 * Day-based low-boss rotation: the guild assigned to a day takes ALL flagged
 * "low" bosses that day. Faction leaders flag the low bosses and choose a
 * cadence — WEEKLY or MONTHLY are hand-filled calendars; DAILY is exclusive
 * to sub-24h-cooldown bosses (they can spawn more than once a day) and
 * auto-rotates the guild order with nothing to fill in.
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

  // Same cache keys the rest of Boss Rotation uses — the Monthly view's
  // WeeklyCalendar overlays boss spawns + guild activities alongside the
  // guild-of-day assignment, at no extra cost when those tabs already loaded.
  const { data: overlaySchedulesRaw } = useQuery<BossScheduleData[]>(
    `boss_schedules:${guildId}`,
    async () => {
      const res = await dashboardApi.getBossSchedules(guildId);
      return res.success && res.data?.schedules ? res.data.schedules : EMPTY_SCHEDULES;
    },
    { persist: true, staleTime: 15000, enabled: !!guildId },
  );
  const { data: overlayActivitiesRaw } = useQuery<GuildActivitiesResponse>(
    `guild_activities:${guildId}`,
    async () => {
      const res = await activityApi.list(guildId);
      return res.success && res.data ? res.data : EMPTY_ACTIVITIES;
    },
    { persist: true, staleTime: 10000, enabled: !!guildId },
  );
  const { data: overlayRulesRaw } = useQuery<ActivityPointRulesData>(
    `activity_rules:${guildId}`,
    async () => {
      const res = await guildApi.getActivityRules(guildId);
      return res.success && res.data ? res.data.rules : EMPTY_ACTIVITY_RULES;
    },
    { persist: true, staleTime: 300000, enabled: !!guildId },
  );
  const overlaySchedules = useMemo(() => overlaySchedulesRaw ?? [], [overlaySchedulesRaw]);
  const overlayActivities = useMemo(() => overlayActivitiesRaw?.activities ?? [], [overlayActivitiesRaw]);
  const overlayTypeMeta = useMemo(() => buildActivityTypeMeta(overlayRulesRaw?.activities ?? []), [overlayRulesRaw]);

  const [mode, setMode] = useState<Mode>("MONTHLY");
  const [lowBossNames, setLowBossNames] = useState<string[]>([]);
  const [weekly, setWeekly] = useState<Record<string, string>>({});
  const [days, setDays] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!data) return;
    setMode(data.mode);
    setLowBossNames([...data.lowBossNames]);
    setWeekly({ ...data.weekly });
    setDays({ ...data.days });
  }, [data]);

  // Daily is exclusive to bosses that can spawn more than once a day — prune
  // any longer-cooldown boss left flagged from a prior mode.
  const dailyEligibleBosses = useMemo(
    () => bosses.filter((b) => b.cooldownHours != null && b.cooldownHours < SHORT_CYCLE_MAX_HOURS),
    [bosses],
  );
  useEffect(() => {
    if (mode !== "DAILY") return;
    const allowed = new Set(dailyEligibleBosses.map((b) => b.bossName));
    setLowBossNames((prev) => prev.filter((n) => allowed.has(n)));
  }, [mode, dailyEligibleBosses]);

  const pickerBosses = mode === "DAILY" ? dailyEligibleBosses : bosses;

  // Read-only 7-day preview of the auto-rotating guild order — nothing to
  // save here, it's a pure function of guild count + date.
  const dailyPreview = useMemo(() => {
    const order = guilds.map((g) => g.id);
    const today = new Date();
    const out: Array<{ key: string; label: string; guild: FactionGuildData | null }> = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(today.getTime() + i * 86400000);
      const idx = getDailyRotationIndex(order.length, d);
      const gid = idx >= 0 ? order[idx] : undefined;
      out.push({
        key: d.toISOString().slice(0, 10),
        label:
          i === 0
            ? "Today"
            : i === 1
              ? "Tomorrow"
              : d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }),
        guild: gid ? (guildMap.get(gid) ?? null) : null,
      });
    }
    return out;
  }, [guilds, guildMap]);

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
      const now = new Date();
      const year = now.getFullYear();
      const month0 = now.getMonth();
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
    const now = new Date();
    const year = now.getFullYear();
    const month0 = now.getMonth();
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

  // Monthly mode's assignment overlay for WeeklyCalendar — reflects the live
  // draft (`days`), not the saved baseline, so an officer sees their pending
  // edits immediately.
  const monthlyGuildOfDay = useCallback(
    (dateKeyStr: string) => {
      const gId = days[dateKeyStr];
      const g = gId ? guildMap.get(gId) : null;
      if (!g) return null;
      const color = getGuildColor(g.name);
      return { name: g.name, badgeClass: `${color.border} ${color.bg} ${color.text}`, dot: color.dot };
    },
    [days, guildMap],
  );

  const bossEntries: CalendarBossEntry[] = useMemo(
    () =>
      overlaySchedules
        .filter((s) => s.status !== "KILLED")
        .map((s) => ({
          id: s.id,
          bossName: s.bossName,
          bossImageUrl: s.bossImageUrl,
          location: s.location,
          spawnTime: s.spawnTime,
          guildName: s.guildTurnGuildName || s.guildTurn || "Unassigned",
        })),
    [overlaySchedules],
  );

  const monthlyChips = useMemo(
    () => buildWeeklyChips({ bossEntries, activities: overlayActivities, typeMeta: overlayTypeMeta }),
    [bossEntries, overlayActivities, overlayTypeMeta],
  );

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
            {(["MONTHLY", "WEEKLY", "DAILY"] as Mode[]).map((m) => (
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
                {m === "MONTHLY" ? "Monthly" : m === "WEEKLY" ? "Weekly" : "Daily"}
              </button>
            ))}
          </div>
          <p className="hidden sm:block text-[11px] text-white/40 max-w-[22rem]">
            {mode === "DAILY" ? (
              <>Guild-of-the-day <span className="text-white/70">auto-rotates every day</span> — for bosses that can spawn more than once in a day.</>
            ) : (
              <>The guild assigned to a day takes <span className="text-white/70">all low bosses</span> that day.</>
            )}
            {!canManage && " Read-only — only faction leaders can edit."}
          </p>
        </div>
        {canManage && (
          <div className="flex items-center gap-2">
            {mode !== "DAILY" && <Button variant="ghost" size="sm" onClick={autoFill}>Auto-fill</Button>}
            <Button variant="ghost" size="sm" onClick={reset} disabled={!dirty || saving}>Reset</Button>
            <Button variant="accent" size="sm" onClick={save} isLoading={saving} disabled={!dirty}>Save</Button>
          </div>
        )}
      </div>

      {/* Low boss selector */}
      <div className="rounded-xl border border-[var(--metal-border)] bg-[var(--obsidian-elevated)]/40 p-3.5">
        <div className="flex items-center justify-between mb-2.5">
          <span className="text-[10px] uppercase tracking-[0.18em] font-bold text-white/40">
            {mode === "DAILY" ? "Low bosses (sub-24h cooldown only)" : "Low bosses"}{" "}
            <span className="text-white/25">({lowBossNames.length} selected)</span>
          </span>
        </div>
        {lowBossNames.length === 0 && (
          <p className="text-[11px] text-amber-300/70 mb-2">Flag which bosses this day rotation covers.</p>
        )}
        {mode === "DAILY" && pickerBosses.length === 0 && (
          <p className="text-[11px] text-white/35 mb-2">No registered bosses have a cooldown under 24 hours yet.</p>
        )}
        <div className="flex flex-wrap gap-1.5">
          {pickerBosses.map((b) => {
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

      {/* Daily view — auto-computed, nothing to click or fill in */}
      {mode === "DAILY" && (
        <div className="rounded-xl border border-[var(--metal-border)] bg-[var(--obsidian-elevated)]/40 p-3.5">
          <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-white/40 mb-3">
            Auto-rotating order — cycles daily, no manual assignment needed
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
            {dailyPreview.map((entry) => {
              const color = getGuildColor(entry.guild?.name || "");
              const isToday = entry.label === "Today";
              return (
                <div
                  key={entry.key}
                  className={`min-h-[62px] rounded-lg border p-1.5 flex flex-col items-start justify-start text-left ${
                    entry.guild ? `${color.border} ${color.bg}` : "border-white/[0.06] bg-white/[0.015]"
                  } ${isToday ? "ring-1 ring-[var(--forge-gold)]/50" : ""}`}
                >
                  <span className={`text-[11px] font-bold ${isToday ? "text-[var(--forge-gold-bright)]" : "text-white/55"}`}>
                    {entry.label}
                  </span>
                  {entry.guild && (
                    <span className="mt-1 flex items-center gap-1 min-w-0 w-full">
                      <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: color.dot }} />
                      <span className={`text-[10px] font-semibold truncate ${color.text}`}>{entry.guild.name}</span>
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

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

      {/* Monthly view — bigger, single-week WeeklyCalendar instead of a full
          month grid; still click-to-cycle editable (onGuildStripClick), now
          also overlaying boss spawns + guild activities for the week. */}
      {mode === "MONTHLY" && (
        <div className="space-y-2">
          {canManage && (
            <div className="flex items-center justify-between gap-3 px-1">
              <p className="text-[10px] text-white/35">Click a day&apos;s guild strip to cycle its assignment.</p>
              <button onClick={clearMonth} className="text-[10px] uppercase tracking-wide text-white/40 hover:text-white/70 cursor-pointer">
                Clear this month
              </button>
            </div>
          )}
          <WeeklyCalendar
            chipsByDate={monthlyChips}
            guildOfDay={monthlyGuildOfDay}
            onGuildStripClick={canManage ? cycleDay : undefined}
          />
        </div>
      )}
    </div>
  );
}
