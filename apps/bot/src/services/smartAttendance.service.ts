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

interface PixelImage {
  data: Buffer;
  width: number;
  height: number;
  channels: number;
}

interface WordSignal {
  active: boolean;
  avgLum: number;
  brightRatio: number;
  blueLift: number;
}

interface SmartAttendanceImageInput {
  imageUrl: string;
  imageSize: number;
  contentType: string | null;
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
  screenshots: number;
  pageConfidence: number;
  ms: number;
}

const DEFAULT_MINUTES = 120;
const MAX_MINUTES = 240;
const MIN_WORD_CONFIDENCE = 0.35;
const MIN_NON_LATIN_WORD_CONFIDENCE = 0.15;
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
const IGNORED_UI_FRAGMENTS = [
  "gatheringpoint",
  "pointnotregistered",
  "selectaplayer",
  "playerinrally",
  "rallysquad",
  "changethesquad",
  "squadslocation",
  "thesquadslocation",
];

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
    return this.scanMany({
      images: [
        {
          imageUrl: params.imageUrl,
          imageSize: params.imageSize,
          contentType: params.contentType,
        },
      ],
      guildId: params.guildId,
      actorId: params.actorId,
      bossScheduleId: params.bossScheduleId,
      minutes: params.minutes,
      forceNewSession: params.forceNewSession,
    });
  }

  async scanMany(params: {
    images: SmartAttendanceImageInput[];
    guildId: string;
    actorId: string;
    bossScheduleId: string;
    minutes?: number;
    forceNewSession?: boolean;
  }): Promise<SmartAttendanceResult> {
    const started = Date.now();
    if (params.images.length === 0) {
      throw new UserFacingError(
        "Attach at least one rally screenshot.",
        "Upload the rally member list screenshots with `!attendance <boss> [minutes]`.",
      );
    }

    const [scans, roster] = await Promise.all([
      Promise.all(params.images.map((image) => this.scanImage(image))),
      loadRoster(params.guildId),
    ]);

    const scansWithWords = scans.filter((scan) => scan.layout.words.length > 0);
    if (scansWithWords.length === 0) {
      throw new UserFacingError(
        "I couldn't find any names in those screenshots.",
        "Crop/zoom the rally list so member names are readable, then try again.",
      );
    }

    const detected = mergeDetectedMembers(scansWithWords.map((scan) => detectMembers(scan.layout.words, scan.signalImage, roster)));
    if (detected.present.length === 0 && detected.absent.length === 0) {
      throw new UserFacingError(
        "I read the screenshots, but couldn't match any visible names to this guild's member.",
        "Make sure member IGNs in ForgeKeep match the in-game names shown in the rally screen.",
      );
    }

    const session = await this.resolveSession({
      guildId: params.guildId,
      actorId: params.actorId,
      bossScheduleId: params.bossScheduleId,
      minutes: params.minutes,
      forceNewSession: params.forceNewSession,
    });

    const detectedUserIds = [...new Set([...detected.present, ...detected.absent].map((m) => m.userId))];
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
    const alreadyPending = new Set(
      existing.filter((row) => row.status === "PENDING").map((row) => row.userId),
    );

    const confirmed: SmartAttendanceResult["confirmed"] = [];
    const alreadyPresent: SmartAttendanceResult["alreadyPresent"] = [];
    const absent: SmartAttendanceResult["absent"] = [];

    // Batched instead of one markMemberPresent/markMemberPendingForReview call
    // per detected member — a single rally screenshot can carry 30-50 visible
    // members, and each singular call is ~6-8 sequential DB round trips on
    // its own (200-400 round trips for one scan otherwise). Chunked at 200
    // (the batch endpoints' own cap) since multi-screenshot scans can exceed
    // it for a large guild.
    const presentToMark = detected.present.filter((match) => !alreadyConfirmed.has(match.userId));
    for (const match of detected.present) {
      if (alreadyConfirmed.has(match.userId)) alreadyPresent.push(match);
    }
    for (const chunk of chunk200(presentToMark.map((match) => match.userId))) {
      await core.dashboard.markMembersPresent(
        params.guildId,
        session.id,
        chunk,
        params.actorId,
        undefined,
        "discord-bot-smart-attendance",
      );
    }
    confirmed.push(...presentToMark);

    const absentToQueue: typeof detected.absent = [];
    for (const match of detected.absent) {
      if (alreadyConfirmed.has(match.userId)) {
        alreadyPresent.push(match);
        continue;
      }
      absent.push(match);
      if (!alreadyPending.has(match.userId)) {
        absentToQueue.push(match);
      }
    }
    for (const chunk of chunk200(absentToQueue.map((match) => match.userId))) {
      await core.dashboard.markMembersPendingForReview(
        params.guildId,
        session.id,
        chunk,
        params.actorId,
        undefined,
        "discord-bot-smart-attendance",
      );
    }

    return {
      session: { id: session.id, title: session.title, created: session.created },
      confirmed,
      alreadyPresent,
      absent,
      ambiguous: detected.ambiguous,
      screenshots: params.images.length,
      pageConfidence: average(scans.map((scan) => scan.layout.confidence)),
      ms: Date.now() - started,
    };
  }

  private async scanImage(input: SmartAttendanceImageInput): Promise<{ layout: Awaited<ReturnType<OcrService["recognizeLayout"]>>; signalImage: PixelImage }> {
    const image = await this.ocr.fetchImage(input.imageUrl, input.imageSize, input.contentType);
    const prepared = await prepareAttendanceImages(image);
    const layout = await this.ocr.recognizeLayout(prepared.ocrImage, { languages: env.OCR_ATTENDANCE_LANGUAGES });
    return { layout, signalImage: prepared.signalImage };
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

function mergeDetectedMembers(items: Array<ReturnType<typeof detectMembers>>): ReturnType<typeof detectMembers> {
  const present = new Map<string, SmartAttendanceResult["confirmed"][number]>();
  const absent = new Map<string, SmartAttendanceResult["absent"][number]>();
  const ambiguous: SmartAttendanceResult["ambiguous"] = [];

  for (const detected of items) {
    for (const item of detected.present) {
      const current = present.get(item.userId);
      if (!current || normalizeName(current.source).length < normalizeName(item.source).length) {
        present.set(item.userId, item);
      }
      absent.delete(item.userId);
    }

    for (const item of detected.absent) {
      if (present.has(item.userId)) continue;
      const current = absent.get(item.userId);
      if (!current || normalizeName(current.source).length < normalizeName(item.source).length) {
        absent.set(item.userId, item);
      }
    }

    ambiguous.push(...detected.ambiguous);
  }

  return {
    present: [...present.values()],
    absent: [...absent.values()],
    ambiguous: collapseAmbiguous(ambiguous),
  };
}

function detectMembers(words: OcrWord[], pixels: PixelImage, roster: RosterMember[]) {
  const present = new Map<string, SmartAttendanceResult["confirmed"][number]>();
  const absent = new Map<string, SmartAttendanceResult["absent"][number]>();
  const ambiguous: SmartAttendanceResult["ambiguous"] = [];

  for (const candidate of buildNameCandidates(words)) {
    const source = candidate.source;
    const normalized = candidate.normalized;
    if (isIgnoredUiText(normalized)) continue;

    const match = bestRosterMatch(normalized, roster);
    if (!match) continue;

    if (match.score < MIN_MATCH_SCORE) {
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

    const signal = sampleWordSignal(pixels, candidate.bbox);
    const item = {
      userId: match.member.userId,
      name: match.member.label,
      source,
      confidence: candidate.confidence,
    };

    if (signal.active) {
      const current = present.get(item.userId);
      if (!current || normalizeName(current.source).length < normalized.length) {
        present.set(item.userId, item);
      }
      absent.delete(item.userId);
      continue;
    }

    if (!present.has(item.userId)) {
      const current = absent.get(item.userId);
      if (!current || normalizeName(current.source).length < normalized.length) {
        absent.set(item.userId, item);
      }
    }
  }

  return {
    present: [...present.values()],
    absent: [...absent.values()],
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

async function prepareAttendanceImages(image: Buffer): Promise<{ ocrImage: Buffer; signalImage: PixelImage }> {
  const meta = await sharp(image).metadata();
  const width = meta.width ?? 0;
  const targetWidth = width > 0
    ? Math.min(Math.round(width * ATTENDANCE_OCR_SCALE), ATTENDANCE_OCR_MAX_WIDTH)
    : undefined;
  const resize = targetWidth ? { width: targetWidth } : undefined;

  const [ocrImage, signalRaw] = await Promise.all([
    sharp(image).rotate().resize(resize).grayscale().normalize().sharpen().png().toBuffer(),
    sharp(image).rotate().resize(resize).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
  ]);

  return {
    ocrImage,
    signalImage: {
      data: signalRaw.data,
      width: signalRaw.info.width,
      height: signalRaw.info.height,
      channels: signalRaw.info.channels,
    },
  };
}

export function buildNameCandidates(words: OcrWord[]): NameCandidate[] {
  const rows = groupWordsByRow(
    words
      .filter((word) => word.confidence >= minWordConfidence(word.text))
      .map((word) => ({ ...word, text: cleanWord(word.text) }))
      .filter((word) => normalizeName(word.text).length > 0),
  );

  const candidates: NameCandidate[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    if (row.some((word) => isIgnoredUiText(normalizeName(word.text)))) continue;

    const sorted = [...row].sort((a, b) => a.bbox.x0 - b.bbox.x0);
    for (let start = 0; start < sorted.length; start++) {
      let source = "";
      let confidence = 0;
      let bbox = sorted[start]!.bbox;

      for (let end = start; end < Math.min(sorted.length, start + PHRASE_MAX_WORDS); end++) {
        const word = sorted[end]!;
        if (isIgnoredUiText(normalizeName(word.text))) break;
        if (end > start) {
          const previous = sorted[end - 1]!;
          const gap = word.bbox.x0 - previous.bbox.x1;
          if (gap < 0 || gap > PHRASE_MAX_GAP_PX) break;
        }

        source += word.text;
        confidence += word.confidence;
        bbox = unionBox(bbox, word.bbox);

        const normalized = normalizeName(source);
        if (normalized.length < 2 || isIgnoredUiText(normalized)) continue;

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

function sampleWordSignal(image: PixelImage, bbox: OcrWord["bbox"]): WordSignal {
  const textBox = clampBox(image, {
    x0: Math.floor(bbox.x0) - 1,
    y0: Math.floor(bbox.y0) - 1,
    x1: Math.ceil(bbox.x1) + 1,
    y1: Math.ceil(bbox.y1) + 1,
  });
  const backdropBox = clampBox(image, {
    x0: Math.floor(bbox.x0) - 3,
    y0: Math.floor(bbox.y0) - 3,
    x1: Math.ceil(bbox.x1) + 3,
    y1: Math.ceil(bbox.y1) + 3,
  });

  const textStats = sampleStats(image, textBox);
  const backdropStats = sampleStats(image, backdropBox);
  const blueLift = textStats.avgB - Math.max(textStats.avgR, textStats.avgG);
  const active =
    textStats.brightRatio >= 0.025 ||
    textStats.avgLum >= 118 ||
    (blueLift >= 10 && backdropStats.avgB >= 42);

  return {
    active,
    avgLum: textStats.avgLum,
    brightRatio: textStats.brightRatio,
    blueLift,
  };
}

function sampleStats(
  image: PixelImage,
  box: { x0: number; y0: number; x1: number; y1: number },
): { avgR: number; avgG: number; avgB: number; avgLum: number; brightRatio: number } {
  let count = 0;
  let bright = 0;
  let totalR = 0;
  let totalG = 0;
  let totalB = 0;
  let totalLum = 0;

  for (let y = box.y0; y < box.y1; y++) {
    for (let x = box.x0; x < box.x1; x++) {
      const offset = (y * image.width + x) * image.channels;
      const r = image.data[offset] ?? 0;
      const g = image.data[offset + 1] ?? 0;
      const b = image.data[offset + 2] ?? 0;
      const a = image.channels >= 4 ? (image.data[offset + 3] ?? 255) : 255;
      if (a < 10) continue;

      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      totalR += r;
      totalG += g;
      totalB += b;
      totalLum += lum;
      if (lum >= 145) bright++;
      count++;
    }
  }

  if (count === 0) {
    return { avgR: 0, avgG: 0, avgB: 0, avgLum: 0, brightRatio: 0 };
  }

  return {
    avgR: totalR / count,
    avgG: totalG / count,
    avgB: totalB / count,
    avgLum: totalLum / count,
    brightRatio: bright / count,
  };
}

function clampBox(
  image: PixelImage,
  box: { x0: number; y0: number; x1: number; y1: number },
): { x0: number; y0: number; x1: number; y1: number } {
  const x0 = Math.max(0, Math.min(image.width - 1, box.x0));
  const y0 = Math.max(0, Math.min(image.height - 1, box.y0));
  const x1 = Math.max(x0 + 1, Math.min(image.width, box.x1));
  const y1 = Math.max(y0 + 1, Math.min(image.height, box.y1));
  return { x0, y0, x1, y1 };
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
  const cjk = containsCjk(a) || containsCjk(b);
  const substringMinLength = cjk ? 3 : hasNonAscii(a) || hasNonAscii(b) ? 2 : 4;
  if (a.length >= substringMinLength && b.includes(a)) return substringNameScore(a.length, b.length, cjk);
  if (b.length >= substringMinLength && a.includes(b)) return substringNameScore(b.length, a.length, cjk);

  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 0;
  return 1 - levenshtein(a, b) / maxLen;
}

function substringNameScore(partLength: number, fullLength: number, cjk: boolean): number {
  const score = partLength / fullLength;
  return cjk ? Math.max(score, 0.82) : score;
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** Splits into groups of ≤200 — the batch attendance endpoints' own per-call cap. */
function chunk200<T>(items: T[]): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += 200) {
    chunks.push(items.slice(i, i + 200));
  }
  return chunks;
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

function minWordConfidence(input: string): number {
  return hasNonAscii(input) ? MIN_NON_LATIN_WORD_CONFIDENCE : MIN_WORD_CONFIDENCE;
}

function isIgnoredUiText(normalized: string): boolean {
  return IGNORED_WORDS.has(normalized) || IGNORED_UI_FRAGMENTS.some((fragment) => normalized.includes(fragment));
}

function containsCjk(input: string): boolean {
  return /\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}|\p{Script=Hangul}/u.test(input);
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
