"use client";

import { useId } from "react";
import type {
  GuildEmblemAccent,
  GuildEmblemColor,
  GuildEmblemConfig,
  GuildEmblemIcon,
  GuildEmblemShape,
} from "@guild/shared";

// ─── Metallic tones shared by every emblem part ──────────────────
const GOLD_HI = "#F3D68C";
const GOLD = "#D9AE5F";
const GOLD_DARK = "#8A6A2F";
const GOLD_SHADOW = "#4A3714";
const SILVER_HI = "#F1F3F7";
const SILVER = "#C9CDD6";
const SILVER_DARK = "#7C818C";
const SILVER_SHADOW = "#42454C";
const FORGE_BLACK = "#08080A";

// Named palette — a theme/glow color, not a fill. The shield's field stays a
// dark forged plate; this is what the sigil, accent filigree, and ambient
// aura burn in. `dark` tints the plate itself so the theme still reads at a
// glance even with the icon's glow dialed down.
export const EMBLEM_PALETTE: Record<GuildEmblemColor, { light: string; mid: string; dark: string }> = {
  crimson: { light: "#FF5A64", mid: "#B33540", dark: "#3A0E14" },
  ember: { light: "#FF9A44", mid: "#C96A22", dark: "#3F1F09" },
  gold: { light: "#F4CD70", mid: "#C79A3C", dark: "#3E2E10" },
  emerald: { light: "#4FE398", mid: "#2E9464", dark: "#0C3323" },
  teal: { light: "#3EE0E6", mid: "#228E92", dark: "#0A2E30" },
  azure: { light: "#5FB0FF", mid: "#3178C6", dark: "#0E2842" },
  sapphire: { light: "#6F86FF", mid: "#3854B8", dark: "#101C40" },
  violet: { light: "#B383FF", mid: "#7A4FD1", dark: "#241242" },
  rose: { light: "#FF87B8", mid: "#C4547F", dark: "#3E1526" },
  umber: { light: "#D9A466", mid: "#8C6438", dark: "#2A1D0F" },
  onyx: { light: "#9AA1B4", mid: "#4B4F5C", dark: "#0A0A0D" },
  ivory: { light: "#FFFDF5", mid: "#E4DCC2", dark: "#2A281F" },
};

// Shape outlines in a 100×110 box (extra bottom room for pointed shields).
const SHAPE_PATHS: Record<GuildEmblemShape, string> = {
  shield:
    "M50 5 L87 17 V52 C87 76 70 92 50 104 C30 92 13 76 13 52 V17 Z",
  "shield-flat":
    "M15 9 H85 V56 C85 78 67 92 50 101 C33 92 15 78 15 56 Z",
  circle: "M50 10 A44 44 0 1 1 49.99 10 Z",
  hexagon: "M50 7 L89 30 V80 L50 103 L11 80 V30 Z",
  diamond: "M50 6 L94 55 L50 104 L6 55 Z",
  star:
    "M50 4 L61 38 L97 38 L68 59 L79 93 L50 72 L21 93 L32 59 L3 38 L39 38 Z",
};

// Top-vertex finial anchor per shape (ornamental spike sitting on the apex).
// Shapes without a clean single apex get none.
const SHAPE_APEX: Partial<Record<GuildEmblemShape, { x: number; y: number }>> = {
  shield: { x: 50, y: 5 },
  hexagon: { x: 50, y: 7 },
  diamond: { x: 50, y: 6 },
};

// Upper-corner horn anchors — small forged claws curling up-and-out from the
// crest's shoulders (the reference badges' horned silhouette). Only shapes
// with two clear upper corners get them.
const SHAPE_HORNS: Partial<Record<GuildEmblemShape, { x: number; y: number }>> = {
  shield: { x: 13, y: 17 },
  "shield-flat": { x: 15, y: 9 },
  hexagon: { x: 11, y: 30 },
};

