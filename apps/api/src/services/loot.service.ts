import { prisma, type LootSale } from "@guild/db";
import { createLedgerEntry } from "./ledger.service";
import { writeAuditLog } from "./audit.service";
import { NotFoundError, BadRequestError } from "../utils/errors";

interface CreateLootSaleInput {
  guildId: string;
  bossScheduleId?: string | null;
  itemName: string;
  category: string;
  saleValue: bigint; // in integer cents
  currency: string;
  creatorId: string;
}

export async function createLootSale(input: CreateLootSaleInput) {
  // 1. Fetch guild settings to find default tax and active model
  const settings = await prisma.guildSettings.findUnique({
    where: { guildId: input.guildId },
  });

  const taxRatePercent = settings?.taxRatePercent ?? 10;
  const distributionModel = settings?.activeShareModel ?? "EQUAL";

  // 2. Compute tax amount and net profit
  const taxAmount = (input.saleValue * BigInt(taxRatePercent)) / 100n;
  const netProfit = input.saleValue - taxAmount;

  let attendees: Array<{ userId: string }> = [];

  // 3. Retrieve attendees if bossScheduleId is provided
  if (input.bossScheduleId) {
    const schedule = await prisma.bossSchedule.findUnique({
      where: { id: input.bossScheduleId },
    });

    if (!schedule) {
      throw new NotFoundError("Boss schedule not found");
    }

    // Gather all confirmed records across any attendance session associated with this boss schedule
    const sessions = await prisma.attendanceSession.findMany({
      where: { bossScheduleId: input.bossScheduleId },
      include: {
        records: {
          where: { status: "CONFIRMED" },
        },
      },
    });

    const attendeeSet = new Set<string>();
    for (const session of sessions) {
      for (const record of session.records) {
        attendeeSet.add(record.userId);
      }
    }

    attendees = Array.from(attendeeSet).map((userId) => ({ userId }));

    if (attendees.length === 0) {
      throw new BadRequestError(
        `No checked-in members found for this boss schedule's attendance session. Cannot distribute loot.`
      );
    }
  }

  // 4. Create the LootSale entry in DB
  const lootSale = await prisma.lootSale.create({
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
    },
  });

  // 5. Ledger entry distributions
  // A. Credit Tax account
  if (taxAmount > 0n) {
    await createLedgerEntry({
      guildId: input.guildId,
      accountType: "TAX",
      accountId: input.guildId,
      currency: input.currency,
      amount: taxAmount,
      entryType: "CREDIT",
      referenceType: "BOSS_LOOT_TAX",
      referenceId: lootSale.id,
      idempotencyKey: `TAX-LOOT-${lootSale.id}`,
      actorId: input.creatorId,
      description: `Guild tax accumulated from sale of ${input.itemName} (${taxRatePercent}%)`,
    });
  }

  // B. Distribute Net Profit
  if (netProfit > 0n) {
    if (attendees.length > 0) {
      if (distributionModel === "PRO_RATA") {
        // Fetch all attendees' total attendance points (DKP) to calculate ratio
        const memberPoints: Record<string, number> = {};
        let totalPoints = 0;

        for (const member of attendees) {
          const ledgerSum = await prisma.ledgerEntry.aggregate({
            where: {
              guildId: input.guildId,
              accountId: member.userId,
              accountType: "MEMBER",
              referenceType: "ATTENDANCE",
            },
            _sum: { amount: true },
          });
          const points = Number(ledgerSum._sum.amount || 0n);
          memberPoints[member.userId] = points;
          totalPoints += points;
        }

        if (totalPoints === 0) {
          // Fallback to EQUAL if nobody has points
          const share = netProfit / BigInt(attendees.length);
          const remainder = netProfit % BigInt(attendees.length);

          for (let i = 0; i < attendees.length; i++) {
            const member = attendees[i];
            if (!member) continue;
            const finalShare = i === 0 ? share + remainder : share;

            await createLedgerEntry({
              guildId: input.guildId,
              accountType: "MEMBER",
              accountId: member.userId,
              currency: input.currency,
              amount: finalShare,
              entryType: "CREDIT",
              referenceType: "BOSS_LOOT_SHARE",
              referenceId: lootSale.id,
              idempotencyKey: `SHARE-LOOT-${lootSale.id}-${member.userId}`,
              actorId: input.creatorId,
              description: `Loot share payout from ${input.itemName} (Pro-rata DKP fallback equal)`,
            });
          }
        } else {
          // Distribute proportionally
          let distributed = 0n;
          for (let i = 0; i < attendees.length; i++) {
            const member = attendees[i];
            if (!member) continue;
            const points = memberPoints[member.userId] ?? 0;
            // Proportional share calculation
            const share = (netProfit * BigInt(points)) / BigInt(totalPoints);
            distributed += share;

            // Give remainder to the last attendee
            const finalShare = i === attendees.length - 1 ? share + (netProfit - distributed) : share;

            await createLedgerEntry({
              guildId: input.guildId,
              accountType: "MEMBER",
              accountId: member.userId,
              currency: input.currency,
              amount: finalShare,
              entryType: "CREDIT",
              referenceType: "BOSS_LOOT_SHARE",
              referenceId: lootSale.id,
              idempotencyKey: `SHARE-LOOT-${lootSale.id}-${member.userId}`,
              actorId: input.creatorId,
              description: `Pro-rata DKP share payout from ${input.itemName} (${points}/${totalPoints} DKP)`,
            });
          }
        }
      } else {
        // Default: EQUAL split
        const share = netProfit / BigInt(attendees.length);
        const remainder = netProfit % BigInt(attendees.length);

        for (let i = 0; i < attendees.length; i++) {
          const member = attendees[i];
          if (!member) continue;
          const finalShare = i === 0 ? share + remainder : share;

          await createLedgerEntry({
            guildId: input.guildId,
            accountType: "MEMBER",
            accountId: member.userId,
            currency: input.currency,
            amount: finalShare,
            entryType: "CREDIT",
            referenceType: "BOSS_LOOT_SHARE",
            referenceId: lootSale.id,
            idempotencyKey: `SHARE-LOOT-${lootSale.id}-${member.userId}`,
            actorId: input.creatorId,
            description: `Equal loot share payout from ${input.itemName}`,
          });
        }
      }
    } else {
      // General sale — goes entirely to the Guild Fund
      await createLedgerEntry({
        guildId: input.guildId,
        accountType: "GUILD_FUND",
        accountId: input.guildId,
        currency: input.currency,
        amount: netProfit,
        entryType: "CREDIT",
        referenceType: "BOSS_LOOT_GUILD_FUND",
        referenceId: lootSale.id,
        idempotencyKey: `FUND-LOOT-${lootSale.id}`,
        actorId: input.creatorId,
        description: `General sale proceeds for ${input.itemName} credited to treasury`,
      });
    }
  }

  // 6. Write Audit Log
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

export async function getLootSales(guildId: string) {
  return prisma.lootSale.findMany({
    where: { guildId },
    include: {
      bossSchedule: true,
    },
    orderBy: { createdAt: "desc" },
  });
}
