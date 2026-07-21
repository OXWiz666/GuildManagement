import { describe, expect, it } from "vitest";
import { buildNameCandidates, nameScore, normalizeName } from "./smartAttendance.service.js";
import type { OcrWord } from "./ocr.service.js";

function word(text: string, x0: number, x1: number): OcrWord {
  return {
    text,
    confidence: 0.9,
    bbox: { x0, y0: 10, x1, y1: 24 },
  };
}

describe("smart attendance name matching", () => {
  it("keeps non-Latin player names during normalization", () => {
    expect(normalizeName("\u8b19\u865a\u306a\u5973\u795e")).toBe("\u8b19\u865a\u306a\u5973\u795e");
    expect(normalizeName("\u795eBiMe")).toBe("\u795ebime");
  });

  it("still normalizes symbol-heavy Latin names", () => {
    expect(normalizeName("\u5352BiMe")).toBe("\u5352bime");
    expect(normalizeName("#BiMe")).toBe("bime");
    expect(normalizeName("ScaR-")).toBe("scar");
  });

  it("allows partial matches for multi-language names without allowing single glyph hits", () => {
    expect(nameScore("\u8b19\u865a\u306a\u5973\u795e", "\u8b19\u865a\u306a\u5973\u795e")).toBe(1);
    expect(nameScore("\u8b19\u865a\u306a", "\u8b19\u865a\u306a\u5973\u795e")).toBeGreaterThan(0.4);
    expect(nameScore("\u795e", "\u8b19\u865a\u306a\u5973\u795e")).toBeLessThan(0.78);
  });

  it("combines nearby OCR words so split CJK names can match roster IGNs", () => {
    const candidates = buildNameCandidates([
      word("\u8b19\u865a", 100, 132),
      word("\u306a", 136, 148),
      word("\u5973\u795e", 152, 184),
    ]);

    expect(candidates.map((candidate) => candidate.normalized)).toContain("\u8b19\u865a\u306a\u5973\u795e");
  });
});