function hornPathAt(cx: number, cy: number): string {
  return (
    `M${cx + 2} ${cy + 2} ` +
    `C${cx - 5} ${cy - 2} ${cx - 8} ${cy - 8} ${cx - 7} ${cy - 15} ` +
    `C${cx - 3} ${cy - 10} ${cx + 2} ${cy - 6.5} ${cx + 7} ${cy - 5.5} ` +
    `C${cx + 4.5} ${cy - 3} ${cx + 3} ${cy - 0.5} ${cx + 2} ${cy + 2} Z`
  );
}

// Icon inner scale per shape — pointed shapes leave less room in the middle.
// Larger than a typical UI icon: the sigil should dominate the plate.
const SHAPE_ICON_SCALE: Record<GuildEmblemShape, number> = {
  shield: 2.15,
  "shield-flat": 2.1,
  circle: 2.15,
  hexagon: 2.1,
  diamond: 1.65,
  star: 1.5,
};

// Main icons, stroke-drawn in a 24×24 box to match the app's icon language.
const ICON_PATHS: Record<GuildEmblemIcon, React.ReactNode> = {
  lion: (
    <>
      {/* 12-point mane, face, brow, nose, muzzle */}
      <path d="M12 3 L14.2 5.6 L17.6 4.4 L17.8 7.9 L21.2 8.6 L19.2 11.5 L21.6 14.2 L18.3 15.1 L18.6 18.6 L15.4 17.6 L14 21 L12 18.8 L10 21 L8.6 17.6 L5.4 18.6 L5.7 15.1 L2.4 14.2 L4.8 11.5 L2.8 8.6 L6.2 7.9 L6.4 4.4 L9.8 5.6 Z" />
      <circle cx="12" cy="11.8" r="4.6" />
      <path d="M9.6 10.4 L11 11.1 M14.4 10.4 L13 11.1" />
      <path d="M12 12.4 L10.9 13.8 H13.1 Z" />
      <path d="M12 13.8 V15 M12 15 C11 16.2 9.9 16.3 9.2 15.8 M12 15 C13 16.2 14.1 16.3 14.8 15.8" />
    </>
  ),
  dragon: (
    <>
      <path d="M4 15c2-6 7-10 15-11-1.5 2-2 3.5-1.5 5.5L21 11l-3 2c.5 3-1.5 6-5 7l-1.5-2.5L9 20c-2.5-.5-4.5-2.5-5-5z" />
      <circle cx="15.2" cy="8.6" r=".6" fill="currentColor" stroke="none" />
      <path d="M9 14l3 1" />
    </>
  ),
  wolf: (
    <>
      <path d="M12 21c-3.5 0-6.5-2.5-6.5-6.5 0-2 .6-3.6-.5-6L8.5 10 12 4l3.5 6 3.5-1.5c-1.1 2.4-.5 4-.5 6 0 4-3 6.5-6.5 6.5z" />
      <path d="M9.2 13.2 L10.6 14.2 M14.8 13.2 L13.4 14.2" />
      <path d="M12 16.5l-1 1.5h2z" />
      <path d="M5 3.5 L8.5 10 M19 3.5 L15.5 10" />
    </>
  ),
  phoenix: (
    <>
      {/* flame body + head, three layered wing sweeps per side */}
      <path d="M12 21 C10.6 18.2 10.7 15.4 12 12.6 C13.3 15.4 13.4 18.2 12 21 Z" />
      <path d="M12 12.6 C11.2 11.4 11.2 10.2 12 9 C12.8 10.2 12.8 11.4 12 12.6 Z" />
      <path d="M12 9 V7.2" />
      <path d="M10.8 13 C7.5 12.5 4.8 10.5 3.2 7 C5.8 8.4 8.2 8.9 10.4 8.6" />
      <path d="M10.5 15.2 C6.8 15.2 3.8 13.6 2 10.6 C4.8 11.7 7.4 12.1 9.8 11.7" />
      <path d="M10.6 17.5 C7.4 17.9 4.6 17 2.6 14.8 C5.2 15.3 7.6 15.2 9.9 14.4" />
      <path d="M13.2 13 C16.5 12.5 19.2 10.5 20.8 7 C18.2 8.4 15.8 8.9 13.6 8.6" />
      <path d="M13.5 15.2 C17.2 15.2 20.2 13.6 22 10.6 C19.2 11.7 16.6 12.1 14.2 11.7" />
      <path d="M13.4 17.5 C16.6 17.9 19.4 17 21.4 14.8 C18.8 15.3 16.4 15.2 14.1 14.4" />
    </>
  ),
  sword: (
    <>
      {/* blade with tip, fuller, curved guard, grip, pommel */}
      <path d="M12 2 L14 5 V13.8 H10 V5 Z" />
      <path d="M12 5.5 V12.5" />
      <path d="M7.5 13.8 H16.5 C17.1 13.8 17.3 14.7 16.7 14.95 L14 15.8 H10 L7.3 14.95 C6.7 14.7 6.9 13.8 7.5 13.8 Z" />
      <path d="M11 15.8 H13 V19.3 H11 Z" />
      <circle cx="12" cy="20.7" r="1.3" />
    </>
  ),
  "crossed-swords": (
    <>
      <g>
        <path d="M4.5 3 L16 14.5" />
        <path d="M13.4 17.1 L18.6 11.9" />
        <path d="M15.2 16 L18 18.8" />
        <circle cx="19" cy="19.8" r="1.1" />
        <path d="M4.5 3 L8 3.8 M4.5 3 L5.3 6.5" />
      </g>
      <g transform="scale(-1,1) translate(-24,0)">
        <path d="M4.5 3 L16 14.5" />
        <path d="M13.4 17.1 L18.6 11.9" />
        <path d="M15.2 16 L18 18.8" />
        <circle cx="19" cy="19.8" r="1.1" />
        <path d="M4.5 3 L8 3.8 M4.5 3 L5.3 6.5" />
      </g>
    </>
  ),
  axe: (
    <>
      {/* double-headed labrys */}
      <path d="M12 3.5 V20.5 M10.4 20.5 H13.6" />
      <path d="M10.8 5.2 C7.8 4.6 5.4 5.6 3.8 7.8 C4.4 10.4 6.6 12 9.6 12.3 C8.5 10 8.9 7.4 10.8 5.2 Z" />
      <g transform="scale(-1,1) translate(-24,0)">
        <path d="M10.8 5.2 C7.8 4.6 5.4 5.6 3.8 7.8 C4.4 10.4 6.6 12 9.6 12.3 C8.5 10 8.9 7.4 10.8 5.2 Z" />
      </g>
    </>
  ),
  crown: (
    <>
      <path d="M3 8l4 4 5-7 5 7 4-4-1.5 11h-15z" />
      <path d="M5.5 21h13" />
      <circle cx="12" cy="14.5" r="1" />
    </>
  ),
  skull: (
    <>
      <path d="M12 2a8 8 0 0 0-8 8c0 2.5 1 4.5 3 6v4h10v-4c2-1.5 3-3.5 3-6a8 8 0 0 0-8-8z" />
      <circle cx="9" cy="11" r="1.4" />
      <circle cx="15" cy="11" r="1.4" />
      <path d="M12 14l-1 2.5h2zM9.5 20v-2M14.5 20v-2" />
    </>
  ),
  tree: (
    <>
      <path d="M12 2l5 6h-2.5l4 5H15l4 6H5l4-6H5.5l4-5H7z" />
      <path d="M12 19v3" />
    </>
  ),
  compass: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21" />
      <path d="M15.5 8.5l-2 5-5 2 2-5z" />
    </>
  ),
  helm: (
    <>
      <path d="M12 3c-4.5 0-7 3-7 7v10l3-1.5V21l4-2 4 2v-2.5L19 20V10c0-4-2.5-7-7-7z" />
      <path d="M12 3v16M8.5 10h7" />
    </>
  ),
};

