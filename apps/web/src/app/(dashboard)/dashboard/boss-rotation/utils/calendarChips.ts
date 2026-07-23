import { getGuildColor } from "./helpers";
import { getBossImageUrl } from "@guild/shared";
import type { GuildActivityData, LowBossRotationResponse } from "@/lib/api";
import { resolveActivityTypeMeta, type ActivityTypeMeta } from "@/lib/activityTypeMeta";
import type { CalendarChip, GuildOfDayInfo } from "../components/WeeklyCalendar";
import { toDateKey } from "../components/WeeklyCalendar";

/** Minimal shape both LIVE (BossRotationItem) and UPCOMING (BossScheduleData)
 *  already get reduced to via rotationToViewEntry/scheduleToViewEntry — kept
 *  structural here so this file doesn't need to import that page-local type. */
export interface CalendarBossEntry {
  id: string;
  bossName: string;
  bossImageUrl?: string | null;
  location: string;
  spawnTime: string | null;
  guildName: string;
}

export function bossEntryToChip(entry: CalendarBossEntry, onClick?: () => void): CalendarChip {
  const guildName = entry.guildName === "Unassigned" ? "" : entry.guildName;
  const color = getGuildColor(guildName);
  return {
    id: `boss:${entry.id}`,
    kind: "boss",
    timeLabel: entry.spawnTime
      ? new Date(entry.spawnTime).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
      : "--:--",
    title: entry.bossName,
    subtitle: `${entry.location} · ${entry.guildName}`,
    badgeClass: `${color.border} ${color.bg} ${color.text}`,
    dot: color.dot,
    iconUrl: entry.bossImageUrl || getBossImageUrl(entry.bossName),
    onClick,
  };
}

export function activityToChip(
  activity: GuildActivityData,
  typeMeta: Record<string, ActivityTypeMeta>,
  onClick?: () => void,
): CalendarChip {
  const meta = resolveActivityTypeMeta(typeMeta, activity.type);
  return {
    id: `activity:${activity.id}`,
    kind: "activity",
    timeLabel: new Date(activity.scheduledAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
    title: activity.title,
    subtitle: meta.label,
    badgeClass: meta.badge,
    dot: meta.dot,
    onClick,
  };
}

/** Buckets boss spawns + guild activities into one chipsByDate map for
 *  WeeklyCalendar — the same overlay used on Live, Upcoming, Activities, and
 *  the Faction Schedule tab. */
export function buildWeeklyChips(opts: {
  bossEntries?: CalendarBossEntry[];
  onBossClick?: (id: string) => void;
  activities?: GuildActivityData[];
  typeMeta?: Record<string, ActivityTypeMeta>;
  onActivityClick?: (activity: GuildActivityData) => void;
}): Map<string, CalendarChip[]> {
  const items: Array<{ dateKey: string; chip: CalendarChip }> = [];

  for (const entry of opts.bossEntries ?? []) {
    if (!entry.spawnTime) continue;
    items.push({
      dateKey: toDateKey(new Date(entry.spawnTime)),
      chip: bossEntryToChip(entry, opts.onBossClick ? () => opts.onBossClick!(entry.id) : undefined),
    });
  }

  for (const activity of opts.activities ?? []) {
    items.push({
      dateKey: toDateKey(new Date(activity.scheduledAt)),
      chip: activityToChip(activity, opts.typeMeta ?? {}, opts.onActivityClick ? () => opts.onActivityClick!(activity) : undefined),
    });
  }

  const map = new Map<string, CalendarChip[]>();
  for (const { dateKey, chip } of items) {
    const list = map.get(dateKey);
    if (list) list.push(chip);
    else map.set(dateKey, [chip]);
  }
  for (const list of map.values()) list.sort((a, b) => a.timeLabel.localeCompare(b.timeLabel));
  return map;
}

/**
 * Resolves which guild "owns" a given date under the Faction Schedule's
 * active cadence — WEEKLY repeats a fixed weekday pattern, MONTHLY is an
 * explicit date map. Shared by the read-only overlay on Live/Upcoming/
 * Activities and the editable strip on the Faction Schedule tab itself
 * (same underlying config).
 */
export function buildGuildOfDayResolver(
  config: LowBossRotationResponse | null | undefined,
): ((dateKey: string) => GuildOfDayInfo | null) | undefined {
  if (!config || config.lowBossNames.length === 0 || config.guilds.length === 0) return undefined;
  const guildMap = new Map(config.guilds.map((g) => [g.id, g]));

  return (dateKey: string) => {
    let guildId: string | undefined;
    if (config.mode === "WEEKLY") {
      const weekday = new Date(`${dateKey}T00:00:00`).getDay();
      guildId = config.weekly[String(weekday)];
    } else {
      guildId = config.days[dateKey];
    }
    const guild = guildId ? guildMap.get(guildId) : null;
    if (!guild) return null;
    const color = getGuildColor(guild.name);
    return { name: guild.name, badgeClass: `${color.border} ${color.bg} ${color.text}`, dot: color.dot };
  };
}
