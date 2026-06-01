import { describe, it, expect, vi, beforeEach } from "vitest";
import { LedgerService } from "./ledger.service";
import { ILedgerRepository } from "../repositories/ledger.repository";
import { type LedgerEntry } from "@guild/db";

describe("LedgerService", () => {
  let mockLedgerRepo: ILedgerRepository;
  let ledgerService: LedgerService;

  beforeEach(() => {
    mockLedgerRepo = {
      findUniqueByIdempotencyKey: vi.fn(),
      createEntry: vi.fn(),
      groupByEntryType: vi.fn(),
      findManyEntries: vi.fn(),
      countEntries: vi.fn(),
    };
    ledgerService = new LedgerService(mockLedgerRepo);
  });

  describe("createLedgerEntry", () => {
    it("should return the existing entry if the idempotency key already exists", async () => {
      const mockEntry: LedgerEntry = {
        id: "entry-123",
        guildId: "guild-1",
        accountType: "MEMBER",
        accountId: "user-1",
        currency: "PHP",
        amount: 5000n,
        entryType: "CREDIT",
        referenceType: "BOSS_KILL",
        referenceId: "boss-123",
        idempotencyKey: "idem-key-1",
        actorId: "actor-1",
        description: "Test description",
        metadata: null,
        createdAt: new Date(),
      };

      vi.mocked(mockLedgerRepo.findUniqueByIdempotencyKey).mockResolvedValue(mockEntry);

      const result = await ledgerService.createLedgerEntry({
        guildId: "guild-1",
        accountType: "MEMBER",
        accountId: "user-1",
        currency: "PHP",
        amount: 5000n,
        entryType: "CREDIT",
        referenceType: "BOSS_KILL",
        referenceId: "boss-123",
        idempotencyKey: "idem-key-1",
        actorId: "actor-1",
        description: "Test description",
      });

      expect(result).toEqual(mockEntry);
      expect(mockLedgerRepo.findUniqueByIdempotencyKey).toHaveBeenCalledWith("idem-key-1");
      expect(mockLedgerRepo.createEntry).not.toHaveBeenCalled();
    });

    it("should create and return a new entry if the idempotency key does not exist", async () => {
      const mockEntry: LedgerEntry = {
        id: "entry-456",
        guildId: "guild-1",
        accountType: "MEMBER",
        accountId: "user-1",
        currency: "PHP",
        amount: 3000n,
        entryType: "DEBIT",
        referenceType: "WITHDRAWAL",
        referenceId: "req-123",
        idempotencyKey: "idem-key-2",
        actorId: "actor-1",
        description: "Debit test",
        metadata: null,
        createdAt: new Date(),
      };

      vi.mocked(mockLedgerRepo.findUniqueByIdempotencyKey).mockResolvedValue(null);
      vi.mocked(mockLedgerRepo.createEntry).mockResolvedValue(mockEntry);

      const result = await ledgerService.createLedgerEntry({
        guildId: "guild-1",
        accountType: "MEMBER",
        accountId: "user-1",
        currency: "PHP",
        amount: 3000n,
        entryType: "DEBIT",
        referenceType: "WITHDRAWAL",
        referenceId: "req-123",
        idempotencyKey: "idem-key-2",
        actorId: "actor-1",
        description: "Debit test",
      });

      expect(result).toEqual(mockEntry);
      expect(mockLedgerRepo.findUniqueByIdempotencyKey).toHaveBeenCalledWith("idem-key-2");
      expect(mockLedgerRepo.createEntry).toHaveBeenCalled();
    });
  });

  describe("getBalance", () => {
    it("should return 0n if no entries are found", async () => {
      vi.mocked(mockLedgerRepo.groupByEntryType).mockResolvedValue([]);

      const balance = await ledgerService.getBalance("MEMBER", "user-1", "PHP", "guild-1");
      expect(balance).toBe(0n);
    });

    it("should calculate correctly: CREDITs - DEBITs", async () => {
      vi.mocked(mockLedgerRepo.groupByEntryType).mockResolvedValue([
        { entryType: "CREDIT", _sum: { amount: 10000n } },
        { entryType: "DEBIT", _sum: { amount: 4000n } },
      ]);

      const balance = await ledgerService.getBalance("MEMBER", "user-1", "PHP", "guild-1");
      expect(balance).toBe(6000n);
    });

    it("should assume 0n if only CREDITs exist", async () => {
      vi.mocked(mockLedgerRepo.groupByEntryType).mockResolvedValue([
        { entryType: "CREDIT", _sum: { amount: 5000n } },
      ]);

      const balance = await ledgerService.getBalance("MEMBER", "user-1", "PHP", "guild-1");
      expect(balance).toBe(5000n);
    });

    it("should assume 0n if only DEBITs exist (negative balance)", async () => {
      vi.mocked(mockLedgerRepo.groupByEntryType).mockResolvedValue([
        { entryType: "DEBIT", _sum: { amount: 2000n } },
      ]);

      const balance = await ledgerService.getBalance("MEMBER", "user-1", "PHP", "guild-1");
      expect(balance).toBe(-2000n);
    });
  });
});
