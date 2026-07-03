// Browser-only CLIP image embeddings via @huggingface/transformers (Transformers.js).
// Dynamically imported so the ~ONNX/WASM runtime never enters the SSR bundle and
// only downloads when a member actually scans a screenshot — same lazy pattern as
// `lib/ocr.ts` (tesseract) and `lib/opencv-loader.ts`.
//
// We use a CLIP ViT vision encoder (open, free, no API keys) to turn each icon —
// catalog art and detected screenshot tiles alike — into a 512-d semantic embedding.
// Cosine similarity between embeddings is a far stronger icon classifier than the
// legacy dHash + colour-grid signature in `lib/image-hash.ts`.

/* eslint-disable @typescript-eslint/no-explicit-any */

export const CLIP_MODEL_ID = "Xenova/clip-vit-base-patch32";
// Bump when the embedding scheme changes (model / preprocessing) to invalidate the
// IndexedDB embedding cache in `lib/embed-cache.ts`.
export const CLIP_EMBED_VERSION = 1;

type Transformers = typeof import("@huggingface/transformers");

let libPromise: Promise<Transformers> | null = null;
async function lib(): Promise<Transformers> {
  if (typeof window === "undefined") throw new Error("CLIP embeddings need a browser");
  if (!libPromise) {
    libPromise = import("@huggingface/transformers").then((t) => {
      // Hub-only: never look for local model files under /models.
      t.env.allowLocalModels = false;
      return t;
    });
  }
  return libPromise;
}

interface Engine {
  processor: any;
  model: any;
  RawImage: Transformers["RawImage"];
}

let enginePromise: Promise<Engine> | null = null;

/** Load (once) the CLIP processor + vision model, preferring WebGPU, else WASM. */
async function engine(): Promise<Engine> {
  if (!enginePromise) {
    enginePromise = (async () => {
      const t = await lib();
      const { AutoProcessor, CLIPVisionModelWithProjection, RawImage } = t as any;
      const processor = await AutoProcessor.from_pretrained(CLIP_MODEL_ID);

      // Try WebGPU (fast) first, then WASM. Within each, try a sequence of weight
      // variants so we succeed regardless of which ONNX files the model repo ships
      // (quantized keeps the download small; fp32 is the guaranteed fallback).
      const hasWebGPU = typeof navigator !== "undefined" && !!(navigator as any).gpu;
      const attempts: Array<{ device: string; dtype: string }> = [];
      if (hasWebGPU) {
        attempts.push({ device: "webgpu", dtype: "fp16" }, { device: "webgpu", dtype: "fp32" });
      }
      attempts.push(
        { device: "wasm", dtype: "q8" },
        { device: "wasm", dtype: "fp32" },
      );

      let model: any = null;
      let lastErr: unknown = null;
      for (const opt of attempts) {
        try {
          model = await CLIPVisionModelWithProjection.from_pretrained(CLIP_MODEL_ID, opt);
          break;
        } catch (err) {
          lastErr = err;
          model = null;
        }
      }
      if (!model) throw lastErr ?? new Error("CLIP model failed to load");
      return { processor, model, RawImage } as Engine;
    })().catch((err) => {
      enginePromise = null; // allow a later retry
      throw err;
    });
  }
  return enginePromise;
}

/** True once the model has been requested — lets callers show a "loading model" hint. */
export function isClipStarted(): boolean {
  return enginePromise !== null;
}

function l2normalize(v: Float32Array): Float32Array {
  let sum = 0;
  for (let i = 0; i < v.length; i++) sum += v[i]! * v[i]!;
  const norm = Math.sqrt(sum) || 1;
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i]! / norm;
  return out;
}

async function embedRawImage(raw: any): Promise<Float32Array> {
  const { processor, model } = await engine();
  const inputs = await processor(raw);
  const out = await model(inputs);
  const embeds = out.image_embeds ?? out.pooler_output ?? out.last_hidden_state;
  const data: Float32Array = Float32Array.from(embeds.data as ArrayLike<number>);
  return l2normalize(data);
}

export interface Inset {
  left: number; // fraction of width trimmed from the left
  right: number;
  top: number;
  bottom: number;
}

// Default tight crop for in-game equipment tiles: trims the rarity frame border and
// the bottom-centre "+N" enhancement badge so the crop approximates the clean catalog
// art (which is what we match against).
export const TILE_INSET: Inset = { left: 0.16, right: 0.16, top: 0.1, bottom: 0.22 };

function applyInset(
  box: { x: number; y: number; w: number; h: number },
  inset?: Inset,
): { x: number; y: number; w: number; h: number } {
  if (!inset) return box;
  return {
    x: box.x + box.w * inset.left,
    y: box.y + box.h * inset.top,
    w: box.w * (1 - inset.left - inset.right),
    h: box.h * (1 - inset.top - inset.bottom),
  };
}

/**
 * Embed a rectangular region of a loaded image (a detected screenshot tile). Pass an
 * `inset` to crop inward to the item art only (see `TILE_INSET`).
 */
export async function embedCanvasRegion(
  src: CanvasImageSource,
  box: { x: number; y: number; w: number; h: number },
  inset?: Inset,
): Promise<Float32Array> {
  const { RawImage } = await engine();
  const b = applyInset(box, inset);
  const w = Math.max(1, Math.round(b.w));
  const h = Math.max(1, Math.round(b.h));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(src, b.x, b.y, b.w, b.h, 0, 0, w, h);
  const raw = (RawImage as any).fromCanvas(canvas);
  return embedRawImage(raw);
}

/** Embed a catalog icon by URL (buckets send `Access-Control-Allow-Origin: *`). */
export async function embedIconUrl(url: string): Promise<Float32Array | null> {
  try {
    const { RawImage } = await engine();
    const raw = await (RawImage as any).fromURL(url);
    return await embedRawImage(raw);
  } catch {
    return null;
  }
}

/** Cosine similarity of two L2-normalized embeddings (0..1 for icon art). */
export function cosine(a: Float32Array, b: Float32Array): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  for (let i = 0; i < n; i++) dot += a[i]! * b[i]!;
  return dot;
}
