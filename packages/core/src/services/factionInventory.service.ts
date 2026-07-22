import {
  prisma,
  Prisma,
  FactionInventoryTransactionType,
  FactionInventoryApprovalStatus,
  FactionInventoryRequestStatus,
  type FactionInventoryRequestPriority,
} from "@guild/db";
import { BadRequestError, ForbiddenError, NotFoundError } from "../utils/errors";
import { writeFactionAuditLog } from "./factionAudit.service";
import { getCachedActiveMemberships } from "../lib/faction-membership-cache";

const GUILD_LEADERSHIP_ROLES = ["GUILD_LEADER", "FACTION_LEADER", "ADMIN"] as const;

function isFactionManagerRole(role: string) {
  return role === "FACTION_LEADER" || role === "ADMIN";
}

// Not imported from faction.service.ts/factionAudit.service.ts to avoid a
// circular dependency — same reasoning as factionAudit.service.ts's own
// comment on this. Duplicates the small membership-resolution shape.
async function resolveActorFactionId(actorId: string): Promise<{ factionId: string; role: string }> {
  const memberships = await getCachedActiveMemberships(actorId);
  const withFaction = memberships.find((m) => m.guild.factionId);
  if (!withFaction?.guild.factionId) {
    throw new ForbiddenError("You must belong to a faction to access its inventory");
  }
  return { factionId: withFaction.guild.factionId, role: withFaction.role };
}

/**
 * Mutation gate for the inventory module: Faction Leader/Admin, or a member
 * holding the INVENTORY_MANAGER capability grant. Per the spec's role
 * matrix, Officer/Treasurer can VIEW inventory but not mutate it by
 * default — narrower than factionAudit.service.ts's audit-log access,
 * which does include Officer.
 */
async function requireFactionInventoryManager(actorId: string): Promise<{ factionId: string; role: string }> {
  const memberships = await getCachedActiveMemberships(actorId);
  const managerMembership = memberships.find((m) => isFactionManagerRole(m.role) && m.guild.factionId);
  if (managerMembership?.guild.factionId) {
    return { factionId: managerMembership.guild.factionId, role: managerMembership.role };
  }

  const { factionId, role } = await resolveActorFactionId(actorId);
  const grant = await prisma.factionRoleAssignment.findFirst({
    where: { factionId, role: "INVENTORY_MANAGER", guildMember: { userId: actorId, isActive: true } },
    select: { id: true },
  });
  if (!grant) {
    throw new ForbiddenError("Only Faction Leaders, Admins, and Faction Inventory Managers can manage inventory");
  }
  return { factionId, role };
}

// Any Guild Leader (or Faction Leader/Admin) of the SPECIFIC guild — used to
// gate "my guild requests an item," distinct from faction-wide inventory
// access. Mirrors faction.service.ts's requireGuildLeadership.
async function requireGuildLeadershipOf(actorId: string, guildId: string): Promise<string> {
  const membership = await prisma.guildMember.findUnique({
    where: { userId_guildId: { userId: actorId, guildId } },
  });
  if (!membership || !membership.isActive || !GUILD_LEADERSHIP_ROLES.includes(membership.role as any)) {
    throw new ForbiddenError("Only that guild's own leadership can request items on its behalf");
  }
  return membership.role;
}

