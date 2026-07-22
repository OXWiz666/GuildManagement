-- Guild Emblem: per-guild customizable emblem config (shape, background
-- color, main icon, accent, border, banner text) rendered as SVG on the
-- client. Replaces the avatar in guild displays when set.
-- See guildEmblemSchema in packages/shared/src/validators/emblem.ts.

ALTER TABLE "guilds" ADD COLUMN IF NOT EXISTS "emblem" JSONB;
