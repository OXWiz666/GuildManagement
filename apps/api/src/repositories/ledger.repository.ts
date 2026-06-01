import { prisma, type LedgerEntry, Prisma } from "@guild/db";

export interface ILedgerRepository {
  findUniqueByIdempotencyKey(key: string): Promise<LedgerEntry | null>;
  createEntry(data: {
    guildId: string;
    accountType: "MEMBER" | "GUILD_FUND" | "TAX";
    accountId: string;
    currency: string;
    amount: bigint;
    entryType: "CREDIT" | "DEBIT";
    referenceType: string;
    referenceId: string;
    idempotencyKey: string;
    actorId: string;
    description: string | null;
    metadata: Prisma.InputJsonValue;
  }): Promise<LedgerEntry>;
  groupByEntryType(
    accountType: "MEMBER" | "GUILD_FUND" | "TAX",
    accountId: string,
    currency: string,
    guildId: string,
  ): Promise<Array<{ entryType: "CREDIT" | "DEBIT"; _sum: { amount: bigint | null } }>>;
  findManyEntries(
    where: Prisma.LedgerEntryWhereInput,
    skip: number,
    take: number,
  ): Promise<LedgerEntry[]>;
  countEntries(where: Prisma.LedgerEntryWhereInput): Promise<number>;
}

export class PrismaLedgerRepository implements ILedgerRepository {
  async findUniqueByIdempotencyKey(key: string): Promise<LedgerEntry | null> {
    return prisma.ledgerEntry.findUnique({
      where: { idempotencyKey: key },
    });
  }

  async createEntry(data: {
    guildId: string;
    accountType: "MEMBER" | "GUILD_FUND" | "TAX";
    accountId: string;
    currency: string;
    amount: bigint;
    entryType: "CREDIT" | "DEBIT";
    referenceType: string;
    referenceId: string;
    idempotencyKey: string;
    actorId: string;
    description: string | null;
    metadata: Prisma.InputJsonValue;
  }): Promise<LedgerEntry> {
    return prisma.ledgerEntry.create({
      data: {
        guildId: data.guildId,
        accountType: data.accountType,
        accountId: data.accountId,
        currency: data.currency,
        amount: data.amount,
        entryType: data.entryType,
        referenceType: data.referenceType,
        referenceId: data.referenceId,
        idempotencyKey: data.idempotencyKey,
        actorId: data.actorId,
        description: data.description,
        metadata: data.metadata,
      },
    });
  }

  async groupByEntryType(
    accountType: "MEMBER" | "GUILD_FUND" | "TAX",
    accountId: string,
    currency: string,
    guildId: string,
  ): Promise<Array<{ entryType: "CREDIT" | "DEBIT"; _sum: { amount: bigint | null } }>> {
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
    return result as any[];
  }

  async findManyEntries(
    where: Prisma.LedgerEntryWhereInput,
    skip: number,
    take: number,
  ): Promise<LedgerEntry[]> {
    return prisma.ledgerEntry.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take,
    });
  }

  async countEntries(where: Prisma.LedgerEntryWhereInput): Promise<number> {
    return prisma.ledgerEntry.count({
      where,
    });
  }
}
