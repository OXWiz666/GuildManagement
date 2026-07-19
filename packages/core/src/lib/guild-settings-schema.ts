import { Prisma, prisma, type GuildSettings } from "@guild/db";

function isMissingGuildSettingsTemplateColumn(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2022" &&
    String(error.meta?.["column"] ?? error.message).includes("settings_template_name")
  );
}

export async function ensureGuildSettingsTemplateColumn() {
  await prisma.$executeRaw`
    ALTER TABLE "guild_settings" ADD COLUMN IF NOT EXISTS "settings_template_name" TEXT
  `;
}

export async function findGuildSettingsByGuildId(guildId: string): Promise<GuildSettings | null> {
  try {
    return await prisma.guildSettings.findUnique({ where: { guildId } });
  } catch (error) {
    if (!isMissingGuildSettingsTemplateColumn(error)) throw error;
    await ensureGuildSettingsTemplateColumn();
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
    if (!isMissingGuildSettingsTemplateColumn(error)) throw error;
    await ensureGuildSettingsTemplateColumn();
    return prisma.guildSettings.update({ where: { guildId }, data });
  }
}
