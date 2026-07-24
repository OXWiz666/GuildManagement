export type RotationTab = "LIVE" | "UPCOMING" | "ACTIVITIES" | "MASTER" | "HISTORY";
export type CycleFilter = "ALL" | "FIXED_SCHEDULE" | "SHORT_CYCLE" | "LONG_CYCLE" | "LOW_BOSS";
export type SortMode = "TIME" | "GUILD";
export type ViewMode = "GRID" | "TIMELINE" | "CALENDAR";
export type HistoryView = "TIMELINE" | "LEDGER";
export type HistoryCategory = "FIXED_HOUR" | "FIXED_SCHEDULE";
export type HistoryRange = "LAST_7D" | "LAST_MONTH" | "CUSTOM";

// Minimal shape the data/action hooks need from `user.guilds[0]` — just
// enough to key queries by guild. useRotationFilters needs more fields
// (name/slug/avatar for its fallback-guild synthesis) so it keeps its own
// wider local type instead of this one.
export type ActiveGuildRef = { guildId: string } | undefined;
