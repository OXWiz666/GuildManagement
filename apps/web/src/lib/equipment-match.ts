import type { EquipmentCatalogItem, EquipmentCatalogSlot } from "@/lib/api";
import type { OcrResult } from "@/lib/ocr";
import {
  catalogSignature,
  signatureFromRegion,
  signatureSimilarity,
  preloadCatalogSignatures,
  type IconSignature,
} from "@/lib/image-hash";
import { detectIconRegions, type Box } from "@/lib/icon-detect";
import { PANEL_LAYOUT } from "@/lib/equipment-layout";
import { embedCanvasRegion, cosine, TILE_INSET } from "@/lib/clip-embed";
import { getCatalogEmbeddings, iconKey } from "@/lib/embed-cache";
import {
  assignSlotsByGeometry,
  detectTileRarity,
  rarityMatches,
  sampleTileInner,
} from "@/lib/panel-detect";
import { runOcr } from "@/lib/ocr";
import type { EquipmentSlot } from "@guild/shared";

// Fuzzy-match OCR text against the icon catalog, per slot. Item "names" are set
// names (Azzam, Eos, …) so we score each catalog item's name against candidate
// phrases pulled from the screenshot text, then assign globally so a single
// stray word can't fill many slots (the main cause of bad auto-fills).

export interface SlotDetection {
  slotType: string;
  item: EquipmentCatalogItem | null;
  confidence: number; // 0..1
  matchedText: string | null;
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// ─── Similarity ──────────────────────────────────────────────────────

/** Sørensen–Dice coefficient over character bigrams (0..1). */
function diceSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const bigrams = (s: string) => {
    const m = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) {
      const g = s.slice(i, i + 2);
      m.set(g, (m.get(g) ?? 0) + 1);
    }
    return m;
  };
  const aB = bigrams(a);
  const bB = bigrams(b);
  let overlap = 0;
  for (const [g, count] of aB) overlap += Math.min(count, bB.get(g) ?? 0);
  return (2 * overlap) / (a.length - 1 + (b.length - 1));
}

/** Jaro–Winkler similarity (0..1) — strong for OCR typos + shared prefixes. */
function jaroWinkler(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;
  const matchDistance = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const aMatches = new Array(a.length).fill(false);
  const bMatches = new Array(b.length).fill(false);
  let matches = 0;
  for (let i = 0; i < a.length; i++) {
    const start = Math.max(0, i - matchDistance);
    const end = Math.min(i + matchDistance + 1, b.length);
    for (let j = start; j < end; j++) {
      if (bMatches[j] || a[i] !== b[j]) continue;
      aMatches[i] = true;
      bMatches[j] = true;
      matches++;
      break;
    }
  }
  if (matches === 0) return 0;
  let t = 0;
  let k = 0;
  for (let i = 0; i < a.length; i++) {
    if (!aMatches[i]) continue;
    while (!bMatches[k]) k++;
    if (a[i] !== b[k]) t++;
    k++;
  }
  t /= 2;
  const jaro = (matches / a.length + matches / b.length + (matches - t) / matches) / 3;
  let prefix = 0;
  for (let i = 0; i < Math.min(4, a.length, b.length); i++) {
    if (a[i] === b[i]) prefix++;
    else break;
  }
  return jaro + prefix * 0.1 * (1 - jaro);
}

/** Combined similarity; length-aware so very short coincidental matches score lower. */
function similarity(a: string, b: string): number {
  const base = Math.max(diceSimilarity(a, b), jaroWinkler(a, b));
  const shortPenalty = Math.min(a.length, b.length) < 4 ? 0.85 : 1;
  return base * shortPenalty;
}

// ─── Candidate phrases from OCR ──────────────────────────────────────

interface Candidate {
  text: string;
  norm: string;
  confidence: number;
  idx: number; // unique per occurrence, so repeated set names can fill multiple slots
}

/** Build 1–3 word windows per line. Distinct occurrences get distinct idx. */
function buildCandidates(ocr: OcrResult): Candidate[] {
  const baseConf =
    ocr.tokens.length > 0
      ? ocr.tokens.reduce((s, t) => s + t.confidence, 0) / ocr.tokens.length
      : 0.5;
  const out: Candidate[] = [];
  let idx = 0;
  for (const line of (ocr.text || "").split(/\r?\n+/)) {
    const words = line.split(/\s+/).map((w) => w.trim()).filter(Boolean);
    for (let i = 0; i < words.length; i++) {
      for (let n = 1; n <= 3 && i + n <= words.length; n++) {
        const text = words.slice(i, i + n).join(" ");
        const norm = normalize(text);
        if (norm.length >= 3) out.push({ text, norm, confidence: baseConf, idx: idx++ });
      }
    }
  }
  return out;
}

