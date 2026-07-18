import { describe, expect, it } from "vitest";
import { dedupeKeys } from "./dedupe.js";

/**
 * These properties are the whole contract. The scheduler re-evaluates every
 * 30s and calls dispatch every time; the ONLY thing standing between that and
 * a notification every 30 seconds is the stability of these keys.
 */
describe("dedupeKeys", () => {
  describe("spawnWarning", () => {
    it("is stable across ticks for the same schedule", () => {
      // Same inputs → same key, so tick 2 claims nothing and sends nothing.
      const a = dedupeKeys.spawnWarning("srv1", "sched1");
      const b = dedupeKeys.spawnWarning("srv1", "sched1");
      expect(a).toBe(b);
    });

    it("differs per Discord server", () => {
      // Two servers watching the same faction boss must each get an alert.
      expect(dedupeKeys.spawnWarning("srv1", "sched1")).not.toBe(
        dedupeKeys.spawnWarning("srv2", "sched1"),
      );
    });

    it("differs per schedule, so the next spawn re-warns", () => {
      expect(dedupeKeys.spawnWarning("srv1", "sched1")).not.toBe(
        dedupeKeys.spawnWarning("srv1", "sched2"),
      );
    });

    it("does not collide with the spawn key for the same schedule", () => {
      // A warning and the live alert are distinct events on the same row.
      expect(dedupeKeys.spawnWarning("srv1", "sched1")).not.toBe(
        dedupeKeys.spawn("srv1", "sched1"),
      );
    });
  });

  describe("kill", () => {
    it("is stable for the same kill", () => {
      expect(dedupeKeys.kill("srv1", "sched1", 1_000)).toBe(dedupeKeys.kill("srv1", "sched1", 1_000));
    });

    it("changes when the kill time is corrected", () => {
      // `!editkilltime` restates a fact worth re-announcing.
      expect(dedupeKeys.kill("srv1", "sched1", 1_000)).not.toBe(
        dedupeKeys.kill("srv1", "sched1", 2_000),
      );
    });
  });

  describe("cpReport", () => {
    it("is stable within a bucket", () => {
      expect(dedupeKeys.cpReport("srv1", "2026-07-17-1")).toBe(
        dedupeKeys.cpReport("srv1", "2026-07-17-1"),
      );
    });

    it("changes between buckets", () => {
      expect(dedupeKeys.cpReport("srv1", "2026-07-17-1")).not.toBe(
        dedupeKeys.cpReport("srv1", "2026-07-17-2"),
      );
    });
  });

  it("produces keys that fit the notification_history.dedupe_key column", () => {
    // TEXT is unbounded, but a key long enough to worry about would signal a
    // design mistake (e.g. embedding a whole payload).
    const key = dedupeKeys.kill("123456789012345678", "clx1234567890abcdefghij", Date.now());
    expect(key.length).toBeLessThan(200);
  });
});

/**
 * Mirrors CpMonitor.currentBucket. Kept in the test rather than exported,
 * because the property being verified is "stable within a window, distinct
 * across windows" — not the exact string format.
 */
function bucketFor(now: Date, intervalHours: number): string {
  const date = now.toISOString().slice(0, 10);
  const bucket = Math.floor(now.getUTCHours() / intervalHours);
  return `${date}-${bucket}`;
}

describe("CP report bucketing", () => {
  it("is identical for two times in the same window", () => {
    // 00:05 and 11:55 both fall in the first 12-hour window.
    expect(bucketFor(new Date("2026-07-17T00:05:00Z"), 12)).toBe(
      bucketFor(new Date("2026-07-17T11:55:00Z"), 12),
    );
  });

  it("changes at the window boundary", () => {
    expect(bucketFor(new Date("2026-07-17T11:59:00Z"), 12)).not.toBe(
      bucketFor(new Date("2026-07-17T12:00:00Z"), 12),
    );
  });

  it("changes across midnight", () => {
    expect(bucketFor(new Date("2026-07-17T23:59:00Z"), 12)).not.toBe(
      bucketFor(new Date("2026-07-18T00:00:00Z"), 12),
    );
  });

  it("yields exactly 24/interval buckets a day for divisors of 24", () => {
    // This is why CP_REPORT_INTERVAL_HOURS is validated to divide 24: a
    // non-divisor leaves a short final window that can double-post at midnight.
    for (const hours of [1, 2, 3, 4, 6, 8, 12, 24]) {
      const buckets = new Set<string>();
      for (let h = 0; h < 24; h++) {
        buckets.add(bucketFor(new Date(Date.UTC(2026, 6, 17, h)), hours));
      }
      expect(buckets.size).toBe(24 / hours);
    }
  });

  it("is restart-safe: derived from the clock, not from process state", () => {
    // Two "runs" at different moments in one window agree — so a bot restarted
    // mid-window doesn't re-post the report.
    const first = bucketFor(new Date("2026-07-17T13:00:00Z"), 12);
    const afterRestart = bucketFor(new Date("2026-07-17T18:30:00Z"), 12);
    expect(first).toBe(afterRestart);
  });
});
