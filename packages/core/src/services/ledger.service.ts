import { type LedgerEntry, Prisma } from "@guild/db";
import { ILedgerRepository, PrismaLedgerRepository } from "../repositories/ledger.repository";

interface CreateLedgerEntryInput {
  guildId: string;
  accountType: "MEMBER" | "GUILD_FUND" | "TAX";
  accountId: string;
  currency: string;
  amount: bigint; // Integer cents/smallest unit — NEVER float
  entryType: "CREDIT" | "DEBIT";
  referenceType: string;
  referenceId: string;
  idempotencyKey: string;
  actorId: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

export class LedgerService {
  constructor(private ledgerRepo: ILedgerRepository) {}

  /**
   * Append a single entry to the immutable ledger.
   * Uses idempotency key to prevent double-crediting on retries.
   * Returns the existing entry if the idempotency key already exists.
   */
  async createLedgerEntry(input: CreateLedgerEntryInput): Promise<LedgerEntry> {
    // Check idempotency — if this key already exists, return existing entry
    const existing = await this.ledgerRepo.findUniqueByIdempotencyKey(input.idempotencyKey);

    if (existing) {
      return existing;
    }

    return this.ledgerRepo.createEntry({
      guildId: input.guildId,
      accountType: input.accountType,
      accountId: input.accountId,
      currency: input.currency,
      amount: input.amount,
      entryType: input.entryType,
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      idempotencyKey: input.idempotencyKey,
      actorId: input.actorId,
      description: input.description ?? null,
      metadata: (input.metadata as Prisma.InputJsonValue) ?? Prisma.DbNull,
    });
  }

  /**
   * Compute the current balance for an account by summing ledger entries.
   * Balance = SUM(CREDITs) - SUM(DEBITs)
   * This is the ONLY way to get a balance — never from a stored column.
   */
  async getBalance(
    accountType: "MEMBER" | "GUILD_FUND" | "TAX",
    accountId: string,
    currency: string,
    guildId: string,
  ): Promise<bigint> {
    const result = await this.ledgerRepo.groupByEntryType(
      accountType,
      accountId,
      currency,
      guildId,
    );

    let credits = 0n;
    let debits = 0n;

    for (const row of result) {
      if (row.entryType === "CREDIT") {
        credits = row._sum.amount ?? 0n;
      } else {
        debits = row._sum.amount ?? 0n;
      }
    }

    return credits - debits;
  }

  /**
   * Get paginated transaction history for an account.
   */
  async getTransactionHistory(
    accountType: "MEMBER" | "GUILD_FUND" | "TAX",
    accountId: string,
    currency: string,
    guildId: string,
    page: number = 1,
    pageSize: number = 20,
  ): Promise<{ entries: LedgerEntry[]; total: number }> {
    const skip = (page - 1) * pageSize;
    const whereCondition: Prisma.LedgerEntryWhereInput = {
      accountType,
      accountId,
      currency,
      guildId,
    };

    const [entries, total] = await Promise.all([
      this.ledgerRepo.findManyEntries(whereCondition, skip, pageSize),
      this.ledgerRepo.countEntries(whereCondition),
    ]);

    return { entries, total };
  }
}

// Runtime concrete singleton
const prismaLedgerRepo = new PrismaLedgerRepository();
export const ledgerService = new LedgerService(prismaLedgerRepo);

// Backward-compatible exports
export const createLedgerEntry = (input: CreateLedgerEntryInput): Promise<LedgerEntry> =>
  ledgerService.createLedgerEntry(input);

export const getBalance = (
  accountType: "MEMBER" | "GUILD_FUND" | "TAX",
  accountId: string,
  currency: string,
  guildId: string,
): Promise<bigint> =>
  ledgerService.getBalance(accountType, accountId, currency, guildId);

export const getTransactionHistory = (
  accountType: "MEMBER" | "GUILD_FUND" | "TAX",
  accountId: string,
  currency: string,
  guildId: string,
  page: number = 1,
  pageSize: number = 20,
): Promise<{ entries: LedgerEntry[]; total: number }> =>
  ledgerService.getTransactionHistory(accountType, accountId, currency, guildId, page, pageSize);