// Auto-accept floor — below this a slot is left empty for manual selection
// (precision over recall: an empty slot is better than a wrong guess).
const MIN_SCORE = 0.66;

interface Match {
  slotType: string;
  item: EquipmentCatalogItem;
  candIdx: number;
  score: number;
  confidence: number;
  text: string;
}

/**
 * Match OCR text to catalog items. For each slot+item we take its best candidate,
 * then assign globally (greedy by score) so each OCR occurrence fills at most one
 * slot — eliminating the "every slot shows the same wrong guess" problem.
 */
export function matchEquipment(
  ocr: OcrResult,
  catalog: EquipmentCatalogSlot[],
): Record<string, SlotDetection> {
  const candidates = buildCandidates(ocr);
  const globalNorm = normalize(ocr.text || "");

  // 1) Best candidate per (slot, item)
  const matches: Match[] = [];
  for (const slot of catalog) {
    for (const item of slot.items) {
      const name = normalize(item.itemName);
      if (name.length < 3) continue;
      let best: { c: Candidate; sim: number } | null = null;
      for (const c of candidates) {
        const sim = similarity(name, c.norm);
        if (!best || sim > best.sim) best = { c, sim };
      }
      if (!best) continue;

      // Small boost when the item's variant (weapon type / armor class / cloak
      // type) or rarity also appears anywhere in the screenshot text.
      let score = best.sim;
      const variantNorm = item.variant ? normalize(item.variant) : "";
      if (variantNorm.length >= 4 && globalNorm.includes(variantNorm)) score = Math.min(1, score + 0.06);
      const rarityNorm = item.rarity ? normalize(item.rarity) : "";
      if (rarityNorm.length >= 4 && globalNorm.includes(rarityNorm)) score = Math.min(1, score + 0.03);

      if (score < MIN_SCORE) continue;
      matches.push({
        slotType: slot.slotType,
        item,
        candIdx: best.c.idx,
        score,
        confidence: Math.min(1, score * (0.7 + 0.3 * best.c.confidence)),
        text: best.c.text,
      });
    }
  }

  // 2) Greedy global assignment: highest score first; one occurrence per slot.
  matches.sort((a, b) => b.score - a.score);
  const result: Record<string, SlotDetection> = {};
  for (const slot of catalog) {
    result[slot.slotType] = { slotType: slot.slotType, item: null, confidence: 0, matchedText: null };
  }
  const usedCand = new Set<number>();
  for (const m of matches) {
    if (result[m.slotType]?.item) continue; // slot already filled
    if (usedCand.has(m.candIdx)) continue; // occurrence already consumed
    result[m.slotType] = {
      slotType: m.slotType,
      item: m.item,
      confidence: m.confidence,
      matchedText: m.text,
    };
    usedCand.add(m.candIdx);
  }

  return result;
}

// ─── Image-to-icon matching (perceptual hash) ────────────────────────
// For icon-only screenshots (the in-game Equipment panel has no text), we crop
// each slot by the fixed panel layout and match its pixels to catalog icons.

export interface ImageDetection {
  item: EquipmentCatalogItem | null;
  confidence: number;
  needsReview: boolean;
  cropSig: IconSignature | null;
  cropEmbed?: Float32Array | null; // CLIP embedding of the crop (for the picker)
}

// Visual-similarity thresholds (tuned for icon art with frames/overlays).
const IMG_ACCEPT = 0.6; // below → leave slot empty
const IMG_REVIEW = 0.82; // below → flag "Needs Review"

/**
 * Match each slot crop of an Equipment-panel screenshot to the best catalog icon
 * for that slot. Catalog icon signatures are cached across scans. `onProgress`
 * reports 0..1 as candidate icons are hashed.
 */
