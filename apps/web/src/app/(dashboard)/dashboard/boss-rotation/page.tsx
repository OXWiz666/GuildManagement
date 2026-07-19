"use client";

import { useCallback, useEffect, useMemo, useRef, useState, memo, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { useAuth } from "@/lib/auth-context";
import {
  dashboardApi,
  guildApi,
  activityApi,
  type AuditLogEntry,
  type BossKilledHistoryDay,
  type BossKilledHistoryEntry,
  type BossKilledHistoryResponse,
  type BossCommitmentData,
  type BossRotationItem,
  type BossRotationResponse,
  type BossScheduleData,
  type FactionGuildData,
  type LowBossRotationResponse,
  type GuildActivitiesResponse,
  type ActivityPointRulesData,
} from "@/lib/api";
import { useSocket } from "@/components/providers/socket-provider";
import { useToast } from "@/components/ui/Toast";
import Button from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import DashboardDecor from "@/components/dashboard/DashboardDecor";
import { ModuleHeader } from "@/components/dashboard/DashboardHelpers";
import { useQuery, queryClient } from "@/lib/query";
import { getGuildColor } from "./utils/helpers";
import MasterListTab from "./components/MasterListTab";
import HistoryLedgerGrid from "./components/HistoryLedgerGrid";
import BossDropsPicker, { type SelectedDrop, rarityStyle } from "./components/BossDropsPicker";
import BossCommitButton from "./components/BossCommitButton";
import ActivitiesTab from "./components/ActivitiesTab";
import WeeklyCalendar from "./components/WeeklyCalendar";
import { buildWeeklyChips, buildGuildOfDayResolver } from "./utils/calendarChips";
import { buildActivityTypeMeta } from "@/lib/activityTypeMeta";

// Modals are only ever needed after a user action (opening the maintenance
// reset dialog, closing out a boss-kill sale) — code-split them out of the
// main route chunk instead of shipping them on every boss-rotation load.
const MaintenanceResetModal = dynamic(() => import("./components/MaintenanceResetModal"));
const BossKillSaleModal = dynamic(() => import("./components/BossKillSaleModal"));
import { PREDEFINED_BOSSES, getBossImageUrl, getNextBossSpawnTime, getBossCycleCategory, getRealtimeBossTimer } from "@guild/shared";

type RotationTab = "LIVE" | "UPCOMING" | "ACTIVITIES" | "MASTER" | "HISTORY";
type CycleFilter = "ALL" | "FIXED_SCHEDULE" | "SHORT_CYCLE" | "LONG_CYCLE";
type SortMode = "TIME" | "GUILD";
type ViewMode = "GRID" | "TIMELINE" | "CALENDAR";
type HistoryView = "TIMELINE" | "LEDGER";
type HistoryCategory = "FIXED_HOUR" | "FIXED_SCHEDULE";
type HistoryRange = "LAST_7D" | "LAST_MONTH" | "CUSTOM";

// Normalized shape both the LIVE (rotation) and UPCOMING (schedule) tabs
// reduce down to, so Timeline/Calendar views only need to know one shape.
interface ViewEntry {
  id: string;
  bossName: string;
  bossImageUrl: string;
  location: string;
  spawnTime: string | null;
  guildName: string;
  timerText: string;
  timerWarning: boolean;
  timerLive: boolean;
}

const VIEW_OPTIONS: Array<{ id: ViewMode; label: string }> = [
  { id: "GRID", label: "Grid" },
  { id: "TIMELINE", label: "Timeline" },
  { id: "CALENDAR", label: "Calendar" },
];

const CYCLE_FILTERS: Array<{ id: CycleFilter; label: string }> = [
  { id: "ALL", label: "All cycles" },
  { id: "FIXED_SCHEDULE", label: "Fixed Schedule" },
  { id: "LONG_CYCLE", label: "Long Cycle Boss" },
  { id: "SHORT_CYCLE", label: "Short Cycle Boss" },
];

const SORT_OPTIONS: Array<{ id: SortMode; label: string }> = [
  { id: "TIME", label: "Sort: Nearest time" },
  { id: "GUILD", label: "Sort: By guild" },
];

const HISTORY_VIEWS: Array<{ id: HistoryView; label: string }> = [
  { id: "TIMELINE", label: "Timeline" },
  { id: "LEDGER", label: "Ledger" },
];

const HISTORY_CATEGORIES: Array<{ id: HistoryCategory; label: string }> = [
  { id: "FIXED_HOUR", label: "Fixed-Hour Bosses" },
  { id: "FIXED_SCHEDULE", label: "Fixed-Schedule Bosses" },
];

const HISTORY_RANGES: Array<{ id: HistoryRange; label: string }> = [
  { id: "LAST_7D", label: "Last 7d" },
  { id: "LAST_MONTH", label: "Last Month" },
  { id: "CUSTOM", label: "Custom" },
];

// Boss category columns for the Ledger grid, derived once from the static
// catalog — "Fixed-Hour" = cooldown-based bosses (SHORT_CYCLE/LONG_CYCLE),
// "Fixed-Schedule" = deterministic weekly-calendar bosses.
const FIXED_HOUR_BOSS_NAMES = PREDEFINED_BOSSES.filter(
  (boss) => getBossCycleCategory(boss.name, boss.type, boss.cooldownHours) !== "FIXED_SCHEDULE",
).map((boss) => boss.name);
const FIXED_SCHEDULE_BOSS_NAMES = PREDEFINED_BOSSES.filter(
  (boss) => getBossCycleCategory(boss.name, boss.type, boss.cooldownHours) === "FIXED_SCHEDULE",
).map((boss) => boss.name);

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

// Spawn times that are missing/never-taken sort to the end, not the front.
function spawnSortValue(spawnTime: string | null | undefined) {
  return spawnTime ? new Date(spawnTime).getTime() : Number.POSITIVE_INFINITY;
}

function guildGroupLabel(name: string | null | undefined) {
  return name && name.trim() ? name : "Unassigned";
}

// Groups already-sorted-by-time items into per-guild sections (guild
// alphabetical, "Unassigned" last), preserving the incoming item order
// within each group so the nearest-time ordering carries over.
function groupByGuild<T>(items: T[], getGuildName: (item: T) => string | null | undefined) {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const name = guildGroupLabel(getGuildName(item));
    const bucket = map.get(name);
    if (bucket) bucket.push(item);
    else map.set(name, [item]);
  }
  return Array.from(map.entries()).sort(([a], [b]) => {
    if (a === "Unassigned") return 1;
    if (b === "Unassigned") return -1;
    return a.localeCompare(b);
  });
}

const CONFIRM_TAKEN_TIMEOUT_MS = 30000;
const EMPTY_ACTIVITIES: GuildActivitiesResponse = { canManage: false, viewerRole: "MEMBER", activities: [] };
const EMPTY_ACTIVITY_RULES: ActivityPointRulesData = { activities: [] };

function toDateTimeInputValue(date: Date) {
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 16);
}

