import { UserFacingError } from "./errors.js";

/**
 * Discord's own timestamp markup. Discord renders these in each viewer's local
 * timezone, which is why the bot emits them instead of formatting a fixed
 * string: a guild spanning PH/SG/AU sees correct local times with no config.
 *   R = relative ("in 5 minutes"), t = short time, f = long date+time
 */
export function discordTimestamp(date: Date, style: "R" | "t" | "f" | "T" | "D" = "R"): string {
  return `<t:${Math.floor(date.getTime() / 1000)}:${style}>`;
}

/**
 * The UTC offset, in minutes, that `timeZone` was at `instant`.
 *
 * Derived from Intl rather than a hardcoded table so zones with DST stay
 * correct year-round. `formatToParts` gives the wall-clock reading in the zone;
 * interpreting those parts as if they were UTC and differencing against the
 * real instant yields the offset.
 */
function zoneOffsetMinutes(instant: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const parts = dtf.formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);

  // Intl renders midnight as hour 24 in some environments; normalize to 0.
  const hour = get("hour") % 24;

  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    hour,
    get("minute"),
    get("second"),
  );

  // Round to the minute: asUtc has second precision but instant carries ms.
  return (asUtc - Math.floor(instant.getTime() / 1000) * 1000) / 60_000;
}

/**
 * Resolve a bare `HH:MM` wall-clock reading in `timeZone` to a real instant.
 *
 * Interpreted as *today* in that zone; if that lands in the future (someone
 * typing `!kill Venatus 23:50` shortly after midnight), it rolls back one day,
 * because a kill can only have happened in the past.
 */
export function resolveWallClock(input: string, timeZone: string, now: Date = new Date()): Date {
  const match = /^(\d{1,2}):(\d{2})$/.exec(input.trim());
  if (!match) {
    throw new UserFacingError(
      `\`${input}\` isn't a valid time.`,
      "Use 24-hour `HH:MM` — for example `!kill Venatus 21:30`.",
    );
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) {
    throw new UserFacingError(
      `\`${input}\` isn't a valid time.`,
      "Hours must be 00–23 and minutes 00–59.",
    );
  }

  // Today's calendar date *in the target zone* — not the host's date, which may
  // already be tomorrow (or still yesterday) relative to game time.
  const dateParts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const [year, month, day] = dateParts.split("-").map(Number) as [number, number, number];

  // First pass: guess the instant using the offset in effect right now.
  const naiveUtc = Date.UTC(year, month - 1, day, hours, minutes, 0, 0);
  const guess = new Date(naiveUtc - zoneOffsetMinutes(now, timeZone) * 60_000);

  // Second pass: re-read the offset AT the guessed instant. Near a DST boundary
  // the two can differ, and the offset at the target instant is the correct one.
  const resolved = new Date(naiveUtc - zoneOffsetMinutes(guess, timeZone) * 60_000);

  // A kill is always in the past. Future ⇒ the user meant yesterday.
  if (resolved.getTime() > now.getTime()) {
    return new Date(resolved.getTime() - 24 * 60 * 60 * 1000);
  }

  return resolved;
}

/**
 * Resolve a bare `HH:MM` wall-clock reading in `timeZone` to a real instant,
 * same DST-aware two-pass resolution as `resolveWallClock` — but for a
 * *spawn* time (`!setspawn`) rather than a kill: interpreted as today in that
 * zone, and rolled FORWARD one day if that already passed, since a spawn
 * being set is always the next upcoming one, never a past instant.
 */
export function resolveFutureWallClock(input: string, timeZone: string, now: Date = new Date()): Date {
  const match = /^(\d{1,2}):(\d{2})$/.exec(input.trim());
  if (!match) {
    throw new UserFacingError(
      `\`${input}\` isn't a valid time.`,
      "Use 24-hour `HH:MM` — for example `!setspawn Venatus 21:30`.",
    );
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) {
    throw new UserFacingError(
      `\`${input}\` isn't a valid time.`,
      "Hours must be 00–23 and minutes 00–59.",
    );
  }

  const dateParts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const [year, month, day] = dateParts.split("-").map(Number) as [number, number, number];

  const naiveUtc = Date.UTC(year, month - 1, day, hours, minutes, 0, 0);
  const guess = new Date(naiveUtc - zoneOffsetMinutes(now, timeZone) * 60_000);
  const resolved = new Date(naiveUtc - zoneOffsetMinutes(guess, timeZone) * 60_000);

  // A spawn being set is always the next upcoming one. Past ⇒ the user meant
  // tomorrow (e.g. setting tonight's 11:30 PM spawn shortly after midnight).
  if (resolved.getTime() < now.getTime()) {
    return new Date(resolved.getTime() + 24 * 60 * 60 * 1000);
  }

  return resolved;
}

/** Human-readable countdown, e.g. "2h 14m". Returns null once elapsed. */
export function formatRemaining(target: Date, now: Date = new Date()): string | null {
  const ms = target.getTime() - now.getTime();
  if (ms <= 0) return null;

  const totalMinutes = Math.floor(ms / 60_000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/** Which day-bucket a spawn falls into, in the guild's zone. */
export type DayBucket = "Today" | "Tomorrow" | "Future";

export function dayBucket(target: Date, timeZone: string, now: Date = new Date()): DayBucket {
  const dayKey = (d: Date) =>
    new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" })
      .format(d);

  const todayKey = dayKey(now);
  const tomorrowKey = dayKey(new Date(now.getTime() + 24 * 60 * 60 * 1000));
  const targetKey = dayKey(target);

  if (targetKey === todayKey) return "Today";
  if (targetKey === tomorrowKey) return "Tomorrow";
  return "Future";
}