export async function matchEquipmentByImage(
  image: HTMLImageElement,
  catalog: EquipmentCatalogSlot[],
  onProgress?: (progress: number) => void,
): Promise<Record<string, ImageDetection>> {
  const W = image.naturalWidth;
  const H = image.naturalHeight;
  const total = Math.max(1, catalog.reduce((n, s) => n + s.items.length, 0));
  let done = 0;

  const result: Record<string, ImageDetection> = {};

  for (const slot of catalog) {
    const box = PANEL_LAYOUT[slot.slotType as EquipmentSlot];
    let cropSig: IconSignature | null = null;
    if (box) {
      const sw = box.w * W;
      const sh = box.h * H;
      const sx = box.cx * W - sw / 2;
      const sy = box.cy * H - sh / 2;
      try {
        cropSig = signatureFromRegion(image, sx, sy, sw, sh);
      } catch {
        cropSig = null;
      }
    }

    let best: { item: EquipmentCatalogItem; sim: number } | null = null;
    if (cropSig) {
      for (const item of slot.items) {
        const sig = await catalogSignature(item.iconUrl);
        done++;
        if (onProgress && done % 8 === 0) onProgress(Math.min(0.99, done / total));
        if (!sig) continue;
        const sim = signatureSimilarity(cropSig, sig);
        if (!best || sim > best.sim) best = { item, sim };
      }
    } else {
      done += slot.items.length;
    }

    const accepted = best && best.sim >= IMG_ACCEPT ? best : null;
    result[slot.slotType] = {
      item: accepted ? accepted.item : null,
      confidence: accepted ? accepted.sim : 0,
      needsReview: !!accepted && accepted.sim < IMG_REVIEW,
      cropSig,
    };
  }

  onProgress?.(1);
  return result;
}

// ─── Automatic detection + classification (OpenCV) ───────────────────
// OpenCV locates icon tiles anywhere in the screenshot; each tile is then
// classified against the WHOLE catalog and the best-matching icon decides which
// slot it fills. This is layout-independent (works on busy in-game screenshots).

const AUTO_ACCEPT = 0.58; // min similarity for a detected tile to fill a slot
const AUTO_REVIEW = 0.8; // below → "Needs Review"

/**
 * Fully automatic gear scan. Returns per-slot detections plus how many icon
 * regions OpenCV found (callers fall back to the layout matcher when ~0).
 */
export async function matchEquipmentAuto(
  image: HTMLImageElement,
  catalog: EquipmentCatalogSlot[],
  onProgress?: (progress: number) => void,
): Promise<{ result: Record<string, ImageDetection>; regions: number }> {
  const allItems = catalog.flatMap((s) => s.items);

  // 0..0.7 — hash the full catalog (cached across scans).
  await preloadCatalogSignatures(
    allItems.map((it) => it.iconUrl),
    (p) => onProgress?.(p * 0.7),
  );

  // 0.7..0.8 — detect candidate icon tiles.
  const regions = await detectIconRegions(image);
  onProgress?.(0.8);

  // Pre-resolve catalog signatures once.
  const itemSigs = await Promise.all(
    allItems.map(async (it) => ({ it, sig: await catalogSignature(it.iconUrl) })),
  );

  // 0.8..1 — classify each region against the whole catalog.
  const result: Record<string, ImageDetection> = {};
  for (const slot of catalog) {
    result[slot.slotType] = { item: null, confidence: 0, needsReview: false, cropSig: null };
  }

  const W = image.naturalWidth;
  const H = image.naturalHeight;
  let processed = 0;
  for (const box of regions) {
    let cropSig: IconSignature | null = null;
    try {
      cropSig = signatureFromRegion(image, box.x, box.y, box.w, box.h);
    } catch {
      cropSig = null;
    }
    processed++;
    onProgress?.(0.8 + 0.2 * (processed / Math.max(1, regions.length)));
    if (!cropSig) continue;

    // Ignore tiles that hug the image edges only partially (clamp safety).
    if (box.w < 4 || box.h < 4 || box.x + box.w > W || box.y + box.h > H) {
      // still attempt; signatureFromRegion already clamps via canvas
    }

    let best: { it: EquipmentCatalogItem; sim: number } | null = null;
    for (const { it, sig } of itemSigs) {
      if (!sig) continue;
      const sim = signatureSimilarity(cropSig, sig);
      if (!best || sim > best.sim) best = { it, sim };
    }
    if (!best || best.sim < AUTO_ACCEPT) continue;

    const slot = best.it.slotType;
    const existing = result[slot];
    // Keep the highest-scoring tile per slot.
    if (!existing || best.sim > existing.confidence) {
      result[slot] = {
        item: best.it,
        confidence: best.sim,
        needsReview: best.sim < AUTO_REVIEW,
        cropSig,
      };
    }
  }

  onProgress?.(1);
  return { result, regions: regions.length };
}

