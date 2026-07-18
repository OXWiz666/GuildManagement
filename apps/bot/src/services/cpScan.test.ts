import { describe, expect, it } from "vitest";
import {
  assessCpChange,
  detectClass,
  parseCombatPower,
  similarity,
  verifyName,
} from "@guild/shared";

/**
 * Realistic OCR output. tesseract on the game's HUD font routinely produces
 * these exact slips: m→rn, P→F, o→0, and stray punctuation between tokens.
 */
const CLEAN_HUD = `Lv. 62  Waez
Combat Power 985,420
EXP 42.3%   12:04   1,204,000 G`;

const SLIPPED_HUD = `Lv, 62 Waez
Cornbat Fower 985.420
EXP 42.3%`;

describe("parseCombatPower", () => {
  it("reads a clean HUD", () => {
    expect(parseCombatPower(CLEAN_HUD)).toBe(985_420);
  });

  it("survives common OCR slips (m→rn, P→F, comma→period)", () => {
    expect(parseCombatPower(SLIPPED_HUD)).toBe(985_420);
  });

  it("anchors on the label rather than taking the largest number", () => {
    // The gold amount (1,204,000) is larger than the CP — a "biggest number"
    // implementation would return it. This is the whole reason for the anchor.
    expect(parseCombatPower(CLEAN_HUD)).not.toBe(1_204_000);
  });

  it("handles the label with no separator", () => {
    expect(parseCombatPower("CombatPower 51952")).toBe(51_952);
  });

  it("returns null when the label is absent", () => {
    expect(parseCombatPower("Lv. 62 Waez\nEXP 42.3%")).toBeNull();
  });

  it("returns null on empty input", () => {
    expect(parseCombatPower("")).toBeNull();
  });

  it("rejects an implausibly large value", () => {
    expect(parseCombatPower("Combat Power 999,999,999,999")).toBeNull();
  });

  it("ignores a trailing symbol after the number", () => {
    expect(parseCombatPower("Combat Power 51,952 ⚔")).toBe(51_952);
  });
});

describe("verifyName", () => {
  it("matches an exact IGN in the text", () => {
    const result = verifyName(CLEAN_HUD, "Waez");
    expect(result.matched).toBe(true);
    expect(result.score).toBe(1);
  });

  it("is case-insensitive", () => {
    expect(verifyName(CLEAN_HUD, "WAEZ").matched).toBe(true);
  });

  it("tolerates OCR splitting a name", () => {
    // "Wa ez" normalizes to "waez" once punctuation/space is stripped.
    expect(verifyName("Lv. 62 Wa ez\nCombat Power 100", "Waez").matched).toBe(true);
  });

  it("tolerates a single-character OCR slip", () => {
    // "Waez" → "Wa3z" is one substitution; similarity 0.75 with threshold 0.7.
    const result = verifyName("Lv. 62 Wa3z", "Waez", 0.7);
    expect(result.matched).toBe(true);
  });

  it("does NOT match a different character's name", () => {
    // This is the anti-impersonation case: someone else's screenshot.
    const result = verifyName("Lv. 62 Sinigang\nCombat Power 100", "Waez");
    expect(result.matched).toBe(false);
  });

  it("returns unmatched for an empty expected IGN", () => {
    expect(verifyName(CLEAN_HUD, "").matched).toBe(false);
  });

  it("returns unmatched for empty text", () => {
    expect(verifyName("", "Waez").matched).toBe(false);
  });
});

describe("detectClass", () => {
  const CANDIDATES = ["Destroyer", "Hunter", "Mage", "Battle Mage"];

  it("detects an exact class in the text", () => {
    expect(detectClass("Waez  Destroyer  Lv 62", CANDIDATES)).toMatchObject({
      className: "Destroyer",
      score: 1,
    });
  });

  it("prefers the longest match when candidates overlap", () => {
    // Both "Mage" and "Battle Mage" appear; the specific one must win.
    expect(detectClass("Waez Battle Mage Lv 62", CANDIDATES).className).toBe("Battle Mage");
  });

  it("is case-insensitive", () => {
    expect(detectClass("waez DESTROYER", CANDIDATES).className).toBe("Destroyer");
  });

  it("fuzzy-matches an OCR slip", () => {
    // "Destr0yer" — a zero-for-o slip.
    expect(detectClass("Waez Destr0yer", CANDIDATES, 0.8).className).toBe("Destroyer");
  });

  it("returns null rather than guessing when no candidate is close", () => {
    expect(detectClass("Waez Necromancer", CANDIDATES).className).toBeNull();
  });

  it("returns null when there are no candidates", () => {
    // A guild with an empty roster and no configured list must not guess.
    expect(detectClass("Waez Destroyer", []).className).toBeNull();
  });
});

describe("assessCpChange", () => {
  const base = { confidence: 0.9, nameMatched: true };

  it("accepts a normal increase", () => {
    expect(assessCpChange({ ...base, oldCp: 900_000, newCp: 985_000 })).toMatchObject({
      suspicious: false,
    });
  });

  it("flags an implausible jump", () => {
    const result = assessCpChange({ ...base, oldCp: 100_000, newCp: 900_000 });
    expect(result.suspicious).toBe(true);
    expect(result.reason).toMatch(/jumped/i);
  });

  it("flags low OCR confidence", () => {
    const result = assessCpChange({ ...base, confidence: 0.3, oldCp: 900_000, newCp: 910_000 });
    expect(result.suspicious).toBe(true);
    expect(result.reason).toMatch(/confidence/i);
  });

  it("flags a name mismatch above all else", () => {
    const result = assessCpChange({ ...base, nameMatched: false, oldCp: 900_000, newCp: 905_000 });
    expect(result.suspicious).toBe(true);
    expect(result.reason).toMatch(/name/i);
  });

  it("does not flag a first-ever entry with no baseline", () => {
    // Every new member would otherwise land in the review queue.
    expect(assessCpChange({ ...base, oldCp: null, newCp: 985_000 })).toMatchObject({
      suspicious: false,
    });
  });

  it("does not flag a decrease", () => {
    // CP going down is never suspicious — nobody cheats downward.
    expect(assessCpChange({ ...base, oldCp: 900_000, newCp: 800_000 })).toMatchObject({
      suspicious: false,
    });
  });

  it("honors a custom growth threshold", () => {
    // +50% passes when the guild allows it.
    expect(
      assessCpChange({ ...base, oldCp: 100_000, newCp: 150_000, maxGrowthRatio: 1.0 }),
    ).toMatchObject({ suspicious: false });
  });
});

describe("similarity", () => {
  it("scores identical strings 1", () => {
    expect(similarity("Waez", "Waez")).toBe(1);
  });

  it("ignores case and punctuation", () => {
    expect(similarity("W-a-e-z", "waez")).toBe(1);
  });

  it("scores unrelated strings low", () => {
    expect(similarity("Waez", "Sinigang")).toBeLessThan(0.4);
  });

  it("normalizes by the longer string", () => {
    // "ab" inside "abcdef" must not score highly.
    expect(similarity("ab", "abcdef")).toBeLessThan(0.5);
  });
});
