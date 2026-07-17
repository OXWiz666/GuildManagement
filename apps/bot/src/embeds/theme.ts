/**
 * ForgeKeep brand tokens, mirrored from the website's design system
 * (apps/web/src/app/globals.css → "Obsidian Guild Command").
 *
 * Discord embeds take an integer color, so these are the same hex values the
 * site uses, converted. Keeping the numbers here — rather than importing the
 * CSS — is deliberate: the bot has no stylesheet pipeline, and these four
 * values are the entire overlap.
 */
export const BrandColor = {
  /** --forge-gold #d4a853 — default/branded embeds. */
  GOLD: 0xd4a853,
  /** --forge-gold-bright #f5c542 — emphasis (leaderboard #1, spawns). */
  GOLD_BRIGHT: 0xf5c542,
  /** Success / alive / CP increase. */
  GREEN: 0x3fb950,
  /** Failure / killed / CP decrease. */
  RED: 0xda3633,
  /** Warning / imminent spawn. */
  AMBER: 0xd29922,
  /** Neutral information. */
  BLUE: 0x388bfd,
} as const;

export const BRAND_FOOTER = "Powered by ForgeKeep";

/**
 * Optional footer icon. There is no canonical hosted ForgeKeep logo in the repo
 * today, so this stays unset unless an operator supplies a URL — an embed with
 * no footer icon renders cleanly, whereas a wrong URL renders as a broken image
 * on every message the bot ever sends.
 *
 * Boss thumbnails are a different story: `getBossImageUrl()` from @guild/shared
 * already resolves the real public bucket the website uses, so embeds call that
 * rather than hardcoding anything here.
 */
export const FORGEKEEP_ICON_URL = process.env["FORGEKEEP_ICON_URL"] ?? null;
