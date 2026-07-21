import { describe, expect, it, vi } from "vitest";
import { BossService } from "./boss.service.js";
import type { AliasRepository, AliasRow } from "../repositories/alias.repository.js";
import type { BossRepository } from "../repositories/boss.repository.js";
import { UnknownBossError } from "../utils/errors.js";
import { services as core } from "@guild/core";

vi.mock("@guild/core", () => ({
  services: {
    dashboard: { markBossRotationKilledByName: vi.fn() },
    equipment: { getDropsCatalog: vi.fn().mockResolvedValue({ items: [] }) },
    storage: { addDropsToStorage: vi.fn() },
  },
}));

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

describe("matchBossAndItem", () => {
  it("splits an exact single-word boss name from a trailing item", async () => {
    const { service } = makeService();
    const result = await service.matchBossAndItem(["Livera", "Pernox", "Bow"], SERVER_ID);
    expect(result).toEqual({ bossName: "Livera", itemDrops: ["Pernox Bow"] });
  });

  it("splits a two-word boss name from a trailing item", async () => {
    const { service } = makeService();
    const result = await service.matchBossAndItem(
      ["Baron", "Baraudmore", "Pernox", "Bow"],
      SERVER_ID,
    );
    expect(result).toEqual({ bossName: "Baron Baraudmore", itemDrops: ["Pernox Bow"] });
  });

  it("splits on a configured alias", async () => {
    const { service } = makeService([
      { alias: "baron", bossName: "Baron Baraudmore", discordServerId: null },
    ]);
    const result = await service.matchBossAndItem(["baron", "Pernox", "Bow"], SERVER_ID);
    expect(result).toEqual({ bossName: "Baron Baraudmore", itemDrops: ["Pernox Bow"] });
  });

  it("splits multiple comma-separated items into an array", async () => {
    const { service } = makeService();
    const result = await service.matchBossAndItem(
      ["Livera", "Pernox", "Bow,", "Temporal", "Fragment", ",", "Iron", "Ore"],
      SERVER_ID,
    );
    expect(result).toEqual({
      bossName: "Livera",
      itemDrops: ["Pernox Bow", "Temporal Fragment", "Iron Ore"],
    });
  });

  it("trims whitespace and drops empty entries from a comma list", async () => {
    const { service } = makeService();
    const result = await service.matchBossAndItem(
      ["Livera", "Pernox", "Bow", ",,", "Iron", "Ore", ","],
      SERVER_ID,
    );
    expect(result).toEqual({ bossName: "Livera", itemDrops: ["Pernox Bow", "Iron Ore"] });
  });

  it("has no item when the boss name consumes every token", async () => {
    const { service } = makeService();
    const result = await service.matchBossAndItem(["Lady", "Dalia"], SERVER_ID);
    expect(result).toEqual({ bossName: "Lady Dalia", itemDrops: undefined });
  });

  it("falls back to fuzzy/prefix matching (boss-only) when no exact split is found", async () => {
    const { service } = makeService();
    // "vio" is not an exact/alias match at any split point, so this can only
    // resolve via resolveBossName's unique-prefix fallback — no item.
    const result = await service.matchBossAndItem(["vio"], SERVER_ID);
    expect(result).toEqual({ bossName: "Viorent" });
  });
});

