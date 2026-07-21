import sharp from "sharp";
import { AttendanceType, prisma } from "@guild/db";
import { services as core } from "@guild/core";
import type { OcrService, OcrWord } from "./ocr.service.js";
import { UserFacingError } from "../utils/errors.js";
import { env } from "../config/env.js";

interface RosterMember {
  userId: string;
  label: string;
  names: string[];
}

interface NameCandidate {
  source: string;
  normalized: string;
  confidence: number;
  bbox: OcrWord["bbox"];
}

export interface SmartAttendanceResult {
  session: {
    id: string;
    title: string;
    created: boolean;
  };
  confirmed: Array<{ userId: string; name: string; source: string; confidence: number }>;
  alreadyPresent: Array<{ userId: string; name: string; source: string; confidence: number }>;
  absent: Array<{ userId: string; name: string; source: string; confidence: number }>;
  ambiguous: Array<{ source: string; reason: string; confidence: number }>;
  pageConfidence: number;
  ms: number;
}

const DEFAULT_MINUTES = 30;
const MAX_MINUTES = 240;
const MIN_WORD_CONFIDENCE = 0.35;
const MIN_MATCH_SCORE = 0.78;
const ATTENDANCE_OCR_SCALE = 2;
const ATTENDANCE_OCR_MAX_WIDTH = 2200;
const PHRASE_MAX_WORDS = 4;
const PHRASE_MAX_GAP_PX = 54;
const IGNORED_WORDS = new Set([
  "manage",
  "rally",
  "gathering",
  "point",
  "not",
  "registered",
  "select",
  "player",
  "squad",
  "change",
  "location",
  "flag",
]);

export class SmartAttendanceService {
  constructor(private readonly ocr: OcrService) {}

  async scan(params: {
    imageUrl: string;
    imageSize: number;
    contentType: string | null;
    guildId: string;
    actorId: string;
    bossScheduleId: string;
    minutes?: number;
    forceNewSession?: boolean;
  }): Promise<SmartAttendanceResult> {
    const started = Date.now();
    const image = await this.ocr.fetchImage(params.imageUrl, params.imageSize, params.contentType);
    const ocrImage = await prepareAttendanceOcrImage(image);
    const [layout, roster] = await Promise.all([
      this.ocr.recognizeLayout(ocrImage, { languages: env.OCR_ATTENDANCE_LANGUAGES }),
      loadRoster(params.guildId),
    ]);

    if (layout.words.length === 0) {
      throw new UserFacingError(
        "I couldn't find any names in that screenshot.",
        "Crop/zoom the rally list so member names are readable, then try again.",
      );
    }

    const session = await this.resolveSession({
      guildId: params.guildId,
      actorId: params.actorId,
      bossScheduleId: params.bossScheduleId,
      minutes: params.minutes,
      forceNewSession: params.forceNewSession,
    });

    const detected = detectMembers(layout.words, roster);
    if (detected.present.length === 0) {
      throw new UserFacingError(
        "I read the screenshot, but couldn't match any visible names to this guild's member.",
        "Make sure member IGNs in ForgeKeep match the in-game names shown in the rally screen.",
      );
    }

    const detectedUserIds = [...new Set(detected.present.map((m) => m.userId))];
    const existing = detectedUserIds.length
      ? await prisma.attendanceRecord.findMany({
          where: {
            sessionId: session.id,
            userId: { in: detectedUserIds },
          },
          select: { userId: true, status: true },
        })
      : [];
    const alreadyConfirmed = new Set(
      existing.filter((row) => row.status === "CONFIRMED").map((row) => row.userId),
    );

    const confirmed: SmartAttendanceResult["confirmed"] = [];
    const alreadyPresent: SmartAttendanceResult["alreadyPresent"] = [];

    for (const match of detected.present) {
      if (alreadyConfirmed.has(match.userId)) {
        alreadyPresent.push(match);
        continue;
      }

      await core.dashboard.markMemberPresent(
        params.guildId,
        session.id,
        match.userId,
        params.actorId,
        undefined,
        "discord-bot-smart-attendance",
      );
      confirmed.push(match);
    }

    return {
      session: { id: session.id, title: session.title, created: session.created },
      confirmed,
      alreadyPresent,
      absent: [],
      ambiguous: detected.ambiguous,
      pageConfidence: layout.confidence,
      ms: Date.now() - started,
    };
  }