// Layered feather sweeps for the left side; the right side mirrors around
// x=50. Drawn twice by Accent — a dark understroke, then the glow pass — so
// the filigree separates from the busy plate behind it.
const WING_PATHS_LEFT = [
  "M30 46 C20 42 13 34 11 23 C17 30 24 34 30 36",
  "M28 51 C17 48 10 41 8 32 C14 38 21 42 27 44",
  "M27 56 C16 54 9 48 6 41 C13 46 20 49 26 51",
];

// Laurel branch: stem + filled leaves, left side (right side mirrors).
const LAUREL_STEM_LEFT = "M29 88 C19 81 13.5 70 14.5 56";
const LAUREL_LEAVES_LEFT = [
  "M17 63 C13 62 11 59 11 55.5 C14.5 56.5 16.5 59 17 63 Z",
  "M19.5 71 C15.5 70.5 13 68 12.5 64.5 C16 65.5 18.5 68 19.5 71 Z",
  "M23.5 78.5 C19.5 78.5 16.5 76.5 15.5 73 C19 73.5 22 75.5 23.5 78.5 Z",
  "M28.5 84.5 C24.5 85 21.5 83.5 20 80.5 C23.5 80.5 26.5 82 28.5 84.5 Z",
];

const MIRROR_X50 = "scale(-1,1) translate(-100,0)";