// ─── CLIP embedding matching (primary classifier) ────────────────────
// A CLIP ViT vision encoder (Transformers.js, in-browser) turns every catalog
// icon and every detected screenshot tile into a 512-d semantic embedding; cosine
// similarity classifies each tile. Far stronger than the dHash signature above.

// Cosine thresholds for CLIP embeddings (tunable — verify on real screenshots).
const CLIP_ACCEPT = 0.75; // below → leave slot empty
const CLIP_REVIEW = 0.88; // below → flag "Needs Review"
// Text-only fallback: fill a slot CLIP left empty when OCR agrees this strongly.
const OCR_FALLBACK = 0.8;

/**
 * Fully automatic gear scan using CLIP embeddings. OpenCV locates icon tiles; each
 * tile is embedded and matched against the whole catalog by cosine similarity, and
 * the best-matching icon decides which slot it fills (layout-independent). OCR is a
 * best-effort tie-breaker that only fills slots vision left empty.
 *
 * Returns per-slot detections plus how many icon regions were found (callers fall
 * back to the dHash / layout matchers when ~0).
 */
export async function matchEquipmentClip(
  image: HTMLImageElement,
  catalog: EquipmentCatalogSlot[],
  onProgress?: (progress: number) => void,
): Promise<{ result: Record<string, ImageDetection>; regions: number }> {
  const allItems = catalog.flatMap((s) => s.items);
  const itemByKey = new Map<string, EquipmentCatalogItem>();
  for (const it of allItems) itemByKey.set(iconKey(it), it);

  // 0..0.5 — embed the catalog (cached in IndexedDB across scans).
  const catEmbeds = await getCatalogEmbeddings(
    allItems.map((it) => ({ bucket: it.bucket, path: it.path, iconUrl: it.iconUrl })),
    (p) => onProgress?.(p * 0.5),
  );

  // 0.5..0.55 — detect candidate icon tiles.
  const regions = await detectIconRegions(image);
  onProgress?.(0.55);

  const result: Record<string, ImageDetection> = {};
  for (const slot of catalog) {
    result[slot.slotType] = { item: null, confidence: 0, needsReview: false, cropSig: null, cropEmbed: null };
  }

  // 0.55..0.95 — embed + classify each region.
  let processed = 0;
  for (const box of regions) {
    let cropEmbed: Float32Array | null = null;
    try {
      cropEmbed = await embedCanvasRegion(image, box);
    } catch {
      cropEmbed = null;
    }
    processed++;
    onProgress?.(0.55 + 0.4 * (processed / Math.max(1, regions.length)));
    if (!cropEmbed) continue;

    let best: { key: string; sim: number } | null = null;
    for (const [key, vec] of catEmbeds) {
      const sim = cosine(cropEmbed, vec);
      if (!best || sim > best.sim) best = { key, sim };
    }
    if (!best || best.sim < CLIP_ACCEPT) continue;

    const item = itemByKey.get(best.key);
    if (!item) continue;
    const slot = item.slotType;
    const existing = result[slot];
    // Keep the highest-scoring tile per slot.
    if (!existing?.item || best.sim > existing.confidence) {
      result[slot] = {
        item,
        confidence: best.sim,
        needsReview: best.sim < CLIP_REVIEW,
        cropSig: null,
        cropEmbed,
      };
    }
  }

  // 0.95..1 — OCR fallback (best-effort). On icon-only panels this is usually inert,
  // but when item names/tooltips are visible it fills slots vision missed.
  try {
    const anyEmpty = catalog.some((s) => !result[s.slotType]?.item);
    if (anyEmpty) {
      const ocr = await runOcr(image.src);
      if ((ocr.text || "").trim().length > 0) {
        const textMatches = matchEquipment(ocr, catalog);
        for (const slot of catalog) {
          const d = result[slot.slotType];
          const tm = textMatches[slot.slotType];
          if (!d?.item && tm?.item && tm.confidence >= OCR_FALLBACK) {
            result[slot.slotType] = {
              item: tm.item,
              confidence: tm.confidence,
              needsReview: true, // text-derived on an icon panel → always confirm
              cropSig: null,
              cropEmbed: null,
            };
          }
        }
      }
    }
  } catch {
    /* OCR is optional — never block the scan */
  }

  onProgress?.(1);
  return { result, regions: regions.length };
}

