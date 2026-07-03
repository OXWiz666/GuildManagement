// Reconstruct the in-game Equipment panel structure from detected tile boxes, so we
// can assign each tile to a *specific slot by geometry* (not by guessing from content).
// The panel is fixed: two big weapon/gadget cards at the top, then two rows of six small
// tiles with a gap in the middle for the character —
//   Row A: helm, upperArmor, lowerArmor | earrings, necklace, bracelet
//   Row B: gloves, boots, cloak         | ring,     belt,     insignia
// Matching each tile only against its own slot's bucket is the key accuracy win.

import type { Box } from "@/lib/icon-detect";
import type { EquipmentSlot } from "@guild/shared";

// Left/right column order (3 each) for the two small-tile rows.
const ROW_A_LEFT: EquipmentSlot[] = ["helm", "upperArmor", "lowerArmor"];
const ROW_A_RIGHT: EquipmentSlot[] = ["earrings", "necklace", "bracelet"];
const ROW_B_LEFT: EquipmentSlot[] = ["gloves", "boots", "cloak"];
const ROW_B_RIGHT: EquipmentSlot[] = ["ring", "belt", "insignia"];

const cx = (b: Box) => b.x + b.w / 2;
const cy = (b: Box) => b.y + b.h / 2;

/** Cluster values into groups whose spread is within `tol`; returns sorted group means. */
function clusterCenters(vals: number[], tol: number): number[] {
  const sorted = [...vals].sort((a, b) => a - b);
  const groups: number[][] = [];
  for (const v of sorted) {
    const last = groups[groups.length - 1];
    if (last && v - last[0]! <= tol) last.push(v);
    else groups.push([v]);
  }
  return groups.map((g) => g.reduce((s, x) => s + x, 0) / g.length);
}

/** Nearest box to a target point, or null if none within `maxDist`. */
function nearest(boxes: Box[], px: number, py: number, maxDist: number): Box | null {
  let best: Box | null = null;
  let bestD = Infinity;
  for (const b of boxes) {
    const d = Math.hypot(cx(b) - px, cy(b) - py);
    if (d < bestD) {
      bestD = d;
      best = b;
    }
  }
  return best && bestD <= maxDist ? best : null;
}

/**
 * Assign detected tiles to equipment slots by their position in the panel grid.
 * Returns a partial map (slots with no confidently-located tile are omitted), or null
 * when the boxes don't look like an equipment panel (caller should fall back).
 */
export function assignSlotsByGeometry(
  boxes: Box[],
  imgW: number,
  imgH: number,
): Partial<Record<EquipmentSlot, Box>> | null {
  if (boxes.length < 6) return null;

  const areas = boxes.map((b) => b.w * b.h);
  const medianArea = [...areas].sort((a, b) => a - b)[Math.floor(areas.length / 2)]!;

  // Big cards: notably larger than the median tile (weapon/gadget).
  const big = boxes.filter((b) => b.w * b.h > medianArea * 1.7);
  const small = boxes.filter((b) => b.w * b.h <= medianArea * 1.7);
  if (small.length < 6) return null;

  const out: Partial<Record<EquipmentSlot, Box>> = {};

  // Weapon = big card on the left half; Gadget = big card on the right half.
  const midX = imgW / 2;
  const bigLeft = big.filter((b) => cx(b) < midX).sort((a, b) => cy(a) - cy(b))[0];
  const bigRight = big.filter((b) => cx(b) >= midX).sort((a, b) => cy(a) - cy(b))[0];
  if (bigLeft) out.weapon = bigLeft;
  if (bigRight) out.gadget = bigRight;

  // Two rows of small tiles by y-centre.
  const rowCenters = clusterCenters(small.map(cy), Math.max(imgH * 0.06, 8));
  if (rowCenters.length < 2) return null;
  // Use the two most-populated rows (the accessory/armor rows).
  const rowsWithCounts = rowCenters
    .map((yc) => ({ yc, count: small.filter((b) => Math.abs(cy(b) - yc) <= imgH * 0.06).length }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 2)
    .sort((a, b) => a.yc - b.yc);
  if (rowsWithCounts.length < 2) return null;

  const tileW = small.reduce((s, b) => s + b.w, 0) / small.length;
  const maxDist = tileW * 0.9;

  const fillRow = (
    yc: number,
    leftSlots: EquipmentSlot[],
    rightSlots: EquipmentSlot[],
  ) => {
    const rowTiles = small.filter((b) => Math.abs(cy(b) - yc) <= imgH * 0.06);
    if (rowTiles.length === 0) return;
    const xs = rowTiles.map(cx).sort((a, b) => a - b);
    // Split left/right on the largest horizontal gap (the character in the centre).
    let gapIdx = 0;
    let gap = -1;
    for (let i = 1; i < xs.length; i++) {
      if (xs[i]! - xs[i - 1]! > gap) {
        gap = xs[i]! - xs[i - 1]!;
        gapIdx = i;
      }
    }
    const splitX = (xs[gapIdx - 1]! + xs[gapIdx]!) / 2;
    const left = rowTiles.filter((b) => cx(b) < splitX).sort((a, b) => cx(a) - cx(b));
    const right = rowTiles.filter((b) => cx(b) >= splitX).sort((a, b) => cx(a) - cx(b));

    // Evenly space each side into 3 columns and snap the nearest tile to each.
    const place = (side: Box[], slots: EquipmentSlot[]) => {
      if (side.length === 0) return;
      const minX = cx(side[0]!);
      const maxX = cx(side[side.length - 1]!);
      for (let i = 0; i < slots.length; i++) {
        const targetX =
          slots.length === 1 ? minX : minX + ((maxX - minX) * i) / (slots.length - 1);
        const b = nearest(side, targetX, yc, maxDist);
        if (b) out[slots[i]!] = b;
      }
    };
    place(left, leftSlots);
    place(right, rightSlots);
  };

  fillRow(rowsWithCounts[0]!.yc, ROW_A_LEFT, ROW_A_RIGHT);
  fillRow(rowsWithCounts[1]!.yc, ROW_B_LEFT, ROW_B_RIGHT);

  // Require a reasonable number of located slots, else this isn't a panel.
  const located = Object.keys(out).length;
  if (located < 8) return null;
  return out;
}

// ─── Rarity from frame colour ────────────────────────────────────────
// Each tile's border colour encodes rarity. We sample the frame ring (just inside the
// tile edge) and classify by hue. Used as a *soft boost*, never a hard filter.

export type Rarity = "Mythic" | "Legend" | "Epic" | "Rare" | "Uncommon";

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : d / max;
  return [h, s, max];
}

