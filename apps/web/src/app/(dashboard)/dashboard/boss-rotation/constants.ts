import { PREDEFINED_BOSSES, getBossCycleCategory } from "@guild/shared";
import type { GuildActivitiesResponse, ActivityPointRulesData } from "@/lib/api";
import type { CycleFilter, SortMode, ViewMode, HistoryView, HistoryCategory, HistoryRange } from "./types";

export const VIEW_OPTIONS: Array<{ id: ViewMode; label: string }> = [
  { id: "GRID", label: "Grid" },
  { id: "TIMELINE", label: "Timeline" },
  { id: "CALENDAR", label: "Calendar" },
];

export const CYCLE_FILTERS: Array<{ id: CycleFilter; label: string }> = [
  { id: "ALL", label: "All cycles" },
  { id: "FIXED_SCHEDULE", label: "Fixed Schedule" },
  { id: "LONG_CYCLE", label: "Long Cycle Boss" },
  { id: "SHORT_CYCLE", label: "Short Cycle Boss" },
  { id: "LOW_BOSS", label: "Low Boss" },
];

export const SORT_OPTIONS: Array<{ id: SortMode; label: string }> = [
  { id: "TIME", label: "Sort: Nearest time" },
  { id: "GUILD", label: "Sort: By guild" },
];

export const HISTORY_VIEWS: Array<{ id: HistoryView; label: string }> = [
  { id: "TIMELINE", label: "Timeline" },
  { id: "LEDGER", label: "Ledger" },
];

export const HISTORY_CATEGORIES: Array<{ id: HistoryCategory; label: string }> = [
  { id: "FIXED_HOUR", label: "Fixed-Hour Bosses" },
  { id: "FIXED_SCHEDULE", label: "Fixed-Schedule Bosses" },
];

export const HISTORY_RANGES: Array<{ id: HistoryRange; label: string }> = [
  { id: "LAST_7D", label: "Last 7d" },
  { id: "LAST_MONTH", label: "Last Month" },
  { id: "CUSTOM", label: "Custom" },
];

// Boss category columns for the Ledger grid, derived once from the static
// catalog — "Fixed-Hour" = cooldown-based bosses (SHORT_CYCLE/LONG_CYCLE),
// "Fixed-Schedule" = deterministic weekly-calendar bosses.
export const FIXED_HOUR_BOSS_NAMES = PREDEFINED_BOSSES.filter(
  (boss) => getBossCycleCategory(boss.name, boss.type, boss.cooldownHours) !== "FIXED_SCHEDULE",
).map((boss) => boss.name);
export const FIXED_SCHEDULE_BOSS_NAMES = PREDEFINED_BOSSES.filter(
  (boss) => getBossCycleCategory(boss.name, boss.type, boss.cooldownHours) === "FIXED_SCHEDULE",
).map((boss) => boss.name);

export const CONFIRM_TAKEN_TIMEOUT_MS = 30000;
export const EMPTY_ACTIVITIES: GuildActivitiesResponse = { canManage: false, viewerRole: "MEMBER", activities: [] };
export const EMPTY_ACTIVITY_RULES: ActivityPointRulesData = { activities: [] };
