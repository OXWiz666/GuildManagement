// ─── Combat Power screenshot parsing ─────────────
// Pure text→data functions, deliberately free of any OCR engine import so the
// SAME parsing runs in the browser (tesseract.js in apps/web) and in the bot
// (tesseract.js in Node). The engine differs; the interpretation must not.
//
// `parseCombatPower` moved here from apps/web/src/lib/combat-power.ts — the web
// scanner re-exports it, so there is one implementation, not two.

/**
 * Tolerant "Combat Power" label matcher.
 *
 * Anchoring on the label is what makes this safe: the in-game HUD shows level,
 * time, exp% and currency alongside CP, so "largest number on screen" would be
 * wrong constantly. The character-class slips (m→rn, P→F, o→0) are real
 * tesseract failure modes on the game's font.
 */
const CP_LABEL = /c[o0](?:m|rn)b[a4]t\s*[fp][o0]wer/i;

/** Upper sanity bound; mirrors the bot's CP_MAX_VALUE default. */
const MAX_CP = 100_000_000;

/** Extract the Combat Power integer from OCR text, or null if not found. */
export function parseCombatPower(text: string): number | null {
  if (!text) return null;

  const match = CP_LABEL.exec(text);
  if (!match) return null;

  // Number token immediately after the label (digits + thousands separators),
  // stopping at the first symbol like ⚔ or #.
  const start = match.index + match[0].length;
  const after = text.slice(start, start + 24);
  const num = /(\d[\d.,\s]*\d|\d)/.exec(after);
  // Group 1 is checked explicitly rather than asserted: this package compiles
  // under noUncheckedIndexedAccess, and a non-null assertion here would be
  // hiding the check rather than doing it.
  const digits = num?.[1];
  if (!digits) return null;

  const value = Number(digits.replace(/[^\d]/g, ""));
  if (!Number.isFinite(value) || value <= 0 || value > MAX_CP) return null;

  return value;
}

// ─── Fuzzy text matching ─────────────────────────

/**
 * Normalize for comparison: lowercase, strip anything non-alphanumeric.
 *
 * OCR routinely inserts spaces/punctuation inside a name ("Wa ez", "W-aez"),
 * so comparing raw strings produces false mismatches.
 */
function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Levenshtein distance, iterative with two rows.
 *
 * Bounded by `max`: OCR text can be long, and we only ever care whether a
 * candidate is within a small edit distance — bailing early keeps this cheap
 * instead of O(n·m) over a whole page of text.
 */
export function levenshtein(a: string, b: string, max = Infinity): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  // A length gap alone already exceeds the budget.
  if (Math.abs(a.length - b.length) > max) return max + 1;

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let curr = new Array<number>(b.length + 1);

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    let rowMin = curr[0]!;

    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j]! + 1, // deletion
        curr[j - 1]! + 1, // insertion
        prev[j - 1]! + cost, // substitution
      );
      if (curr[j]! < rowMin) rowMin = curr[j]!;
    }

    // Every value in this row already exceeds the budget — no better result
    // can emerge from later rows.
    if (rowMin > max) return max + 1;

    [prev, curr] = [curr, prev];
  }

  return prev[b.length]!;
}

/**
 * Similarity in 0..1, where 1 is identical.
 * Normalized by the longer string so "ab" vs "abcdef" scores low, not high.
 */
export function similarity(a: string, b: string): number {
  const x = normalize(a);
  const y = normalize(b);
  if (!x && !y) return 1;
  if (!x || !y) return 0;

  const longest = Math.max(x.length, y.length);
  return 1 - levenshtein(x, y) / longest;
}

export interface NameVerification {
  /** True when the expected IGN appears in the OCR text. */
  matched: boolean;
  /** Best similarity found, 0..1. */
  score: number;
  /** The OCR token that matched best — useful for a "did you mean" message. */
  bestToken: string | null;
}

/**
 * Confirm an EXPECTED in-game name appears in the OCR text.
 *
 * Deliberately verification, not extraction. Because a scan only ever updates
 * the sender's own row, we already know which name to look for — and checking
 * "does this known string appear" is far more reliable than trying to pick an
 * arbitrary name out of a HUD. It also means a mismatch is a useful signal
 * (wrong character's screenshot) rather than a parsing failure.
 */
