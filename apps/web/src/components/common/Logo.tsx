"use client";

import { useId } from "react";

/**
 * ForgeKeep brand mark — a struck anvil set on a faceted keep/shield, crowned
 * by an ember spark. Rendered in the forge-gold gradient so it sits natively
 * in the obsidian guild-command theme. A faint conic "forge ring" wakes up on
 * hover (driven by the parent `group`).
 */
export function LogoMark({
  className = "h-9 w-9",
  animated = true,
}: {
  className?: string;
  animated?: boolean;
}) {
  const gid = useId().replace(/:/g, "");

  return (
    <svg viewBox="0 0 40 40" className={className} fill="none" role="img" aria-label="ForgeKeep">
      <defs>
        <linearGradient id={`${gid}-gold`} x1="6" y1="3" x2="34" y2="37" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#f5c542" />
          <stop offset="52%" stopColor="#d4a853" />
          <stop offset="100%" stopColor="#a78332" />
        </linearGradient>
        <linearGradient id={`${gid}-anvil`} x1="10" y1="16" x2="30" y2="26" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#fff3cf" />
          <stop offset="100%" stopColor="#d4a853" />
        </linearGradient>
      </defs>

      {/* Keep / faceted shield */}
      <path
        d="M20 2.5 L34 7.5 V19 C34 27.8 28 33.8 20 37.5 C12 33.8 6 27.8 6 19 V7.5 Z"
        fill={`url(#${gid}-gold)`}
        fillOpacity="0.07"
        stroke={`url(#${gid}-gold)`}
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      {/* Inner facet line for depth */}
      <path
        d="M20 6 L30 9.6 V19 C30 25.4 25.6 30 20 32.8"
        stroke={`url(#${gid}-gold)`}
        strokeOpacity="0.35"
        strokeWidth="0.8"
        strokeLinejoin="round"
      />

      {/* Anvil — horn left, stepped body, sturdy base */}
      <path
        d="M12.5 17.4 H24 L27.5 19 L23.6 20.9 H21.2 V22.8 H23.4 V25.2 H15.6 V22.8 H17.8 V20.9 H12.5 Z"
        fill={`url(#${gid}-anvil)`}
      />

      {/* Ember spark rising from the strike point */}
      <path
        className={animated ? "fk-spark" : ""}
        d="M28.8 7.4 L29.7 10.1 L32.4 11 L29.7 11.9 L28.8 14.6 L27.9 11.9 L25.2 11 L27.9 10.1 Z"
        fill="#f5c542"
        style={{ transformOrigin: "28.8px 11px" }}
      />
    </svg>
  );
}

/**
 * Framed mark with a forge-ring halo that lights on hover. Drop inside a parent
 * carrying the `group` class to wire the hover state.
 */
export function LogoBadge({ size = 36 }: { size?: number }) {
  return (
    <span
      className="relative grid place-items-center rounded-xl border border-[var(--metal-border)] bg-[var(--forge-glow)]/40 transition-all duration-500 group-hover:border-[var(--forge-gold)]/50 group-hover:bg-[var(--forge-glow)] group-hover:shadow-[0_0_18px_-2px_rgba(212,168,83,0.4)]"
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
      <LogoMark className="h-[64%] w-[64%]" />
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
 * Stacked brand lockup with the full tagline keyline — for hero / auth / footer
 * moments where there is room to state the promise.
 */
export function LogoTagline({
  size = 44,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <span className={`group inline-flex items-center gap-3.5 ${className}`}>
      <LogoBadge size={size} />
      <span className="flex flex-col leading-none">
        <span className="text-xl font-semibold tracking-tight text-white font-fantasy">
          Forge<span className="text-[var(--forge-gold)]">Keep</span>
        </span>
        <span className="mt-2 flex items-center gap-2">
          <span className="brand-keyline w-6" />
          <span className="text-[10px] font-medium tracking-[0.04em] text-[var(--forge-gold)]/75">
            {TAGLINE}
          </span>
        </span>
      </span>
    </span>
  );
}
