import { describe, expect, it, vi } from "vitest";
import { BossService } from "./boss.service.js";
import type { AliasRepository, AliasRow } from "../repositories/alias.repository.js";
import type { BossRepository } from "../repositories/boss.repository.js";
import { UnknownBossError } from "../utils/errors.js";

const SERVER_ID = "srv1";

function makeService(aliases: AliasRow[] = []) {
  const aliasRepo = {
    listForServer: vi.fn().mockResolvedValue(aliases),
    upsert: vi.fn(),
    remove: vi.fn(),
  } as unknown as AliasRepository;

  const bossRepo = {
    listUpcoming: vi.fn().mockResolvedValue([]),
    getFactionGuildIds: vi.fn().mockResolvedValue([]),
    findLiveSchedule: vi.fn(),
    listCommitments: vi.fn(),
  } as unknown as BossRepository;

  return { service: new BossService(bossRepo, aliasRepo), aliasRepo, bossRepo };
}

describe("resolveBossName", () => {
  it("resolves an exact name", async () => {
    const { service } = makeService();
    expect(await service.resolveBossName("Venatus", SERVER_ID)).toBe("Venatus");
  });

  it("is case-insensitive", async () => {
    const { service } = makeService();
    expect(await service.resolveBossName("vEnAtUs", SERVER_ID)).toBe("Venatus");
  });

  it("resolves multi-word names", async () => {
    const { service } = makeService();
    expect(await service.resolveBossName("lady dalia", SERVER_ID)).toBe("Lady Dalia");
  });

  it("resolves a unique prefix", async () => {
    const { service } = makeService();
    // "vio" uniquely identifies Viorent.
    expect(await service.resolveBossName("vio", SERVER_ID)).toBe("Viorent");
  });

  it("rejects an ambiguous prefix instead of guessing", async () => {
    const { service } = makeService();
    // "la" matches both Lady Dalia and Larba — picking one would be a coin flip.
    await expect(service.resolveBossName("la", SERVER_ID)).rejects.toThrow(/No boss matches/i);
  });

  it("resolves a global alias", async () => {
    // The brief's `!spawn baron` — a nickname with no registry entry.
    const { service } = makeService([
      { alias: "baron", bossName: "Baron Baraudmore", discordServerId: null },
    ]);

    expect(await service.resolveBossName("baron", SERVER_ID)).toBe("Baron Baraudmore");
  });

  it("lets a server alias override a global one", async () => {
    const { service } = makeService([
      { alias: "boss", bossName: "Venatus", discordServerId: null },
      { alias: "boss", bossName: "Ego", discordServerId: SERVER_ID },
    ]);

    expect(await service.resolveBossName("boss", SERVER_ID)).toBe("Ego");
  });

  it("normalizes an alias to the registry's canonical casing", async () => {
    const { service } = makeService([
      { alias: "ven", bossName: "venatus", discordServerId: null },
    ]);

    // Stored lowercase, but the kill path needs the exact registry name.
    expect(await service.resolveBossName("ven", SERVER_ID)).toBe("Venatus");
  });

  it("ignores an alias pointing at a boss that no longer exists", async () => {
    const { service } = makeService([
      { alias: "ghost", bossName: "Deleted Boss", discordServerId: SERVER_ID },
    ]);

    await expect(service.resolveBossName("ghost", SERVER_ID)).rejects.toThrow(/No boss matches/i);
  });

  it("rejects empty input", async () => {
    const { service } = makeService();
    await expect(service.resolveBossName("   ", SERVER_ID)).rejects.toThrow();
  });

  it("suggests near-misses on a typo", async () => {
    const { service } = makeService();

    // "natus" is a substring of Venatus, so the fuzzy fallback should offer it.
    // Suggestions live on `hint` (rendered as the embed's description), not in
    // `message` — assert on the field the user actually reads.
    const error = await service
      .resolveBossName("natus", SERVER_ID)
      .then(() => null)
      .catch((e: unknown) => e as UnknownBossError);

    expect(error).toBeInstanceOf(UnknownBossError);
    expect(error?.message).toMatch(/No boss matches/i);
    expect(error?.hint).toMatch(/Venatus/);
  });

  it("offers the candidates when a prefix is ambiguous", async () => {
    const { service } = makeService();

    const error = await service
      .resolveBossName("la", SERVER_ID)
      .then(() => null)
      .catch((e: unknown) => e as UnknownBossError);

    // Both prefix matches should be named so the user can disambiguate.
    expect(error?.hint).toMatch(/Lady Dalia/);
    expect(error?.hint).toMatch(/Larba/);
  });
});

describe("listUpcoming", () => {
  it("marks a boss whose spawn time has passed as live", async () => {
    const now = new Date("2026-07-17T12:00:00Z");
    const { service, bossRepo } = makeService();

    vi.mocked(bossRepo.listUpcoming).mockResolvedValue([
      {
        scheduleId: "s1",
        bossName: "Venatus",
        // Spawned 10 minutes ago — inside the live grace window.
        spawnTime: new Date("2026-07-17T11:50:00Z"),
        location: "Corrupted Basin",
        status: "SPAWNED",
        guildTurn: "Alpha",
        guildId: "g1",
      },
    ]);

    const [spawn] = await service.listUpcoming({ guildId: "g1", now });

    expect(spawn?.live).toBe(true);
    expect(spawn?.liveElapsedText).toBeTruthy();
  });

  it("reports a countdown for a future spawn", async () => {
    const now = new Date("2026-07-17T12:00:00Z");
    const { service, bossRepo } = makeService();

    vi.mocked(bossRepo.listUpcoming).mockResolvedValue([
      {
        scheduleId: "s1",
        bossName: "Venatus",
        spawnTime: new Date("2026-07-17T14:00:00Z"),
        location: "Corrupted Basin",
        status: "UPCOMING",
        guildTurn: null,
        guildId: "g1",
      },
    ]);

    const [spawn] = await service.listUpcoming({ guildId: "g1", now });

    expect(spawn?.live).toBe(false);
    expect(spawn?.timerText).toBe("02:00:00");
  });
});
