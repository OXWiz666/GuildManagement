import { prisma } from "@guild/db";
import { writeAuditLog } from "./audit.service";
import { broadcastToGuild } from "../lib/socket";
import { createLootSale } from "./loot.service";
import { NotFoundError, ForbiddenError, BadRequestError } from "../utils/errors";
import { findGuildSettingsByGuildId } from "../lib/guild-settings-schema";

const OFFICER_ROLES = ["OFFICER", "GUILD_LEADER", "FACTION_LEADER", "ADMIN"];

// ─── Membership helper ───────────────────────────────────────────────
async function requireOfficer(guildId: string, actorId: string) {
  const member = await prisma.guildMember.findUnique({
    where: { userId_guildId: { userId: actorId, guildId } },
  });
  if (!member || !member.isActive || !OFFICER_ROLES.includes(member.role)) {
    throw new ForbiddenError("Only officers and above can manage guild storage");
  }
  return member;
}

const RECIPIENT_SELECT = {
  recipient: { select: { id: true, ign: true, role: true, rankName: true } },
} as const;

// ─── List — the two boards the spec asks for ─────────────────────────
// GUILD STORAGE  → status IN_STORAGE
// LISTED IN THE NEXT MARKET → status LISTED_MARKET
export async function getStorage(guildId: string, actorId: string) {
  const member = await prisma.guildMember.findUnique({
    where: { userId_guildId: { userId: actorId, guildId } },
  });
  if (!member || !member.isActive) {
    throw new ForbiddenError("You must be an active guild member");
  }
  const canManage = OFFICER_ROLES.includes(member.role);

  const items = await prisma.guildStorageItem.findMany({
    where: { guildId, status: { in: ["IN_STORAGE", "LISTED_MARKET"] } },
    include: RECIPIENT_SELECT,
    orderBy: { createdAt: "desc" },
  });

  return {
    storage: items.filter((i) => i.status === "IN_STORAGE"),
    listed: items.filter((i) => i.status === "LISTED_MARKET"),
    canManage,
  };
}

// ─── Fetch a live item that still belongs to the vault ───────────────
async function getStoredItem(guildId: string, id: string) {
  const item = await prisma.guildStorageItem.findUnique({ where: { id } });
  if (!item || item.guildId !== guildId) throw new NotFoundError("Storage item not found");
  return item;
}

// ─── Register into the next market listing ───────────────────────────
export async function registerInMarket(guildId: string, id: string, actorId: string, price: number) {
  await requireOfficer(guildId, actorId);
  const item = await getStoredItem(guildId, id);
  if (item.status !== "IN_STORAGE") {
    throw new BadRequestError("Only items currently in storage can be listed");
  }
  if (!Number.isFinite(price) || price < 0) {
    throw new BadRequestError("A valid listing price is required");
  }

  const listingPrice = BigInt(Math.round(price * 100));

  const updated = await prisma.guildStorageItem.update({
    where: { id },
    data: { status: "LISTED_MARKET", disposition: "MARKET", listingPrice },
    include: RECIPIENT_SELECT,
  });

  await writeAuditLog({
    actorId,
    guildId,
    action: "STORAGE_ITEM_LISTED",
    target: "GuildStorageItem",
    targetId: id,
    detail: { itemName: item.itemName, listingPrice: price },
  });

  void broadcastToGuild(guildId, "storage_updated", { id });
  return updated;
}

// ─── Recall a listed item back into storage ──────────────────────────
export async function recallToStorage(guildId: string, id: string, actorId: string) {
  await requireOfficer(guildId, actorId);
  const item = await getStoredItem(guildId, id);
  if (item.status !== "LISTED_MARKET") {
    throw new BadRequestError("Only market-listed items can be recalled");
  }

  const updated = await prisma.guildStorageItem.update({
    where: { id },
    data: { status: "IN_STORAGE", disposition: null, listingPrice: null },
    include: RECIPIENT_SELECT,
  });

  await writeAuditLog({
    actorId,
    guildId,
    action: "STORAGE_ITEM_RECALLED",
    target: "GuildStorageItem",
    targetId: id,
    detail: { itemName: item.itemName },
  });

  void broadcastToGuild(guildId, "storage_updated", { id });
  return updated;
}