  private async resolveSession(params: {
    guildId: string;
    actorId: string;
    bossScheduleId: string;
    minutes?: number;
    forceNewSession?: boolean;
  }): Promise<{ id: string; title: string; created: boolean }> {
    const now = new Date();

    if (!params.forceNewSession) {
      // Scoped to this boss's schedule row, not "any active session" — two
      // officers scanning different bosses at once must not collide into the
      // same check-in window.
      const active = await prisma.attendanceSession.findFirst({
        where: {
          guildId: params.guildId,
          isActive: true,
          bossScheduleId: params.bossScheduleId,
          expiresAt: { gt: now },
        },
        select: { id: true, title: true },
        orderBy: { createdAt: "desc" },
      });
      if (active) return { ...active, created: false };
    }

    const minutes = Math.min(Math.max(params.minutes ?? DEFAULT_MINUTES, 1), MAX_MINUTES);
    const session = await core.dashboard.createAttendanceSession(
      params.guildId,
      // Empty title — createAttendanceSession auto-titles from the boss
      // schedule ("<Boss> Attendance (<date>)") so the website's attendance
      // card shows the real boss, not a generic "Smart Rally Attendance".
      "",
      AttendanceType.GUILD,
      minutes,
      params.actorId,
      undefined,
      "discord-bot-smart-attendance",
      params.bossScheduleId,
    );

    return { id: session.id, title: session.title, created: true };
  }
}

function detectMembers(words: OcrWord[], roster: RosterMember[]) {
  const present = new Map<string, SmartAttendanceResult["confirmed"][number]>();
  const ambiguous: SmartAttendanceResult["ambiguous"] = [];

  for (const candidate of buildNameCandidates(words)) {
    const source = candidate.source;
    const normalized = candidate.normalized;
    if (IGNORED_WORDS.has(normalized)) continue;

    const match = bestRosterMatch(normalized, roster);
    if (!match) continue;

    if (match.score < MIN_MATCH_SCORE) {
      if (source.length >= 3) {
        ambiguous.push({
          source,
          reason: "low roster match",
          confidence: candidate.confidence,
        });
      }
      continue;
    }

    if (match.tied) {
      ambiguous.push({
        source,
        reason: "matched more than one roster member",
        confidence: candidate.confidence,
      });
      continue;
    }

    const item = {
      userId: match.member.userId,
      name: match.member.label,
      source,
      confidence: candidate.confidence,
    };

    const current = present.get(item.userId);
    if (!current || normalizeName(current.source).length < normalized.length) {
      present.set(item.userId, item);
    }
  }

  return {
    present: [...present.values()],
    absent: [],
    ambiguous: collapseAmbiguous(ambiguous),
  };
}

async function loadRoster(guildId: string): Promise<RosterMember[]> {
  const rows = await prisma.guildMember.findMany({
    where: { guildId, isActive: true },
    select: {
      userId: true,
      ign: true,
      user: { select: { displayName: true, username: true } },
    },
  });

  return rows.map((row) => {
    const names = [row.ign, row.user.displayName, row.user.username]
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      .map(normalizeName)
      .filter((value) => value.length >= 2);

    return {
      userId: row.userId,
      label: row.ign ?? row.user.displayName,
      names: [...new Set(names)],
    };
  });
}

async function prepareAttendanceOcrImage(image: Buffer): Promise<Buffer> {
  const meta = await sharp(image).metadata();
  const width = meta.width ?? 0;
  const targetWidth = width > 0
    ? Math.min(Math.round(width * ATTENDANCE_OCR_SCALE), ATTENDANCE_OCR_MAX_WIDTH)
    : undefined;

  return sharp(image)
    .rotate()
    .resize(targetWidth ? { width: targetWidth } : undefined)
    .grayscale()
    .normalize()
    .sharpen()
    .png()
    .toBuffer();
}

