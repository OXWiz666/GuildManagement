import { describe, expect, it } from "vitest";
import { nameScore, normalizeName } from "./smartAttendance.service.js";

describe("smart attendance name matching", () => {
  it("keeps non-Latin player names during normalization", () => {
    expect(normalizeName("諸虛女神")).toBe("諸虛女神");
    expect(normalizeName("神BiMe")).toBe("神bime");
  });

  it("still normalizes symbol-heavy Latin names", () => {
    expect(normalizeName("卒BiMe")).toBe("卒bime");
    expect(normalizeName("#BiMe")).toBe("bime");
    expect(normalizeName("ScaR—")).toBe("scar");
  });

  it("allows partial matches for multi-language names without allowing single glyph hits", () => {
    expect(nameScore("諸虛女神", "諸虛女神")).toBe(1);
    expect(nameScore("虛女", "諸虛女神")).toBeGreaterThan(0.4);
    expect(nameScore("神", "諸虛女神")).toBeLessThan(0.78);
  });
});
