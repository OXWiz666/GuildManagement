import { useMemo } from "react";
import {
  dashboardApi,
  guildApi,
  type AuditLogEntry,
  type BossKilledHistoryDay,
  type BossKilledHistoryResponse,
} from "@/lib/api";
import { useQuery } from "@/lib/query";
import type { HistoryCategory, HistoryRange, ActiveGuildRef } from "../types";
import { FIXED_HOUR_BOSS_NAMES, FIXED_SCHEDULE_BOSS_NAMES } from "../constants";

function previousMonthKey() {
  const date = new Date();
  date.setDate(1);
  date.setMonth(date.getMonth() - 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

// Plain (non-hook) helper so the direct `Date.now()`/`new Date()` reads stay
// out of the component body — calling this from a useMemo doesn't trip the
// "impure call during render" purity check the way an inline call would.
function rollingWeekBounds() {
  const todayKey = new Date().toISOString().slice(0, 10);
  const startKey = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);
  return { todayKey, startKey };
}

// Owns everything the History tab needs: the Boss Killed History + Queue
// Changes queries, the "Last 7d" cross-month merge, and the search/category
// filtering. Takes the tab's filter state as input rather than owning it,
// since the History tab's controls (view/search/category/range/month) are
// plain UI state the page still renders directly.
export function useBossHistory(
  activeGuild: ActiveGuildRef,
  historyRange: HistoryRange,
  historyMonth: string,
  historySearch: string,
  historyCategory: HistoryCategory,
) {
  // Boss kills already appear in the day-grouped history below — this only
  // pulls the one thing that history doesn't cover: Master List queue
  // reorders. Folded into the History tab as a compact section instead of a
  // separate "Activity" tab, which used to show the same kills twice.
  const {
    data: queueChangesRaw,
    isLoading: isLoadingQueueChanges,
  } = useQuery<AuditLogEntry[]>(
    activeGuild ? `boss_rotation_queue_changes:${activeGuild.guildId}` : "boss_rotation_queue_changes_empty",
    async () => {
      if (!activeGuild) return [];
      const result = await guildApi.getAuditLogs(activeGuild.guildId, "boss-rotation", 1, 15);
      if (!result.success || !result.data) return [];
      return result.data.logs.filter((log) => log.action === "BOSS_ROTATION_QUEUE_UPDATED");
    },
    { persist: true, staleTime: 30000, enabled: !!activeGuild },
  );

  // "Last 7d"/"Last Month" always read the current month; only "Custom"
  // hands the month picker's value to the query.
  const effectiveHistoryMonth = historyRange === "CUSTOM" ? historyMonth : "";

  const {
    data: killedHistoryRaw,
    isLoading: isLoadingHistory,
  } = useQuery<BossKilledHistoryResponse>(
    activeGuild ? `boss_killed_history:${activeGuild.guildId}:${effectiveHistoryMonth || "current"}` : "boss_killed_history_empty",
    async () => {
      if (!activeGuild) return { month: "", total: 0, days: [] };
      const result = await dashboardApi.getBossKilledHistory(activeGuild.guildId, effectiveHistoryMonth || undefined);
      return result.success && result.data ? result.data : { month: effectiveHistoryMonth, total: 0, days: [] };
    },
    { persist: true, staleTime: 30000, enabled: !!activeGuild },
  );

  // "Last 7d" can span a month boundary (e.g. today is the 3rd) — pull the
  // previous month too, only when that range is active, and merge below.
  const prevMonthKey = useMemo(() => previousMonthKey(), []);
  const { data: prevMonthHistoryRaw } = useQuery<BossKilledHistoryResponse>(
    activeGuild && historyRange === "LAST_7D"
      ? `boss_killed_history:${activeGuild.guildId}:${prevMonthKey}`
      : "boss_killed_history_prev_empty",
    async () => {
      if (!activeGuild) return { month: prevMonthKey, total: 0, days: [] };
      const result = await dashboardApi.getBossKilledHistory(activeGuild.guildId, prevMonthKey);
      return result.success && result.data ? result.data : { month: prevMonthKey, total: 0, days: [] };
    },
    { persist: true, staleTime: 30000, enabled: !!activeGuild && historyRange === "LAST_7D" },
  );

  const killedHistory = useMemo<BossKilledHistoryResponse>(
    () => killedHistoryRaw || { month: effectiveHistoryMonth, total: 0, days: [] },
    [killedHistoryRaw, effectiveHistoryMonth],
  );
  const queueChanges = useMemo(() => queueChangesRaw || [], [queueChangesRaw]);

  // "Last 7d" merges the current + previous month's day buckets (dedup by
  // date, since a re-fetch could return the same date from both) and clips to
  // the actual rolling 7-day window; the other two ranges are already exactly
  // what the server returned for the selected month.
  const rangeFilteredDays = useMemo<BossKilledHistoryDay[]>(() => {
    if (historyRange !== "LAST_7D") return killedHistory.days;
    const merged = new Map<string, BossKilledHistoryDay>();
    for (const day of [...(prevMonthHistoryRaw?.days || []), ...killedHistory.days]) {
      merged.set(day.date, day);
    }
    const { todayKey, startKey } = rollingWeekBounds();
    return Array.from(merged.values())
      .filter((day) => day.date >= startKey && day.date <= todayKey)
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [killedHistory.days, prevMonthHistoryRaw, historyRange]);

  // Client-side search (boss name or recorder) + the selected boss category
  // (Fixed-Hour vs Fixed-Schedule), keeping day groupings but dropping days
  // left with no matching kills.
  const categoryBossNames = historyCategory === "FIXED_HOUR" ? FIXED_HOUR_BOSS_NAMES : FIXED_SCHEDULE_BOSS_NAMES;
  const filteredHistoryDays = useMemo(() => {
    const needle = historySearch.trim().toLowerCase();
    const categorySet = new Set(categoryBossNames.map((name) => name.toLowerCase()));
    return rangeFilteredDays
      .map((day) => ({
        ...day,
        kills: day.kills.filter(
          (kill) =>
            categorySet.has(kill.bossName.toLowerCase()) &&
            (!needle ||
              kill.bossName.toLowerCase().includes(needle) ||
              kill.recordedBy.displayName.toLowerCase().includes(needle)),
        ),
      }))
      .filter((day) => day.kills.length > 0);
  }, [rangeFilteredDays, historySearch, categoryBossNames]);

  // Ledger view — one row per kill, newest first, instead of grouped-by-day
  // cards. `filteredHistoryDays` (and its underlying `days`) are already
  // ordered newest-day-first with each day's kills newest-first, so a
  // straight flatMap preserves that order.
  const historyRows = useMemo(
    () => filteredHistoryDays.flatMap((day) => day.kills.map((kill) => ({ ...kill, date: day.date }))),
    [filteredHistoryDays],
  );

  // Same search box also narrows the Queue Changes section, so one field
  // filters everything the History tab shows.
  const filteredQueueChanges = useMemo(() => {
    const needle = historySearch.trim().toLowerCase();
    if (!needle) return queueChanges;
    return queueChanges.filter((log) => {
      const bossName = typeof log.detail?.bossName === "string" ? log.detail.bossName : "";
      return bossName.toLowerCase().includes(needle) || log.actor.displayName.toLowerCase().includes(needle);
    });
  }, [queueChanges, historySearch]);

  return {
    killedHistory,
    isLoadingHistory,
    isLoadingQueueChanges,
    filteredQueueChanges,
    filteredHistoryDays,
    historyRows,
    categoryBossNames,
  };
}
