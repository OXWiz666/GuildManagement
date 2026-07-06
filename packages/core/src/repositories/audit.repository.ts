import { prisma, Prisma } from "@guild/db";
import type { AuditAction } from "@guild/shared";

export interface AuditLogInput {
  actorId: string;
  guildId?: string;
  action: AuditAction | string;
  target?: string;
  targetId?: string;
  detail?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

export interface IAuditRepository {
  create(data: AuditLogInput): Promise<void>;
}

export class PrismaAuditRepository implements IAuditRepository {
  async create(input: AuditLogInput): Promise<void> {
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
  }
}
