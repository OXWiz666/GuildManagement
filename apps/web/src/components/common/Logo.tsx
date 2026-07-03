"use client";

/**
 * ForgeKeep brand assets.
 *
 * The mark is the shipped raster logo (`/forgekeep-logo.png`) — a struck anvil
 * with a torch flame set on a faceted keep/shield, above the wordmark. Because
 * the artwork ships on a solid black field it is designed to sit on the app's
 * obsidian surfaces, where the black blends seamlessly.
 *
 * - `/forgekeep-icon.png`  — shield-only crop, for compact / square spots.
 * - `/forgekeep-logo.png`  — full vertical lockup (shield + wordmark + tagline).
 */

/**
 * Shield-only brand icon. Sized by `className` (e.g. "h-9 w-9") just like the
 * previous SVG mark, so existing call sites keep working. `animated` is kept for
 * API compatibility and is intentionally unused.
 */
export function LogoMark({
  className = "h-9 w-9",
}: {
  className?: string;
  /** Kept for API compatibility with the previous SVG mark; unused. */
  animated?: boolean;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/forgekeep-icon.png"
      alt="ForgeKeep"
      className={`object-contain ${className}`}
      draggable={false}
    />
  );
}

/**
 * Framed mark with a forge-ring halo that lights on hover. Drop inside a parent
 * carrying the `group` class to wire the hover state.
 */
export function LogoBadge({ size = 36 }: { size?: number }) {
  return (
    <span
      className="relative grid place-items-center overflow-hidden rounded-xl border border-[var(--metal-border)] bg-[var(--obsidian-surface)] transition-all duration-500 group-hover:border-[var(--forge-gold)]/50 group-hover:shadow-[0_0_18px_-2px_rgba(212,168,83,0.4)]"
      style={{ height: size, width: size }}
    >
      {/* Conic forge ring — only visible on hover */}
      <span
        aria-hidden
        className="absolute -inset-px rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"
        style={{
          background:
            "conic-gradient(from 0deg, transparent 0deg, rgba(245,197,66,0.55) 60deg, transparent 140deg, transparent 360deg)",
          WebkitMask:
            "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
          WebkitMaskComposite: "xor",
          maskComposite: "exclude",
          padding: 1,
          animation: "forge-ring-spin 4s linear infinite",
        }}
      />
      <LogoMark className="h-[86%] w-[86%]" />
      <span className="sr-only">ForgeKeep</span>
    </span>
  );
}

/**
 * Full lockup: framed mark + wordmark + descriptor. Used in nav, footer, auth.
 */
export default function Logo({
  size = 36,
  showWordmark = true,
  descriptor = "Guild Command",
  className = "",
}: {
  size?: number;
  showWordmark?: boolean;
  descriptor?: string;
  className?: string;
}) {
  return (
    <span className={`flex items-center gap-2.5 ${className}`}>
      <LogoBadge size={size} />

      {showWordmark && (
        <span className="flex flex-col leading-none">
          <span className="text-[15px] font-semibold tracking-tight text-white transition-colors group-hover:text-[var(--forge-gold-bright)] font-fantasy">
            Forge<span className="text-[var(--forge-gold)]">Keep</span>
          </span>
          {descriptor && (
            <span className="mt-1 text-[8px] font-mono uppercase tracking-[0.22em] text-[var(--forge-gold)]/60">
              {descriptor}
            </span>
          )}
        </span>
      )}
    </span>
  );
}

/** The brand tagline. Single source of truth so every surface stays in sync. */
export const TAGLINE = "Forged in trust, kept in order.";

/**
 * Full stacked brand lockup — the shipped artwork with the shield, wordmark and
 * tagline all together. For hero / auth / footer moments where there is room to
 * state the promise. `size` maps to the icon height for backwards compatibility;
 * the full lockup is scaled proportionally from it.
 */
export function LogoTagline({
  size = 44,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  const width = Math.round(size * 4.6);
  const height = Math.round((width * 486) / 621);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/forgekeep-logo.png"
      alt="ForgeKeep — Lead · Organize · Conquer"
      width={width}
      height={height}
      className={`object-contain ${className}`}
      draggable={false}
    />
  );
}
