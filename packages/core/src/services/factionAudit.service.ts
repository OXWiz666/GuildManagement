import { Prisma, prisma } from "@guild/db";
import { ForbiddenError } from "../utils/errors";
import { cache } from "../lib/cache";
import { getCachedActiveMemberships } from "../lib/faction-membership-cache";

export interface FactionAuditLogInput {
  factionId: string;
  actorId: string;
  actorRole: string;
  action: string;
  entityType?: string;
  entityId?: string;
  previousValue?: Record<string, unknown> | null;
  newValue?: Record<string, unknown> | null;
  reason?: string;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Write an immutable faction-scoped audit log entry. Never updated or
 * deleted by any service. Mirrors audit.service.ts's write-never-throw
 * contract — audit logging should never break the calling flow.
 */
export async function writeFactionAuditLog(input: FactionAuditLogInput): Promise<void> {
  try {
    await prisma.factionAuditLog.create({
      data: {
        factionId: input.factionId,
        actorId: input.actorId,
        actorRole: input.actorRole,
        action: input.action,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        previousValue: (input.previousValue as Prisma.InputJsonValue) ?? Prisma.DbNull,
        newValue: (input.newValue as Prisma.InputJsonValue) ?? Prisma.DbNull,
        reason: input.reason ?? null,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
      },
    });
  } catch (error) {
    console.error("⚠️  Failed to write faction audit log:", error);
  }
}

// Shares the same cached membership lookup faction.service.ts's
// requireManagedFaction uses (see getCachedActiveMemberships) rather than
// issuing its own guildMember.findMany — not imported from faction.service.ts
// itself, to avoid a circular dependency (faction.service.ts calls
// writeFactionAuditLog above).
async function requireFactionAuditAccess(actorId: string) {
  const memberships = await getCachedActiveMemberships(actorId);
  const factionId = memberships.find((m) => m.guild.factionId)?.guild.factionId;
  if (!factionId) {
    throw new ForbiddenError("You must belong to a faction to view its audit log");
  }

  const isManager = memberships.some(
    (m) => m.guild.factionId === factionId && (m.role === "FACTION_LEADER" || m.role === "ADMIN"),
  );
  if (isManager) return factionId;

  // Short-TTL cache too: an Officer paging through the audit log would
  // otherwise re-run this lookup on every page turn.
  const isOfficer = await cache.getOrSet(`fk:faction-officer-grant:${actorId}:${factionId}`, 15, async () => {
    const grant = await prisma.factionRoleAssignment.findFirst({
      where: { factionId, role: "OFFICER", guildMember: { userId: actorId, isActive: true } },
      select: { id: true },
    });
    return Boolean(grant);
  });
  if (!isOfficer) {
    throw new ForbiddenError("Only Faction Leaders, Admins, and Faction Officers can view the audit log");
  }
  return factionId;
}

export interface ListFactionAuditLogsFilters {
  from?: string;
  to?: string;
  action?: string;
  entityType?: string;
  page?: number;
  pageSize?: number;
}

export async function listFactionAuditLogs(actorId: string, filters: ListFactionAuditLogsFilters = {}) {
  const factionId = await requireFactionAuditAccess(actorId);

  const page = filters.page && filters.page > 0 ? filters.page : 1;
  const pageSize = filters.pageSize && filters.pageSize > 0 ? Math.min(filters.pageSize, 100) : 25;

  const where: Prisma.FactionAuditLogWhereInput = {
    factionId,
    ...(filters.action ? { action: filters.action } : {}),
    ...(filters.entityType ? { entityType: filters.entityType } : {}),
    ...(filters.from || filters.to
      ? {
          createdAt: {
            ...(filters.from ? { gte: new Date(filters.from) } : {}),
            ...(filters.to ? { lte: new Date(filters.to) } : {}),
          },
        }
      : {}),
  };

  const [logs, total] = await Promise.all([
    prisma.factionAuditLog.findMany({
      where,
      include: { actor: { select: { id: true, displayName: true, avatarUrl: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.factionAuditLog.count({ where }),
  ]);

  return {
    logs: logs.map((log) => ({
      id: log.id,
      factionId: log.factionId,
      actorId: log.actorId,
      actor: { id: log.actor.id, displayName: log.actor.displayName, avatarUrl: log.actor.avatarUrl },
      actorRole: log.actorRole,
      action: log.action,
      entityType: log.entityType,
      entityId: log.entityId,
      previousValue: log.previousValue,
      newValue: log.newValue,
      reason: log.reason,
      createdAt: log.createdAt.toISOString(),
    })),
    total,
    page,
    pageSize,
  };
}
