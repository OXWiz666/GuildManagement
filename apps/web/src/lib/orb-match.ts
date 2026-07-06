// ORB feature-matching re-rank (OpenCV.js). DINOv2 embeddings give a strong shortlist
// per slot; ORB then compares the crop to each shortlisted catalog icon at the level of
// keypoints. Because the catalog icon IS the source art of the in-game icon, the correct
// item shares many keypoint correspondences while wrong items share few — recovering the
// fine spatial discrimination that a pooled embedding loses.
//
// Everything here is best-effort and fail-safe: any OpenCV/Mat error yields a 0 score so
// the DINOv2 ranking stands. OpenCV Mats are manually freed to avoid WASM heap leaks.

import { loadOpenCv } from "./opencv-loader";
import { loadImage } from "./image-hash";

/* eslint-disable @typescript-eslint/no-explicit-any */

const ORB_FEATURES = 150; // keypoints per image (icons are small — keep modest)
const RATIO = 0.75; // Lowe ratio test

export interface OrbDesc {
  des: any; // cv.Mat of descriptors (kept alive in caches; never deleted)
  count: number; // keypoint count
}

/** Compute ORB descriptors for a canvas/image element. Caller owns nothing extra. */
async function computeOrb(source: CanvasImageSource): Promise<OrbDesc | null> {
  const cv = await loadOpenCv();
  let src: any, gray: any, orb: any, kp: any, mask: any;
  try {
    src = cv.imread(source as any);
    gray = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    orb = new cv.ORB(ORB_FEATURES);
    kp = new cv.KeyPointVector();
    mask = new cv.Mat();
    const des = new cv.Mat();
    orb.detectAndCompute(gray, mask, kp, des);
    const count = kp.size();
    if (count < 4 || des.empty()) {
      des.delete();
      return null;
    }
    return { des, count };
  } catch {
    return null;
  } finally {
    src?.delete();
    gray?.delete();
    mask?.delete();
    kp?.delete();
    orb?.delete();
  }
}

/** ORB descriptors for the current scan's crop canvas (not cached; caller frees). */
export function orbForCanvas(canvas: HTMLCanvasElement): Promise<OrbDesc | null> {
  return computeOrb(canvas);
}

// Catalog icon descriptors are cached across scans (Mats kept alive intentionally).
const iconOrbCache = new Map<string, Promise<OrbDesc | null>>();
export function orbForIcon(url: string): Promise<OrbDesc | null> {
  const hit = iconOrbCache.get(url);
  if (hit) return hit;
  const p = (async () => {
    const img = await loadImage(url);
    if (!img || img.naturalWidth === 0) return null;
    return computeOrb(img);
  })();
  iconOrbCache.set(url, p);
  return p;
}

/**
 * Fraction of the crop's keypoints that find a good (ratio-test) match in the icon,
 * 0..1. Higher = the two images share more exact-art structure.
 */
export async function orbGoodMatchRatio(crop: OrbDesc | null, icon: OrbDesc | null): Promise<number> {
  if (!crop || !icon) return 0;
  const cv = await loadOpenCv();
  let bf: any, matches: any;
  try {
    if (crop.des.rows < 2 || icon.des.rows < 2) return 0;
    bf = new cv.BFMatcher(cv.NORM_HAMMING, false);
    matches = new cv.DMatchVectorVector();
    bf.knnMatch(crop.des, icon.des, matches, 2);
    let good = 0;
    for (let i = 0; i < matches.size(); i++) {
      const m = matches.get(i);
      if (m.size() >= 2) {
        const a = m.get(0);
        const b = m.get(1);
        if (a.distance < RATIO * b.distance) good++;
      }
      m.delete();
    }
    const denom = Math.max(8, Math.min(crop.count, icon.count));
    return Math.min(1, good / denom);
  } catch {
    return 0;
  } finally {
    matches?.delete();
    bf?.delete();
  }
}

/** Free a per-scan crop descriptor Mat. */
export function freeOrb(d: OrbDesc | null): void {
  try {
    d?.des?.delete();
  } catch {
    /* already freed */
  }
}
