import { prisma, Prisma, type GuildSettings } from "@guild/db";
import { writeAuditLog } from "./audit.service";
import { NotFoundError, BadRequestError } from "../utils/errors";
import { findGuildSettingsByGuildId } from "../lib/guild-settings-schema";

interface CreateLootSaleInput {
  guildId: string;
  bossScheduleId?: string | null;
  itemName: string;
  category: string;
  saleValue: bigint;
  currency: string;
  creatorId: string;
  soldAt?: Date | null;
}

interface LootSaleContext {
  settings: GuildSettings | null;
  attendees: Array<{ userId: string }>;
  memberPoints: Record<string, number>;
  totalPoints: number;
}

/**
 * Resolves the guild settings, confirmed attendees, and (for PRO_RATA) each
 * attendee's DKP total for a loot sale (or a batch of them sharing the same
 * bossScheduleId). These reads don't depend on any individual item's sale
 * value, so a batch resolves this once and reuses it for every item instead
 * of re-fetching per item.
 */
async function resolveLootSaleContext(guildId: string, bossScheduleId?: string | null): Promise<LootSaleContext> {
  const [settings, attendees] = await Promise.all([
    findGuildSettingsByGuildId(guildId),
    bossScheduleId
      ? (async () => {
          const [schedule, records] = await Promise.all([
            prisma.bossSchedule.findUnique({
              where: { id: bossScheduleId },
              select: { id: true },
            }),
            prisma.attendanceRecord.findMany({
              where: {
                status: "CONFIRMED",
                session: { bossScheduleId },
              },
              select: { userId: true },
            }),
          ]);

          if (!schedule) {
            throw new NotFoundError("Boss schedule not found");
          }

          const result = Array.from(new Set(records.map((record) => record.userId))).map((userId) => ({ userId }));

          if (result.length === 0) {
            throw new BadRequestError(
              `No checked-in members found for this boss schedule's attendance session. Cannot distribute loot.`,
            );
          }

          return result;
        })()
      : Promise.resolve([] as Array<{ userId: string }>),
  ]);

  const distributionModel = settings?.activeShareModel ?? "EQUAL";
  const memberPoints: Record<string, number> = {};
  let totalPoints = 0;
  if (attendees.length > 0 && distributionModel === "PRO_RATA") {
    const dkpRows = await prisma.ledgerEntry.groupBy({
      by: ["accountId"],
      where: {
        guildId,
        accountId: { in: attendees.map((member) => member.userId) },
        accountType: "MEMBER",
        referenceType: "ATTENDANCE",
      },
      _sum: { amount: true },
    });

    for (const row of dkpRows) {
      const points = Number(row._sum.amount || 0n);
      memberPoints[row.accountId] = points;
      totalPoints += points;
    }
  }

  return { settings, attendees, memberPoints, totalPoints };
}

async function createLootSaleWithContext(input: CreateLootSaleInput, ctx: LootSaleContext) {
  const { settings, attendees, memberPoints, totalPoints } = ctx;

  const taxRatePercent = settings?.taxRatePercent ?? 10;
  const distributionModel = settings?.activeShareModel ?? "EQUAL";
  const taxAmount = (input.saleValue * BigInt(taxRatePercent)) / 100n;
  const netProfit = input.saleValue - taxAmount;

  const lootSale = await prisma.$transaction(async (tx) => {
    const createdSale = await tx.lootSale.create({
      data: {
        guildId: input.guildId,
        bossScheduleId: input.bossScheduleId || null,
        itemName: input.itemName,
        category: input.category,
        saleValue: input.saleValue,
        taxRatePercent,
        taxAmount,
        netProfit,
        distributionModel,
        currency: input.currency,
        creatorId: input.creatorId,
        // Honor an officer-supplied activity date; otherwise default to now()
        ...(input.soldAt ? { createdAt: input.soldAt } : {}),
      },
    });

    const ledgerEntries: Prisma.LedgerEntryCreateManyInput[] = [];

    if (taxAmount > 0n) {
      ledgerEntries.push({
        guildId: input.guildId,
        accountType: "TAX",
        accountId: input.guildId,
        currency: input.currency,
        amount: taxAmount,
        entryType: "CREDIT",
        referenceType: "BOSS_LOOT_TAX",
        referenceId: createdSale.id,
        idempotencyKey: `TAX-LOOT-${createdSale.id}`,
        actorId: input.creatorId,
        description: `Guild tax accumulated from sale of ${input.itemName} (${taxRatePercent}%)`,
      });
    }

    if (netProfit > 0n) {
      if (attendees.length > 0) {
        if (distributionModel === "PRO_RATA" && totalPoints > 0) {
          let distributed = 0n;
          for (let i = 0; i < attendees.length; i++) {
            const member = attendees[i];
            if (!member) continue;
            const points = memberPoints[member.userId] ?? 0;
            const share = (netProfit * BigInt(points)) / BigInt(totalPoints);
            distributed += share;
            const finalShare = i === attendees.length - 1 ? share + (netProfit - distributed) : share;

            ledgerEntries.push({
              guildId: input.guildId,
              accountType: "MEMBER",
              accountId: member.userId,
              currency: input.currency,
              amount: finalShare,
              entryType: "CREDIT",
              referenceType: "BOSS_LOOT_SHARE",
              referenceId: createdSale.id,
              idempotencyKey: `SHARE-LOOT-${createdSale.id}-${member.userId}`,
              actorId: input.creatorId,
              description: `Pro-rata DKP share payout from ${input.itemName} (${points}/${totalPoints} DKP)`,
            });
          }
        } else {
          const share = netProfit / BigInt(attendees.length);
          const remainder = netProfit % BigInt(attendees.length);
          const description = distributionModel === "PRO_RATA"
            ? `Loot share payout from ${input.itemName} (Pro-rata DKP fallback equal)`
            : `Equal loot share payout from ${input.itemName}`;

          for (let i = 0; i < attendees.length; i++) {
            const member = attendees[i];
            if (!member) continue;
            const finalShare = i === 0 ? share + remainder : share;

            ledgerEntries.push({
              guildId: input.guildId,
              accountType: "MEMBER",
              accountId: member.userId,
              currency: input.currency,
              amount: finalShare,
              entryType: "CREDIT",
              referenceType: "BOSS_LOOT_SHARE",
              referenceId: createdSale.id,
              idempotencyKey: `SHARE-LOOT-${createdSale.id}-${member.userId}`,
              actorId: input.creatorId,
              description,
            });
          }
        }
      } else {
        ledgerEntries.push({
          guildId: input.guildId,
          accountType: "GUILD_FUND",
          accountId: input.guildId,
          currency: input.currency,
          amount: netProfit,
          entryType: "CREDIT",
          referenceType: "BOSS_LOOT_GUILD_FUND",
          referenceId: createdSale.id,
          idempotencyKey: `FUND-LOOT-${createdSale.id}`,
          actorId: input.creatorId,
          description: `General sale proceeds for ${input.itemName} credited to treasury`,
        });
      }
    }

    if (ledgerEntries.length > 0) {
      await tx.ledgerEntry.createMany({
        data: ledgerEntries,
        skipDuplicates: true,
      });
    }

    return createdSale;
  });

  await writeAuditLog({
    actorId: input.creatorId,
    guildId: input.guildId,
    action: "LOOT_ITEM_SOLD",
    target: "LootSale",
    targetId: lootSale.id,
    detail: {
      itemName: input.itemName,
      category: input.category,
      saleValue: input.saleValue.toString(),
      taxAmount: taxAmount.toString(),
      netProfit: netProfit.toString(),
      bossScheduleId: input.bossScheduleId,
      distributionModel,
    },
  });

  return lootSale;
}

