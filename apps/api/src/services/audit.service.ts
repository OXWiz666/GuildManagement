import { prisma, Prisma } from "@guild/db";
import type { AuditAction } from "@guild/shared";

interface AuditLogInput {
  actorId: string;
  guildId?: string;
  action: AuditAction | string;
  target?: string;
  targetId?: string;
  detail?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Write an immutable audit log entry.
 * Called by every service that modifies state.
 * This is append-only — entries are never updated or deleted.
 */
export async function writeAuditLog(input: AuditLogInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: input.actorId,
        guildId: input.guildId ?? null,
        action: input.action,
        target: input.target ?? null,
        targetId: input.targetId ?? null,
        detail: (input.detail as Prisma.InputJsonValue) ?? Prisma.DbNull,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
      },
    });
  } catch (error) {
    // Audit logging should never break the main flow.
    // Log the error but don't throw.
    console.error("⚠️  Failed to write audit log:", error);
  }
}
