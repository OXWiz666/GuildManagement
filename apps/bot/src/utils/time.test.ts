import { describe, expect, it } from "vitest";
import { dayBucket, discordTimestamp, formatRemaining, resolveWallClock } from "./time.js";

// Singapore is UTC+8 with no DST — the game's server time, and the bot default.
const SGT = "Asia/Singapore";
// Sydney observes DST, which is what makes the offset-at-instant logic matter.
const SYDNEY = "Australia/Sydney";

describe("resolveWallClock", () => {
  it("interprets HH:MM as wall-clock time in the target zone", () => {
    // 2026-07-17 14:00 SGT === 06:00 UTC.
    const now = new Date("2026-07-17T14:30:00Z"); // 22:30 SGT
    const result = resolveWallClock("14:00", SGT, now);

    expect(result.toISOString()).toBe("2026-07-17T06:00:00.000Z");
  });

  it("uses the target zone's calendar date, not the host's", () => {
    // 23:30 UTC on the 17th is already 07:30 on the 18th in Singapore.
    // "07:00" must resolve to the 18th SGT (23:00 UTC on the 17th), NOT the 17th.
    const now = new Date("2026-07-17T23:30:00Z");
    const result = resolveWallClock("07:00", SGT, now);

    expect(result.toISOString()).toBe("2026-07-17T23:00:00.000Z");
  });

  it("rolls back a day when the time would otherwise be in the future", () => {
    // 00:10 SGT on the 18th; "23:50" means last night, not tonight.
    const now = new Date("2026-07-17T16:10:00Z"); // 00:10 SGT on the 18th
    const result = resolveWallClock("23:50", SGT, now);

    // 23:50 SGT on the 17th === 15:50 UTC on the 17th — 20 minutes ago.
    expect(result.toISOString()).toBe("2026-07-17T15:50:00.000Z");
    expect(result.getTime()).toBeLessThan(now.getTime());
  });

  it("never returns a future instant", () => {
    const now = new Date("2026-07-17T02:00:00Z"); // 10:00 SGT
    for (const input of ["09:00", "10:00", "11:00", "23:59", "00:00"]) {
      const result = resolveWallClock(input, SGT, now);
      expect(result.getTime()).toBeLessThanOrEqual(now.getTime());
    }
  });

  it("honors a DST offset (Sydney, +11 in January)", () => {
    // Australia/Sydney is UTC+11 during southern summer.
    const now = new Date("2026-01-15T12:00:00Z"); // 23:00 AEDT
    const result = resolveWallClock("20:00", SYDNEY, now);

    expect(result.toISOString()).toBe("2026-01-15T09:00:00.000Z");
  });

  it("honors a non-DST offset (Sydney, +10 in July)", () => {
    // Same zone, six months later: UTC+10.
    const now = new Date("2026-07-15T12:00:00Z"); // 22:00 AEST
    const result = resolveWallClock("20:00", SYDNEY, now);

    expect(result.toISOString()).toBe("2026-07-15T10:00:00.000Z");
  });

  it("accepts single-digit hours", () => {
    const now = new Date("2026-07-17T14:30:00Z");
    expect(resolveWallClock("9:05", SGT, now).toISOString()).toBe("2026-07-17T01:05:00.000Z");
  });

  it("rejects malformed input", () => {
    const now = new Date("2026-07-17T14:30:00Z");
    for (const bad of ["", "abc", "9", "25:00", "12:60", "12:5", "1200", "12-30"]) {
      expect(() => resolveWallClock(bad, SGT, now)).toThrow();
    }
  });
});

describe("formatRemaining", () => {
  const now = new Date("2026-07-17T00:00:00Z");

  it("formats minutes under an hour", () => {
    expect(formatRemaining(new Date("2026-07-17T00:45:00Z"), now)).toBe("45m");
  });

  it("formats hours and minutes", () => {
    expect(formatRemaining(new Date("2026-07-17T02:14:00Z"), now)).toBe("2h 14m");
  });

  it("formats days and hours", () => {
    expect(formatRemaining(new Date("2026-07-19T05:00:00Z"), now)).toBe("2d 5h");
  });

  it("returns null once elapsed", () => {
    expect(formatRemaining(new Date("2026-07-16T23:59:00Z"), now)).toBeNull();
    expect(formatRemaining(now, now)).toBeNull();
  });
});

describe("dayBucket", () => {
  // 2026-07-17 20:00 SGT.
  const now = new Date("2026-07-17T12:00:00Z");

  it("buckets same-day-in-zone as Today", () => {
    expect(dayBucket(new Date("2026-07-17T15:00:00Z"), SGT, now)).toBe("Today");
  });

  it("buckets next-day-in-zone as Tomorrow", () => {
    // 09:00 SGT on the 18th.
    expect(dayBucket(new Date("2026-07-18T01:00:00Z"), SGT, now)).toBe("Tomorrow");
  });

  it("buckets beyond tomorrow as Future", () => {
    expect(dayBucket(new Date("2026-07-20T01:00:00Z"), SGT, now)).toBe("Future");
  });

  it("buckets by the guild's zone, not UTC", () => {
    // 17:00 UTC on the 17th is already 01:00 on the 18th in Singapore, so a
    // UTC-based implementation would wrongly say "Today".
    expect(dayBucket(new Date("2026-07-17T17:00:00Z"), SGT, now)).toBe("Tomorrow");
  });
});

describe("discordTimestamp", () => {
  it("emits Discord's timestamp markup in seconds", () => {
    const date = new Date("2026-07-17T12:00:00Z");
    expect(discordTimestamp(date, "R")).toBe("<t:1784289600:R>");
    expect(discordTimestamp(date, "f")).toBe("<t:1784289600:f>");
  });

  it("defaults to relative style", () => {
    expect(discordTimestamp(new Date("2026-07-17T12:00:00Z"))).toBe("<t:1784289600:R>");
  });
});