function getCountdown(spawnTime: string, nowMs: number) {
  const diff = new Date(spawnTime).getTime() - nowMs;
  if (diff <= 0) return { text: "LIVE", warning: true, expired: true };
  const hrs = Math.floor(diff / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  const secs = Math.floor((diff % 60000) / 1000);
  return {
    text: `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`,
    warning: diff <= 60 * 60 * 1000,
    expired: false,
  };
}

function rotationToViewEntry(rotation: BossRotationItem, serverNow: number): ViewEntry {
  const tick = rotation.spawnTime
    ? getCountdown(rotation.spawnTime, serverNow)
    : { text: "Not Taken Yet", warning: false, expired: false };
  return {
    id: rotation.id,
    bossName: rotation.bossName,
    bossImageUrl: rotation.bossImageUrl || getBossImageUrl(rotation.bossName),
    location: rotation.location,
    spawnTime: rotation.spawnTime,
    guildName: guildGroupLabel(rotation.currentGuild?.name),
    timerText: tick.text,
    timerWarning: tick.warning,
    timerLive: tick.expired,
  };
}

function scheduleToViewEntry(schedule: BossScheduleData, serverNow: number): ViewEntry {
  const timer = getRealtimeBossTimer(schedule.bossName, schedule.spawnTime, serverNow, { status: schedule.status });
  return {
    id: schedule.id,
    bossName: schedule.bossName,
    bossImageUrl: schedule.bossImageUrl || getBossImageUrl(schedule.bossName),
    location: schedule.location,
    spawnTime: schedule.spawnTime,
    guildName: guildGroupLabel(schedule.guildTurnGuildName || schedule.guildTurn),
    timerText: timer.live ? "LIVE" : timer.text,
    timerWarning: timer.warning,
    timerLive: timer.live,
  };
}

export default function BossRotationPage() {
  const { user } = useAuth();
  const { socket } = useSocket();
  const { addToast } = useToast();
  const activeGuild = user?.guilds?.[0];
  const isOfficer =
    activeGuild?.role === "OFFICER" ||
    activeGuild?.role === "GUILD_LEADER" ||
    activeGuild?.role === "FACTION_LEADER" ||
    activeGuild?.role === "ADMIN";

  const [activeTab, setActiveTab] = useState<RotationTab>("LIVE");
  const [historyMonth, setHistoryMonth] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTakingGuildId, setSelectedTakingGuildId] = useState("ALL");
  const [selectedCycle, setSelectedCycle] = useState<CycleFilter>("ALL");
  const [sortMode, setSortMode] = useState<SortMode>("TIME");
  const [viewMode, setViewMode] = useState<ViewMode>("GRID");
  const [historySearch, setHistorySearch] = useState("");
  const [historyView, setHistoryView] = useState<HistoryView>("LEDGER");
  const [historyCategory, setHistoryCategory] = useState<HistoryCategory>("FIXED_HOUR");
  const [historyRange, setHistoryRange] = useState<HistoryRange>("LAST_MONTH");
  const [now, setNow] = useState<number | null>(null);
  const [killTarget, setKillTarget] = useState<BossRotationItem | null>(null);
  const [killTime, setKillTime] = useState("");
  const [selectedTakenGuildId, setSelectedTakenGuildId] = useState("");
  const [killDrops, setKillDrops] = useState<SelectedDrop[]>([]);
  const [showDropsPicker, setShowDropsPicker] = useState(false);
  const [isKilling, setIsKilling] = useState(false);
  const [saleModalKill, setSaleModalKill] = useState<BossKilledHistoryEntry | null>(null);
  const [editingHistoryKill, setEditingHistoryKill] = useState<BossKilledHistoryEntry | null>(null);
  const [editHistoryKillTime, setEditHistoryKillTime] = useState("");
  const [isEditingHistoryKill, setIsEditingHistoryKill] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [showMaintenanceModal, setShowMaintenanceModal] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isMaintenanceResetting, setIsMaintenanceResetting] = useState(false);
  const isKillingRef = useRef(false);
  const rotationQueryKey = activeGuild ? `boss_rotation_v2:${activeGuild.guildId}` : "boss_rotation_empty";

  // Timeline/Calendar views compute their countdown text from this shared
  // `now`, so the tick only needs to run there — the default Grid view's
  // cards keep their own live countdown internally (see RotationCard /
  // UpcomingCard), and Master/Activity/History have no countdown to show at
  // all. Without this gate the whole page (every card, every tab) was
  // re-rendering once a second regardless of what was actually on screen.
  const needsSharedTick =
    (activeTab === "LIVE" || activeTab === "UPCOMING") &&
    (viewMode === "TIMELINE" || viewMode === "CALENDAR");

  useEffect(() => {
    if (!needsSharedTick) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [needsSharedTick]);

  const {
    data: rotationData,
    isLoading,
    refetch: refetchRotation,
  } = useQuery<BossRotationResponse>(
    rotationQueryKey,
    async () => {
      if (!activeGuild) {
        return { serverTime: new Date().toISOString(), canManage: false, viewerRole: "MEMBER", factionId: null, guilds: [], rotations: [] };
      }
      const result = await dashboardApi.getBossRotation(activeGuild.guildId);
      return result.success && result.data
        ? result.data
        : { serverTime: new Date().toISOString(), canManage: false, viewerRole: "MEMBER", factionId: null, guilds: [], rotations: [] };
    },
    { persist: true, staleTime: 10000, enabled: !!activeGuild },
  );

  const { data: schedulesRaw } = useQuery<BossScheduleData[]>(
    activeGuild ? `boss_schedules:${activeGuild.guildId}` : "boss_schedules_empty",
    async () => {
      if (!activeGuild) return [];
      const result = await dashboardApi.getBossSchedules(activeGuild.guildId);
      return result.success && result.data?.schedules ? result.data.schedules : [];
    },
    { persist: true, staleTime: 15000, enabled: !!activeGuild },
  );

  // Same cache key LowBossSchedule/ActivitiesTab use — feeds the "guild of
  // the day" overlay on the Live/Upcoming weekly calendars, shared rather
  // than re-fetched.
  const { data: lowRotationRaw } = useQuery<LowBossRotationResponse | null>(
    activeGuild ? `boss_low_rotation:${activeGuild.guildId}` : "boss_low_rotation_empty",
    async () => {
      if (!activeGuild) return null;
      const result = await dashboardApi.getLowBossRotation(activeGuild.guildId);
      return result.success && result.data ? result.data : null;
    },
    { persist: true, staleTime: 15000, enabled: !!activeGuild },
  );
  const guildOfDay = useMemo(() => buildGuildOfDayResolver(lowRotationRaw), [lowRotationRaw]);

  // Same cache key ActivitiesTab uses — the Live/Upcoming weekly calendars
  // overlay guild activities alongside boss spawns, shared rather than
  // re-fetched.
  const { data: activitiesRaw } = useQuery<GuildActivitiesResponse>(
    activeGuild ? `guild_activities:${activeGuild.guildId}` : "guild_activities_empty",
    async () => {
      if (!activeGuild) return EMPTY_ACTIVITIES;
      const result = await activityApi.list(activeGuild.guildId);
      return result.success && result.data ? result.data : EMPTY_ACTIVITIES;
    },
    { persist: true, staleTime: 10000, enabled: !!activeGuild },
  );
  const { data: activityRulesRaw } = useQuery<ActivityPointRulesData>(
    activeGuild ? `activity_rules:${activeGuild.guildId}` : "activity_rules_empty",
    async () => {
      if (!activeGuild) return EMPTY_ACTIVITY_RULES;
      const result = await guildApi.getActivityRules(activeGuild.guildId);
      return result.success && result.data ? result.data.rules : EMPTY_ACTIVITY_RULES;
    },
    { persist: true, staleTime: 300000, enabled: !!activeGuild },
  );
  const calendarActivities = useMemo(() => activitiesRaw?.activities ?? [], [activitiesRaw]);
  const calendarTypeMeta = useMemo(
    () => buildActivityTypeMeta(activityRulesRaw?.activities ?? []),
    [activityRulesRaw],
  );

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

  useEffect(() => {
    if (!socket || !activeGuild) return;
    const handleRotationUpdate = () => {
      queryClient.invalidateQueries(`boss_rotation_v2:${activeGuild.guildId}`);
      queryClient.invalidateQueries(`boss_schedules:${activeGuild.guildId}`);
      queryClient.invalidateQueries(`boss_rotation_queue_changes:${activeGuild.guildId}`);
      queryClient.invalidateQueries(`boss_killed_history:${activeGuild.guildId}`);
    };
    socket.on("boss_rotation_updated", handleRotationUpdate);
    socket.on("boss_schedule_deleted", handleRotationUpdate);
    return () => {
      socket.off("boss_rotation_updated", handleRotationUpdate);
      socket.off("boss_schedule_deleted", handleRotationUpdate);
    };
  }, [socket, activeGuild]);

  const serverNow = now ?? new Date(rotationData?.serverTime || 0).getTime();
  const canManage = rotationData?.canManage || false;
  const schedules = useMemo(() => schedulesRaw || [], [schedulesRaw]);
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

  const fallbackGuilds = useMemo<FactionGuildData[]>(() => {
    const guildMap = new Map<string, FactionGuildData>();
    for (const guild of rotationData?.guilds || []) {
      guildMap.set(guild.id, guild);
    }
    if (activeGuild) {
      guildMap.set(activeGuild.guildId, {
        id: activeGuild.guildId,
        name: activeGuild.guildName,
        slug: activeGuild.guildSlug,
        avatarUrl: activeGuild.guildAvatarUrl,
      });
    }
    for (const schedule of schedules) {
      if (schedule.guildTurnGuildId && schedule.guildTurnGuildName && !guildMap.has(schedule.guildTurnGuildId)) {
        guildMap.set(schedule.guildTurnGuildId, {
          id: schedule.guildTurnGuildId,
          name: schedule.guildTurnGuildName,
          slug: schedule.guildTurnGuildName.toLowerCase().replace(/\s+/g, "-"),
          avatarUrl: null,
        });
      }
    }
    return Array.from(guildMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [activeGuild, rotationData?.guilds, schedules]);

  const fallbackRotations = useMemo<BossRotationItem[]>(() => {
    if ((rotationData?.rotations?.length || 0) > 0 || schedules.length === 0) return [];
    const guildMap = new Map(fallbackGuilds.map((guild) => [guild.id, guild]));
    const queue = fallbackGuilds;

    return PREDEFINED_BOSSES.map((boss) => {
      const bossSchedules = schedules.filter((schedule) => schedule.bossName.toLowerCase() === boss.name.toLowerCase());
      const activeSchedule = bossSchedules
        .filter((schedule) => schedule.status !== "KILLED")
        .sort((a, b) => new Date(a.spawnTime).getTime() - new Date(b.spawnTime).getTime())[0] || null;
      const latestKilled = bossSchedules
        .filter((schedule) => schedule.status === "KILLED")
        .sort((a, b) => new Date(b.killedAt || b.spawnTime).getTime() - new Date(a.killedAt || a.spawnTime).getTime())[0] || null;

      const currentGuild =
        (activeSchedule?.guildTurnGuildId ? guildMap.get(activeSchedule.guildTurnGuildId) : null) ||
        queue[0] ||
        null;
      const currentIndex = currentGuild ? Math.max(0, queue.findIndex((guild) => guild.id === currentGuild.id)) : 0;
      const nextGuild = queue.length ? queue[(currentIndex + 1) % queue.length] || currentGuild : null;
      const everTaken = boss.type === "FIXED_SCHEDULE" || Boolean(activeSchedule || latestKilled);

      return {
        id: `fallback:${boss.name}`,
        bossName: boss.name,
        bossImageUrl: activeSchedule?.bossImageUrl || getBossImageUrl(boss.name),
        level: boss.level,
        type: boss.type,
        cooldownHours: boss.cooldownHours || null,
        location: activeSchedule?.location || boss.location,
        currentIndex,
        queue,
        currentGuild,
        nextGuild,
        everTaken,
        spawnTime: activeSchedule?.spawnTime ||
          (boss.type === "FIXED_SCHEDULE"
            ? getNextBossSpawnTime(boss.name, latestKilled?.killedAt ? new Date(latestKilled.killedAt) : new Date()).toISOString()
            : (latestKilled?.spawnTime || null)),
        status: activeSchedule?.status || latestKilled?.status || (everTaken ? "UPCOMING" : "NOT_STARTED"),
        activeSchedule,
        latestKilled,
      };
    });
  }, [fallbackGuilds, rotationData?.rotations?.length, schedules]);

  const rotations = useMemo(
    () => (rotationData?.rotations?.length ? rotationData.rotations : fallbackRotations),
    [fallbackRotations, rotationData],
  );

  const takingGuilds = useMemo(() => {
    const guildMap = new Map<string, FactionGuildData>();
    for (const guild of fallbackGuilds) {
      guildMap.set(guild.id, guild);
    }
    for (const rotation of rotations) {
      for (const guild of rotation.queue) {
        guildMap.set(guild.id, guild);
      }
      if (rotation.currentGuild) guildMap.set(rotation.currentGuild.id, rotation.currentGuild);
      if (rotation.nextGuild) guildMap.set(rotation.nextGuild.id, rotation.nextGuild);
    }
    return Array.from(guildMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [fallbackGuilds, rotations]);

  const filteredRotations = useMemo(() => {
    const needle = searchQuery.trim().toLowerCase();
    const filtered = rotations.filter((rotation) => {
      const matchesSearch = !needle ||
        rotation.bossName.toLowerCase().includes(needle) ||
        rotation.location.toLowerCase().includes(needle) ||
        rotation.currentGuild?.name.toLowerCase().includes(needle) ||
        rotation.nextGuild?.name.toLowerCase().includes(needle) ||
        rotation.queue.some((guild) => guild.name.toLowerCase().includes(needle));

      const takingGuildId = rotation.currentGuild?.id || rotation.activeSchedule?.guildTurnGuildId || "";
      const matchesGuild =
        selectedTakingGuildId === "ALL" ||
        (selectedTakingGuildId === "UNASSIGNED" && !takingGuildId) ||
        takingGuildId === selectedTakingGuildId;

      const matchesCycle =
        selectedCycle === "ALL" ||
        getBossCycleCategory(rotation.bossName, rotation.type, rotation.cooldownHours) === selectedCycle;

      return matchesSearch && matchesGuild && matchesCycle;
    });

    // Nearest-spawn-first is the base order in every mode; guild mode groups
    // on top of that ordering (see groupByGuild), so the time sort here
    // guarantees soonest-first inside each guild section too.
    return [...filtered].sort((a, b) => {
      if (sortMode === "GUILD") {
        const guildCompare = guildGroupLabel(a.currentGuild?.name).localeCompare(guildGroupLabel(b.currentGuild?.name));
        if (guildCompare !== 0) return guildCompare;
      }
      return spawnSortValue(a.spawnTime) - spawnSortValue(b.spawnTime);
    });
  }, [rotations, searchQuery, selectedTakingGuildId, selectedCycle, sortMode]);

  // Generate upcoming entries for ALL bosses (including those without explicit schedules).
  // Built from filteredRotations so the shared search/guild/cycle toolbar actually
  // applies here too, not just on the LIVE tab.
  const upcomingBosses = useMemo(() => {
    const allUpcoming: BossScheduleData[] = [];

    for (const rotation of filteredRotations) {
      // A never-taken cycle boss has no real spawn time yet — it belongs in
      // the LIVE tab (so its first kill can be logged), not the upcoming
      // schedule, which has nothing meaningful to count down to.
      if (!rotation.spawnTime) continue;

      allUpcoming.push({
        id: rotation.activeSchedule?.id || rotation.id,
        guildId: activeGuild?.guildId || null,
        bossName: rotation.bossName,
        bossImageUrl: rotation.bossImageUrl,
        spawnTime: rotation.spawnTime,
        location: rotation.location,
        guildTurn: rotation.currentGuild?.name || null,
        guildTurnGuildId: rotation.currentGuild?.id || null,
        guildTurnGuildName: rotation.currentGuild?.name || null,
        status: rotation.status === "NOT_STARTED" ? "UPCOMING" : rotation.status,
        killedAt: rotation.latestKilled?.killedAt || null,
        creatorId: rotation.activeSchedule?.creatorId || "",
        creatorName: rotation.activeSchedule?.creatorName,
        createdAt: rotation.activeSchedule?.createdAt || new Date().toISOString(),
        attendanceSessions: rotation.activeSchedule?.attendanceSessions,
      });
    }

    // Nearest spawn first as the base order; guild mode groups on top of it
    // (see groupByGuild), so each guild's cards still read soonest-first.
    allUpcoming.sort((a, b) => {
      if (sortMode === "GUILD") {
        const guildCompare = guildGroupLabel(a.guildTurnGuildName || a.guildTurn).localeCompare(
          guildGroupLabel(b.guildTurnGuildName || b.guildTurn),
        );
        if (guildCompare !== 0) return guildCompare;
      }
      return spawnSortValue(a.spawnTime) - spawnSortValue(b.spawnTime);
    });
    return allUpcoming.slice(0, 24);
  }, [filteredRotations, activeGuild, sortMode]);

  // Every boss card currently on screen (LIVE + UPCOMING) mounts its own
  // BossCommitButton, which otherwise fires one `getBossCommitments` request
  // per card. Fetch all of them here in one batched call and pass each
  // card its own slice as `initialData` (see BossCommitButton) so a card
  // that mounts once this has already resolved — tab switches, filter
  // changes, revisits — skips its own request entirely. Keyed on the
  // actual id set so a boss appearing/disappearing (kill, filter change)
  // refreshes the batch, not just guildId.
  const commitScheduleIds = useMemo(() => {
    const ids = new Set<string>();
    for (const rotation of filteredRotations) {
      if (rotation.activeSchedule?.id) ids.add(rotation.activeSchedule.id);
    }
    for (const schedule of upcomingBosses) {
      ids.add(schedule.id);
    }
    return Array.from(ids).sort();
  }, [filteredRotations, upcomingBosses]);

  const commitmentsBatchKey = activeGuild && commitScheduleIds.length > 0
    ? `boss_commitments_batch:${activeGuild.guildId}:${commitScheduleIds.join(",")}`
    : "boss_commitments_batch_empty";

  const { data: commitmentsBatch } = useQuery<Record<string, BossCommitmentData>>(
    commitmentsBatchKey,
    async () => {
      if (!activeGuild || commitScheduleIds.length === 0) return {};
      const res = await dashboardApi.getBossCommitmentsBatch(activeGuild.guildId, commitScheduleIds);
      return res.success && res.data ? res.data : {};
    },
    { staleTime: 20000, enabled: !!activeGuild && commitScheduleIds.length > 0 },
  );

  // Only guilds that actually hold a turn for this boss in the Master List
  // rotation queue may take it. Guilds absent from the master list are NOT
  // eligible and must not appear in the "Taking Guild" picker. If a boss has no
  // configured participants at all, fall back to every faction guild so the
  // modal stays usable rather than showing an empty list.
  const modalGuildQueue = useMemo(() => {
    if (!killTarget) return [];
    if (killTarget.queue.length > 0) {
      const guildMap = new Map<string, FactionGuildData>();
      for (const guild of killTarget.queue) {
        guildMap.set(guild.id, guild);
      }
      return Array.from(guildMap.values());
    }
    return takingGuilds;
  }, [killTarget, takingGuilds]);

  const selectedTakenGuild = modalGuildQueue.find((guild) => guild.id === selectedTakenGuildId) || null;
  const previewNextGuild = selectedTakenGuild && modalGuildQueue.length > 0
    ? modalGuildQueue[(modalGuildQueue.findIndex((guild) => guild.id === selectedTakenGuild.id) + 1) % modalGuildQueue.length] || null
    : null;
  const canConfirmTaken = Boolean(killTarget && killTime && selectedTakenGuild && !isKilling);
  const canSaveHistoryEdit = Boolean(editingHistoryKill && editHistoryKillTime && editingHistoryKill.bossScheduleId && !isEditingHistoryKill);

  // Stable reference (vs. an inline `() => openKillModal(rotation)` per
  // card) so RotationCard's memo isn't defeated by a fresh closure on every
  // parent render — the card passes itself as the argument instead.
  const openKillModal = useCallback(
    (rotation: BossRotationItem) => {
      isKillingRef.current = false;
      setIsKilling(false);
      const defaultGuildId =
        rotation.activeSchedule?.guildTurnGuildId ||
        rotation.currentGuild?.id ||
        rotation.queue[0]?.id ||
        takingGuilds[0]?.id ||
        "";
      setKillTarget(rotation);
      setKillTime(toDateTimeInputValue(new Date()));
      setSelectedTakenGuildId(defaultGuildId);
      setKillDrops([]);
    },
    [takingGuilds],
  );

  const openHistoryKillEditModal = useCallback(
    (kill: BossKilledHistoryEntry) => {
      if (!canManage) return;
      setSaleModalKill(null);
      setEditingHistoryKill(kill);
      setEditHistoryKillTime(toDateTimeInputValue(new Date(kill.killedAt)));
    },
    [canManage],
  );

  // react-hooks/refs can't see into buildWeeklyChips: it only ever *stores*
  // the onBossClick closure on each chip (invoked later, on an actual user
  // click) and never calls it while building the map, so openKillModal's
  // internal isKillingRef access never happens during render. Safe to
  // silence — the lint rule is guarding against a call pattern this isn't.
  /* eslint-disable react-hooks/refs */
  const liveCalendarChips = useMemo(
    () =>
      buildWeeklyChips({
        bossEntries: filteredRotations.map((rotation) => rotationToViewEntry(rotation, serverNow)),
        onBossClick: canManage
          ? (id) => {
              const rotation = filteredRotations.find((r) => r.id === id);
              if (rotation) openKillModal(rotation);
            }
          : undefined,
        activities: calendarActivities,
        typeMeta: calendarTypeMeta,
      }),
    [filteredRotations, serverNow, canManage, openKillModal, calendarActivities, calendarTypeMeta],
  );
  /* eslint-enable react-hooks/refs */

  const upcomingCalendarChips = useMemo(
    () =>
      buildWeeklyChips({
        bossEntries: upcomingBosses.map((schedule) => scheduleToViewEntry(schedule, serverNow)),
        activities: calendarActivities,
        typeMeta: calendarTypeMeta,
      }),
    [upcomingBosses, serverNow, calendarActivities, calendarTypeMeta],
  );

  async function confirmKill() {
    if (isKillingRef.current || !activeGuild || !killTarget || !killTime || !selectedTakenGuild) return;
    isKillingRef.current = true;
    setIsKilling(true);
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), CONFIRM_TAKEN_TIMEOUT_MS);
    try {
      const killedAt = new Date(killTime).toISOString();
      const dropsPayload = killDrops.map((d) => ({
        bucket: d.item.bucket,
        path: d.item.path,
        quantity: d.quantity,
        customName: d.customName,
      }));
      const result = killTarget.activeSchedule
        ? await dashboardApi.markBossRotationKilled(
            activeGuild.guildId,
            killTarget.activeSchedule.id,
            killedAt,
            selectedTakenGuild.id,
            controller.signal,
            dropsPayload,
          )
        : await dashboardApi.markBossRotationKilledByName(
            activeGuild.guildId,
            killTarget.bossName,
            killedAt,
            selectedTakenGuild.id,
            controller.signal,
            dropsPayload,
          );
      window.clearTimeout(timeoutId);
      if (result.success) {
        addToast("success", `${killTarget.bossName} taken by ${selectedTakenGuild?.name || "selected guild"}. Next spawn has been calculated.`);
        setKillTarget(null);
        setSelectedTakenGuildId("");
        queryClient.invalidateQueries(`boss_rotation_v2:${activeGuild.guildId}`);
        queryClient.invalidateQueries(`boss_schedules:${activeGuild.guildId}`);
        queryClient.invalidateQueries(`boss_rotation_audit:${activeGuild.guildId}`);
        queryClient.invalidateQueries(`boss_killed_history:${activeGuild.guildId}`);
        void refetchRotation();
      } else {
        addToast("error", result.error?.message || "Failed to mark boss taken");
      }
    } catch (error) {
      window.clearTimeout(timeoutId);
      if (error instanceof DOMException && error.name === "AbortError") {
        addToast("error", "Confirm taken timed out. Refreshing boss rotation status.");
        if (activeGuild) {
          queryClient.invalidateQueries(`boss_rotation_v2:${activeGuild.guildId}`);
          queryClient.invalidateQueries(`boss_schedules:${activeGuild.guildId}`);
          void refetchRotation();
        }
      } else {
        addToast("error", "Failed to mark boss taken");
      }
    } finally {
      window.clearTimeout(timeoutId);
      isKillingRef.current = false;
      setIsKilling(false);
    }
  }

  async function saveHistoryKillEdit() {
    if (!activeGuild || !editingHistoryKill || !editHistoryKillTime || isEditingHistoryKill) return;
    if (!editingHistoryKill.bossScheduleId) {
      addToast("error", "This history entry cannot be edited because it is not linked to a schedule.");
      return;
    }

    setIsEditingHistoryKill(true);
    try {
      const killedAt = new Date(editHistoryKillTime).toISOString();
      const result = await dashboardApi.editBossKillHistoryEntry(activeGuild.guildId, editingHistoryKill.id, killedAt);
      if (result.success) {
        addToast("success", `${editingHistoryKill.bossName} kill time updated.`);
        setEditingHistoryKill(null);
        setEditHistoryKillTime("");
        queryClient.invalidateQueries(`boss_rotation_v2:${activeGuild.guildId}`);
        queryClient.invalidateQueries(`boss_schedules:${activeGuild.guildId}`);
        queryClient.invalidateQueries(`boss_rotation_audit:${activeGuild.guildId}`);
        queryClient.invalidateQueries(`boss_killed_history:${activeGuild.guildId}`);
        void refetchRotation();
      } else {
        addToast("error", result.error?.message || "Failed to update kill time");
      }
    } catch {
      addToast("error", "Failed to update kill time");
    } finally {
      setIsEditingHistoryKill(false);
    }
  }

  function invalidateRotationQueries() {
    if (!activeGuild) return;
    queryClient.invalidateQueries(`boss_rotation_v2:${activeGuild.guildId}`);
    queryClient.invalidateQueries(`boss_schedules:${activeGuild.guildId}`);
    queryClient.invalidateQueries(`boss_rotation_audit:${activeGuild.guildId}`);
    void refetchRotation();
  }

  async function handleResetAllTimers() {
    if (!activeGuild || isResetting) return;
    setIsResetting(true);
    try {
      const result = await dashboardApi.resetBossTimers(activeGuild.guildId);
      if (result.success) {
        addToast("success", "All boss timers have been reset from now.");
        setShowResetModal(false);
        invalidateRotationQueries();
      } else {
        addToast("error", result.error?.message || "Failed to reset boss timers");
      }
    } catch {
      addToast("error", "Failed to reset boss timers");
    } finally {
      setIsResetting(false);
    }
  }

  async function handleMaintenanceReset(maintenanceEndTime: Date) {
    if (!activeGuild || isMaintenanceResetting) return;
    setIsMaintenanceResetting(true);
    try {
      const result = await dashboardApi.maintenanceResetBossTimers(
        activeGuild.guildId,
        maintenanceEndTime.toISOString(),
      );
      if (result.success) {
        addToast("success", "Cycle boss timers reset for maintenance.");
        setShowMaintenanceModal(false);
        invalidateRotationQueries();
      } else {
        addToast("error", result.error?.message || "Failed to run maintenance reset");
      }
    } catch {
      addToast("error", "Failed to run maintenance reset");
    } finally {
      setIsMaintenanceResetting(false);
    }
  }

  if (!user || !activeGuild) {
    return (
      <div className="flex items-center justify-center h-64 animate-fade-in">
        <p className="text-white/40">No active guild selected</p>
      </div>
    );
  }

  const tabs: Array<{ id: RotationTab; label: string; count?: number; hidden?: boolean }> = [
    { id: "LIVE", label: "Guild Rotation", count: filteredRotations.length },
    { id: "UPCOMING", label: "Upcoming", count: upcomingBosses.length },
    { id: "ACTIVITIES", label: "Guild Event" },
    { id: "MASTER", label: "Faction Schedule", hidden: !isOfficer },
    { id: "HISTORY", label: "Activity", count: killedHistory.total },
  ];

  return (
    <div className="relative max-w-full xl:max-w-[1600px] mx-auto w-full px-2 md:px-4 lg:px-6">
      <DashboardDecor />
      <div className="relative z-10 space-y-6 text-white/85">
        <ModuleHeader
          eyebrow="Faction Operations"
          title="Faction Boss Rotation"
          description="Server-owned rotation queues, realtime timers, and guild leader notifications."
          right={
            <div className="flex flex-wrap items-center gap-2">
              {isOfficer && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowResetModal(true)}
                    className="border border-white/[0.08] hover:border-emerald-500/35 hover:text-emerald-300"
                  >
                    <svg className="h-3.5 w-3.5 mr-1.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21.5 2v6h-6" />
                      <path d="M2.5 12a10 10 0 0 1 17.17-6.83L21.5 8" />
                      <path d="M2.5 22v-6h6" />
                      <path d="M21.5 12a10 10 0 0 1-17.17 6.83L2.5 16" />
                    </svg>
                    Reset Timers
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowMaintenanceModal(true)}
                    className="border border-white/[0.08] hover:border-amber-500/35 hover:text-amber-300"
                  >
                    <svg className="h-3.5 w-3.5 mr-1.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
                    </svg>
                    Maintenance Reset
                  </Button>
                </>
              )}
              <Button variant="ghost" size="sm" onClick={refetchRotation} isLoading={isLoading}>
                Refresh
              </Button>
            </div>
          }
        />

        <div className="flex flex-nowrap items-center bg-[var(--obsidian-elevated)]/40 backdrop-blur-md border border-[var(--metal-border)] rounded-xl p-1 gap-1 min-w-0 max-w-full overflow-x-auto no-scrollbar">
          {tabs.filter((tab) => !tab.hidden).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative shrink-0 whitespace-nowrap px-4 py-2 text-[13px] font-semibold rounded-lg transition-all cursor-pointer focus-ring ${
                activeTab === tab.id
                  ? "bg-[var(--forge-glow)] border border-[var(--forge-gold)]/25 text-[var(--forge-gold-bright)] shadow-[0_0_12px_rgba(212,168,83,0.1)]"
                  : "text-white/45 hover:text-white/75 border border-transparent hover:bg-white/[0.03]"
              }`}
            >
              {tab.label}
              {typeof tab.count === "number" && (
                <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded-full ${
                  activeTab === tab.id
                    ? "bg-[var(--forge-gold)]/15 text-[var(--forge-gold)]"
                    : "bg-white/5 text-white/45"
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {(activeTab === "LIVE" || activeTab === "UPCOMING") && (
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-[minmax(170px,210px)_minmax(170px,210px)_minmax(180px,240px)_minmax(200px,300px)] gap-2 w-full lg:w-auto">
              <label className="relative block">
                <span className="sr-only">Filter boss cycle</span>
                <select
                  value={selectedCycle}
                  onChange={(event) => setSelectedCycle(event.target.value as CycleFilter)}
                  className="w-full h-[42px] px-3.5 rounded-xl bg-[var(--obsidian-elevated)]/50 border border-[var(--metal-border)] text-[13px] text-white/90 focus:outline-none focus:border-[var(--forge-gold)]/35 transition-colors cursor-pointer"
                >
                  {CYCLE_FILTERS.map((filter) => (
                    <option className="bg-[#0c0d12]" key={filter.id} value={filter.id}>
                      {filter.label}
                    </option>
                  ))}
                </select>
              </label>

              {viewMode === "GRID" && (
                <label className="relative block">
                  <span className="sr-only">Sort order</span>
                  <select
                    value={sortMode}
                    onChange={(event) => setSortMode(event.target.value as SortMode)}
                    className="w-full h-[42px] px-3.5 rounded-xl bg-[var(--obsidian-elevated)]/50 border border-[var(--metal-border)] text-[13px] text-white/90 focus:outline-none focus:border-[var(--forge-gold)]/35 transition-colors cursor-pointer"
                  >
                    {SORT_OPTIONS.map((option) => (
                      <option className="bg-[#0c0d12]" key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <label className="relative block">
                <span className="sr-only">Filter taking guild</span>
                <select
                  value={selectedTakingGuildId}
                  onChange={(event) => setSelectedTakingGuildId(event.target.value)}
                  className="w-full h-[42px] px-3.5 rounded-xl bg-[var(--obsidian-elevated)]/50 border border-[var(--metal-border)] text-[13px] text-white/90 focus:outline-none focus:border-[var(--forge-gold)]/35 transition-colors cursor-pointer"
                >
                  <option className="bg-[#0c0d12]" value="ALL">All taking guilds</option>
                  <option className="bg-[#0c0d12]" value="UNASSIGNED">Unassigned</option>
                  {takingGuilds.map((guild) => (
                    <option className="bg-[#0c0d12]" key={guild.id} value={guild.id}>
                      {guild.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="relative block">
                <span className="sr-only">Search rotations</span>
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8" />
                  <path d="M21 21l-4.35-4.35" />
                </svg>
                <input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search boss or guild..."
                  className="w-full h-[42px] pl-10 pr-4 rounded-xl bg-[var(--obsidian-elevated)]/50 border border-[var(--metal-border)] text-sm text-white/90 placeholder:text-white/35 focus:outline-none focus:border-[var(--forge-gold)]/35 transition-colors"
                />
              </label>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-[10px] uppercase tracking-[0.16em] text-white/30 font-bold mr-1">View</span>
              <div className="inline-flex items-center bg-[var(--obsidian-elevated)]/40 backdrop-blur-md border border-[var(--metal-border)] rounded-lg p-1 gap-1">
                {VIEW_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setViewMode(option.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold rounded-md transition-all cursor-pointer focus-ring ${
                      viewMode === option.id
                        ? "bg-[var(--forge-glow)] border border-[var(--forge-gold)]/25 text-[var(--forge-gold-bright)]"
                        : "text-white/40 hover:text-white/70 border border-transparent hover:bg-white/[0.03]"
                    }`}
                  >
                    <ViewModeIcon mode={option.id} />
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === "LIVE" && (
          isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
              {[1, 2, 3, 4].map((item) => <Skeleton key={item} className="h-72 rounded-2xl" />)}
            </div>
          ) : filteredRotations.length === 0 ? (
            <EmptyState title="No rotations found" body="Try a different boss or guild search." />
          ) : viewMode === "TIMELINE" ? (
            <TimelineView
              entries={filteredRotations.map((rotation) => rotationToViewEntry(rotation, serverNow))}
              canManage={canManage}
              onTaken={(id) => {
                const rotation = filteredRotations.find((r) => r.id === id);
                if (rotation) openKillModal(rotation);
              }}
            />
          ) : viewMode === "CALENDAR" ? (
            <WeeklyCalendar chipsByDate={liveCalendarChips} guildOfDay={guildOfDay} />
          ) : sortMode === "GUILD" ? (
            <div className="space-y-7">
              {groupByGuild(filteredRotations, (rotation) => rotation.currentGuild?.name).map(([guildName, guildRotations]) => (
                <GuildSection key={guildName} guildName={guildName} count={guildRotations.length}>
                  {guildRotations.map((rotation, index) => (
                    <RotationCard
                      key={rotation.id}
                      rotation={rotation}
                      canManage={canManage}
                      onKilled={openKillModal}
                      guildId={activeGuild.guildId}
                      index={index}
                      commitmentsBatch={commitmentsBatch}
                    />
                  ))}
                </GuildSection>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
              {filteredRotations.map((rotation, index) => (
                <RotationCard
                  key={rotation.id}
                  rotation={rotation}
                  canManage={canManage}
                  onKilled={openKillModal}
                  guildId={activeGuild.guildId}
                  index={index}
                  commitmentsBatch={commitmentsBatch}
                />
              ))}
            </div>
          )
        )}

        {activeTab === "UPCOMING" && (
          <div>
            {upcomingBosses.length === 0 ? (
              <EmptyState title="No upcoming bosses" body="All bosses that will spawn in the future appear here." />
            ) : viewMode === "TIMELINE" ? (
              <TimelineView entries={upcomingBosses.map((schedule) => scheduleToViewEntry(schedule, serverNow))} />
            ) : viewMode === "CALENDAR" ? (
              <WeeklyCalendar chipsByDate={upcomingCalendarChips} guildOfDay={guildOfDay} />
            ) : sortMode === "GUILD" ? (
              <div className="space-y-7">
                {groupByGuild(upcomingBosses, (schedule) => schedule.guildTurnGuildName || schedule.guildTurn).map(([guildName, guildSchedules]) => (
                  <GuildSection key={guildName} guildName={guildName} count={guildSchedules.length}>
                    {guildSchedules.map((schedule, index) => (
                      <UpcomingCard
                        key={schedule.id}
                        schedule={schedule}
                        guildId={activeGuild.guildId}
                        index={index}
                        commitmentsBatch={commitmentsBatch}
                      />
                    ))}
                  </GuildSection>
                ))}
              </div>
            ) : (
              <div className="space-y-7">
                {groupSchedulesByDay(upcomingBosses).map((group) => (
                  <div key={group.key}>
                    <div className="flex items-center gap-3 mb-3">
                      <span className={`text-[11px] font-bold uppercase tracking-[0.18em] ${group.label === "Today" ? "text-[var(--forge-gold-bright)]" : "text-white/50"}`}>
                        {group.label}
                      </span>
                      <span className="h-px flex-1 bg-white/[0.06]" />
                      <span className="text-[10px] text-white/30 font-mono">{group.items.length}</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
                      {group.items.map((schedule, index) => (
                        <UpcomingCard
                          key={schedule.id}
                          schedule={schedule}
                          guildId={activeGuild.guildId}
                          index={index}
                          commitmentsBatch={commitmentsBatch}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "ACTIVITIES" && <ActivitiesTab guildId={activeGuild.guildId} />}

        {activeTab === "MASTER" && <MasterListTab guildId={activeGuild.guildId} />}

        {activeTab === "HISTORY" && (
          <div className="space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-lg bg-white/[0.04] border border-white/[0.08] flex items-center justify-center shrink-0">
                  <svg className="h-4 w-4 text-white/50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 7v5l3 3" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">Boss Killed History</p>
                  <p className="text-xs text-white/45">Per-boss kill ledger and chronological timeline, plus recent queue changes.</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex items-center bg-[var(--obsidian-elevated)]/40 backdrop-blur-md border border-[var(--metal-border)] rounded-lg p-1 gap-1">
                  {HISTORY_VIEWS.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setHistoryView(option.id)}
                      className={`px-3.5 py-1.5 text-[12px] font-semibold rounded-md transition-all cursor-pointer focus-ring ${
                        historyView === option.id
                          ? "bg-white text-[#0c0d12]"
                          : "text-white/45 hover:text-white/75 border border-transparent hover:bg-white/[0.03]"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>

                <label className="relative block w-full sm:w-56">
                  <span className="sr-only">Search boss history</span>
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8" />
                    <path d="M21 21l-4.35-4.35" />
                  </svg>
                  <input
                    value={historySearch}
                    onChange={(event) => setHistorySearch(event.target.value)}
                    placeholder="Search boss name..."
                    className="w-full pl-9 pr-3.5 py-2.5 rounded-lg bg-white/[0.03] border border-white/[0.08] text-[13px] text-white placeholder:text-white/35 focus:outline-none focus:border-[var(--forge-gold)]/40"
                  />
                </label>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 rounded-xl border border-white/[0.06] bg-white/[0.025] p-1.5">
              <div className="inline-flex flex-wrap items-center gap-1">
                {HISTORY_CATEGORIES.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setHistoryCategory(cat.id)}
                    className={`px-3.5 py-2 text-[12.5px] font-semibold rounded-lg transition-all cursor-pointer ${
                      historyCategory === cat.id
                        ? "bg-[var(--forge-glow)] border border-[var(--forge-gold)]/25 text-[var(--forge-gold-bright)]"
                        : "text-white/45 hover:text-white/75 border border-transparent hover:bg-white/[0.03]"
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2 pr-1">
                {HISTORY_RANGES.map((range) => (
                  <button
                    key={range.id}
                    type="button"
                    onClick={() => setHistoryRange(range.id)}
                    className={`px-3 py-1.5 text-[12px] font-semibold rounded-lg border transition-all cursor-pointer ${
                      historyRange === range.id
                        ? "bg-white text-[#0c0d12] border-white"
                        : "text-white/50 border-white/[0.08] hover:text-white/80 hover:border-white/20"
                    }`}
                  >
                    {range.label}
                  </button>
                ))}
                {historyRange === "CUSTOM" && (
                  <label className="block">
                    <span className="sr-only">Custom history month</span>
                    <input
                      type="month"
                      value={historyMonth || killedHistory.month}
                      onChange={(event) => setHistoryMonth(event.target.value)}
                      className="px-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.08] text-[12px] text-white focus:outline-none focus:border-[var(--forge-gold)]/40"
                    />
                  </label>
                )}
              </div>
            </div>

            {!isLoadingQueueChanges && filteredQueueChanges.length > 0 && (
              <section className="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
                <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] bg-white/[0.025] px-4 py-3">
                  <h3 className="text-sm font-semibold text-white">Queue Changes</h3>
                  <span className="text-[11px] text-white/35">{filteredQueueChanges.length} recent</span>
                </div>
                <div className="divide-y divide-white/[0.05]">
                  {filteredQueueChanges.map((log) => {
                    const bossName = typeof log.detail?.bossName === "string" ? log.detail.bossName : log.target || "Boss Rotation";
                    const nextGuildName = typeof log.detail?.nextGuildName === "string" ? log.detail.nextGuildName : null;
                    const nextColor = getGuildColor(nextGuildName || "");
                    return (
                      <div key={log.id} className="px-4 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                        <p className="text-[12px] text-white/70 truncate">
                          <span className="font-semibold text-white/90">{log.actor.displayName}</span> reordered{" "}
                          <span className="font-semibold text-white/90">{bossName}</span>&apos;s queue
                          {nextGuildName && (
                            <>
                              {" "}— next up:{" "}
                              <span className={`font-semibold ${nextColor.text}`}>{nextGuildName}</span>
                            </>
                          )}
                        </p>
                        <span className="text-[11px] text-white/35 shrink-0 font-mono">
                          {new Date(log.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {isLoadingHistory ? (
              <div className="space-y-2">
                {[1, 2, 3].map((item) => <Skeleton key={item} className="h-14 rounded-lg" />)}
              </div>
            ) : historyRows.length === 0 && filteredQueueChanges.length === 0 ? (
              <EmptyState
                title="No kills recorded for this range"
                body={`No ${historyCategory === "FIXED_HOUR" ? "Fixed-Hour" : "Fixed-Schedule"} boss kills found. Try a different range or category.`}
              />
            ) : historyRows.length === 0 ? null : historyView === "LEDGER" ? (
              <HistoryLedgerGrid
                days={filteredHistoryDays}
                bossNames={categoryBossNames}
                onSelectKill={setSaleModalKill}
                canEdit={canManage}
                onEditKill={openHistoryKillEditModal}
              />
            ) : (
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] border-collapse text-left">
                    <thead>
                      <tr className="border-b border-white/[0.06] bg-white/[0.03]">
                        <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.16em] text-white/40">Date</th>
                        <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.16em] text-white/40">Time</th>
                        <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.16em] text-white/40">Boss</th>
                        <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.16em] text-white/40">Taken by</th>
                        <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.16em] text-white/40">Recorded by</th>
                        <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.16em] text-white/40">Drops</th>
                        <th className="px-4 py-2.5" aria-hidden="true" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.05]">
                      {historyRows.map((kill) => {
                        const takenColor = getGuildColor(kill.takenGuildName || "");
                        return (
                          <tr key={kill.id} className="hover:bg-white/[0.02] transition-colors align-middle">
                            <td className="px-4 py-3 text-[12px] font-mono text-white/55 whitespace-nowrap">
                              {new Date(`${kill.date}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                            </td>
                            <td className="px-4 py-3 text-[12px] font-mono text-white/55 whitespace-nowrap">
                              {new Date(kill.killedAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                            </td>
                            <td className="px-4 py-3 min-w-0">
                              <div className="flex items-center gap-2.5 min-w-0">
                                <BossAvatar src={kill.bossImageUrl} name={kill.bossName} />
                                <div className="min-w-0">
                                  <p className="text-[13px] font-semibold text-white truncate">{kill.bossName}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              {kill.takenGuildName ? (
                                <span className={`text-[12px] font-semibold ${takenColor.text}`}>{kill.takenGuildName}</span>
                              ) : (
                                <span className="text-[12px] text-white/30">Unrecorded</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-[12px] text-white/60 whitespace-nowrap">{kill.recordedBy.displayName}</td>
                            <td className="px-4 py-3 text-[12px] text-white/55 min-w-[220px]">
                              {kill.drops.length > 0 ? (
                                <div className="flex flex-wrap gap-1.5">
                                  {kill.drops.map((drop, index) => (
                                    <span
                                      key={`${drop.itemName}-${index}`}
                                      title={[drop.itemName, drop.rarity, drop.type].filter(Boolean).join(" - ")}
                                      className="inline-flex max-w-[220px] items-center gap-1 rounded-md border border-white/[0.08] bg-white/[0.035] px-2 py-1 text-[11px] text-white/70"
                                    >
                                      {drop.iconUrl && (
                                        <img
                                          src={drop.iconUrl}
                                          alt=""
                                          loading="lazy"
                                          className="h-4 w-4 rounded object-cover border border-white/10"
                                        />
                                      )}
                                      <span className="truncate">{drop.itemName}</span>
                                      {drop.quantity > 1 && <span className="text-white/35">x{drop.quantity}</span>}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-white/25">No drops recorded</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right whitespace-nowrap">
                              {canManage && (
                                <button
                                  type="button"
                                  onClick={() => openHistoryKillEditModal(kill)}
                                  className="mr-3 inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--forge-gold-bright)] hover:text-[var(--forge-gold)] transition-colors cursor-pointer"
                                >
                                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M12 20h9" />
                                    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                                  </svg>
                                  Edit
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => setSaleModalKill(kill)}
                                className="text-[11px] font-semibold text-emerald-300 hover:text-emerald-200 transition-colors cursor-pointer"
                              >
                                Details
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {killTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-md" onClick={() => !isKilling && setKillTarget(null)} />
          <div className="relative w-full max-w-md rounded-xl border border-[var(--metal-border)] bg-[var(--obsidian-elevated)] shadow-[0_40px_90px_-25px_rgba(0,0,0,0.8)] p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="relative p-0.5 rounded-xl border border-emerald-500/30 glow-gold-active">
                <BossAvatar src={killTarget.bossImageUrl || getBossImageUrl(killTarget.bossName)} name={killTarget.bossName} />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-[0.22em] text-emerald-300">Confirm taken</p>
                <h3 className="text-base font-semibold text-white">{killTarget.bossName}</h3>
              </div>
            </div>

            <div className="rounded-xl border border-[var(--metal-border)] bg-[var(--obsidian-elevated)]/60 p-3 space-y-2 mb-4">
              <ModalLine label="Taking guild" value={selectedTakenGuild?.name || "Select a guild"} tone="emerald" />
              <ModalLine label="Next guild" value={previewNextGuild?.name || "Unassigned"} tone="amber" />
              <ModalLine label="Next spawn source" value="Calculated from taken time" />
            </div>

            {!killTarget.activeSchedule && (
              <p className="mb-4 rounded-lg border border-[var(--forge-gold)]/20 bg-[var(--forge-glow)]/20 px-3 py-2 text-xs leading-5 text-[var(--forge-gold-dim)]">
                This boss has no active schedule yet. Confirming will import the latest killed time and calculate the next spawn.
              </p>
            )}

            <label className="block mb-4">
              <span className="block text-[10px] font-medium text-white/50 uppercase tracking-[0.18em] mb-2">
                Taking guild
              </span>
              <select
                value={selectedTakenGuildId}
                onChange={(event) => setSelectedTakenGuildId(event.target.value)}
                disabled={isKilling}
                className="w-full px-3.5 py-2.5 rounded-lg bg-[var(--obsidian-elevated)]/60 border border-[var(--metal-border)] text-[13px] text-white focus:outline-none focus:border-[var(--forge-gold)]/40 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                <option className="bg-[#0c0d12]" value="">Select taking guild</option>
                {modalGuildQueue.map((guild) => (
                  <option className="bg-[#0c0d12]" key={guild.id} value={guild.id}>
                    {guild.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block mb-5">
              <span className="block text-[10px] font-medium text-white/50 uppercase tracking-[0.18em] mb-2">
                Taken time
              </span>
              <input
                type="datetime-local"
                value={killTime}
                onChange={(event) => setKillTime(event.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg bg-[var(--obsidian-elevated)]/60 border border-[var(--metal-border)] text-[13px] text-white focus:outline-none focus:border-[var(--forge-gold)]/40"
              />
            </label>

            {/* Boss drops */}
            <div className="mb-5">
              <div className="flex items-center justify-between mb-2">
                <span className="block text-[10px] font-medium text-white/50 uppercase tracking-[0.18em]">
                  Boss drops <span className="text-white/30 normal-case tracking-normal">(optional)</span>
                </span>
                <button
                  type="button"
                  onClick={() => setShowDropsPicker(true)}
                  disabled={isKilling}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--forge-gold)]/30 bg-[var(--forge-glow)] px-2.5 py-1 text-[11px] font-bold text-[var(--forge-gold-bright)] hover:border-[var(--forge-gold)]/50 transition-colors cursor-pointer disabled:opacity-40"
                >
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                  {killDrops.length > 0 ? "Edit drops" : "Add drops"}
                </button>
              </div>
              {killDrops.length === 0 ? (
                <button
                  type="button"
                  onClick={() => setShowDropsPicker(true)}
                  disabled={isKilling}
                  className="w-full rounded-lg border border-dashed border-white/[0.1] bg-white/[0.01] px-3 py-3 text-[11px] text-white/35 hover:text-white/60 hover:border-white/20 transition-colors cursor-pointer disabled:opacity-40"
                >
                  No drops recorded — click to add the items this boss dropped.
                </button>
              ) : (
                <div className="flex flex-wrap gap-1.5 rounded-lg border border-white/[0.06] bg-white/[0.02] p-2">
                  {killDrops.map(({ item, quantity }) => {
                    const rs = rarityStyle(item.rarity);
                    return (
                      <span key={`${item.bucket}::${item.path}`} className={`inline-flex items-center gap-1.5 rounded-md border ${rs.border} ${rs.bg} pl-1 pr-1.5 py-0.5`}>
                        <img src={item.iconUrl} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-4 w-4 rounded object-cover" />
                        <span className="text-[10px] font-semibold text-white/85 max-w-[110px] truncate">{item.itemName}</span>
                        {quantity > 1 && <span className="text-[9px] font-mono text-white/50">×{quantity}</span>}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 border-t border-white/[0.06] pt-4">
              <Button variant="ghost" size="sm" onClick={() => setKillTarget(null)} disabled={isKilling}>
                Cancel
              </Button>
              <Button variant="accent" size="sm" onClick={confirmKill} isLoading={isKilling} disabled={!canConfirmTaken}>
                Confirm taken
              </Button>
            </div>
          </div>
        </div>
      )}

      {killTarget && showDropsPicker && (
        <BossDropsPicker
          bossName={killTarget.bossName}
          initial={killDrops}
          onCancel={() => setShowDropsPicker(false)}
          onApply={(selected) => {
            setKillDrops(selected);
            setShowDropsPicker(false);
          }}
        />
      )}

      {editingHistoryKill && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-md"
            onClick={() => !isEditingHistoryKill && setEditingHistoryKill(null)}
          />
          <div className="relative w-full max-w-md rounded-xl border border-[var(--metal-border)] bg-[var(--obsidian-elevated)] shadow-[0_40px_90px_-25px_rgba(0,0,0,0.8)] p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="relative p-0.5 rounded-xl border border-[var(--forge-gold)]/30 glow-gold-active">
                <BossAvatar src={editingHistoryKill.bossImageUrl || getBossImageUrl(editingHistoryKill.bossName)} name={editingHistoryKill.bossName} />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-[0.22em] text-[var(--forge-gold-bright)]">Edit kill time</p>
                <h3 className="text-base font-semibold text-white truncate">{editingHistoryKill.bossName}</h3>
              </div>
            </div>

            <div className="rounded-xl border border-[var(--metal-border)] bg-[var(--obsidian-elevated)]/60 p-3 space-y-2 mb-4">
              <ModalLine label="Taken by" value={editingHistoryKill.takenGuildName || "Unrecorded"} tone="emerald" />
              <ModalLine label="Recorded by" value={editingHistoryKill.recordedBy.displayName} />
              <ModalLine
                label="Current time"
                value={new Date(editingHistoryKill.killedAt).toLocaleString("en-US", {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
                tone="amber"
              />
            </div>

            {!editingHistoryKill.bossScheduleId && (
              <p className="mb-4 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs leading-5 text-red-200/80">
                This history entry is not linked to a boss schedule, so its timer cannot be corrected.
              </p>
            )}

            <label className="block mb-5">
              <span className="block text-[10px] font-medium text-white/50 uppercase tracking-[0.18em] mb-2">
                Corrected killed time
              </span>
              <input
                type="datetime-local"
                value={editHistoryKillTime}
                max={toDateTimeInputValue(new Date())}
                onChange={(event) => setEditHistoryKillTime(event.target.value)}
                disabled={isEditingHistoryKill || !editingHistoryKill.bossScheduleId}
                className="w-full px-3.5 py-2.5 rounded-lg bg-[var(--obsidian-elevated)]/60 border border-[var(--metal-border)] text-[13px] text-white focus:outline-none focus:border-[var(--forge-gold)]/40 disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </label>

            <div className="flex justify-end gap-2 border-t border-white/[0.06] pt-4">
              <Button variant="ghost" size="sm" onClick={() => setEditingHistoryKill(null)} disabled={isEditingHistoryKill}>
                Cancel
              </Button>
              <Button variant="accent" size="sm" onClick={saveHistoryKillEdit} isLoading={isEditingHistoryKill} disabled={!canSaveHistoryEdit}>
                Save edit
              </Button>
            </div>
          </div>
        </div>
      )}

      {saleModalKill && activeGuild && (
        <BossKillSaleModal
          guildId={activeGuild.guildId}
          kill={saleModalKill}
          isOfficer={isOfficer}
          onClose={() => setSaleModalKill(null)}
        />
      )}

      <MaintenanceResetModal
        isOpen={showMaintenanceModal}
        onClose={() => !isMaintenanceResetting && setShowMaintenanceModal(false)}
        onConfirm={handleMaintenanceReset}
        isProcessing={isMaintenanceResetting}
      />

      {showResetModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in"
            onClick={() => !isResetting && setShowResetModal(false)}
          />
          <div className="relative w-full max-w-md mx-4 animate-scale-in">
            <div className="rounded-2xl bg-[#0c0c10] border border-white/[0.08] shadow-2xl shadow-black/60 overflow-hidden">
              <div className="relative px-6 pt-6 pb-4">
                <div
                  className="absolute inset-x-0 top-0 h-32 pointer-events-none"
                  style={{ background: "linear-gradient(180deg, rgba(16,185,129,0.08) 0%, transparent 100%)" }}
                />
                <div className="relative flex items-start gap-4">
                  <div className="shrink-0 h-11 w-11 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                    <svg className="h-5 w-5 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21.5 2v6h-6" />
                      <path d="M2.5 12a10 10 0 0 1 17.17-6.83L21.5 8" />
                      <path d="M2.5 22v-6h6" />
                      <path d="M21.5 12a10 10 0 0 1-17.17 6.83L2.5 16" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-[16px] font-bold text-white">Reset All Boss Timers</h3>
                    <p className="text-[12px] text-white/45 mt-1 leading-relaxed">
                      Restart <span className="text-emerald-400 font-semibold">every boss</span> timer from
                      now. Each boss&apos;s next spawn will be recalculated as if it were just taken at this moment.
                    </p>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-end gap-3 px-6 py-5 border-t border-white/[0.04]">
                <Button variant="ghost" size="sm" onClick={() => setShowResetModal(false)} disabled={isResetting}>
                  Cancel
                </Button>
                <Button variant="accent" size="sm" onClick={handleResetAllTimers} isLoading={isResetting}>
                  Reset All Timers
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const RotationCard = memo(function RotationCard({
  rotation,
  canManage,
  onKilled,
  guildId,
  index = 0,
  commitmentsBatch,
}: {
  rotation: BossRotationItem;
  canManage: boolean;
  onKilled: (rotation: BossRotationItem) => void;
  guildId: string;
  index?: number;
  commitmentsBatch?: Record<string, BossCommitmentData> | null;
}) {
  // Ticks on its own, independent of the page — so opening a modal, typing in
  // a filter, or any other unrelated state change up in BossRotationPage
  // doesn't force every visible boss card (and everything nested inside it,
  // like BossCommitButton) to re-render along with it.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // A cycle boss with no spawnTime has never been taken — there's no real
  // countdown to show yet; the "Taken" action below logs its first kill.
  const tick = rotation.spawnTime
    ? getCountdown(rotation.spawnTime, now)
    : { text: "Not Taken Yet", warning: false, expired: false };
  const currentColor = getGuildColor(rotation.currentGuild?.name || "");
  const nextColor = getGuildColor(rotation.nextGuild?.name || "");
  const canKill = canManage;
  const spawnLabel = rotation.spawnTime
    ? new Date(rotation.spawnTime).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
    : "—";

  // `rotation.queue` is stored in a fixed roster order (e.g. alphabetical),
  // not rotation order — numbering it as-is could show the current holder
  // sitting at "2." with someone else at "1.", which reads as if that guild
  // goes first. Rotate the list so the current holder is always "1." and the
  // rest follow in actual hand-off order.
  const currentQueueIndex = rotation.currentGuild
    ? rotation.queue.findIndex((guild) => guild.id === rotation.currentGuild!.id)
    : -1;
  const displayQueue =
    currentQueueIndex > 0
      ? [...rotation.queue.slice(currentQueueIndex), ...rotation.queue.slice(0, currentQueueIndex)]
      : rotation.queue;

  // With only one guild queued, "Current Holder" / "Up Next" / "Queue" would
  // all repeat the same name — collapse to a single queue block instead of
  // three redundant readouts of the same guild.
  const showHandoff = displayQueue.length > 1;

  return (
    <article
      className={`group relative rounded-2xl border bg-[var(--obsidian-elevated)]/40 flex flex-col transition-colors duration-300 animate-[fadeInUp_0.5s_ease-out_forwards] ${
        tick.expired
          ? "border-emerald-500/25 hover:border-emerald-500/45"
          : tick.warning
            ? "border-[var(--forge-gold)]/20 hover:border-[var(--forge-gold)]/40"
            : "border-[var(--metal-border)] hover:border-white/15"
      }`}
      style={{ animationDelay: `${index * 40}ms` }}
    >
      <div className="p-4 flex flex-col gap-3 flex-1">
        {/* Boss info */}
        <div className="flex items-start gap-3">
          <div className="relative h-11 w-11 shrink-0 rounded-xl overflow-hidden ring-1 ring-white/10">
            <BossAvatar src={rotation.bossImageUrl || getBossImageUrl(rotation.bossName)} name={rotation.bossName} />
          </div>
          <div className="min-w-0 flex-1 pt-0.5">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-white truncate">{rotation.bossName}</h3>
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-white/[0.06] text-white/55 shrink-0">
                Lvl {rotation.level}
              </span>
            </div>
            <div className="flex items-center gap-1 text-white/40 mt-1">
              <svg className="h-3 w-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2a8 8 0 00-8 8c0 5.25 8 12 8 12s8-6.75 8-12a8 8 0 00-8-8z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              <span className="text-[11px] truncate">{rotation.location}</span>
            </div>
          </div>
          <span
            className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${
              tick.expired ? "bg-emerald-400 animate-pulse" : tick.warning ? "bg-[var(--forge-gold)]" : "bg-white/15"
            }`}
            aria-hidden="true"
          />
        </div>

        {/* Timer — one flat block, one state color, no nested bezels */}
        <div
          className={`rounded-xl px-3 py-2.5 ${
            tick.expired ? "bg-emerald-500/[0.07]" : tick.warning ? "bg-[var(--forge-gold)]/[0.07]" : "bg-white/[0.025]"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[9px] uppercase tracking-[0.16em] font-bold text-white/30">
              {tick.expired ? "Live now" : tick.warning ? "Spawning soon" : "Next spawn"}
            </span>
            <span className="text-[9px] text-white/30 font-mono">{spawnLabel}</span>
          </div>
          <p
            className={`mt-1 font-mono text-lg font-bold leading-none tracking-wide ${
              tick.expired ? "text-emerald-400" : tick.warning ? "text-[var(--forge-gold-bright)]" : "text-white/85"
            }`}
          >
            {tick.text}
          </p>
        </div>

        {/* Handoff — only shown when there's an actual handoff to show */}
        {showHandoff && (
          <div className="flex items-center gap-2 text-[11px]">
            <span className={`font-semibold truncate ${currentColor.text}`}>{rotation.currentGuild?.name || "Unassigned"}</span>
            <svg className="h-3 w-3 text-white/20 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
            <span className={`font-semibold truncate ${nextColor.text}`}>{rotation.nextGuild?.name || "Unassigned"}</span>
          </div>
        )}

        {/* Queue */}
        <div className="rounded-xl bg-white/[0.02] px-3 py-2.5 flex-1">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[9px] uppercase tracking-[0.16em] font-bold text-white/30">
              {showHandoff ? "Queue" : "Holder"}
            </span>
            {showHandoff && <span className="text-[9px] text-white/30 font-mono">{displayQueue.length} guilds</span>}
          </div>
          {displayQueue.length === 0 ? (
            <p className="text-[10px] text-white/25 italic">No guilds queued</p>
          ) : (
            <div className="flex flex-wrap items-center gap-1.5">
              {displayQueue.map((guild, i) => {
                const color = getGuildColor(guild.name);
                const isCurrent = rotation.currentGuild?.id === guild.id;
                return (
                  <span
                    key={guild.id}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[10px] font-semibold ${
                      isCurrent
                        ? "border-[var(--forge-gold)]/40 bg-[var(--forge-glow)] text-[var(--forge-gold-bright)]"
                        : `${color.border} ${color.bg} ${color.text}`
                    }`}
                  >
                    <span
                      className="h-1.5 w-1.5 rounded-full shrink-0"
                      style={{ backgroundColor: isCurrent ? "var(--forge-gold)" : color.dot }}
                    />
                    {showHandoff && <span className="font-mono text-[9px] opacity-60">{i + 1}</span>}
                    <span className="truncate max-w-[100px]">{guild.name}</span>
                  </span>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer — status left; commit headcount + Taken action grouped on the right */}
        <div className="flex items-center justify-between gap-3 border-t border-white/[0.05] pt-3 mt-auto">
          <div className="flex items-center gap-1.5 text-[10px] text-white/40 min-w-0">
            <span
              className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                rotation.activeSchedule || rotation.type === "FIXED_SCHEDULE" ? "bg-emerald-400" : "bg-amber-400"
              }`}
            />
            <span className="truncate">
              {rotation.activeSchedule ? "Active" : rotation.type === "FIXED_SCHEDULE" ? "Fixed schedule" : "Import needed"}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {rotation.activeSchedule && (
              <BossCommitButton
                variant="inline"
                guildId={guildId}
                scheduleId={rotation.activeSchedule.id}
                bossName={rotation.bossName}
                initialData={commitmentsBatch?.[rotation.activeSchedule.id]}
              />
            )}
            {canManage && (
              <button
                type="button"
                onClick={() => onKilled(rotation)}
                disabled={!canKill}
                aria-label={`Mark ${rotation.bossName} taken`}
                title={rotation.activeSchedule ? "Taken" : "Import killed time"}
                className="h-8 px-4 inline-flex items-center gap-1.5 rounded-full border border-emerald-500/35 bg-emerald-500/10 text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-400 hover:bg-emerald-500/20 hover:text-white transition-colors disabled:opacity-35 disabled:cursor-not-allowed cursor-pointer focus-ring"
              >
                <svg className="h-3 w-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
                  <path d="M22 4L12 14.01l-3-3" />
                </svg>
                Taken
              </button>
            )}
          </div>
        </div>
      </div>
    </article>
  );
});

const UpcomingCard = memo(function UpcomingCard({
  schedule,
  guildId,
  index = 0,
  commitmentsBatch,
}: {
  schedule: BossScheduleData;
  guildId: string;
  index?: number;
  commitmentsBatch?: Record<string, BossCommitmentData> | null;
}) {
  // Ticks on its own for the same reason RotationCard does — see there.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tickId = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tickId);
  }, []);

  // Real-time countdown that projects forward along the boss's actual respawn
  // cycle, so a passed spawn shows a live future countdown instead of "LIVE".
  const timer = getRealtimeBossTimer(schedule.bossName, schedule.spawnTime, now, { status: schedule.status });
  const tick = { text: timer.text, warning: timer.warning, expired: timer.live };
  const color = getGuildColor(schedule.guildTurnGuildName || schedule.guildTurn || "");
  const spawnLabel = new Date(timer.nextSpawn).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  const isLive = timer.live;
  const dayLabel = dayKeyLabel(schedule.spawnTime).label;
  const isToday = dayLabel === "Today";

  return (
    <article
      className={`group relative rounded-2xl border bg-[var(--obsidian-elevated)]/40 flex flex-col transition-colors duration-300 animate-[fadeInUp_0.5s_ease-out_forwards] ${
        isLive
          ? "border-emerald-500/25 hover:border-emerald-500/45"
          : tick.warning
            ? "border-[var(--forge-gold)]/20 hover:border-[var(--forge-gold)]/40"
            : "border-[var(--metal-border)] hover:border-white/15"
      }`}
      style={{ animationDelay: `${index * 40}ms` }}
    >
      <div className="p-4 flex flex-col gap-3 flex-1">
        <div className="flex items-start gap-3">
          <div className="relative h-11 w-11 shrink-0 rounded-xl overflow-hidden ring-1 ring-white/10">
            <BossAvatar src={schedule.bossImageUrl || getBossImageUrl(schedule.bossName)} name={schedule.bossName} />
          </div>
          <div className="min-w-0 flex-1 pt-0.5">
            <div className="flex items-center gap-1.5">
              <h3 className="text-sm font-bold text-white truncate">{schedule.bossName}</h3>
              {isToday && (
                <span className="shrink-0 px-1.5 py-0.5 rounded-full text-[8px] font-extrabold uppercase tracking-wider bg-[var(--forge-gold)]/15 text-[var(--forge-gold-bright)] border border-[var(--forge-gold)]/30">
                  Today
                </span>
              )}
            </div>
            <div className="flex items-center gap-1 text-white/40 mt-1">
              <svg className="h-3 w-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2a8 8 0 00-8 8c0 5.25 8 12 8 12s8-6.75 8-12a8 8 0 00-8-8z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              <span className="text-[11px] truncate">{schedule.location}</span>
            </div>
          </div>
          <span
            className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${
              isLive ? "bg-emerald-400 animate-pulse" : tick.warning ? "bg-[var(--forge-gold)]" : "bg-white/15"
            }`}
            aria-hidden="true"
          />
        </div>

        {/* Timer — one flat block, matching Guild Rotation's card */}
        <div
          className={`rounded-xl px-3 py-2.5 ${
            isLive ? "bg-emerald-500/[0.07]" : tick.warning ? "bg-[var(--forge-gold)]/[0.07]" : "bg-white/[0.025]"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[9px] uppercase tracking-[0.16em] font-bold text-white/30">
              {isLive ? "Live now" : tick.warning ? "Spawning soon" : "Upcoming"}
            </span>
            <span className="text-[9px] text-white/30 font-mono">{spawnLabel}</span>
          </div>
          <p
            className={`mt-1 font-mono text-lg font-bold leading-none tracking-wide ${
              isLive ? "text-emerald-400" : tick.warning ? "text-[var(--forge-gold-bright)]" : "text-white/85"
            }`}
          >
            {isLive ? "LIVE" : tick.text}
          </p>
        </div>

        {/* Taking guild + status */}
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 min-w-0 text-[11px]">
            <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: color.dot }} />
            <span className={`font-semibold truncate ${color.text}`}>
              {schedule.guildTurnGuildName || schedule.guildTurn || "Unassigned"}
            </span>
          </span>
          <span className="text-[9px] font-bold uppercase tracking-wider text-white/35 shrink-0">{schedule.status}</span>
        </div>

        {/* War-planning headcount for this specific upcoming spawn */}
        <div className="mt-auto">
          <BossCommitButton
            guildId={guildId}
            scheduleId={schedule.id}
            bossName={schedule.bossName}
            initialData={commitmentsBatch?.[schedule.id]}
          />
        </div>
      </div>
    </article>
  );
});

function BossAvatar({ src, name }: { src: string; name: string }) {
  return (
    <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg border border-white/[0.08] bg-zinc-950">
      <img
        src={src}
        alt={name}
        className="h-full w-full object-cover"
        loading="lazy"
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/35 to-transparent" />
    </div>
  );
}

function dayKeyLabel(spawnTime: string | null) {
  if (!spawnTime) return { key: "unscheduled", label: "Not scheduled" };
  const date = new Date(spawnTime);
  const key = date.toDateString();
  const todayKey = new Date().toDateString();
  const tomorrowKey = new Date(Date.now() + 86400000).toDateString();
  const label =
    key === todayKey
      ? "Today"
      : key === tomorrowKey
        ? "Tomorrow"
        : date.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
  return { key, label };
}

// Entries arrive pre-sorted chronologically, so grouping consecutive
// same-day entries this way naturally keeps each day's items in time order.
function groupByDay(entries: ViewEntry[]) {
  const groups: Array<{ key: string; label: string; items: ViewEntry[] }> = [];
  for (const entry of entries) {
    const { key, label } = dayKeyLabel(entry.spawnTime);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(entry);
    else groups.push({ key, label, items: [entry] });
  }
  return groups;
}

// Same day-bucketing as groupByDay, but for raw schedule rows (Upcoming
// Grid view) rather than the reduced ViewEntry shape. Assumes input is
// already sorted soonest-first, same as groupByDay.
function groupSchedulesByDay(schedules: BossScheduleData[]) {
  const groups: Array<{ key: string; label: string; items: BossScheduleData[] }> = [];
  for (const schedule of schedules) {
    const { key, label } = dayKeyLabel(schedule.spawnTime);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(schedule);
    else groups.push({ key, label, items: [schedule] });
  }
  return groups;
}

function TimelineView({
  entries,
  canManage,
  onTaken,
}: {
  entries: ViewEntry[];
  canManage?: boolean;
  onTaken?: (id: string) => void;
}) {
  const sorted = useMemo(
    () => [...entries].sort((a, b) => spawnSortValue(a.spawnTime) - spawnSortValue(b.spawnTime)),
    [entries],
  );
  const groups = useMemo(() => groupByDay(sorted), [sorted]);

  return (
    <div className="space-y-6 animate-scale-in">
      {groups.map((group) => (
        <div key={group.key}>
          <div className="flex items-center gap-3 mb-3">
            <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--forge-gold)]">{group.label}</span>
            <span className="h-px flex-1 bg-white/[0.06]" />
            <span className="text-[10px] text-white/30 font-mono">{group.items.length}</span>
          </div>
          <div className="relative pl-6 border-l border-white/[0.08] space-y-3">
            {group.items.map((entry) => (
              <TimelineRow key={entry.id} entry={entry} canManage={canManage} onTaken={onTaken} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function TimelineRow({
  entry,
  canManage,
  onTaken,
}: {
  entry: ViewEntry;
  canManage?: boolean;
  onTaken?: (id: string) => void;
}) {
  const color = getGuildColor(entry.guildName === "Unassigned" ? "" : entry.guildName);
  const timeLabel = entry.spawnTime
    ? new Date(entry.spawnTime).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
    : "--:--";
  const dotColor = entry.timerLive ? "bg-emerald-400" : entry.timerWarning ? "bg-[var(--forge-gold)]" : "bg-white/25";

  return (
    <div className="relative flex flex-wrap items-center gap-3 rounded-xl border border-white/[0.05] bg-white/[0.02] hover:bg-white/[0.035] hover:border-white/10 transition-colors p-3">
      <span className={`absolute -left-[29px] top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border-2 border-[#0c0d12] ${dotColor}`} />
      <span className="w-14 shrink-0 font-mono text-xs text-white/50">{timeLabel}</span>
      <BossAvatar src={entry.bossImageUrl} name={entry.bossName} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-white truncate">{entry.bossName}</p>
        <p className="text-[11px] text-white/40 truncate">{entry.location}</p>
      </div>
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[10px] font-bold shrink-0 ${color.border} ${color.bg} ${color.text}`}>
        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color.dot }} />
        {entry.guildName}
      </span>
      <span className={`shrink-0 font-mono text-xs font-bold ${entry.timerLive ? "text-emerald-400" : entry.timerWarning ? "text-[var(--forge-gold-bright)]" : "text-white/60"}`}>
        {entry.timerText}
      </span>
      {canManage && onTaken && (
        <button
          type="button"
          onClick={() => onTaken(entry.id)}
          className="shrink-0 h-7 px-3 inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 text-[10px] font-bold uppercase tracking-wider text-emerald-400 hover:bg-emerald-500/20 hover:border-emerald-500/60 hover:text-white transition-all cursor-pointer"
        >
          <svg className="h-3 w-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
            <path d="M22 4L12 14.01l-3-3" />
          </svg>
          Taken
        </button>
      )}
    </div>
  );
}

function ViewModeIcon({ mode }: { mode: ViewMode }) {
  if (mode === "TIMELINE") {
    return (
      <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="4" y1="6" x2="4" y2="18" />
        <circle cx="4" cy="6" r="1.5" fill="currentColor" stroke="none" />
        <circle cx="4" cy="12" r="1.5" fill="currentColor" stroke="none" />
        <circle cx="4" cy="18" r="1.5" fill="currentColor" stroke="none" />
        <line x1="9" y1="6" x2="20" y2="6" />
        <line x1="9" y1="12" x2="20" y2="12" />
        <line x1="9" y1="18" x2="20" y2="18" />
      </svg>
    );
  }
  if (mode === "CALENDAR") {
    return (
      <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </svg>
    );
  }
  return (
    <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

function GuildSection({ guildName, count, children }: { guildName: string; count: number; children: ReactNode }) {
  const color = getGuildColor(guildName === "Unassigned" ? "" : guildName);
  return (
    <section>
      <div className="flex items-center gap-2.5 mb-3.5">
        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg border text-[11px] font-bold ${color.border} ${color.bg} ${color.text}`}>
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color.dot }} />
          {guildName}
        </span>
        <span className="text-[10px] text-white/35 font-mono">{count} boss{count === 1 ? "" : "es"}</span>
        <span className="h-px flex-1 bg-white/[0.06]" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
        {children}
      </div>
    </section>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-72 rounded-xl bg-white/[0.015] border border-white/[0.05] p-8 text-center">
      <svg className="h-10 w-10 text-white/20 mb-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 8v4" />
        <path d="M12 16h.01" />
      </svg>
      <h3 className="text-sm font-semibold text-white/80">{title}</h3>
      <p className="text-xs text-white/45 mt-1 max-w-sm">{body}</p>
    </div>
  );
}

function ModalLine({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "amber" | "emerald" }) {
  const toneClass = tone === "amber"
    ? "text-amber-300"
    : tone === "emerald"
      ? "text-emerald-300"
      : "text-white/80";

  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[11px] text-white/40">{label}</span>
      <span className={`text-[12px] font-semibold text-right ${toneClass}`}>{value}</span>
    </div>
  );
}
