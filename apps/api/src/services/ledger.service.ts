import { prisma, type LedgerEntry, Prisma } from "@guild/db";

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

/**
 * Append a single entry to the immutable ledger.
 * Uses idempotency key to prevent double-crediting on retries.
 * Returns the existing entry if the idempotency key already exists.
 */
export async function createLedgerEntry(
  input: CreateLedgerEntryInput,
): Promise<LedgerEntry> {
  // Check idempotency — if this key already exists, return existing entry
  const existing = await prisma.ledgerEntry.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
  });

  if (existing) {
    return existing;
  }

  return prisma.ledgerEntry.create({
    data: {
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
    },
  });
}

/**
 * Compute the current balance for an account by summing ledger entries.
 * Balance = SUM(CREDITs) - SUM(DEBITs)
 * This is the ONLY way to get a balance — never from a stored column.
 */
export async function getBalance(
  accountType: "MEMBER" | "GUILD_FUND" | "TAX",
  accountId: string,
  currency: string,
  guildId: string,
): Promise<bigint> {
  const result = await prisma.ledgerEntry.groupBy({
    by: ["entryType"],
    where: {
      accountType,
      accountId,
      currency,
      guildId,
    },
    _sum: {
      amount: true,
    },
  });

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
export async function getTransactionHistory(
  accountType: "MEMBER" | "GUILD_FUND" | "TAX",
  accountId: string,
  currency: string,
  guildId: string,
  page: number = 1,
  pageSize: number = 20,
): Promise<{ entries: LedgerEntry[]; total: number }> {
  const skip = (page - 1) * pageSize;

  const [entries, total] = await Promise.all([
    prisma.ledgerEntry.findMany({
      where: {
        accountType,
        accountId,
        currency,
        guildId,
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
    }),
    prisma.ledgerEntry.count({
      where: {
        accountType,
        accountId,
        currency,
        guildId,
      },
    }),
  ]);

  return { entries, total };
}
