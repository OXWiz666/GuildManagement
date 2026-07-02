// Browser-only OCR via tesseract.js. Dynamically imported so it never enters
// the SSR bundle and only downloads when the member actually scans a screenshot.

export interface OcrToken {
  text: string;
  confidence: number; // 0..1
}

export interface OcrResult {
  text: string;
  tokens: OcrToken[];
}

/**
 * Run OCR on an image (File / Blob / data URL / HTMLCanvas).
 * `onProgress` reports recognition progress in 0..1.
 */
export async function runOcr(
  image: File | Blob | string,
  onProgress?: (progress: number) => void,
): Promise<OcrResult> {
  const Tesseract = (await import("tesseract.js")).default;

  const { data } = await Tesseract.recognize(image, "eng", {
    logger: (m: { status: string; progress: number }) => {
      if (m.status === "recognizing text" && onProgress) onProgress(m.progress);
    },
  });

  const text = data.text ?? "";
  const overall = (data.confidence ?? 0) / 100; // page-level confidence (0..1)

  // Tokenize the recognized text. Each token carries the page confidence; the
  // matcher additionally weights by string similarity per candidate.
  const tokens: OcrToken[] = text
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
    .map((t) => ({ text: t, confidence: overall }));

  return { text, tokens };
}