// ─── Layout-aware, per-slot matching (primary, most accurate) ────────
// Each detected tile is assigned to a specific slot by geometry, then matched ONLY
// against that slot's bucket using a tight art-only crop (frame + "+N" badge removed),
// a CLIP+dHash ensemble, and a rarity-frame soft boost. Restricting candidates per slot
// + cleaning the crop is what makes the match decisive instead of "same wrong set".

const PANEL_ACCEPT = 0.7; // below → leave slot empty
const PANEL_REVIEW = 0.82; // below → "Needs Review"
const PANEL_MARGIN = 0.04; // min lead over the 2nd-best candidate to be confident
const RARITY_BONUS = 0.05; // soft boost for same-rarity candidates
const CLIP_W = 0.75;
const DHASH_W = 0.25;

function insetPixels(box: Box): Box {
  return {
    x: box.x + box.w * TILE_INSET.left,
    y: box.y + box.h * TILE_INSET.top,
    w: box.w * (1 - TILE_INSET.left - TILE_INSET.right),
    h: box.h * (1 - TILE_INSET.top - TILE_INSET.bottom),
  };
}

function emptyResult(catalog: EquipmentCatalogSlot[]): Record<string, ImageDetection> {
  const r: Record<string, ImageDetection> = {};
  for (const s of catalog) {
    r[s.slotType] = { item: null, confidence: 0, needsReview: false, cropSig: null, cropEmbed: null };
  }
  return r;
}

/**
 * Match a single located slot tile against ONLY that slot's catalog items, using a tight
 * crop, a CLIP+dHash ensemble, and a rarity soft-boost. Shared by both the geometry and
 * fixed-layout matchers.
 */
async function scoreSlotCrop(
  image: HTMLImageElement,
  box: Box,
  slot: EquipmentCatalogSlot,
  catEmbeds: Map<string, Float32Array>,
): Promise<ImageDetection> {
  let cropEmbed: Float32Array | null = null;
  let cropSig: IconSignature | null = null;
  try {
    cropEmbed = await embedCanvasRegion(image, box, TILE_INSET);
  } catch {
    cropEmbed = null;
  }
  try {
    const ib = insetPixels(box);
    cropSig = signatureFromRegion(image, ib.x, ib.y, ib.w, ib.h);
  } catch {
    cropSig = null;
  }
  if (!cropEmbed) return { item: null, confidence: 0, needsReview: false, cropSig, cropEmbed: null };

  // Empty-slot detection: a flat, desaturated inner region = the placeholder silhouette.
  const inner = sampleTileInner(image, insetPixels(box));
  const emptyLikely = inner.saturation < 0.09 && inner.value < 0.5;

  const rarity = detectTileRarity(image, box);

  let best: { it: EquipmentCatalogItem; score: number } | null = null;
  let second = -Infinity;
  for (const it of slot.items) {
    const vec = catEmbeds.get(iconKey(it));
    if (!vec) continue;
    const clip = cosine(cropEmbed, vec);
    let dh = clip; // neutral fallback when a dHash signature isn't available
    if (cropSig) {
      const dsig = await catalogSignature(it.iconUrl);
      if (dsig) dh = signatureSimilarity(cropSig, dsig);
    }
    let score = CLIP_W * clip + DHASH_W * dh;
    if (rarity && rarityMatches(rarity, it.rarity)) score += RARITY_BONUS;

    if (!best || score > best.score) {
      if (best) second = best.score;
      best = { it, score };
    } else if (score > second) {
      second = score;
    }
  }
  if (!best) return { item: null, confidence: 0, needsReview: false, cropSig, cropEmbed };

  const margin = best.score - (isFinite(second) ? second : 0);
  // Treat as empty when the tile looks like the placeholder AND we aren't confident —
  // a confident, colourful match (score ≥ REVIEW) is never overridden.
  const isEmpty = emptyLikely && best.score < PANEL_REVIEW;
  const accepted = best.score >= PANEL_ACCEPT && !isEmpty;
  return {
    item: accepted ? best.it : null,
    confidence: accepted ? Math.min(1, best.score) : 0,
    needsReview: accepted && (best.score < PANEL_REVIEW || margin < PANEL_MARGIN),
    cropSig,
    cropEmbed,
  };
}

