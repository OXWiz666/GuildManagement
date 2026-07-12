import { prisma } from "@guild/db";
import { BadRequestError, NotFoundError } from "../utils/errors";
import { writeAuditLog } from "./audit.service";

// Color keys the client knows how to render as a badge. Keep in sync with the
// CATEGORY_COLORS map in the web app's category UI.
export const MEMBER_CATEGORY_COLORS = [
  "slate",
  "amber",
  "cyan",
  "emerald",
  "violet",
  "rose",
  "sky",
  "orange",
] as const;

const MAX_NAME_LENGTH = 32;
const MAX_DESCRIPTION_LENGTH = 120;

function normalizeColor(color?: string | null): string {
  if (color && (MEMBER_CATEGORY_COLORS as readonly string[]).includes(color)) {
    return color;
  }
  return "slate";
}

function serializeCategory(c: {
  id: string;
  guildId: string;
  name: string;
  color: string;
  description: string | null;
  sortOrder: number;
}) {
  return {
    id: c.id,
    guildId: c.guildId,
    name: c.name,
    color: c.color,
    description: c.description,
    sortOrder: c.sortOrder,
  };
}

export async function listMemberCategories(guildId: string) {
  const categories = await prisma.guildMemberCategory.findMany({
    where: { guildId },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return categories.map(serializeCategory);
}

export async function createMemberCategory(
  actorId: string,
  guildId: string,
  payload: { name?: string; color?: string; description?: string },
  ipAddress?: string,
  userAgent?: string,
) {
  const name = (payload.name || "").trim();
  if (!name) {
    throw new BadRequestError("Category name is required");
  }
  if (name.length > MAX_NAME_LENGTH) {
    throw new BadRequestError(`Category name must be at most ${MAX_NAME_LENGTH} characters`);
  }

  const existing = await prisma.guildMemberCategory.findFirst({ where: { guildId, name } });
  if (existing) {
    throw new BadRequestError("A category with that name already exists");
  }

  // Append to the end of the current ordering.
  const last = await prisma.guildMemberCategory.findFirst({
    where: { guildId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  const category = await prisma.guildMemberCategory.create({
    data: {
      guildId,
      name,
      color: normalizeColor(payload.color),
      description: payload.description?.trim() || null,
      sortOrder: (last?.sortOrder ?? -1) + 1,
    },
  });

  await writeAuditLog({
    actorId,
    guildId,
    action: "MEMBER_CATEGORY_CREATED",
    target: "GuildMemberCategory",
    targetId: category.id,
    detail: { name: category.name, color: category.color },
    ipAddress,
    userAgent,
  });

  return serializeCategory(category);
}

export async function updateMemberCategory(
  actorId: string,
  guildId: string,
  categoryId: string,
  payload: { name?: string; color?: string; description?: string; sortOrder?: number },
  ipAddress?: string,
  userAgent?: string,
) {
  const existing = await prisma.guildMemberCategory.findUnique({ where: { id: categoryId } });
  if (!existing || existing.guildId !== guildId) {
    throw new NotFoundError("Category not found");
  }

  const data: { name?: string; color?: string; description?: string | null; sortOrder?: number } = {};

  if (payload.name !== undefined) {
    const name = payload.name.trim();
    if (!name) throw new BadRequestError("Category name is required");
    if (name.length > MAX_NAME_LENGTH) {
      throw new BadRequestError(`Category name must be at most ${MAX_NAME_LENGTH} characters`);
    }
    if (name !== existing.name) {
      const clash = await prisma.guildMemberCategory.findFirst({ where: { guildId, name } });
      if (clash) throw new BadRequestError("A category with that name already exists");
    }
    data.name = name;
  }

  if (payload.color !== undefined) data.color = normalizeColor(payload.color);
  if (payload.description !== undefined) {
    const desc = payload.description.trim();
    if (desc.length > MAX_DESCRIPTION_LENGTH) {
      throw new BadRequestError(`Description must be at most ${MAX_DESCRIPTION_LENGTH} characters`);
    }
    data.description = desc || null;
  }
  if (payload.sortOrder !== undefined && Number.isFinite(payload.sortOrder)) {
    data.sortOrder = Math.trunc(payload.sortOrder);
  }

  const category = await prisma.guildMemberCategory.update({
    where: { id: categoryId },
    data,
  });

  await writeAuditLog({
    actorId,
    guildId,
    action: "MEMBER_CATEGORY_UPDATED",
    target: "GuildMemberCategory",
    targetId: category.id,
    detail: { ...data },
    ipAddress,
    userAgent,
  });

  return serializeCategory(category);
}

export async function deleteMemberCategory(
  actorId: string,
  guildId: string,
  categoryId: string,
  ipAddress?: string,
  userAgent?: string,
) {
  const existing = await prisma.guildMemberCategory.findUnique({ where: { id: categoryId } });
  if (!existing || existing.guildId !== guildId) {
    throw new NotFoundError("Category not found");
  }

  // Members referencing this category are detached automatically (FK is
  // ON DELETE SET NULL), so no member data is lost — they just become uncategorized.
  await prisma.guildMemberCategory.delete({ where: { id: categoryId } });

  await writeAuditLog({
    actorId,
    guildId,
    action: "MEMBER_CATEGORY_DELETED",
    target: "GuildMemberCategory",
    targetId: categoryId,
    detail: { name: existing.name },
    ipAddress,
    userAgent,
  });

  return { success: true };
}

export async function assignMemberCategory(
  actorId: string,
  guildId: string,
  memberId: string,
  categoryId: string | null,
  ipAddress?: string,
  userAgent?: string,
) {
  const member = await prisma.guildMember.findUnique({
    where: { id: memberId },
    select: { id: true, guildId: true, userId: true, categoryId: true },
  });
  if (!member || member.guildId !== guildId) {
    throw new NotFoundError("Member not found in this guild");
  }

  if (categoryId) {
    const category = await prisma.guildMemberCategory.findUnique({ where: { id: categoryId } });
    if (!category || category.guildId !== guildId) {
      throw new BadRequestError("Category does not belong to this guild");
    }
  }

  const updated = await prisma.guildMember.update({
    where: { id: memberId },
    data: { categoryId: categoryId || null },
    include: {
      user: { select: { id: true, displayName: true, email: true, avatarUrl: true } },
      category: { select: { id: true, name: true, color: true, description: true, sortOrder: true } },
    },
  });

  await writeAuditLog({
    actorId,
    guildId,
    action: "MEMBER_CATEGORY_ASSIGNED",
    target: "GuildMember",
    targetId: member.userId,
    detail: { memberId, categoryId: categoryId || null },
    ipAddress,
    userAgent,
  });

  return {
    id: updated.id,
    userId: updated.userId,
    role: updated.role,
    rankName: updated.rankName,
    ign: updated.ign,
    cp: updated.cp,
    class: updated.class,
    weapon: updated.weapon,
    memberCode: updated.memberCode,
    joinedAt: updated.joinedAt.toISOString(),
    isActive: updated.isActive,
    category: updated.category
      ? {
          id: updated.category.id,
          name: updated.category.name,
          color: updated.category.color,
          description: updated.category.description,
          sortOrder: updated.category.sortOrder,
        }
      : null,
    user: {
      id: updated.user.id,
      displayName: updated.user.displayName,
      email: updated.user.email,
      avatarUrl: updated.user.avatarUrl,
    },
  };
}