// ─── Mark a listed item as sold in the next market ────────────────────
// Creates the authoritative Sold Item Registry entry (a LootSale row, same
// accounting/tax/dividend path as a manually-recorded sale) and resolves
// the storage item. Not tied to a boss-schedule attendance session, so
// proceeds credit the guild fund directly (see loot.service.createLootSale).
export async function markStorageItemSold(
  guildId: string,
  id: string,
  actorId: string,
  payload: { saleValue: number; soldAt?: string },
) {
  await requireOfficer(guildId, actorId);
  const item = await getStoredItem(guildId, id);
  if (item.status !== "LISTED_MARKET") {
    throw new BadRequestError("Only items listed in the next market can be marked sold");
  }
  if (!Number.isFinite(payload.saleValue) || payload.saleValue < 0) {
    throw new BadRequestError("A valid sale value is required");
  }

  const settings = await findGuildSettingsByGuildId(guildId);
  const soldAt = payload.soldAt ? new Date(payload.soldAt) : null;
  if (payload.soldAt && (!soldAt || Number.isNaN(soldAt.getTime()))) {
    throw new BadRequestError("Invalid sold date");
  }

  await createLootSale({
    guildId,
    bossScheduleId: null,
    itemName: item.itemName,
    category: "GUILD_STORAGE",
    saleValue: BigInt(Math.round(payload.saleValue * 100)),
    currency: settings?.currencyCode || "PHP",
    creatorId: actorId,
    soldAt,
  });

  const updated = await prisma.guildStorageItem.update({
    where: { id },
    data: {
      status: "DISTRIBUTED",
      resolvedById: actorId,
      resolvedAt: new Date(),
    },
    include: RECIPIENT_SELECT,
  });

  await writeAuditLog({
    actorId,
    guildId,
    action: "STORAGE_ITEM_SOLD",
    target: "GuildStorageItem",
    targetId: id,
    detail: { itemName: item.itemName, saleValue: payload.saleValue },
  });

  void broadcastToGuild(guildId, "storage_updated", { id });
  return updated;
}

// ─── Distribute — GUILD_SALE (direct) or GUILD_AUCTION (DKP) ──────────
type DistributePayload =
  | { mode: "GUILD_SALE"; memberId: string; note?: string }
  | { mode: "GUILD_AUCTION"; startingBid?: number; durationHours?: number; note?: string };

export async function distributeStorageItem(
  guildId: string,
  id: string,
  actorId: string,
  payload: DistributePayload,
) {
  await requireOfficer(guildId, actorId);
  const item = await getStoredItem(guildId, id);
  if (item.status === "DISTRIBUTED") {
    throw new BadRequestError("This item has already been distributed");
  }

  if (payload.mode === "GUILD_SALE") {
    const recipient = await prisma.guildMember.findFirst({
      where: { id: payload.memberId, guildId, isActive: true },
    });
    if (!recipient) throw new BadRequestError("Target member not found in this guild");

    const updated = await prisma.guildStorageItem.update({
      where: { id },
      data: {
        status: "DISTRIBUTED",
        disposition: "GUILD_SALE",
        recipientMemberId: recipient.id,
        note: payload.note?.trim() || item.note,
        resolvedById: actorId,
        resolvedAt: new Date(),
      },
      include: RECIPIENT_SELECT,
    });

    await writeAuditLog({
      actorId,
      guildId,
      action: "STORAGE_ITEM_DISTRIBUTED",
      target: "GuildStorageItem",
      targetId: id,
      detail: { itemName: item.itemName, mode: "GUILD_SALE", recipientIgn: recipient.ign },
    });

    void broadcastToGuild(guildId, "storage_updated", { id });
    return { item: updated, auction: null };
  }

  // GUILD_AUCTION — spin up a live DKP auction from the stored item.
  const durationHours = payload.durationHours && payload.durationHours >= 1 ? payload.durationHours : 24;
  const startingBid = payload.startingBid && payload.startingBid > 0 ? payload.startingBid : 0;
  const endsAt = new Date(Date.now() + durationHours * 60 * 60 * 1000);

  const auction = await prisma.auctionItem.create({
    data: {
      guildId,
      creatorId: actorId,
      itemName: item.itemName,
      description: item.sourceBoss ? `From ${item.sourceBoss} · guild storage` : "From guild storage",
      imageUrl: item.imageUrl,
      category: item.category,
      startingBid,
      currentBid: startingBid,
      endsAt,
      status: "ACTIVE",
    },
  });

  const updated = await prisma.guildStorageItem.update({
    where: { id },
    data: {
      status: "DISTRIBUTED",
      disposition: "GUILD_AUCTION",
      auctionItemId: auction.id,
      note: payload.note?.trim() || item.note,
      resolvedById: actorId,
      resolvedAt: new Date(),
    },
    include: RECIPIENT_SELECT,
  });

  await writeAuditLog({
    actorId,
    guildId,
    action: "STORAGE_ITEM_DISTRIBUTED",
    target: "GuildStorageItem",
    targetId: id,
    detail: { itemName: item.itemName, mode: "GUILD_AUCTION", auctionId: auction.id },
  });

  void broadcastToGuild(guildId, "storage_updated", { id });
  void broadcastToGuild(guildId, "auction_updated", { id: auction.id });
  return { item: updated, auction };
}