/**
 * PRIMARY matcher. Detect tiles → assign each to a specific slot by panel geometry →
 * match per-slot. Returns how many slots were located (0 ⇒ not a panel; caller falls back).
 */
export async function matchEquipmentPanel(
  image: HTMLImageElement,
  catalog: EquipmentCatalogSlot[],
  onProgress?: (progress: number) => void,
): Promise<{ result: Record<string, ImageDetection>; located: number }> {
  const allItems = catalog.flatMap((s) => s.items);

  // 0..0.5 — embed catalog (cached in IndexedDB across scans).
  const catEmbeds = await getCatalogEmbeddings(
    allItems.map((it) => ({ bucket: it.bucket, path: it.path, iconUrl: it.iconUrl })),
    (p) => onProgress?.(p * 0.5),
  );

  // 0.5..0.55 — detect tiles + reconstruct the panel grid.
  const regions = await detectIconRegions(image);
  const slotBoxes = assignSlotsByGeometry(regions, image.naturalWidth, image.naturalHeight);
  onProgress?.(0.55);

  const result = emptyResult(catalog);
  if (!slotBoxes) {
    onProgress?.(1);
    return { result, located: 0 };
  }

  const bySlot = new Map(catalog.map((s) => [s.slotType, s]));
  const entries = Object.entries(slotBoxes) as [EquipmentSlot, Box][];
  let processed = 0;
  for (const [slotType, box] of entries) {
    processed++;
    onProgress?.(0.55 + 0.45 * (processed / Math.max(1, entries.length)));
    const slot = bySlot.get(slotType);
    if (!slot || slot.items.length === 0) continue;
    result[slotType] = await scoreSlotCrop(image, box, slot, catEmbeds);
  }

  onProgress?.(1);
  return { result, located: entries.length };
}

/**
 * FALLBACK matcher for clean panel crops when geometry reconstruction fails: use the
 * fixed `PANEL_LAYOUT` boxes with the same per-slot tight-crop scoring.
 */
export async function matchEquipmentLayout(
  image: HTMLImageElement,
  catalog: EquipmentCatalogSlot[],
  onProgress?: (progress: number) => void,
): Promise<Record<string, ImageDetection>> {
  const allItems = catalog.flatMap((s) => s.items);
  const catEmbeds = await getCatalogEmbeddings(
    allItems.map((it) => ({ bucket: it.bucket, path: it.path, iconUrl: it.iconUrl })),
    (p) => onProgress?.(p * 0.5),
  );

  const W = image.naturalWidth;
  const H = image.naturalHeight;
  const result = emptyResult(catalog);
  let i = 0;
  for (const slot of catalog) {
    i++;
    onProgress?.(0.5 + 0.5 * (i / Math.max(1, catalog.length)));
    const lb = PANEL_LAYOUT[slot.slotType as EquipmentSlot];
    if (!lb || slot.items.length === 0) continue;
    const box: Box = {
      x: lb.cx * W - (lb.w * W) / 2,
      y: lb.cy * H - (lb.h * H) / 2,
      w: lb.w * W,
      h: lb.h * H,
    };
    result[slot.slotType] = await scoreSlotCrop(image, box, slot, catEmbeds);
  }
  onProgress?.(1);
  return result;
}

/** Rank a slot's items by CLIP similarity to a crop embedding (for the picker). */
export async function rankItemsByCropEmbed(
  cropEmbed: Float32Array,
  items: EquipmentCatalogItem[],
): Promise<Map<string, number>> {
  const embeds = await getCatalogEmbeddings(
    items.map((it) => ({ bucket: it.bucket, path: it.path, iconUrl: it.iconUrl })),
  );
  const scores = new Map<string, number>();
  for (const it of items) {
    const vec = embeds.get(iconKey(it));
    if (vec) scores.set(`${it.bucket}/${it.path}`, cosine(cropEmbed, vec));
  }
  return scores;
}

/** Rank a slot's catalog items by visual similarity to a crop (for the picker). */
export async function rankItemsByCrop(
  cropSig: IconSignature,
  items: EquipmentCatalogItem[],
): Promise<Map<string, number>> {
  const scores = new Map<string, number>();
  await Promise.all(
    items.map(async (it) => {
      const sig = await catalogSignature(it.iconUrl);
      if (sig) scores.set(`${it.bucket}/${it.path}`, signatureSimilarity(cropSig, sig));
    }),
  );
  return scores;
}