function Accent({ accent, glow }: { accent: GuildEmblemAccent; glow: string }) {
  const strokeCommon = {
    fill: "none",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (accent) {
    case "wings": {
      const feathers = (stroke: string, width: number, opacity: number) => (
        <g {...strokeCommon} stroke={stroke} strokeWidth={width} opacity={opacity}>
          {WING_PATHS_LEFT.map((d) => (
            <path key={d} d={d} />
          ))}
          <g transform={MIRROR_X50}>
            {WING_PATHS_LEFT.map((d) => (
              <path key={d} d={d} />
            ))}
          </g>
        </g>
      );
      return (
        <>
          {feathers("rgba(0,0,0,0.6)", 3.2, 0.8)}
          {feathers(glow, 1.7, 0.95)}
        </>
      );
    }
    case "laurels": {
      const branch = (stroke: string, fill: string, width: number, opacity: number) => (
        <g {...strokeCommon} stroke={stroke} strokeWidth={width} opacity={opacity}>
          <path d={LAUREL_STEM_LEFT} fill="none" />
          {LAUREL_LEAVES_LEFT.map((d) => (
            <path key={d} d={d} fill={fill} strokeWidth={width * 0.5} />
          ))}
          <g transform={MIRROR_X50}>
            <path d={LAUREL_STEM_LEFT} fill="none" />
            {LAUREL_LEAVES_LEFT.map((d) => (
              <path key={d} d={d} fill={fill} strokeWidth={width * 0.5} />
            ))}
          </g>
        </g>
      );
      return (
        <>
          {branch("rgba(0,0,0,0.6)", "rgba(0,0,0,0.6)", 3, 0.8)}
          {branch(glow, glow, 1.5, 0.95)}
        </>
      );
    }
    case "stars": {
      const star = (cx: number, cy: number, r: number) =>
        `M${cx} ${cy - r} L${cx + r * 0.3} ${cy - r * 0.3} L${cx + r} ${cy} L${cx + r * 0.3} ${cy + r * 0.3} L${cx} ${cy + r} L${cx - r * 0.3} ${cy + r * 0.3} L${cx - r} ${cy} L${cx - r * 0.3} ${cy - r * 0.3} Z`;
      const shapes = [star(30, 24, 4), star(50, 17, 5.5), star(70, 24, 4), star(38, 19, 2), star(62, 19, 2)];
      return (
        <>
          <g fill="rgba(0,0,0,0.6)" stroke="rgba(0,0,0,0.6)" strokeWidth={1.6} opacity={0.8}>
            {shapes.map((d) => (
              <path key={d} d={d} />
            ))}
          </g>
          <g fill={glow} stroke="none" opacity={0.95}>
            {shapes.map((d) => (
              <path key={d} d={d} />
            ))}
          </g>
        </>
      );
    }
    case "chevrons": {
      const rows = ["M38 84 L50 77 L62 84", "M38 92 L50 85 L62 92"];
      return (
        <>
          <g {...strokeCommon} stroke="rgba(0,0,0,0.6)" strokeWidth={3.4} opacity={0.8}>
            {rows.map((d) => (
              <path key={d} d={d} />
            ))}
          </g>
          <g {...strokeCommon} stroke={glow} strokeWidth={1.8} opacity={0.95}>
            {rows.map((d) => (
              <path key={d} d={d} />
            ))}
          </g>
        </>
      );
    }
    default:
      return null;
  }
}

/** Beveled ring: a dark sunken groove, a bright cast-metal band, and a
 * hairline separating the band from the field — a stamped/forged rim rather
 * than a flat outline. */
function BorderStrokes({
  shape,
  border,
  goldUrl,
  silverUrl,
}: {
  shape: GuildEmblemShape;
  border: GuildEmblemConfig["border"];
  goldUrl: string;
  silverUrl: string;
}) {
  const d = SHAPE_PATHS[shape];
  if (border === "none") {
    return (
      <>
        <path d={d} fill="none" stroke="rgba(0,0,0,0.7)" strokeWidth={1.8} />
        <path d={d} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={0.6} transform="translate(-0.4 -0.4)" />
      </>
    );
  }
  if (border === "double") {
    return (
      <>
        <path d={d} fill="none" stroke="rgba(0,0,0,0.65)" strokeWidth={3.4} />
        <path d={d} fill="none" stroke={goldUrl} strokeWidth={2} />
        <g transform="translate(5 5.5) scale(0.9)">
          <path d={d} fill="none" stroke="rgba(0,0,0,0.5)" strokeWidth={2.2} />
          <path d={d} fill="none" stroke={goldUrl} strokeWidth={1.3} />
        </g>
      </>
    );
  }
  const metal = border === "silver" ? silverUrl : goldUrl;
  return (
    <>
      {/* sunken groove */}
      <path d={d} fill="none" stroke="rgba(0,0,0,0.7)" strokeWidth={6} />
      {/* raised metal band */}
      <path d={d} fill="none" stroke={metal} strokeWidth={3.6} />
      {/* hairline separating band from field */}
      <path d={d} fill="none" stroke="rgba(0,0,0,0.6)" strokeWidth={1} transform="scale(0.982)" style={{ transformOrigin: "50px 54px" }} />
    </>
  );
}

export interface GuildEmblemProps {
  emblem: GuildEmblemConfig | null | undefined;
  /** Guild name — banner fallback text and the no-emblem initial tile. */
  name: string;
  /** Rendered width in px (height follows the emblem's aspect). */
  size?: number;
  className?: string;
}

// Padding (in viewBox units) around the badge so the ambient glow has room
// to bleed past the silhouette instead of getting clipped at the edge.
const PAD = 11;

/**
 * Renders a guild's customizable emblem as pure SVG — a forged dark plate
 * with a glowing sigil in the guild's theme color, a cast-metal bevel rim,
 * and an ambient aura bleeding past the edge. With no emblem set it falls
 * back to the familiar initial tile so callers can swap it in anywhere a
 * guild avatar used to be.
 */
export default function GuildEmblem({ emblem, name, size = 48, className = "" }: GuildEmblemProps) {
  const uid = useId();

  if (!emblem) {
    return (
      <div
        className={`rounded-full bg-white/[0.08] border border-white/10 flex items-center justify-center font-bold text-white/80 shrink-0 ${className}`}
        style={{ width: size, height: size, fontSize: Math.max(10, size * 0.38) }}
        aria-label={name}
      >
        {(name || "G").charAt(0).toUpperCase()}
      </div>
    );
  }

  const palette = EMBLEM_PALETTE[emblem.bgColor] ?? EMBLEM_PALETTE.onyx;
  const bannerEnabled = Boolean(emblem.banner?.enabled);
  const bannerText = (emblem.banner?.text?.trim() || name || "").slice(0, 16).toUpperCase();
  const viewHeight = bannerEnabled ? 130 : 112;
  const iconScale = SHAPE_ICON_SCALE[emblem.shape] ?? 2;
  // Icon box is 24×24; center it on the shape's visual middle (50, 54).
  const iconOffset = 12 * iconScale;
  const apex = SHAPE_APEX[emblem.shape];
  const horns = SHAPE_HORNS[emblem.shape];

  const boxW = 100 + PAD * 2;
  const boxH = viewHeight + PAD * 2;

  const fieldId = `${uid}-field`;
  const goldId = `${uid}-gold`;
  const silverId = `${uid}-silver`;
  const glowId = `${uid}-glow`;
  const clipId = `${uid}-clip`;
  const grainId = `${uid}-grain`;
  const vignetteId = `${uid}-vignette`;
  const shadowId = `${uid}-shadow`;
  const iconShadowId = `${uid}-icon-shadow`;
  const auraBlurId = `${uid}-aura-blur`;
  const glowBlurId = `${uid}-glow-blur`;
  const bannerId = `${uid}-banner`;

  const goldUrl = `url(#${goldId})`;
  const silverUrl = `url(#${silverId})`;
  const glowUrl = `url(#${glowId})`;

  return (
    <svg
      viewBox={`${-PAD} ${-PAD} ${boxW} ${boxH}`}
      width={size}
      height={(size * boxH) / boxW}
      className={`shrink-0 ${className}`}
      role="img"
      aria-label={`${name} emblem`}
    >
      <defs>
        {/* Forged plate — a faint tint of the theme color at the rim,
            crushing to near-black toward the lower-right. The theme reads as
            a moody undertone, not a flat fill. */}
        <linearGradient id={fieldId} x1="0.1" y1="0" x2="0.8" y2="1">
          <stop offset="0%" stopColor={palette.mid} />
          <stop offset="35%" stopColor={palette.dark} />
          <stop offset="100%" stopColor={FORGE_BLACK} />
        </linearGradient>

        {/* Glowing sigil — the theme color, hot at the core. */}
        <radialGradient id={glowId} cx="50%" cy="45%" r="65%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="35%" stopColor={palette.light} />
          <stop offset="100%" stopColor={palette.mid} />
        </radialGradient>

        {/* Cast-gold rim: dark → bright → dark, like light raking across a
            convex metal band */}
        <linearGradient id={goldId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={GOLD_SHADOW} />
          <stop offset="35%" stopColor={GOLD_HI} />
          <stop offset="55%" stopColor={GOLD} />
          <stop offset="100%" stopColor={GOLD_SHADOW} />
        </linearGradient>
        <linearGradient id={silverId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={SILVER_SHADOW} />
          <stop offset="35%" stopColor={SILVER_HI} />
          <stop offset="55%" stopColor={SILVER} />
          <stop offset="100%" stopColor={SILVER_SHADOW} />
        </linearGradient>

        <radialGradient id={vignetteId} cx="50%" cy="42%" r="62%">
          <stop offset="0%" stopColor="#000000" stopOpacity="0" />
          <stop offset="70%" stopColor="#000000" stopOpacity="0" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0.55" />
        </radialGradient>

        <clipPath id={clipId}>
          <path d={SHAPE_PATHS[emblem.shape]} />
        </clipPath>

        {/* Fine grain so the plate reads as forged metal, not flat vector fill. */}
        <filter id={grainId} x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" result="noise" />
          <feColorMatrix in="noise" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.5 0" />
        </filter>

        <linearGradient id={bannerId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#232530" />
          <stop offset="100%" stopColor="#0E0E13" />
        </linearGradient>

        <filter id={shadowId} x="-20%" y="-20%" width="140%" height="150%">
          <feDropShadow dx="0" dy="1.6" stdDeviation="1.8" floodColor="#000000" floodOpacity="0.5" />
        </filter>
        <filter id={iconShadowId} x="-60%" y="-60%" width="220%" height="220%">
          <feDropShadow dx="0.4" dy="0.7" stdDeviation="0.3" floodColor="#000000" floodOpacity="0.7" />
        </filter>
        <filter id={auraBlurId} x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="3.4" />
        </filter>
        <filter id={glowBlurId} x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="1.3" />
        </filter>
      </defs>

      {/* Ambient aura bleeding past the silhouette — the ability-icon glow */}
      <path
        d={SHAPE_PATHS[emblem.shape]}
        fill={palette.light}
        opacity={0.5}
        filter={`url(#${auraBlurId})`}
        style={{ mixBlendMode: "screen" }}
      />

      <g filter={`url(#${shadowId})`}>
        <path d={SHAPE_PATHS[emblem.shape]} fill={`url(#${fieldId})`} />

        <g clipPath={`url(#${clipId})`}>
          {/* forged-metal grain */}
          <rect x={-PAD} y={-PAD} width={boxW} height={boxH} filter={`url(#${grainId})`} style={{ mixBlendMode: "overlay" }} />
          {/* corner vignette for depth */}
          <rect x={-PAD} y={-PAD} width={boxW} height={boxH} fill={`url(#${vignetteId})`} />
        </g>

        <BorderStrokes shape={emblem.shape} border={emblem.border} goldUrl={goldUrl} silverUrl={silverUrl} />

        {/* inner glow ring — the aura contained just inside the rim */}
        <g clipPath={`url(#${clipId})`}>
          <path
            d={SHAPE_PATHS[emblem.shape]}
            fill="none"
            stroke={palette.light}
            strokeWidth={5}
            opacity={0.4}
            filter={`url(#${auraBlurId})`}
            style={{ mixBlendMode: "screen" }}
          />
        </g>

        {apex && (
          <path
            d={`M${apex.x} ${apex.y - 7} L${apex.x + 2.4} ${apex.y + 1.5} L${apex.x} ${apex.y + 4} L${apex.x - 2.4} ${apex.y + 1.5} Z`}
            fill={goldUrl}
            stroke="rgba(0,0,0,0.5)"
            strokeWidth={0.5}
          />
        )}

        {/* Forged corner horns — part of the border treatment, so plain
            "none" borders stay clean while any metal rim gets the horned
            crest silhouette. Silver rims get silver horns. */}
        {horns && emblem.border !== "none" && (
          <g
            fill={emblem.border === "silver" ? silverUrl : goldUrl}
            stroke="rgba(0,0,0,0.55)"
            strokeWidth={0.7}
            strokeLinejoin="round"
          >
            <path d={hornPathAt(horns.x, horns.y)} />
            <g transform={MIRROR_X50}>
              <path d={hornPathAt(horns.x, horns.y)} />
            </g>
          </g>
        )}

        <Accent accent={emblem.accent} glow={glowUrl} />

        {/* glow layer behind the sigil */}
        <g
          transform={`translate(${50 - iconOffset} ${54 - iconOffset}) scale(${iconScale})`}
          fill="none"
          stroke={palette.light}
          strokeWidth={3.2}
          strokeLinecap="round"
          strokeLinejoin="round"
          color={palette.light}
          opacity={0.75}
          filter={`url(#${glowBlurId})`}
          style={{ mixBlendMode: "screen" }}
        >
          {ICON_PATHS[emblem.icon]}
        </g>
        {/* crisp cast-metal sigil on top */}
        <g
          transform={`translate(${50 - iconOffset} ${54 - iconOffset}) scale(${iconScale})`}
          fill="none"
          stroke={goldUrl}
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          color={goldUrl}
          filter={`url(#${iconShadowId})`}
        >
          {ICON_PATHS[emblem.icon]}
        </g>
      </g>

      {bannerEnabled && (
        <g filter={`url(#${shadowId})`}>
          <rect x="10" y="102" width="80" height="21" rx="2" fill={`url(#${bannerId})`} stroke="rgba(0,0,0,0.6)" strokeWidth={3} />
          <rect x="10" y="102" width="80" height="21" rx="2" fill="none" stroke={goldUrl} strokeWidth={1.3} />
          <line x1="13" y1="103.3" x2="87" y2="103.3" stroke="rgba(255,255,255,0.14)" strokeWidth={0.6} />
          <path d="M9 102.5 L9 121.5 L12.5 118 L12.5 106 Z M91 102.5 L91 121.5 L87.5 118 L87.5 106 Z" fill={goldUrl} stroke="rgba(0,0,0,0.5)" strokeWidth={0.5} />
          <text
            x="50"
            y="115.8"
            textAnchor="middle"
            fontSize={bannerText.length > 10 ? 7 : 8.5}
            fontWeight={700}
            letterSpacing="0.12em"
            fill={GOLD_HI}
            style={{ fontFamily: "inherit" }}
          >
            {bannerText}
          </text>
        </g>
      )}
    </svg>
  );
}