function serializeItem(item: {
  id: string;
  factionId: string;
  itemName: string;
  itemIcon: string | null;
  category: string;
  rarity: string | null;
  description: string | null;
  currentQuantity: number;
  reservedQuantity: number;
  distributedQuantity: number;
  unitValueCents: number | null;
  storageLocation: string | null;
  batchNumber: string | null;
  expirationDate: Date | null;
  minStockThreshold: number | null;
  status: string;
  createdByUserId: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: item.id,
    factionId: item.factionId,
    itemName: item.itemName,
    itemIcon: item.itemIcon,
    category: item.category,
    rarity: item.rarity,
    description: item.description,
    currentQuantity: item.currentQuantity,
    reservedQuantity: item.reservedQuantity,
    availableQuantity: item.currentQuantity - item.reservedQuantity,
    distributedQuantity: item.distributedQuantity,
    unitValueCents: item.unitValueCents,
    storageLocation: item.storageLocation,
    batchNumber: item.batchNumber,
    expirationDate: item.expirationDate?.toISOString() ?? null,
    minStockThreshold: item.minStockThreshold,
    status: item.status,
    createdByUserId: item.createdByUserId,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

// ═══════════════════════════════════════════════════
// ITEMS
// ═══════════════════════════════════════════════════

export async function listInventoryItems(actorId: string) {
  const { factionId } = await resolveActorFactionId(actorId);
  const items = await prisma.factionInventoryItem.findMany({
    where: { factionId, status: "ACTIVE" },
    orderBy: [{ category: "asc" }, { itemName: "asc" }],
  });
  return items.map(serializeItem);
}

export async function createInventoryItem(
  actorId: string,
  payload: {
    itemName: string;
    itemIcon?: string;
    category: string;
    rarity?: string;
    description?: string;
    unitValueCents?: number;
    storageLocation?: string;
    batchNumber?: string;
    expirationDate?: string;
    minStockThreshold?: number;
  },
  ipAddress?: string,
  userAgent?: string,
) {
  const { factionId, role } = await requireFactionInventoryManager(actorId);

  const item = await prisma.factionInventoryItem.create({
    data: {
      factionId,
      itemName: payload.itemName.trim(),
      itemIcon: payload.itemIcon?.trim() || null,
      category: payload.category,
      rarity: payload.rarity?.trim() || null,
      description: payload.description?.trim() || null,
      unitValueCents: payload.unitValueCents ?? null,
      storageLocation: payload.storageLocation?.trim() || null,
      batchNumber: payload.batchNumber?.trim() || null,
      expirationDate: payload.expirationDate ? new Date(payload.expirationDate) : null,
      minStockThreshold: payload.minStockThreshold ?? null,
      createdByUserId: actorId,
    },
  });

  await writeFactionAuditLog({
    factionId,
    actorId,
    actorRole: role,
    action: "FACTION_INVENTORY_ITEM_CREATED",
    entityType: "FactionInventoryItem",
    entityId: item.id,
    newValue: { itemName: item.itemName, category: item.category },
    ipAddress,
    userAgent,
  });

  return serializeItem(item);
}

export async function updateInventoryItem(
  actorId: string,
  itemId: string,
  payload: {
    itemName?: string;
    itemIcon?: string | null;
    category?: string;
    rarity?: string | null;
    description?: string | null;
    unitValueCents?: number | null;
    storageLocation?: string | null;
    batchNumber?: string | null;
    expirationDate?: string | null;
    minStockThreshold?: number | null;
    status?: string;
  },
  ipAddress?: string,
  userAgent?: string,
) {
  const { factionId, role } = await requireFactionInventoryManager(actorId);
  const before = await prisma.factionInventoryItem.findUnique({ where: { id: itemId } });
  if (!before || before.factionId !== factionId) {
    throw new NotFoundError("Inventory item not found");
  }

  const item = await prisma.factionInventoryItem.update({
    where: { id: itemId },
    data: {
      itemName: payload.itemName?.trim(),
      itemIcon: payload.itemIcon === undefined ? undefined : payload.itemIcon?.trim() || null,
      category: payload.category,
      rarity: payload.rarity === undefined ? undefined : payload.rarity?.trim() || null,
      description: payload.description === undefined ? undefined : payload.description?.trim() || null,
      unitValueCents: payload.unitValueCents === undefined ? undefined : payload.unitValueCents,
      storageLocation: payload.storageLocation === undefined ? undefined : payload.storageLocation?.trim() || null,
      batchNumber: payload.batchNumber === undefined ? undefined : payload.batchNumber?.trim() || null,
      expirationDate:
        payload.expirationDate === undefined ? undefined : payload.expirationDate ? new Date(payload.expirationDate) : null,
      minStockThreshold: payload.minStockThreshold === undefined ? undefined : payload.minStockThreshold,
      status: payload.status,
    },
  });

  await writeFactionAuditLog({
    factionId,
    actorId,
    actorRole: role,
    action: "FACTION_INVENTORY_ITEM_UPDATED",
    entityType: "FactionInventoryItem",
    entityId: itemId,
    previousValue: { itemName: before.itemName, category: before.category, status: before.status },
    newValue: payload,
    ipAddress,
    userAgent,
  });

  return serializeItem(item);
}

// ═══════════════════════════════════════════════════
// QUANTITY-MOVING ACTIONS
// Every guarded decrement uses a WHERE-conditioned updateMany inside an
// interactive transaction: the WHERE clause is re-evaluated by Postgres
// against the row's actual committed value at the moment the UPDATE
// acquires its lock, not a stale pre-read — that's what makes it safe
// under concurrency without a separate application-level lock. The
// previous/new quantity snapshot is then read back AFTER the guarded
// write (guaranteed to see the transaction's own write), so it's never
// derived from a value that could have gone stale between read and write.
// ═══════════════════════════════════════════════════

async function guardedIncrement(
  tx: Prisma.TransactionClient,
  itemId: string,
  field: "currentQuantity" | "reservedQuantity",
  amount: number,
) {
  await tx.factionInventoryItem.update({
    where: { id: itemId },
    data: { [field]: { increment: amount } },
  });
}

async function guardedDecrement(
  tx: Prisma.TransactionClient,
  itemId: string,
  where: Prisma.FactionInventoryItemWhereInput,
  data: Prisma.FactionInventoryItemUpdateManyMutationInput,
  errorMessage: string,
) {
  const result = await tx.factionInventoryItem.updateMany({ where: { id: itemId, ...where }, data });
  if (result.count === 0) {
    throw new BadRequestError(errorMessage);
  }
}

export async function recordManualAddition(
  actorId: string,
  itemId: string,
  quantity: number,
  reason?: string,
  ipAddress?: string,
  userAgent?: string,
) {
  return recordAddition(actorId, itemId, quantity, "MANUAL_ADDITION", { reason }, ipAddress, userAgent);
}

export async function recordGuildContribution(
  actorId: string,
  itemId: string,
  quantity: number,
  sourceGuildId: string,
  reason?: string,
  ipAddress?: string,
  userAgent?: string,
) {
  await requireGuildLeadershipOf(actorId, sourceGuildId);
  return recordAddition(actorId, itemId, quantity, "GUILD_CONTRIBUTION", { reason, sourceGuildId }, ipAddress, userAgent);
}

async function recordAddition(
  actorId: string,
  itemId: string,
  quantity: number,
  transactionType: "MANUAL_ADDITION" | "GUILD_CONTRIBUTION",
  extra: { reason?: string; sourceGuildId?: string },
  ipAddress?: string,
  userAgent?: string,
) {
  if (quantity <= 0) throw new BadRequestError("Quantity must be positive");

  // MANUAL_ADDITION requires Inventory access; GUILD_CONTRIBUTION's caller
  // already checked guild leadership above, but we still need factionId/role
  // and to confirm the item belongs to the actor's own faction.
  const { factionId, role } =
    transactionType === "MANUAL_ADDITION" ? await requireFactionInventoryManager(actorId) : await resolveActorFactionId(actorId);

  const before = await prisma.factionInventoryItem.findUnique({ where: { id: itemId } });
  if (!before || before.factionId !== factionId) {
    throw new NotFoundError("Inventory item not found");
  }

  const { newQuantity, previousQuantity } = await prisma.$transaction(async (tx) => {
    await guardedIncrement(tx, itemId, "currentQuantity", quantity);
    const after = await tx.factionInventoryItem.findUniqueOrThrow({ where: { id: itemId } });
    const newQuantity = after.currentQuantity;
    await tx.factionInventoryTransaction.create({
      data: {
        factionId,
        itemId,
        sourceGuildId: extra.sourceGuildId ?? null,
        quantity,
        previousQuantity: newQuantity - quantity,
        newQuantity,
        transactionType: FactionInventoryTransactionType[transactionType],
        reason: extra.reason?.trim() || null,
        requestedByUserId: actorId,
        approvedByUserId: actorId,
        approvalStatus: FactionInventoryApprovalStatus.APPROVED,
        approvedAt: new Date(),
      },
    });
    return { newQuantity, previousQuantity: newQuantity - quantity };
  });

  await writeFactionAuditLog({
    factionId,
    actorId,
    actorRole: role,
    action: transactionType === "MANUAL_ADDITION" ? "FACTION_INVENTORY_MANUAL_ADDITION" : "FACTION_INVENTORY_GUILD_CONTRIBUTION",
    entityType: "FactionInventoryItem",
    entityId: itemId,
    previousValue: { currentQuantity: previousQuantity },
    newValue: { currentQuantity: newQuantity, quantity },
    reason: extra.reason,
    ipAddress,
    userAgent,
  });

  return { itemId, previousQuantity, newQuantity };
}

export async function adjustQuantity(
  actorId: string,
  itemId: string,
  delta: number,
  reason: string,
  ipAddress?: string,
  userAgent?: string,
) {
  if (delta === 0) throw new BadRequestError("Adjustment cannot be zero");
  const { factionId, role } = await requireFactionInventoryManager(actorId);

  const before = await prisma.factionInventoryItem.findUnique({ where: { id: itemId } });
  if (!before || before.factionId !== factionId) {
    throw new NotFoundError("Inventory item not found");
  }

  const { newQuantity, previousQuantity } = await prisma.$transaction(async (tx) => {
    if (delta > 0) {
      await guardedIncrement(tx, itemId, "currentQuantity", delta);
    } else {
      await guardedDecrement(
        tx,
        itemId,
        { currentQuantity: { gte: -delta } },
        { currentQuantity: { decrement: -delta } },
        "Cannot adjust below zero stock",
      );
    }
    const after = await tx.factionInventoryItem.findUniqueOrThrow({ where: { id: itemId } });
    const newQuantity = after.currentQuantity;
    await tx.factionInventoryTransaction.create({
      data: {
        factionId,
        itemId,
        quantity: Math.abs(delta),
        previousQuantity: newQuantity - delta,
        newQuantity,
        transactionType: FactionInventoryTransactionType.ADJUSTMENT,
        reason: reason.trim(),
        requestedByUserId: actorId,
        approvedByUserId: actorId,
        approvalStatus: FactionInventoryApprovalStatus.APPROVED,
        approvedAt: new Date(),
      },
    });
    return { newQuantity, previousQuantity: newQuantity - delta };
  });

  await writeFactionAuditLog({
    factionId,
    actorId,
    actorRole: role,
    action: "FACTION_INVENTORY_ADJUSTED",
    entityType: "FactionInventoryItem",
    entityId: itemId,
    previousValue: { currentQuantity: previousQuantity },
    newValue: { currentQuantity: newQuantity, delta },
    reason,
    ipAddress,
    userAgent,
  });

  return { itemId, previousQuantity, newQuantity };
}

// ═══════════════════════════════════════════════════
// TRANSACTIONS (ledger)
// ═══════════════════════════════════════════════════

export interface ListInventoryTransactionsFilters {
  itemId?: string;
  transactionType?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export async function listInventoryTransactions(actorId: string, filters: ListInventoryTransactionsFilters = {}) {
  const { factionId } = await resolveActorFactionId(actorId);

  const page = filters.page && filters.page > 0 ? filters.page : 1;
  const pageSize = filters.pageSize && filters.pageSize > 0 ? Math.min(filters.pageSize, 100) : 25;

  const where: Prisma.FactionInventoryTransactionWhereInput = {
    factionId,
    ...(filters.itemId ? { itemId: filters.itemId } : {}),
    ...(filters.transactionType ? { transactionType: filters.transactionType as FactionInventoryTransactionType } : {}),
    ...(filters.from || filters.to
      ? {
          createdAt: {
            ...(filters.from ? { gte: new Date(filters.from) } : {}),
            ...(filters.to ? { lte: new Date(filters.to) } : {}),
          },
        }
      : {}),
  };

  const [transactions, total] = await Promise.all([
    prisma.factionInventoryTransaction.findMany({
      where,
      include: {
        item: { select: { itemName: true, itemIcon: true, category: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.factionInventoryTransaction.count({ where }),
  ]);

  return {
    transactions: transactions.map((t) => ({
      id: t.id,
      itemId: t.itemId,
      itemName: t.item.itemName,
      itemIcon: t.item.itemIcon,
      category: t.item.category,
      sourceGuildId: t.sourceGuildId,
      destinationGuildId: t.destinationGuildId,
      quantity: t.quantity,
      previousQuantity: t.previousQuantity,
      newQuantity: t.newQuantity,
      transactionType: t.transactionType,
      reason: t.reason,
      // Not joined to a User relation — the UI resolves display names from
      // the already-fetched faction members roster (see FactionMembersTab),
      // same as other lists in this module keep their FK surface small.
      requestedByUserId: t.requestedByUserId,
      approvedByUserId: t.approvedByUserId,
      approvalStatus: t.approvalStatus,
      createdAt: t.createdAt.toISOString(),
      approvedAt: t.approvedAt?.toISOString() ?? null,
    })),
    total,
    page,
    pageSize,
  };
}

// ═══════════════════════════════════════════════════
// REQUESTS (a guild asking the faction pool for items)
// Lifecycle: SUBMITTED -> APPROVED (reserves) or REJECTED -> DISTRIBUTED
// (consumes reservation). CANCELLED releases any reservation that was made.
// ═══════════════════════════════════════════════════

function serializeRequest(r: {
  id: string;
  factionId: string;
  itemId: string;
  item: { itemName: string; itemIcon: string | null };
  requestingGuildId: string;
  requestingGuild: { name: string };
  requestedByUserId: string;
  quantity: number;
  purpose: string | null;
  priority: string;
  requiredDate: Date | null;
  evidenceUrl: string | null;
  status: string;
  reviewerId: string | null;
  approvalNotes: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: r.id,
    factionId: r.factionId,
    itemId: r.itemId,
    itemName: r.item.itemName,
    itemIcon: r.item.itemIcon,
    requestingGuildId: r.requestingGuildId,
    requestingGuildName: r.requestingGuild.name,
    requestedByUserId: r.requestedByUserId,
    quantity: r.quantity,
    purpose: r.purpose,
    priority: r.priority,
    requiredDate: r.requiredDate?.toISOString() ?? null,
    evidenceUrl: r.evidenceUrl,
    status: r.status,
    reviewerId: r.reviewerId,
    approvalNotes: r.approvalNotes,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

const REQUEST_INCLUDE = {
  item: { select: { itemName: true, itemIcon: true } },
  requestingGuild: { select: { name: true } },
} satisfies Prisma.FactionInventoryRequestInclude;

export async function submitInventoryRequest(
  actorId: string,
  guildId: string,
  payload: {
    itemId: string;
    quantity: number;
    purpose?: string;
    priority?: FactionInventoryRequestPriority;
    requiredDate?: string;
    evidenceUrl?: string;
  },
  ipAddress?: string,
  userAgent?: string,
) {
  const role = await requireGuildLeadershipOf(actorId, guildId);
  const { factionId } = await resolveActorFactionId(actorId);

  const item = await prisma.factionInventoryItem.findUnique({ where: { id: payload.itemId } });
  if (!item || item.factionId !== factionId) {
    throw new NotFoundError("Inventory item not found");
  }
  if (payload.quantity <= 0) throw new BadRequestError("Quantity must be positive");

  const request = await prisma.factionInventoryRequest.create({
    data: {
      factionId,
      itemId: payload.itemId,
      requestingGuildId: guildId,
      requestedByUserId: actorId,
      quantity: payload.quantity,
      purpose: payload.purpose?.trim() || null,
      priority: payload.priority ?? "NORMAL",
      requiredDate: payload.requiredDate ? new Date(payload.requiredDate) : null,
      evidenceUrl: payload.evidenceUrl?.trim() || null,
    },
    include: REQUEST_INCLUDE,
  });

  await writeFactionAuditLog({
    factionId,
    actorId,
    actorRole: role,
    action: "FACTION_INVENTORY_REQUEST_SUBMITTED",
    entityType: "FactionInventoryRequest",
    entityId: request.id,
    newValue: { itemName: item.itemName, quantity: payload.quantity, guildId },
    ipAddress,
    userAgent,
  });

  return serializeRequest(request);
}

export async function listInventoryRequests(actorId: string, filters: { mine?: boolean; guildId?: string } = {}) {
  const { factionId } = await resolveActorFactionId(actorId);

  // "Mine" — every request submitted by a guild this actor leads. Anyone
  // else needs Inventory access to see the full faction-wide queue.
  let where: Prisma.FactionInventoryRequestWhereInput = { factionId };
  if (filters.mine) {
    where = { ...where, requestedByUserId: actorId };
  } else {
    await requireFactionInventoryManager(actorId);
  }
  if (filters.guildId) {
    where = { ...where, requestingGuildId: filters.guildId };
  }

  const requests = await prisma.factionInventoryRequest.findMany({
    where,
    include: REQUEST_INCLUDE,
    orderBy: { createdAt: "desc" },
    // No pagination UI exists for this list (unlike listInventoryTransactions,
    // which is properly paginated) — a bare cap keeps a long-lived faction's
    // full request history from being fetched on every read.
    take: 200,
  });
  return requests.map(serializeRequest);
}

export async function reviewInventoryRequest(
  actorId: string,
  requestId: string,
  action: "APPROVE" | "REJECT",
  approvalNotes?: string,
  ipAddress?: string,
  userAgent?: string,
) {
  const { factionId, role } = await requireFactionInventoryManager(actorId);

  const request = await prisma.factionInventoryRequest.findUnique({
    where: { id: requestId },
    include: REQUEST_INCLUDE,
  });
  if (!request || request.factionId !== factionId) {
    throw new NotFoundError("Inventory request not found");
  }
  if (request.status !== FactionInventoryRequestStatus.SUBMITTED && request.status !== FactionInventoryRequestStatus.UNDER_REVIEW) {
    throw new BadRequestError("Request is no longer pending");
  }
  if (action === "APPROVE" && request.requestedByUserId === actorId) {
    throw new ForbiddenError("You cannot approve your own request");
  }

  if (action === "REJECT") {
    const updated = await prisma.factionInventoryRequest.update({
      where: { id: requestId },
      data: { status: FactionInventoryRequestStatus.REJECTED, reviewerId: actorId, approvalNotes: approvalNotes?.trim() || null },
      include: REQUEST_INCLUDE,
    });
    await writeFactionAuditLog({
      factionId,
      actorId,
      actorRole: role,
      action: "FACTION_INVENTORY_REQUEST_REJECTED",
      entityType: "FactionInventoryRequest",
      entityId: requestId,
      reason: approvalNotes,
      ipAddress,
      userAgent,
    });
    return serializeRequest(updated);
  }

  // APPROVE: reserve stock. Checked against currentQuantity - reservedQuantity
  // (available) read just before the write — the hard, race-safe guarantee
  // against a negative *currentQuantity* balance lives at the DISTRIBUTE
  // step below, which atomically re-validates both columns together; a rare
  // over-optimistic reservation here just surfaces as a clear error at
  // distribute time rather than corrupting the real stock count.
  const item = request.item;
  const itemRow = await prisma.factionInventoryItem.findUniqueOrThrow({ where: { id: request.itemId } });
  const available = itemRow.currentQuantity - itemRow.reservedQuantity;
  if (available < request.quantity) {
    throw new BadRequestError(`Not enough available stock (have ${available}, need ${request.quantity})`);
  }

  const updated = await prisma.$transaction(async (tx) => {
    await guardedIncrement(tx, request.itemId, "reservedQuantity", request.quantity);
    const afterItem = await tx.factionInventoryItem.findUniqueOrThrow({ where: { id: request.itemId } });
    await tx.factionInventoryTransaction.create({
      data: {
        factionId,
        itemId: request.itemId,
        destinationGuildId: request.requestingGuildId,
        quantity: request.quantity,
        previousQuantity: afterItem.reservedQuantity - request.quantity,
        newQuantity: afterItem.reservedQuantity,
        transactionType: FactionInventoryTransactionType.RESERVATION,
        requestedByUserId: request.requestedByUserId,
        approvedByUserId: actorId,
        approvalStatus: FactionInventoryApprovalStatus.APPROVED,
        approvedAt: new Date(),
      },
    });
    return tx.factionInventoryRequest.update({
      where: { id: requestId },
      data: { status: FactionInventoryRequestStatus.APPROVED, reviewerId: actorId, approvalNotes: approvalNotes?.trim() || null },
      include: REQUEST_INCLUDE,
    });
  });

  await writeFactionAuditLog({
    factionId,
    actorId,
    actorRole: role,
    action: "FACTION_INVENTORY_REQUEST_APPROVED",
    entityType: "FactionInventoryRequest",
    entityId: requestId,
    newValue: { itemName: item.itemName, quantity: request.quantity },
    reason: approvalNotes,
    ipAddress,
    userAgent,
  });

  return serializeRequest(updated);
}

export async function distributeInventoryRequest(actorId: string, requestId: string, ipAddress?: string, userAgent?: string) {
  const { factionId, role } = await requireFactionInventoryManager(actorId);

  const request = await prisma.factionInventoryRequest.findUnique({ where: { id: requestId }, include: REQUEST_INCLUDE });
  if (!request || request.factionId !== factionId) {
    throw new NotFoundError("Inventory request not found");
  }
  if (request.status !== FactionInventoryRequestStatus.APPROVED) {
    throw new BadRequestError("Only approved requests can be distributed");
  }

  const updated = await prisma.$transaction(async (tx) => {
    await guardedDecrement(
      tx,
      request.itemId,
      { currentQuantity: { gte: request.quantity }, reservedQuantity: { gte: request.quantity } },
      {
        currentQuantity: { decrement: request.quantity },
        reservedQuantity: { decrement: request.quantity },
        distributedQuantity: { increment: request.quantity },
      },
      "Not enough reserved stock to distribute — this usually means an earlier reservation was already released",
    );
    const afterItem = await tx.factionInventoryItem.findUniqueOrThrow({ where: { id: request.itemId } });
    await tx.factionInventoryTransaction.create({
      data: {
        factionId,
        itemId: request.itemId,
        destinationGuildId: request.requestingGuildId,
        quantity: request.quantity,
        previousQuantity: afterItem.currentQuantity + request.quantity,
        newQuantity: afterItem.currentQuantity,
        transactionType: FactionInventoryTransactionType.DISTRIBUTION,
        requestedByUserId: request.requestedByUserId,
        approvedByUserId: actorId,
        approvalStatus: FactionInventoryApprovalStatus.APPROVED,
        approvedAt: new Date(),
      },
    });
    return tx.factionInventoryRequest.update({
      where: { id: requestId },
      data: { status: FactionInventoryRequestStatus.DISTRIBUTED },
      include: REQUEST_INCLUDE,
    });
  });

  await writeFactionAuditLog({
    factionId,
    actorId,
    actorRole: role,
    action: "FACTION_INVENTORY_REQUEST_DISTRIBUTED",
    entityType: "FactionInventoryRequest",
    entityId: requestId,
    newValue: { itemName: request.item.itemName, quantity: request.quantity, guildId: request.requestingGuildId },
    ipAddress,
    userAgent,
  });

  return serializeRequest(updated);
}

export async function cancelInventoryRequest(actorId: string, requestId: string, ipAddress?: string, userAgent?: string) {
  const request = await prisma.factionInventoryRequest.findUnique({ where: { id: requestId }, include: REQUEST_INCLUDE });
  if (!request) throw new NotFoundError("Inventory request not found");

  if (request.requestedByUserId !== actorId) {
    // Inventory managers may also cancel on a requester's behalf.
    await requireFactionInventoryManager(actorId);
  }
  if (
    request.status !== FactionInventoryRequestStatus.SUBMITTED &&
    request.status !== FactionInventoryRequestStatus.UNDER_REVIEW &&
    request.status !== FactionInventoryRequestStatus.APPROVED
  ) {
    throw new BadRequestError("Request can no longer be cancelled");
  }

  const wasApproved = request.status === FactionInventoryRequestStatus.APPROVED;
  const { factionId } = request;
  const actorRole = (await getCachedActiveMemberships(actorId)).find((m) => m.guild.factionId === factionId)?.role ?? "UNKNOWN";

  const updated = await prisma.$transaction(async (tx) => {
    if (wasApproved) {
      await guardedDecrement(
        tx,
        request.itemId,
        { reservedQuantity: { gte: request.quantity } },
        { reservedQuantity: { decrement: request.quantity } },
        "Reserved quantity already released",
      );
      const afterItem = await tx.factionInventoryItem.findUniqueOrThrow({ where: { id: request.itemId } });
      await tx.factionInventoryTransaction.create({
        data: {
          factionId,
          itemId: request.itemId,
          destinationGuildId: request.requestingGuildId,
          quantity: request.quantity,
          previousQuantity: afterItem.reservedQuantity + request.quantity,
          newQuantity: afterItem.reservedQuantity,
          transactionType: FactionInventoryTransactionType.RESERVATION_RELEASE,
          requestedByUserId: request.requestedByUserId,
          approvedByUserId: actorId,
          approvalStatus: FactionInventoryApprovalStatus.APPROVED,
          approvedAt: new Date(),
        },
      });
    }
    return tx.factionInventoryRequest.update({
      where: { id: requestId },
      data: { status: FactionInventoryRequestStatus.CANCELLED },
      include: REQUEST_INCLUDE,
    });
  });

  await writeFactionAuditLog({
    factionId,
    actorId,
    actorRole,
    action: "FACTION_INVENTORY_REQUEST_CANCELLED",
    entityType: "FactionInventoryRequest",
    entityId: requestId,
    ipAddress,
    userAgent,
  });

  return serializeRequest(updated);
}
