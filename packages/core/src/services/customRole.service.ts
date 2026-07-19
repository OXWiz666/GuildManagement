import { prisma } from "@guild/db";
import { CUSTOMIZABLE_ROLES, resolveRoleDisplayName, type GuildRoleType } from "@guild/shared";
import { BadRequestError, NotFoundError } from "../utils/errors";
import { writeAuditLog } from "./audit.service";
import { findGuildSettingsByGuildId } from "../lib/guild-settings-schema";

const MAX_NAME_LENGTH = 32;

export const CUSTOM_ROLE_COLORS = [
  "slate",
  "amber",
  "cyan",
  "emerald",
  "violet",
  "rose",
  "sky",
  "orange",
] as const;

function normalizeColor(color?: string | null): string {
  if (color && (CUSTOM_ROLE_COLORS as readonly string[]).includes(color)) {
    return color;
  }
  return "slate";
}

function isCustomizableBand(band: unknown): band is GuildRoleType {
  return typeof band === "string" && (CUSTOMIZABLE_ROLES as readonly string[]).includes(band);
}

function serializeDefinition(d: {
  id: string;
  guildId: string;
  name: string;
  color: string;
  band: string;
  sortOrder: number;
}) {
  return {
    id: d.id,
    guildId: d.guildId,
    name: d.name,
    color: d.color,
    band: d.band,
    sortOrder: d.sortOrder,
  };
}

export async function listCustomRoles(guildId: string) {
  const definitions = await prisma.guildRoleDefinition.findMany({
    where: { guildId },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return definitions.map(serializeDefinition);
}

export async function createCustomRole(
  actorId: string,
  guildId: string,
  payload: { name?: string; color?: string; band?: string },
  ipAddress?: string,
  userAgent?: string,
) {
  const name = (payload.name || "").trim();
  if (!name) {
    throw new BadRequestError("Role name is required");
  }
  if (name.length > MAX_NAME_LENGTH) {
    throw new BadRequestError(`Role name must be at most ${MAX_NAME_LENGTH} characters`);
  }
  if (!isCustomizableBand(payload.band)) {
    throw new BadRequestError("Role band must be one of OFFICER, CORE_MEMBER, ELITE_MEMBER, MEMBER");
  }

  const existing = await prisma.guildRoleDefinition.findFirst({ where: { guildId, name } });
  if (existing) {
    throw new BadRequestError("A role with that name already exists");
  }

  const last = await prisma.guildRoleDefinition.findFirst({
    where: { guildId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  const definition = await prisma.guildRoleDefinition.create({
    data: {
      guildId,
      name,
      color: normalizeColor(payload.color),
      band: payload.band as GuildRoleType,
      sortOrder: (last?.sortOrder ?? -1) + 1,
    },
  });

  await writeAuditLog({
    actorId,
    guildId,
    action: "CUSTOM_ROLE_CREATED",
    target: "GuildRoleDefinition",
    targetId: definition.id,
    detail: { name: definition.name, band: definition.band, color: definition.color },
    ipAddress,
    userAgent,
  });

  return serializeDefinition(definition);
}

export async function updateCustomRole(
  actorId: string,
  guildId: string,
  roleId: string,
  payload: { name?: string; color?: string; sortOrder?: number },
  ipAddress?: string,
  userAgent?: string,
) {
  const existing = await prisma.guildRoleDefinition.findUnique({ where: { id: roleId } });
  if (!existing || existing.guildId !== guildId) {
    throw new NotFoundError("Custom role not found");
  }

  const data: { name?: string; color?: string; sortOrder?: number } = {};

  if (payload.name !== undefined) {
    const name = payload.name.trim();
    if (!name) throw new BadRequestError("Role name is required");
    if (name.length > MAX_NAME_LENGTH) {
      throw new BadRequestError(`Role name must be at most ${MAX_NAME_LENGTH} characters`);
    }
    if (name !== existing.name) {
      const clash = await prisma.guildRoleDefinition.findFirst({ where: { guildId, name } });
      if (clash) throw new BadRequestError("A role with that name already exists");
    }
    data.name = name;
  }

  if (payload.color !== undefined) data.color = normalizeColor(payload.color);
  if (payload.sortOrder !== undefined && Number.isFinite(payload.sortOrder)) {
    data.sortOrder = Math.trunc(payload.sortOrder);
  }

  const [definition] = await prisma.$transaction([
    prisma.guildRoleDefinition.update({ where: { id: roleId }, data }),
    // rankName is denormalized onto GuildMember — keep it in sync when the name changes.
    ...(data.name
      ? [
          prisma.guildMember.updateMany({
            where: { customRoleId: roleId },
            data: { rankName: data.name },
          }),
        ]
      : []),
  ]);

  await writeAuditLog({
    actorId,
    guildId,
    action: "CUSTOM_ROLE_UPDATED",
    target: "GuildRoleDefinition",
    targetId: definition.id,
    detail: { ...data },
    ipAddress,
    userAgent,
  });

  return serializeDefinition(definition);
}

export async function deleteCustomRole(
  actorId: string,
  guildId: string,
  roleId: string,
  ipAddress?: string,
  userAgent?: string,
) {
  const existing = await prisma.guildRoleDefinition.findUnique({ where: { id: roleId } });
  if (!existing || existing.guildId !== guildId) {
    throw new NotFoundError("Custom role not found");
  }

  const settings = await findGuildSettingsByGuildId(guildId);
  const overrides = (settings?.roleDisplayNames || null) as Partial<Record<GuildRoleType, string>> | null;
  const fallbackName = resolveRoleDisplayName(existing.band as GuildRoleType, overrides);

  // Members referencing this role are detached automatically (FK is ON
  // DELETE SET NULL) but their denormalized rankName needs resetting too,
  // or it would keep showing the deleted custom name.
  await prisma.$transaction([
    prisma.guildMember.updateMany({
      where: { customRoleId: roleId },
      data: { rankName: fallbackName },
    }),
    prisma.guildRoleDefinition.delete({ where: { id: roleId } }),
  ]);

  await writeAuditLog({
    actorId,
    guildId,
    action: "CUSTOM_ROLE_DELETED",
    target: "GuildRoleDefinition",
    targetId: roleId,
    detail: { name: existing.name, band: existing.band },
    ipAddress,
    userAgent,
  });

  return { success: true };
}
