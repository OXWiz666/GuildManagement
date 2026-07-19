-- Store the selected guild settings template name for guild leaders.
ALTER TABLE "guild_settings" ADD COLUMN IF NOT EXISTS "settings_template_name" TEXT;
