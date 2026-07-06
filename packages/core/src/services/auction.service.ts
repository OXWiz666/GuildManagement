import { prisma } from "@guild/db";
import { writeAuditLog } from "./audit.service";
import { NotFoundError, ForbiddenError, BadRequestError } from "../utils/errors";

// ─── Helper: Validate leader/officer access ──────────────────────────────────
async function requireLeaderOrOfficer(guildId: string, actorId: string, minRole: "OFFICER" | "GUILD_LEADER" = "OFFICER") {
  const membership = await prisma.guildMember.findUnique({
    where: { userId_guildId: { userId: actorId, guildId } },
  });

  const allowedRoles =
    minRole === "GUILD_LEADER"
      ? ["GUILD_LEADER", "FACTION_LEADER", "ADMIN"]
      : ["OFFICER", "GUILD_LEADER", "FACTION_LEADER", "ADMIN"];

  if (!membership || !membership.isActive || !allowedRoles.includes(membership.role)) {
    throw new ForbiddenError(`This action requires ${minRole} or higher`);
  }
  return membership;
}

// ─── Create Auction ──────────────────────────────────────────────────────────

export async function createAuction(
  guildId: string,
  actorId: string,
  payload: {
    itemName: string;
    description?: string;
    imageUrl?: string;
    category?: string;
    startingBid: number;
    durationHours: number;
  },
  ipAddress?: string,
  userAgent?: string,
) {
  await requireLeaderOrOfficer(guildId, actorId, "GUILD_LEADER");

  if (!payload.itemName?.trim()) throw new BadRequestError("Item name is required");
  if (payload.startingBid < 0) throw new BadRequestError("Starting bid cannot be negative");
  if (payload.durationHours < 1 || payload.durationHours > 168) {
    throw new BadRequestError("Auction duration must be between 1 and 168 hours");
  }

  const endsAt = new Date(Date.now() + payload.durationHours * 60 * 60 * 1000);

  const auction = await prisma.auctionItem.create({
    data: {
      guildId,
      creatorId: actorId,
      itemName: payload.itemName.trim(),
      description: payload.description?.trim() || null,
      imageUrl: payload.imageUrl || null,
      category: payload.category || "OTHER",
      startingBid: payload.startingBid,
      currentBid: payload.startingBid,
      endsAt,
      status: "ACTIVE",
    },
    include: { bids: true },
  });

  await writeAuditLog({
    actorId,
    guildId,
    action: "AUCTION_CREATED",
    target: "AuctionItem",
    targetId: auction.id,
    detail: { itemName: auction.itemName, startingBid: auction.startingBid, endsAt: endsAt.toISOString() },
    ipAddress,
    userAgent,
  });

  return auction;
}

// ─── Get Active Auctions ─────────────────────────────────────────────────────

export async function getActiveAuctions(guildId: string, requestingMemberId?: string) {
  const now = new Date();

  // Auto-expire any auctions that have passed endsAt
  await prisma.auctionItem.updateMany({
    where: { guildId, status: "ACTIVE", endsAt: { lt: now } },
    data: { status: "ENDED" },
  });

  const auctions = await prisma.auctionItem.findMany({
    where: { guildId, status: "ACTIVE" },
    include: {
      bids: {
        orderBy: { bidAmount: "desc" },
        take: 5,
        include: {
          member: { select: { ign: true, role: true, rankName: true } },
        },
      },
    },
    orderBy: { endsAt: "asc" },
  });

  // Attach my bid flag if member is specified
  return auctions.map((a) => ({
    ...a,
    myBid: requestingMemberId
      ? a.bids.find((b) => b.memberId === requestingMemberId)?.bidAmount ?? null
      : null,
    bidCount: a.bids.length,
  }));
}

// ─── Get Auction History ─────────────────────────────────────────────────────

