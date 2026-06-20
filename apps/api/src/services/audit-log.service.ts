import { prisma } from "@guild/db";

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

  const [itemRequests, auctions, itemRequestCount, auctionCount] = await Promise.all([
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
  ];

  const paginated = logs
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(skip, skip + limit);

  return pageResult(paginated, itemRequestCount + auctionCount, page, limit);
}

export async function getCurrencyDistributionAuditLogs(
  guildId: string,
  page: number,
  limit: number,
): Promise<AuditLogPage> {
  const skip = (page - 1) * limit;

  const [ledger, total] = await Promise.all([
    prisma.ledgerEntry.findMany({
      where: {
        guildId,
        currency: { in: ["PHP", "DIAMOND"] },
        accountType: "MEMBER",
      },
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
      where: {
        guildId,
        currency: { in: ["PHP", "DIAMOND"] },
        accountType: "MEMBER",
      },
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