export function verifyName(text: string, expectedIgn: string, threshold = 0.8): NameVerification {
  const expected = normalize(expectedIgn);
  if (!expected || !text) return { matched: false, score: 0, bestToken: null };

  const haystack = normalize(text);

  // Fast path: the name survived OCR intact somewhere in the text.
  if (haystack.includes(expected)) {
    return { matched: true, score: 1, bestToken: expectedIgn };
  }

  // Otherwise compare against each whitespace-delimited token.
  let best = 0;
  let bestToken: string | null = null;

  for (const token of text.split(/\s+/)) {
    const candidate = normalize(token);
    if (!candidate) continue;
    // Skip tokens whose length is wildly different — cheap pre-filter.
    if (Math.abs(candidate.length - expected.length) > 3) continue;

    const score = similarity(candidate, expected);
    if (score > best) {
      best = score;
      bestToken = token;
    }
  }

  return { matched: best >= threshold, score: best, bestToken };
}

export interface ClassDetection {
  className: string | null;
  score: number;
}

/**
 * Detect a character class by matching known candidates against OCR text.
 *
 * Candidate-driven rather than extractive: there is no canonical class list in
 * this codebase (`guild_members.class` is free text), so callers supply the
 * classes already present on the roster plus any configured overrides. An empty
 * candidate list simply yields no detection — never a guess.
 */
export function detectClass(
  text: string,
  candidates: string[],
  threshold = 0.85,
): ClassDetection {
  if (!text || candidates.length === 0) return { className: null, score: 0 };

  const haystack = normalize(text);

  // Exact containment wins outright. Longest-first so "Battle Mage" is
  // preferred over "Mage" when both are candidates and both appear.
  const byLength = [...candidates].sort((a, b) => b.length - a.length);
  for (const candidate of byLength) {
    const needle = normalize(candidate);
    if (needle && haystack.includes(needle)) {
      return { className: candidate, score: 1 };
    }
  }

  // Fall back to fuzzy token comparison for OCR slips.
  let best = 0;
  let bestClass: string | null = null;

  const tokens = text.split(/\s+/).filter(Boolean);
  for (const candidate of candidates) {
    for (const token of tokens) {
      const score = similarity(token, candidate);
      if (score > best) {
        best = score;
        bestClass = candidate;
      }
    }
  }

  return best >= threshold ? { className: bestClass, score: best } : { className: null, score: best };
}

// ─── Plausibility ────────────────────────────────

export interface CpPlausibility {
  suspicious: boolean;
  reason: string | null;
}

/**
 * Judge whether a scanned CP change warrants officer review.
 *
 * This does NOT block the update — the member gets their new CP immediately.
 * It only marks rows worth a look, because a screenshot is editable and a
 * silent 10× jump should not pass unnoticed.
 */
export function assessCpChange(params: {
  oldCp: number | null;
  newCp: number;
  confidence: number;
  nameMatched: boolean;
  /** Fractional increase that trips the flag (0.3 = +30%). */
  maxGrowthRatio?: number;
  /** OCR confidence below which a scan is flagged. */
  minConfidence?: number;
}): CpPlausibility {
  const maxGrowth = params.maxGrowthRatio ?? 0.3;
  const minConfidence = params.minConfidence ?? 0.6;

  if (!params.nameMatched) {
    return { suspicious: true, reason: "Character name on the screenshot didn't match the member's IGN" };
  }

  if (params.confidence < minConfidence) {
    return {
      suspicious: true,
      reason: `Low OCR confidence (${Math.round(params.confidence * 100)}%)`,
    };
  }

  // A first-ever entry has no baseline to compare against, so it can't be
  // "implausible" — flagging every new member would make the queue useless.
  if (params.oldCp === null || params.oldCp === 0) {
    return { suspicious: false, reason: null };
  }

  const growth = (params.newCp - params.oldCp) / params.oldCp;
  if (growth > maxGrowth) {
    return {
      suspicious: true,
      reason: `CP jumped ${Math.round(growth * 100)}% in one update`,
    };
  }

  return { suspicious: false, reason: null };
}
