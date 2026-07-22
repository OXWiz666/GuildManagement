import { z } from "zod";

// ─── Guild Emblem ────────────────────────────────────────────────
// A guild's emblem is a small config object rendered as SVG on the client
// (see GuildEmblem.tsx). Every part is an enum key so the renderer stays
// deterministic and the stored JSON can never carry arbitrary markup.

export const GUILD_EMBLEM_SHAPES = [
  "shield",
  "shield-flat",
  "circle",
  "hexagon",
  "diamond",
  "star",
] as const;
export type GuildEmblemShape = (typeof GUILD_EMBLEM_SHAPES)[number];

// Named palette keys — hex values live beside the renderer so a palette
// tweak never requires a data migration.
export const GUILD_EMBLEM_COLORS = [
  "crimson",
  "ember",
  "gold",
  "emerald",
  "teal",
  "azure",
  "sapphire",
  "violet",
  "rose",
  "umber",
  "onyx",
  "ivory",
] as const;
export type GuildEmblemColor = (typeof GUILD_EMBLEM_COLORS)[number];

export const GUILD_EMBLEM_ICONS = [
  "lion",
  "dragon",
  "wolf",
  "phoenix",
  "sword",
  "crossed-swords",
  "axe",
  "crown",
  "skull",
  "tree",
  "compass",
  "helm",
] as const;
export type GuildEmblemIcon = (typeof GUILD_EMBLEM_ICONS)[number];

export const GUILD_EMBLEM_ACCENTS = [
  "none",
  "wings",
  "laurels",
  "stars",
  "chevrons",
] as const;
export type GuildEmblemAccent = (typeof GUILD_EMBLEM_ACCENTS)[number];

export const GUILD_EMBLEM_BORDERS = [
  "none",
  "gold",
  "silver",
  "double",
] as const;
export type GuildEmblemBorder = (typeof GUILD_EMBLEM_BORDERS)[number];

export const guildEmblemSchema = z.object({
  shape: z.enum(GUILD_EMBLEM_SHAPES),
  bgColor: z.enum(GUILD_EMBLEM_COLORS),
  icon: z.enum(GUILD_EMBLEM_ICONS),
  accent: z.enum(GUILD_EMBLEM_ACCENTS).default("none"),
  border: z.enum(GUILD_EMBLEM_BORDERS).default("gold"),
  // Banner ribbon under the emblem; text defaults to the guild name at
  // render time when enabled without custom text.
  banner: z
    .object({
      enabled: z.boolean(),
      text: z.string().trim().max(16).optional(),
    })
    .optional(),
});
export type GuildEmblemConfig = z.infer<typeof guildEmblemSchema>;

export const updateGuildEmblemSchema = z.object({
  // null clears the emblem and falls back to the avatar/initial.
  emblem: guildEmblemSchema.nullable(),
});
export type UpdateGuildEmblemInput = z.infer<typeof updateGuildEmblemSchema>;
