import { loadOpenCv } from "./opencv-loader";

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

function iou(a: Box, b: Box): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  if (inter === 0) return 0;
  return inter / (a.w * a.h + b.w * b.h - inter);
}

/** Non-max suppression: keep larger boxes, drop heavily-overlapping ones. */
function nms(boxes: Box[], thresh: number): Box[] {
  const sorted = [...boxes].sort((p, q) => q.w * q.h - p.w * p.h);
  const kept: Box[] = [];
  for (const b of sorted) {
    if (!kept.some((k) => iou(k, b) > thresh)) kept.push(b);
  }
  return kept;
}

/**
 * Detect candidate equipment-icon cells in a screenshot via contour analysis.
 * Returns bounding boxes (image pixel coords). Tuning lives in the constants
 * below — adjust if detection misses or over-detects on real screenshots.
 */
export async function detectIconRegions(image: HTMLImageElement): Promise<Box[]> {
  const cv = await loadOpenCv();

  const src = cv.imread(image);
  const gray = new cv.Mat();
  const edges = new cv.Mat();
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  let kernel: any;

  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    // Edge map + dilation closes the tile borders into connected loops.
    cv.Canny(gray, edges, 40, 140);
    kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3));
    cv.dilate(edges, edges, kernel);

    cv.findContours(edges, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

    const W = src.cols;
    const H = src.rows;
    const imgArea = W * H;
    const boxes: Box[] = [];

    // Geometry filters — icon tiles are roughly square-ish and a modest fraction
    // of the image. Big weapon/gadget cards are slightly taller, hence the AR range.
    const AR_MIN = 0.55;
    const AR_MAX = 1.7;
    const W_FRAC_MIN = 0.04;
    const W_FRAC_MAX = 0.26;
    const AREA_FRAC_MIN = 0.0018;
    const AREA_FRAC_MAX = 0.08;

    for (let i = 0; i < contours.size(); i++) {
      const cnt = contours.get(i);
      const rect = cv.boundingRect(cnt);
      cnt.delete();
      const ar = rect.width / rect.height;
      const wFrac = rect.width / W;
      const areaFrac = (rect.width * rect.height) / imgArea;
      if (
        ar >= AR_MIN &&
        ar <= AR_MAX &&
        wFrac >= W_FRAC_MIN &&
        wFrac <= W_FRAC_MAX &&
        areaFrac >= AREA_FRAC_MIN &&
        areaFrac <= AREA_FRAC_MAX
      ) {
        boxes.push({ x: rect.x, y: rect.y, w: rect.width, h: rect.height });
      }
    }

    return nms(boxes, 0.35);
  } finally {
    src.delete();
    gray.delete();
    edges.delete();
    contours.delete();
    hierarchy.delete();
    if (kernel) kernel.delete();
  }
}
