// Perceptual image signatures for icon matching (browser canvas).
// A signature = a 64-bit difference hash (structure) + a 4×4 average-colour grid.
// Public icon buckets send `Access-Control-Allow-Origin: *`, so cross-origin
// catalog icons can be drawn to a canvas and read without tainting.

export interface IconSignature {
  dhash: Uint8Array; // 64 bits (0/1) — structural fingerprint
  color: Float32Array; // 48 = 4×4 cells × RGB, normalised 0..1
}

function makeCtx(w: number, h: number): CanvasRenderingContext2D {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c.getContext("2d", { willReadFrequently: true })!;
}

/** Compute a signature from a region of an image/canvas source. */
export function signatureFromRegion(
  src: CanvasImageSource,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
): IconSignature {
  // Difference hash on a 9×8 grayscale downscale.
  const ctx = makeCtx(9, 8);
  ctx.drawImage(src, sx, sy, sw, sh, 0, 0, 9, 8);
  const d = ctx.getImageData(0, 0, 9, 8).data;
  const gray = (i: number) => d[i]! * 0.299 + d[i + 1]! * 0.587 + d[i + 2]! * 0.114;
  const dhash = new Uint8Array(64);
  let k = 0;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const left = gray((y * 9 + x) * 4);
      const right = gray((y * 9 + x + 1) * 4);
      dhash[k++] = left < right ? 1 : 0;
    }
  }

  // 4×4 average colour grid.
  const cctx = makeCtx(4, 4);
  cctx.drawImage(src, sx, sy, sw, sh, 0, 0, 4, 4);
  const cd = cctx.getImageData(0, 0, 4, 4).data;
  const color = new Float32Array(48);
  for (let i = 0; i < 16; i++) {
    color[i * 3] = cd[i * 4]! / 255;
    color[i * 3 + 1] = cd[i * 4 + 1]! / 255;
    color[i * 3 + 2] = cd[i * 4 + 2]! / 255;
  }
  return { dhash, color };
}

/** Similarity of two signatures, 0..1 (higher = more alike). */
export function signatureSimilarity(a: IconSignature, b: IconSignature): number {
  let ham = 0;
  for (let i = 0; i < 64; i++) if (a.dhash[i] !== b.dhash[i]) ham++;
  const structSim = 1 - ham / 64;
  let sse = 0;
  for (let i = 0; i < 48; i++) {
    const diff = a.color[i]! - b.color[i]!;
    sse += diff * diff;
  }
  const colorSim = 1 - Math.sqrt(sse / 48);
  return 0.6 * structSim + 0.4 * colorSim;
}

// ─── Caches ──────────────────────────────────────────────────────────

const imgCache = new Map<string, Promise<HTMLImageElement | null>>();
export function loadImage(url: string): Promise<HTMLImageElement | null> {
  const existing = imgCache.get(url);
  if (existing) return existing;
  const p = new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
  imgCache.set(url, p);
  return p;
}

const sigCache = new Map<string, IconSignature | null>();
/** Load + hash a catalog icon by URL (cached across scans). */
export async function catalogSignature(url: string): Promise<IconSignature | null> {
  if (sigCache.has(url)) return sigCache.get(url)!;
  const img = await loadImage(url);
  let sig: IconSignature | null = null;
  try {
    if (img && img.naturalWidth > 0) {
      sig = signatureFromRegion(img, 0, 0, img.naturalWidth, img.naturalHeight);
    }
  } catch {
    sig = null; // tainted canvas / decode failure
  }
  sigCache.set(url, sig);
  return sig;
}

/** Preload + hash a list of catalog icon URLs (batched), reporting 0..1 progress. */
export async function preloadCatalogSignatures(
  urls: string[],
  onProgress?: (progress: number) => void,
): Promise<void> {
  const pending = urls.filter((u) => !sigCache.has(u));
  const total = pending.length;
  if (total === 0) {
    onProgress?.(1);
    return;
  }
  const BATCH = 16;
  let done = 0;
  for (let i = 0; i < pending.length; i += BATCH) {
    await Promise.all(pending.slice(i, i + BATCH).map((u) => catalogSignature(u)));
    done = Math.min(total, i + BATCH);
    onProgress?.(done / total);
  }
}

/** Load an image from a data URL (same-origin, no CORS concerns). */
export function loadDataUrl(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load the screenshot"));
    img.src = dataUrl;
  });
}