// ─── Auto-ingest: every boss-kill drop lands in storage, no manual step ─
// Called from dashboard.service's kill-logging paths (already permission-
// checked as a boss-taken manager there) — every drop the officer records
// on a kill is unconditionally vaulted, so nothing has to be re-added by
// hand. Never throws on empty input; best-effort, never blocks the kill.
const DROP_TYPE_TO_STORAGE_CATEGORY: Record<string, string> = {
  Weapon: "LEGEND_WEAPON",
  Armor: "LEGEND_ARMOR",
  Accessory: "LEGEND_ACCESSORY",
  Cloak: "LEGEND_ACCESSORY",
  Mount: "MOUNT",
};

export async function addDropsToStorage(
  guildId: string,
  actorId: string,
  bossName: string,
  drops: Array<{ itemName: string; type: string; rarity: string | null; iconUrl?: string; quantity: number }>,
) {
  if (!drops.length) return [];

  const created = await prisma.$transaction(
    drops.map((d) =>
      prisma.guildStorageItem.create({
        data: {
          guildId,
          itemName: d.itemName,
          category: DROP_TYPE_TO_STORAGE_CATEGORY[d.type] || "OTHER",
          sourceBoss: bossName,
          rarity: d.rarity || "LEGEND",
          imageUrl: d.iconUrl || null,
          quantity: d.quantity,
          status: "IN_STORAGE",
          addedById: actorId,
        },
      }),
    ),
  );

  await writeAuditLog({
    actorId,
    guildId,
    action: "STORAGE_ITEM_ADDED",
    target: "GuildStorageItem",
    targetId: bossName,
    detail: { source: "boss_kill", bossName, items: drops.map((d) => ({ itemName: d.itemName, quantity: d.quantity })) },
  });

  void broadcastToGuild(guildId, "storage_updated", { count: created.length, source: "boss_kill" });
  return created;
}

// ─── Remove an item from the vault (never touches distributed history) ─
export async function removeStorageItem(guildId: string, id: string, actorId: string) {
  await requireOfficer(guildId, actorId);
  const item = await getStoredItem(guildId, id);
  if (item.status === "DISTRIBUTED") {
    throw new BadRequestError("Distributed items cannot be removed");
  }

  await prisma.guildStorageItem.delete({ where: { id } });

  await writeAuditLog({
    actorId,
    guildId,
    action: "STORAGE_ITEM_REMOVED",
    target: "GuildStorageItem",
    targetId: id,
    detail: { itemName: item.itemName },
  });

  void broadcastToGuild(guildId, "storage_updated", { id });
  return { success: true };
}