/** Classify a tile's rarity from its frame colour, or null if unclear. */
export function detectTileRarity(src: CanvasImageSource, box: Box): Rarity | null {
  try {
    const size = 24;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(src, box.x, box.y, box.w, box.h, 0, 0, size, size);
    const data = ctx.getImageData(0, 0, size, size).data;

    // Sample a ring 2–4px inside the edge (the coloured frame, not the art or outer glow).
    let r = 0;
    let g = 0;
    let b = 0;
    let n = 0;
    const inEdge = (x: number, y: number) => {
      const m = Math.min(x, y, size - 1 - x, size - 1 - y);
      return m >= 2 && m <= 4;
    };
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (!inEdge(x, y)) continue;
        const i = (y * size + x) * 4;
        r += data[i]!;
        g += data[i + 1]!;
        b += data[i + 2]!;
        n++;
      }
    }
    if (n === 0) return null;
    const [h, s, v] = rgbToHsv(r / n, g / n, b / n);
    if (v < 0.12 || s < 0.15) return null; // too dark / grey to tell

    if (h >= 265 && h < 320) return "Epic"; // purple
    if (h >= 320 || h < 15) return "Mythic"; // red/magenta
    if (h >= 35 && h < 70) return "Legend"; // gold/orange
    if (h >= 70 && h < 165) return "Uncommon"; // green
    if (h >= 175 && h < 255) return "Rare"; // blue
    return null;
  } catch {
    return null;
  }
}

// ─── Empty-slot detection ────────────────────────────────────────────
// An unequipped slot shows a flat, desaturated grey placeholder silhouette (see the
// base panel). Real item art is colourful/high-contrast. Sampling the inner art region's
// saturation + brightness lets us leave empty slots empty instead of force-matching.

/** Mean saturation + brightness (0..1) of a tile's inner art region. */
export function sampleTileInner(src: CanvasImageSource, box: Box): { saturation: number; value: number } {
  try {
    const size = 28;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(src, box.x, box.y, box.w, box.h, 0, 0, size, size);
    const data = ctx.getImageData(0, 0, size, size).data;
    const lo = Math.floor(size * 0.2);
    const hi = Math.ceil(size * 0.8);
    let s = 0;
    let v = 0;
    let n = 0;
    for (let y = lo; y < hi; y++) {
      for (let x = lo; x < hi; x++) {
        const i = (y * size + x) * 4;
        const [, sat, val] = rgbToHsv(data[i]!, data[i + 1]!, data[i + 2]!);
        s += sat;
        v += val;
        n++;
      }
    }
    if (n === 0) return { saturation: 1, value: 1 };
    return { saturation: s / n, value: v / n };
  } catch {
    return { saturation: 1, value: 1 }; // fail-safe: treat as non-empty
  }
}

/** True when two rarity strings refer to the same tier (handles Legend/Legendary). */
export function rarityMatches(detected: Rarity | null, itemRarity: string | null): boolean {
  if (!detected || !itemRarity) return false;
  const a = detected.toLowerCase();
  const b = itemRarity.toLowerCase();
  if (a === b) return true;
  if (a === "legend" && b.startsWith("legend")) return true;
  return false;
}
