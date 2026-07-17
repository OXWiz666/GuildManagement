// Read "Combat Power" from a character screenshot via browser OCR (reuses the same
// tesseract path as the gear scanner). The in-game HUD shows e.g. `Combat Power
// 51,952` alongside level, time, exp% and currency, so we anchor on the label and
// take the number that follows it — far safer than "largest number on screen".
//
// The PARSING moved to @guild/shared (types/cpScan.ts): the Discord bot scans the
// same screenshots server-side and must interpret them identically, and two
// copies of the label regex would eventually disagree. This module is now just
// the browser-side OCR wrapper, and re-exports `parseCombatPower` so existing
// importers are unaffected.

import { runOcr } from "@/lib/ocr";
import { parseCombatPower } from "@guild/shared";

export { parseCombatPower };

export interface CpScanResult {
  cp: number | null; // parsed Combat Power, or null if not confidently found
  raw: string; // full OCR text (for debugging / manual fallback)
}

/**
 * OCR a Combat Power screenshot and parse the value. `onProgress` reports 0..1.
 */
export async function scanCombatPower(
  image: File | Blob | string,
  onProgress?: (progress: number) => void,
): Promise<CpScanResult> {
  const ocr = await runOcr(image, onProgress);
  return { cp: parseCombatPower(ocr.text), raw: ocr.text };
}
