import type { NextRequest } from "next/server";
import { services, broadcastToGuild } from "@guild/core";
import { gearItemsSchema } from "@guild/shared";
import { prisma } from "@guild/db";
import { withApi, ok } from "@/server/respond";
import { requireAuth } from "@/server/guards";
import { readJson } from "@/server/request";

export const runtime = "nodejs";

export const POST = withApi(async (req: NextRequest) => {
  const user = requireAuth(req);
  const body = await readJson<{
    inviteCode: string;
    ign: string;
    cp: number;
    class: string;
    weapon: string;
    gear?: unknown;
  }>(req);

  const gearItems = gearItemsSchema.parse(body.gear);

  const result = await services.application.createJoinRequest(
    user.userId,
    body.inviteCode,
    body.ign,
    Number(body.cp),
    body.class,
    body.weapon,
    gearItems,
  );

  const fullRequest = await prisma.guildJoinRequest.findUnique({
    where: { id: result.id },
    include: {
      user: { select: { id: true, displayName: true, email: true, avatarUrl: true } },
    },
  });

  if (fullRequest) {
    broadcastToGuild(result.guildId, "join_request_created", {
      ...fullRequest,
      createdAt: fullRequest.createdAt.toISOString(),
    });
  }

  return ok(result);
});