describe("matchDropItem", () => {
  const catalogItem = {
    type: "Weapon",
    slotType: "weapon",
    category: "Sword",
    rarity: "LEGEND",
    itemName: "Pernox Bow",
    bucket: "drops",
    path: "weapon/pernox-bow.png",
    iconUrl: "https://example.test/pernox-bow.png",
  };

  it("matches an exact (case-insensitive) catalog item", async () => {
    vi.mocked(core.equipment.getDropsCatalog).mockResolvedValue({ items: [catalogItem] });
    const { service } = makeService();

    const match = await service.matchDropItem("pernox bow");
    expect(match).toEqual({
      bucket: "drops",
      path: "weapon/pernox-bow.png",
      itemName: "Pernox Bow",
      iconUrl: "https://example.test/pernox-bow.png",
    });
  });

  it("matches a full weapon name so the stored drop keeps its catalog icon", async () => {
    vi.mocked(core.equipment.getDropsCatalog).mockResolvedValue({
      items: [
        {
          type: "Weapon",
          slotType: "weapon",
          category: "Bow",
          rarity: "LEGEND",
          itemName: "Innis Bow",
          bucket: "WeapBow",
          path: "Legend/Innis.png",
          iconUrl: "https://example.test/innis-bow.png",
        },
      ],
    });
    const { service } = makeService();

    const match = await service.matchDropItem("Innis Bow");
    expect(match).toEqual({
      bucket: "WeapBow",
      path: "Legend/Innis.png",
      itemName: "Innis Bow",
      iconUrl: "https://example.test/innis-bow.png",
    });
  });

  it("accepts legacy compact filename aliases but returns the full catalog name", async () => {
    vi.mocked(core.equipment.getDropsCatalog).mockResolvedValue({
      items: [
        {
          type: "Weapon",
          slotType: "weapon",
          category: "Greatsword",
          rarity: "LEGEND",
          itemName: "Illiana Greatsword",
          bucket: "WeapGS",
          path: "Legend/IllianaGS.png",
          iconUrl: "https://example.test/illiana-greatsword.png",
        },
      ],
    });
    const { service } = makeService();

    const match = await service.matchDropItem("IllianaGS");
    expect(match).toEqual({
      bucket: "WeapGS",
      path: "Legend/IllianaGS.png",
      itemName: "Illiana Greatsword",
      iconUrl: "https://example.test/illiana-greatsword.png",
    });
  });

  it("does not match a generic weapon type without the item family name", async () => {
    vi.mocked(core.equipment.getDropsCatalog).mockResolvedValue({
      items: [
        {
          type: "Weapon",
          slotType: "weapon",
          category: "Bow",
          rarity: "LEGEND",
          itemName: "Innis Bow",
          bucket: "WeapBow",
          path: "Legend/Innis.png",
          iconUrl: "https://example.test/innis-bow.png",
        },
      ],
    });
    const { service } = makeService();

    await expect(service.matchDropItem("Bow")).resolves.toBeNull();
  });

  it("returns null when nothing in the catalog is close enough", async () => {
    vi.mocked(core.equipment.getDropsCatalog).mockResolvedValue({ items: [catalogItem] });
    const { service } = makeService();

    const match = await service.matchDropItem("completely unrelated gizmo");
    expect(match).toBeNull();
  });
});

describe("listDropItemNames", () => {
  const catalog = [
    {
      type: "Weapon",
      slotType: "weapon",
      category: "Greatsword",
      rarity: "LEGEND",
      itemName: "Serus Greatsword",
      bucket: "drops",
      path: "weapon/serus-greatsword.png",
      iconUrl: "https://example.test/serus-greatsword.png",
    },
    {
      type: "Armor",
      slotType: "armor",
      category: "Plate",
      rarity: "EPIC",
      itemName: "Ancient Boots",
      bucket: "drops",
      path: "armor/ancient-boots.png",
      iconUrl: "https://example.test/ancient-boots.png",
    },
  ];

  it("returns sorted item names with display metadata", async () => {
    vi.mocked(core.equipment.getDropsCatalog).mockResolvedValue({ items: catalog });
    const { service } = makeService();

    await expect(service.listDropItemNames()).resolves.toEqual([
      { itemName: "Ancient Boots", type: "Armor", category: "Plate", rarity: "EPIC" },
      { itemName: "Serus Greatsword", type: "Weapon", category: "Greatsword", rarity: "LEGEND" },
    ]);
  });

  it("filters by item name, type, category, or rarity", async () => {
    vi.mocked(core.equipment.getDropsCatalog).mockResolvedValue({ items: catalog });
    const { service } = makeService();

    await expect(service.listDropItemNames("legend")).resolves.toEqual([
      { itemName: "Serus Greatsword", type: "Weapon", category: "Greatsword", rarity: "LEGEND" },
    ]);
  });
});

describe("recordKill", () => {
  it("does not add typed fallback drops when the boss kill was already logged", async () => {
    vi.mocked(core.equipment.getDropsCatalog).mockResolvedValue({ items: [] });
    vi.mocked(core.dashboard.markBossRotationKilledByName).mockResolvedValue({
      schedule: {
        id: "killed1",
        bossName: "Livera",
        killedAt: "2026-07-21T06:00:00.000Z",
      },
      nextSchedule: null,
      alreadyLogged: true,
    } as never);
    const { service } = makeService();

    const result = await service.recordKill({
      guildId: "g1",
      bossName: "Livera",
      killedAt: new Date("2026-07-21T06:05:00.000Z"),
      actorId: "u1",
      itemDrops: ["Unmatched Drop"],
    });

    expect(result.alreadyLogged).toBe(true);
    expect(result.drops).toEqual([]);
    expect(core.storage.addDropsToStorage).not.toHaveBeenCalled();
  });
});
