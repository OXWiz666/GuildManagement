import type { BossRotationItem, BossScheduleData } from "@/lib/api";
import { getBossImageUrl, getRealtimeBossTimer } from "@guild/shared";

// Normalized shape both the LIVE (rotation) and UPCOMING (schedule) tabs
// reduce down to, so Timeline/Calendar views only need to know one shape.
export interface ViewEntry {
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

// Spawn times that are missing/never-taken sort to the end, not the front.
export function spawnSortValue(spawnTime: string | null | undefined) {
  return spawnTime ? new Date(spawnTime).getTime() : Number.POSITIVE_INFINITY;
}

export function guildGroupLabel(name: string | null | undefined) {
  return name && name.trim() ? name : "Unassigned";
}

// Groups already-sorted-by-time items into per-guild sections (guild
// alphabetical, "Unassigned" last), preserving the incoming item order
// within each group so the nearest-time ordering carries over.
export function groupByGuild<T>(items: T[], getGuildName: (item: T) => string | null | undefined) {
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

export function getCountdown(spawnTime: string, nowMs: number) {
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

export function rotationToViewEntry(rotation: BossRotationItem, serverNow: number): ViewEntry {
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

export function scheduleToViewEntry(schedule: BossScheduleData, serverNow: number): ViewEntry {
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

export function dayKeyLabel(spawnTime: string | null) {
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
export function groupByDay(entries: ViewEntry[]) {
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
export function groupSchedulesByDay(schedules: BossScheduleData[]) {
  const groups: Array<{ key: string; label: string; items: BossScheduleData[] }> = [];
  for (const schedule of schedules) {
    const { key, label } = dayKeyLabel(schedule.spawnTime);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(schedule);
    else groups.push({ key, label, items: [schedule] });
  }
  return groups;
}
