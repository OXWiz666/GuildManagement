import type { NextRequest } from "next/server";
import { services, BadRequestError } from "@guild/core";
import { prisma } from "@guild/db";
import { withApi, ok } from "@/server/respond";
import { requireGuildRole } from "@/server/guards";
import { auditLogLimit } from "@/server/ratelimit";

export const runtime = "nodejs";

function clampPagination(pageParam: string | null, limitParam: string | null, defaultLimit = 30) {
  const parsedPage = pageParam ? parseInt(pageParam, 10) : NaN;
  const parsedLimit = limitParam ? parseInt(limitParam, 10) : NaN;
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const limit =
    Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 100) : defaultLimit;
  return { page, limit, skip: (page - 1) * limit };
}

export const GET = withApi(
  async (req: NextRequest, ctx: RouteContext<"/api/guilds/[guildId]/audit-logs">) => {
    const { guildId } = await ctx.params;
    await requireGuildRole(req, "MEMBER", guildId);
    auditLogLimit(req);

    const sp = req.nextUrl.searchParams;
    const filter = sp.get("filter") ?? undefined;
    const { page, limit, skip } = clampPagination(sp.get("page"), sp.get("limit"));

    if (filter === "items") {
      return ok(await services.auditLog.getItemDistributionAuditLogs(guildId, page, limit));
    }

    if (filter === "member-items") {
      const memberId = sp.get("memberId");
      if (!memberId) {
        throw new BadRequestError(
          "memberId query parameter is required for member-items filter",
        );
      }
      return ok(
        await services.auditLog.getItemDistributionAuditLogs(guildId, page, limit, memberId),
      );
    }

    if (filter === "currency") {
      return ok(await services.auditLog.getCurrencyDistributionAuditLogs(guildId, page, limit));
    }

    // Standard guild actions (default / boss / boss-rotation logs).
    let actionFilter: Record<string, unknown> | undefined;
    if (filter === "boss-rotation") {
      actionFilter = { in: ["BOSS_ROTATION_QUEUE_UPDATED", "BOSS_ROTATION_KILLED"] };
    } else if (filter === "boss") {
      actionFilter = {
        in: [
          "BOSS_EVENT_SCHEDULED",
          "BOSS_KILLED_LOGGED",
          "BOSS_EVENT_UPDATED",
          "BOSS_EVENT_DELETED",
          "BOSS_KILL_RECORDED",
          "BOSS_ROTATION_QUEUE_UPDATED",
          "BOSS_ROTATION_KILLED",
        ],
      };
    }

    const where = { guildId, ...(actionFilter ? { action: actionFilter } : {}) };
    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: {
          actor: { select: { id: true, displayName: true, avatarUrl: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.auditLog.count({ where }),
    ]);

    return ok({
      logs: logs.map((log) => ({
        id: log.id,
        action: log.action,
        target: log.target,
        targetId: log.targetId,
        detail: log.detail,
        createdAt: log.createdAt.toISOString(),
        actor: {
          id: log.actor.id,
          displayName: log.actor.displayName,
          avatarUrl: log.actor.avatarUrl,
        },
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  },
);
