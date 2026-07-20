import { Prisma, prisma, type GuildSettings } from "@guild/db";

const REPAIRABLE_GUILD_SETTINGS_COLUMNS = [
  "market_rules",
  "role_display_names",
  "activity_point_rules",
  "character_classes",
  "server_name",
  "timezone",
  "region",
  "language",
  "settings_template_name",
] as const;

function isMissingRepairableGuildSettingsColumn(error: unknown) {
  const column = String(error instanceof Prisma.PrismaClientKnownRequestError ? error.meta?.["column"] ?? error.message : "");
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2022" &&
    REPAIRABLE_GUILD_SETTINGS_COLUMNS.some((name) => column.includes(name))
  );
}

export async function ensureGuildSettingsColumns() {
  await prisma.$executeRaw`
    ALTER TABLE "guild_settings"
      ADD COLUMN IF NOT EXISTS "market_rules" JSONB NOT NULL DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS "role_display_names" JSONB NOT NULL DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS "activity_point_rules" JSONB NOT NULL DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS "character_classes" JSONB NOT NULL DEFAULT '[]',
      ADD COLUMN IF NOT EXISTS "server_name" TEXT,
      ADD COLUMN IF NOT EXISTS "timezone" TEXT NOT NULL DEFAULT 'Asia/Singapore',
      ADD COLUMN IF NOT EXISTS "region" TEXT,
      ADD COLUMN IF NOT EXISTS "language" TEXT NOT NULL DEFAULT 'en',
      ADD COLUMN IF NOT EXISTS "settings_template_name" TEXT
  `;
}

export const ensureGuildSettingsTemplateColumn = ensureGuildSettingsColumns;

export async function findGuildSettingsByGuildId(guildId: string): Promise<GuildSettings | null> {
  try {
    return await prisma.guildSettings.findUnique({ where: { guildId } });
  } catch (error) {
    if (!isMissingRepairableGuildSettingsColumn(error)) throw error;
    await ensureGuildSettingsColumns();
    return prisma.guildSettings.findUnique({ where: { guildId } });
  }
}

export async function updateGuildSettingsByGuildId(
  guildId: string,
  data: Prisma.GuildSettingsUpdateInput,
): Promise<GuildSettings> {
  try {
    return await prisma.guildSettings.update({ where: { guildId }, data });
  } catch (error) {
    if (!isMissingRepairableGuildSettingsColumn(error)) throw error;
    await ensureGuildSettingsColumns();
    return prisma.guildSettings.update({ where: { guildId }, data });
  }
}