export function buildNameCandidates(words: OcrWord[]): NameCandidate[] {
  const rows = groupWordsByRow(
    words
      .filter((word) => word.confidence >= MIN_WORD_CONFIDENCE)
      .map((word) => ({ ...word, text: cleanWord(word.text) }))
      .filter((word) => normalizeName(word.text).length > 0),
  );

  const candidates: NameCandidate[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    const sorted = [...row].sort((a, b) => a.bbox.x0 - b.bbox.x0);
    for (let start = 0; start < sorted.length; start++) {
      let source = "";
      let confidence = 0;
      let bbox = sorted[start]!.bbox;

      for (let end = start; end < Math.min(sorted.length, start + PHRASE_MAX_WORDS); end++) {
        const word = sorted[end]!;
        if (end > start) {
          const previous = sorted[end - 1]!;
          const gap = word.bbox.x0 - previous.bbox.x1;
          if (gap < 0 || gap > PHRASE_MAX_GAP_PX) break;
        }

        source += word.text;
        confidence += word.confidence;
        bbox = unionBox(bbox, word.bbox);

        const normalized = normalizeName(source);
        if (normalized.length < 2 || IGNORED_WORDS.has(normalized)) continue;

        const key = normalized;
        if (seen.has(key)) continue;
        seen.add(key);
        candidates.push({
          source,
          normalized,
          confidence: confidence / (end - start + 1),
          bbox,
        });
      }
    }
  }

  return candidates.sort((a, b) => b.normalized.length - a.normalized.length);
}

function groupWordsByRow(words: OcrWord[]): OcrWord[][] {
  const rows: OcrWord[][] = [];
  const sorted = [...words].sort((a, b) => wordCenterY(a) - wordCenterY(b));

  for (const word of sorted) {
    const centerY = wordCenterY(word);
    const height = Math.max(1, word.bbox.y1 - word.bbox.y0);
    const row = rows.find((items) => {
      const first = items[0];
      return first && Math.abs(wordCenterY(first) - centerY) <= Math.max(height, first.bbox.y1 - first.bbox.y0) * 0.65;
    });

    if (row) row.push(word);
    else rows.push([word]);
  }

  return rows;
}

function wordCenterY(word: OcrWord): number {
  return (word.bbox.y0 + word.bbox.y1) / 2;
}

function unionBox(a: OcrWord["bbox"], b: OcrWord["bbox"]): OcrWord["bbox"] {
  return {
    x0: Math.min(a.x0, b.x0),
    y0: Math.min(a.y0, b.y0),
    x1: Math.max(a.x1, b.x1),
    y1: Math.max(a.y1, b.y1),
  };
}

function bestRosterMatch(normalized: string, roster: RosterMember[]) {
  let best: { member: RosterMember; score: number } | null = null;
  let ties = 0;

  for (const member of roster) {
    for (const name of member.names) {
      const score = nameScore(normalized, name);
      if (!best || score > best.score) {
        best = { member, score };
        ties = 0;
      } else if (score === best.score && score >= MIN_MATCH_SCORE && member.userId !== best.member.userId) {
        ties++;
      }
    }
  }

  return best ? { ...best, tied: ties > 0 } : null;
}

export function nameScore(a: string, b: string): number {
  if (a === b) return 1;
  const substringMinLength = hasNonAscii(a) || hasNonAscii(b) ? 2 : 4;
  if (a.length >= substringMinLength && b.includes(a)) return a.length / b.length;
  if (b.length >= substringMinLength && a.includes(b)) return b.length / a.length;

  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 0;
  return 1 - levenshtein(a, b) / maxLen;
}

function levenshtein(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  const curr = Array.from({ length: b.length + 1 }, () => 0);

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      curr[j] =
        a[i - 1] === b[j - 1]
          ? prev[j - 1]!
          : Math.min(prev[j - 1]!, prev[j]!, curr[j - 1]!) + 1;
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j]!;
  }

  return prev[b.length]!;
}

function cleanWord(input: string): string {
  return input.replace(/[^\p{L}\p{N}_-]/gu, "").trim();
}

export function normalizeName(input: string): string {
  return cleanWord(input).toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

function hasNonAscii(input: string): boolean {
  return /[^\x00-\x7F]/.test(input);
}

function collapseAmbiguous(items: SmartAttendanceResult["ambiguous"]) {
  const seen = new Set<string>();
  const out: SmartAttendanceResult["ambiguous"] = [];
  for (const item of items) {
    const key = `${item.source}:${item.reason}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out.slice(0, 10);
}
