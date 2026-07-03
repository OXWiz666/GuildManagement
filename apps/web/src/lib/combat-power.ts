// Read "Combat Power" from a character screenshot via browser OCR (reuses the same
// tesseract path as the gear scanner). The in-game HUD shows e.g. `Combat Power
// 51,952` alongside level, time, exp% and currency, so we anchor on the label and
// take the number that follows it — far safer than "largest number on screen".

import { runOcr } from "@/lib/ocr";

export interface CpScanResult {
  cp: number | null; // parsed Combat Power, or null if not confidently found
  raw: string; // full OCR text (for debugging / manual fallback)
}

// Tolerant label matcher: "Combat Power", "CombatPower", and common OCR slips like
// "Cornbat Power" (m→rn), "Combat Fower" (P→F), zeros-for-o's.
const CP_LABEL = /c[o0](?:m|rn)b[a4]t\s*[fp][o0]wer/i;

/** Extract the Combat Power integer from OCR text, or null if not found. */
export function parseCombatPower(text: string): number | null {
  if (!text) return null;

  const match = CP_LABEL.exec(text);
  if (match) {
    // Number token immediately after the label (digits + thousands separators),
    // stopping at the first symbol like ⚔ or #.
    const after = text.slice(match.index + match[0].length, match.index + match[0].length + 24);
    const num = /(\d[\d.,\s]*\d|\d)/.exec(after);
    if (num) {
      const value = Number(num[1].replace(/[^\d]/g, ""));
      if (isFinite(value) && value > 0 && value <= 100_000_000) return value;
    }
  }

  return null;
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