export async function createLootSale(input: CreateLootSaleInput) {
  const ctx = await resolveLootSaleContext(input.guildId, input.bossScheduleId);
  return createLootSaleWithContext(input, ctx);
}

interface CreateLootSaleBatchInput {
  guildId: string;
  bossScheduleId?: string | null;
  category: string;
  currency: string;
  creatorId: string;
  soldAt?: Date | null;
  items: Array<{ itemName: string; saleValue: bigint }>;
}

/**
 * Logs many loot items sold from a single activity. Each item is recorded as its
 * own LootSale (so taxes/dividends are split per item), but they share the same
 * activity (bossScheduleId), category, currency and sold date so the registry can
 * group them into one activity row.
 *
 * All items share the same guild settings, attendee list, and (for PRO_RATA)
 * attendee DKP totals, so those reads are resolved once for the whole batch
 * instead of once per item — a 5-item batch previously issued ~10-20 avoidable
 * round trips re-fetching the same rows.
 */
export async function createLootSaleBatch(input: CreateLootSaleBatchInput) {
  if (!input.items || input.items.length === 0) {
    throw new BadRequestError("At least one loot item is required");
  }

  const ctx = await resolveLootSaleContext(input.guildId, input.bossScheduleId);

  const created = [];
  for (const item of input.items) {
    const sale = await createLootSaleWithContext(
      {
        guildId: input.guildId,
        bossScheduleId: input.bossScheduleId ?? null,
        itemName: item.itemName,
        category: input.category,
        saleValue: item.saleValue,
        currency: input.currency,
        creatorId: input.creatorId,
        soldAt: input.soldAt ?? null,
      },
      ctx,
    );
    created.push(sale);
  }
  return created;
}

/**
 * Returns the CONFIRMED attendees (deduped, with in-game names) for a set of boss
 * schedules, keyed by bossScheduleId. Used to display "who was present" on each
 * activity in the registry and the logging modal preview.
 */
export async function getConfirmedAttendeesForSchedules(
  guildId: string,
  scheduleIds: string[],
) {
  const map = new Map<string, Array<{ userId: string; name: string }>>();
  const ids = Array.from(new Set(scheduleIds.filter(Boolean)));
  if (ids.length === 0) return map;

  const records = await prisma.attendanceRecord.findMany({
    where: {
      status: "CONFIRMED",
      session: { bossScheduleId: { in: ids } },
    },
    select: {
      userId: true,
      session: { select: { bossScheduleId: true } },
      user: { select: { displayName: true } },
    },
  });

  const userIds = Array.from(new Set(records.map((r) => r.userId)));
  const members = await prisma.guildMember.findMany({
    where: { guildId, userId: { in: userIds } },
    select: { userId: true, ign: true },
  });
  const ignMap = new Map(members.map((m) => [m.userId, m.ign]));

  for (const r of records) {
    const sid = r.session.bossScheduleId;
    if (!sid) continue;
    const arr = map.get(sid) ?? [];
    if (arr.some((a) => a.userId === r.userId)) continue; // dedupe across sessions
    arr.push({ userId: r.userId, name: ignMap.get(r.userId) || r.user.displayName });
    map.set(sid, arr);
  }

  return map;
}

export async function getLootSales(guildId: string) {
  const sales = await prisma.lootSale.findMany({
    where: { guildId },
    include: {
      bossSchedule: true,
    },
    orderBy: { createdAt: "desc" },
  });

  const scheduleIds = sales
    .map((s) => s.bossScheduleId)
    .filter((id): id is string => Boolean(id));
  const attendeeMap = await getConfirmedAttendeesForSchedules(guildId, scheduleIds);

  return sales.map((s) => ({
    ...s,
    attendees: s.bossScheduleId ? attendeeMap.get(s.bossScheduleId) ?? [] : [],
  }));
}