export async function getAuctionHistory(guildId: string, page = 1, limit = 20) {
  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    prisma.auctionItem.findMany({
      where: { guildId, status: { in: ["ENDED", "CANCELLED"] } },
      include: {
        bids: {
          orderBy: { bidAmount: "desc" },
          take: 1,
          include: { member: { select: { ign: true, rankName: true } } },
        },
      },
      orderBy: { endsAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.auctionItem.count({ where: { guildId, status: { in: ["ENDED", "CANCELLED"] } } }),
  ]);

  return {
    items,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

// ─── Place Bid ───────────────────────────────────────────────────────────────

export async function placeBid(
  guildId: string,
  auctionId: string,
  actorId: string,
  bidAmount: number,
) {
  if (bidAmount < 1) throw new BadRequestError("Bid amount must be at least 1 point");

  // Get bidder's membership and auction details in parallel
  const [member, auction] = await Promise.all([
    prisma.guildMember.findUnique({
      where: { userId_guildId: { userId: actorId, guildId } },
    }),
    prisma.auctionItem.findUnique({
      where: { id: auctionId },
      include: { bids: { orderBy: { bidAmount: "desc" }, take: 1 } },
    }),
  ]);

  if (!member || !member.isActive) {
    throw new ForbiddenError("You must be an active guild member to bid");
  }

  const now = new Date();

  if (!auction || auction.guildId !== guildId) throw new NotFoundError("Auction not found");
  if (auction.status !== "ACTIVE") throw new BadRequestError("This auction is no longer active");
  if (auction.endsAt < now) throw new BadRequestError("This auction has expired");

  const minimumBid = auction.currentBid + 1;
  if (bidAmount < minimumBid) {
    throw new BadRequestError(`Minimum bid is ${minimumBid} points (current: ${auction.currentBid})`);
  }

  if (member.bidPoints < bidAmount) {
    throw new BadRequestError(
      `Insufficient bid points. You have ${member.bidPoints} but need ${bidAmount}`
    );
  }

  // Use transaction: deduct points, create bid record, update auction's current bid
  const result = await prisma.$transaction(async (tx) => {
    // Deduct bid points from member
    const updatedMember = await tx.guildMember.update({
      where: { id: member.id },
      data: { bidPoints: { decrement: bidAmount } },
    });

    // Refund previous top bidder if different person
    const prevTopBid = auction.bids[0];
    if (prevTopBid && prevTopBid.memberId !== member.id) {
      await tx.guildMember.update({
        where: { id: prevTopBid.memberId },
        data: { bidPoints: { increment: prevTopBid.bidAmount } },
      });
    } else if (prevTopBid && prevTopBid.memberId === member.id) {
      // Same bidder outbidding themselves: refund their previous bid first
      await tx.guildMember.update({
        where: { id: member.id },
        data: { bidPoints: { increment: prevTopBid.bidAmount } },
      });
    }

    // Create bid record
    const bid = await tx.auctionBid.create({
      data: { auctionId, memberId: member.id, bidAmount },
    });

    // Update auction's current high bid & winner
    const updatedAuction = await tx.auctionItem.update({
      where: { id: auctionId },
      data: { currentBid: bidAmount, winnerId: member.id },
    });

    return { bid, updatedAuction, updatedMember };
  });

  await writeAuditLog({
    actorId,
    guildId,
    action: "AUCTION_BID_PLACED",
    target: "AuctionBid",
    targetId: result.bid.id,
    detail: { auctionId, itemName: auction.itemName, bidAmount, ign: member.ign },
  });

  return { success: true, bid: result.bid, newBidPoints: result.updatedMember.bidPoints };
}

// ─── End Auction (Leader manual close) ───────────────────────────────────────

export async function endAuction(
  guildId: string,
  auctionId: string,
  actorId: string,
  ipAddress?: string,
  userAgent?: string,
) {
  await requireLeaderOrOfficer(guildId, actorId, "GUILD_LEADER");

  const auction = await prisma.auctionItem.findUnique({
    where: { id: auctionId },
    include: {
      bids: {
        orderBy: { bidAmount: "desc" },
        take: 1,
        include: { member: { select: { ign: true } } },
      },
    },
  });

  if (!auction || auction.guildId !== guildId) throw new NotFoundError("Auction not found");
  if (auction.status !== "ACTIVE") throw new BadRequestError("Auction is already ended or cancelled");

  const winner = auction.bids[0]?.member ?? null;

  const updated = await prisma.auctionItem.update({
    where: { id: auctionId },
    data: { status: "ENDED" },
  });

  await writeAuditLog({
    actorId,
    guildId,
    action: "AUCTION_ENDED",
    target: "AuctionItem",
    targetId: auctionId,
    detail: {
      itemName: auction.itemName,
      winnerId: auction.winnerId,
      winnerIgn: winner?.ign ?? "No bids",
      finalBid: auction.currentBid,
    },
    ipAddress,
    userAgent,
  });

  return { success: true, auction: updated, winner };
}

// ─── Cancel Auction ───────────────────────────────────────────────────────────

export async function cancelAuction(
  guildId: string,
  auctionId: string,
  actorId: string,
  ipAddress?: string,
  userAgent?: string,
) {
  await requireLeaderOrOfficer(guildId, actorId, "GUILD_LEADER");

  const auction = await prisma.auctionItem.findUnique({
    where: { id: auctionId },
    include: { bids: { orderBy: { bidAmount: "desc" }, take: 1 } },
  });

  if (!auction || auction.guildId !== guildId) throw new NotFoundError("Auction not found");
  if (auction.status !== "ACTIVE") throw new BadRequestError("Auction is already ended or cancelled");

  await prisma.$transaction(async (tx) => {
    // Refund the current top bidder
    const topBid = auction.bids[0];
    if (topBid) {
      await tx.guildMember.update({
        where: { id: topBid.memberId },
        data: { bidPoints: { increment: topBid.bidAmount } },
      });
    }
    await tx.auctionItem.update({
      where: { id: auctionId },
      data: { status: "CANCELLED", winnerId: null },
    });
  });

  await writeAuditLog({
    actorId,
    guildId,
    action: "AUCTION_CANCELLED",
    target: "AuctionItem",
    targetId: auctionId,
    detail: { itemName: auction.itemName },
    ipAddress,
    userAgent,
  });

  return { success: true };
}

// ─── Award Bid Points (called after attendance confirm or boss kill) ──────────

export async function awardBidPoints(
  guildId: string,
  userId: string,
  points: number,
) {
  await prisma.guildMember.updateMany({
    where: { userId, guildId, isActive: true },
    data: { bidPoints: { increment: points } },
  });
}
