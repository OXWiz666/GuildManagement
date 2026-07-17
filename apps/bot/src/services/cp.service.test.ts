import { describe, expect, it, vi } from "vitest";
import { CpService } from "./cp.service.js";
import type { CpRepository } from "../repositories/cp.repository.js";

/** Minimal fake — the service only touches what each test exercises. */
function makeService(overrides: Partial<CpRepository> = {}) {
  const repo = {
    getProfile: vi.fn(),
    updateCp: vi.fn(),
    leaderboard: vi.fn(),
    getRank: vi.fn().mockResolvedValue(1),
    history: vi.fn(),
    stats: vi.fn(),
    growthSince: vi.fn(),
    writeSnapshot: vi.fn(),
    ...overrides,
  } as unknown as CpRepository;

  return { service: new CpService(repo), repo };
}

describe("parseCpInput", () => {
  const { service } = makeService();

  it("accepts a plain integer", () => {
    expect(service.parseCpInput("985000")).toBe(985_000);
  });

  it("accepts separators players copy from the game UI", () => {
    expect(service.parseCpInput("985,000")).toBe(985_000);
    expect(service.parseCpInput("985 000")).toBe(985_000);
    expect(service.parseCpInput("1_250_000")).toBe(1_250_000);
  });

  it("trims surrounding whitespace", () => {
    expect(service.parseCpInput("  42  ")).toBe(42);
  });

  it("accepts zero", () => {
    expect(service.parseCpInput("0")).toBe(0);
  });

  it("rejects negatives", () => {
    // The minus sign fails the digits-only test before range checking.
    expect(() => service.parseCpInput("-500")).toThrow(/valid Combat Power/i);
  });

  it("rejects decimals", () => {
    expect(() => service.parseCpInput("985.5")).toThrow(/valid Combat Power/i);
  });

  it("rejects non-numeric input", () => {
    for (const bad of ["abc", "", "9e5", "985k", "NaN", "Infinity"]) {
      expect(() => service.parseCpInput(bad)).toThrow();
    }
  });

  it("rejects values above the configured maximum", () => {
    // Default CP_MAX_VALUE is 100,000,000.
    expect(() => service.parseCpInput("100000001")).toThrow(/maximum/i);
  });

  it("rejects integers beyond the safe range rather than silently rounding", () => {
    // All digits, so the regex passes — the safe-integer guard is what catches
    // it. Without that, Number() would round and store a wrong value.
    expect(() => service.parseCpInput("99999999999999999999")).toThrow(/too large/i);
  });
});

describe("updateCp", () => {
  it("reports changed=false when the value is unchanged", async () => {
    // The repository returns null to signal a no-op write.
    const { service } = makeService({
      updateCp: vi.fn().mockResolvedValue(null),
      getRank: vi.fn().mockResolvedValue(3),
    } as Partial<CpRepository>);

    const result = await service.updateCp({
      memberId: "m1",
      guildId: "g1",
      userId: "u1",
      rawValue: "500000",
      actorId: "u1",
      actorDiscordId: "d1",
    });

    expect(result.changed).toBe(false);
    expect(result.delta).toBe(0);
    expect(result.newCp).toBe(500_000);
  });

  it("returns the delta and rank on a real change", async () => {
    const { service } = makeService({
      updateCp: vi.fn().mockResolvedValue({ oldCp: 900_000, newCp: 985_000, delta: 85_000 }),
      getRank: vi.fn().mockResolvedValue(2),
    } as Partial<CpRepository>);

    const result = await service.updateCp({
      memberId: "m1",
      guildId: "g1",
      userId: "u1",
      rawValue: "985,000",
      actorId: "u1",
      actorDiscordId: "d1",
    });

    expect(result).toMatchObject({ oldCp: 900_000, newCp: 985_000, delta: 85_000, rank: 2, changed: true });
  });

  it("validates before writing", async () => {
    const updateCp = vi.fn();
    const { service } = makeService({ updateCp } as Partial<CpRepository>);

    await expect(
      service.updateCp({
        memberId: "m1",
        guildId: "g1",
        userId: "u1",
        rawValue: "not-a-number",
        actorId: "u1",
        actorDiscordId: "d1",
      }),
    ).rejects.toThrow();

    // The bad value must never reach the database.
    expect(updateCp).not.toHaveBeenCalled();
  });
});

describe("leaderboard", () => {
  it("converts 1-based pages to offsets", async () => {
    const leaderboard = vi.fn().mockResolvedValue({ rows: [], total: 0 });
    const { service } = makeService({ leaderboard } as Partial<CpRepository>);

    await service.leaderboard("g1", 3, 10);

    expect(leaderboard).toHaveBeenCalledWith({ guildId: "g1", offset: 20, limit: 10 });
  });

  it("clamps non-positive pages to page 1 rather than a negative offset", async () => {
    const leaderboard = vi.fn().mockResolvedValue({ rows: [], total: 0 });
    const { service } = makeService({ leaderboard } as Partial<CpRepository>);

    await service.leaderboard("g1", 0, 10);

    // Prisma throws on a negative skip — this guard is why it can't happen.
    expect(leaderboard).toHaveBeenCalledWith({ guildId: "g1", offset: 0, limit: 10 });
  });

  it("reports at least one page even when empty", async () => {
    const leaderboard = vi.fn().mockResolvedValue({ rows: [], total: 0 });
    const { service } = makeService({ leaderboard } as Partial<CpRepository>);

    const result = await service.leaderboard("g1", 1, 10);
    expect(result.totalPages).toBe(1);
  });
});
