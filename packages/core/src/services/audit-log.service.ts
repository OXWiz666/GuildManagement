import { Prisma, prisma } from "@guild/db";

type AuditLogEntry = {
  id: string;
  action: string;
  target: string | null;
  targetId: string | null;
  detail: Record<string, unknown> | null;
  createdAt: string;
  actor: {
    id: string;
    displayName: string;
    avatarUrl: string | null;
  };
};

export type AuditLogPage = {
  logs: AuditLogEntry[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

function pageResult(logs: AuditLogEntry[], total: number, page: number, limit: number): AuditLogPage {
  return {
    logs,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

export async function getItemDistributionAuditLogs(
  guildId: string,
  page: number,
  limit: number,
  memberId?: string,
): Promise<AuditLogPage> {
  const skip = (page - 1) * limit;
  const windowTake = skip + limit;

  const [
    itemRequests,
    auctions,
    distributions,
    mountDistributions,
    itemRequestCount,
    auctionCount,
    distributionCount,
    mountDistributionCount,
  ] = await Promise.all([
    prisma.itemRequest.findMany({
      where: {
        guildId,
        type: "ITEM",
        status: "FULFILLED",
        ...(memberId ? { memberId } : {}),
      },
      include: {
        member: {
          include: {
            user: {
              select: { id: true, displayName: true, avatarUrl: true },
            },
          },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: windowTake,
    }),
    prisma.auctionItem.findMany({
      where: {
        guildId,
        status: "ENDED",
        winnerId: memberId ? memberId : { not: null },
      },
      include: {
        bids: {
          orderBy: { bidAmount: "desc" },
          take: 1,
          include: {
            member: {
              include: {
                user: {
                  select: { id: true, displayName: true, avatarUrl: true },
                },
              },
            },
          },
        },
      },
      orderBy: { endsAt: "desc" },
      take: windowTake,
    }),
    prisma.itemDistribution.findMany({
      where: { guildId, ...(memberId ? { memberId } : {}) },
      include: {
        member: { include: { user: { select: { id: true, displayName: true, avatarUrl: true } } } },
      },
      orderBy: { distributedAt: "desc" },
      take: windowTake,
    }),
    prisma.mountDistribution
      ? prisma.mountDistribution.findMany({
          where: { guildId, ...(memberId ? { memberId } : {}) },
          include: {
            member: { include: { user: { select: { id: true, displayName: true, avatarUrl: true } } } },
            mount: { select: { name: true } },
          },
          orderBy: { distributedAt: "desc" },
          take: windowTake,
        })
      : Promise.resolve([]),
    prisma.itemRequest.count({
      where: {
        guildId,
        type: "ITEM",
        status: "FULFILLED",
        ...(memberId ? { memberId } : {}),
      },
    }),
    prisma.auctionItem.count({
      where: {
        guildId,
        status: "ENDED",
        winnerId: memberId ? memberId : { not: null },
      },
    }),
    prisma.itemDistribution.count({ where: { guildId, ...(memberId ? { memberId } : {}) } }),
    prisma.mountDistribution
      ? prisma.mountDistribution.count({ where: { guildId, ...(memberId ? { memberId } : {}) } })
      : Promise.resolve(0),
  ]);

  const logs: AuditLogEntry[] = [
    ...itemRequests.map((request) => ({
      id: request.id,
      action: "ITEM_REQUEST_FULFILLED",
      target: "ItemRequest",
      targetId: request.id,
      detail: {
        itemName: request.itemName,
        quantity: request.quantity,
        category: request.itemCategory,
        recipientName: request.member.ign || request.member.user.displayName,
        recipientId: request.member.userId,
      },
      createdAt: request.updatedAt.toISOString(),
      actor: {
        id: request.reviewedById || "system",
        displayName: "Guild Officer",
        avatarUrl: null,
      },
    })),
    ...auctions.map((auction) => {
      const winningBid = auction.bids[0];
      const winner = winningBid?.member;
      return {
        id: auction.id,
        action: "AUCTION_WON",
        target: "AuctionItem",
        targetId: auction.id,
        detail: {
          itemName: auction.itemName,
          quantity: 1,
          category: auction.category,
          recipientName: winner ? (winner.ign || winner.user.displayName) : "Unknown Member",
          recipientId: winner ? winner.userId : null,
          bidAmount: auction.currentBid,
        },
        createdAt: auction.endsAt.toISOString(),
        actor: {
          id: auction.creatorId,
          displayName: "Auction System",
          avatarUrl: null,
        },
      };
    }),
    ...distributions.map((dist) => {
      const items = (dist.items && typeof dist.items === "object" ? dist.items : {}) as Record<string, unknown>;
      const itemName = Object.entries(items)
        .filter(([, v]) => (typeof v === "number" ? v > 0 : v !== false && v !== "" && v != null))
        .map(([k, v]) => (typeof v === "number" && v > 1 ? `${k} ×${v}` : k))
        .join(", ");
      return {
        id: dist.id,
        action: "ITEM_DISTRIBUTED",
        target: "ItemDistribution",
        targetId: dist.id,
        detail: {
          itemName: itemName || "Items",
          quantity: Object.keys(items).length,
          category: dist.rankTier,
          recipientName: dist.ignSnapshot || dist.member.ign || dist.member.user.displayName,
          recipientId: dist.member.userId,
          note: dist.note,
        },
        createdAt: dist.distributedAt.toISOString(),
        actor: { id: dist.distributedById, displayName: "Guild Officer", avatarUrl: null },
      };
    }),
    ...mountDistributions.map((md) => ({
      id: md.id,
      action: "MOUNT_DISTRIBUTED",
      target: "MountDistribution",
      targetId: md.id,
      detail: {
        itemName: md.mountNameSnapshot || md.mount.name,
        quantity: 1,
        category: "MOUNT",
        recipientName: md.ignSnapshot || md.member.ign || md.member.user.displayName,
        recipientId: md.member.userId,
        note: md.note,
      },
      createdAt: md.distributedAt.toISOString(),
      actor: { id: md.distributedById, displayName: "Guild Officer", avatarUrl: null },
    })),
  ];

  const paginated = logs
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(skip, skip + limit);

  return pageResult(
    paginated,
    itemRequestCount + auctionCount + distributionCount + mountDistributionCount,
    page,
    limit,
  );
}

export async function getCurrencyDistributionAuditLogs(
  guildId: string,
  page: number,
  limit: number,
): Promise<AuditLogPage> {
  const skip = (page - 1) * limit;
  const currencyLedgerWhere = {
    guildId,
    currency: { in: ["PHP", "DIAMOND"] },
    accountType: "MEMBER",
    OR: [
      { entryType: "CREDIT", referenceType: "BOSS_LOOT_SHARE" },
      {
        entryType: "DEBIT",
        referenceType: {
          notIn: ["ATTENDANCE", "ATTENDANCE_REVOKE", "ATTENDANCE_STATUS_PENDING"],
        },
      },
    ],
  } satisfies Prisma.LedgerEntryWhereInput;

  const [ledger, total] = await Promise.all([
    prisma.ledgerEntry.findMany({
      where: currencyLedgerWhere,
      include: {
        actor: {
          select: { id: true, displayName: true, avatarUrl: true },
        },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.ledgerEntry.count({
      where: currencyLedgerWhere,
    }),
  ]);

  const recipientIds = Array.from(new Set(ledger.map((entry) => entry.accountId)));
  const membersList = recipientIds.length > 0
    ? await prisma.guildMember.findMany({
        where: { userId: { in: recipientIds }, guildId },
        include: {
          user: {
            select: { displayName: true },
          },
        },
      })
    : [];
  const memberMap = new Map(membersList.map((member) => [member.userId, member.ign || member.user.displayName]));

  return pageResult(
    ledger.map((entry) => ({
      id: entry.id,
      action: entry.entryType === "CREDIT" ? "CURRENCY_DISTRIBUTION" : "CURRENCY_PAYOUT",
      target: "LedgerEntry",
      targetId: entry.id,
      detail: {
        amount: Number(entry.amount) / 100,
        currency: entry.currency,
        entryType: entry.entryType,
        referenceType: entry.referenceType,
        description: entry.description,
        recipientId: entry.accountId,
        recipientName: memberMap.get(entry.accountId) || "Unknown Member",
      },
      createdAt: entry.createdAt.toISOString(),
      actor: {
        id: entry.actor.id,
        displayName: entry.actor.displayName,
        avatarUrl: entry.actor.avatarUrl,
      },
    })),
    total,
    page,
    limit,
  );
}
