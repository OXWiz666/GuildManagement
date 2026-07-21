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
    const [layout, pixels, roster] = await Promise.all([
      this.ocr.recognizeLayout(image, { languages: env.OCR_ATTENDANCE_LANGUAGES }),
      decodeImage(image),
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

    const detected = detectMembers(layout.words, pixels, roster);
    if (detected.present.length === 0 && detected.absent.length === 0) {
      throw new UserFacingError(
        "I read the screenshot, but couldn't match any visible names to this guild's member.",
        "Make sure member IGNs in ForgeKeep match the in-game names shown in the rally screen.",
      );
    }

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

    for (const match of detected.absent) {
      if (alreadyConfirmed.has(match.userId)) {
        alreadyPresent.push(match);
        continue;
      }

      if (!alreadyPending.has(match.userId)) {
        await core.dashboard.markMemberPendingForReview(
          params.guildId,
          session.id,
          match.userId,
          params.actorId,
          undefined,
          "discord-bot-smart-attendance",
        );
      }
      absent.push(match);
    }

    return {
      session: { id: session.id, title: session.title, created: session.created },
      confirmed,
      alreadyPresent,
      absent,
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

function detectMembers(words: OcrWord[], pixels: PixelImage, roster: RosterMember[]) {
  const present = new Map<string, SmartAttendanceResult["confirmed"][number]>();
  const absent = new Map<string, SmartAttendanceResult["absent"][number]>();
  const ambiguous: SmartAttendanceResult["ambiguous"] = [];

  for (const word of words) {
    const source = cleanWord(word.text);
    const normalized = normalizeName(source);
    if (word.confidence < MIN_WORD_CONFIDENCE || normalized.length < 2) continue;
    if (IGNORED_WORDS.has(normalized)) continue;

    const match = bestRosterMatch(normalized, roster);
    if (!match) continue;

    if (match.score < MIN_MATCH_SCORE) {
      if (source.length >= 3) {
        ambiguous.push({
          source,
          reason: "low roster match",
          confidence: word.confidence,
        });
      }
      continue;
    }

    if (match.tied) {
      ambiguous.push({
        source,
        reason: "matched more than one roster member",
        confidence: word.confidence,
      });
      continue;
    }

    const signal = sampleWordSignal(pixels, word.bbox);
    const item = {
      userId: match.member.userId,
      name: match.member.label,
      source,
      confidence: word.confidence,
    };

    if (signal.active) {
      present.set(item.userId, item);
      absent.delete(item.userId);
    } else if (!present.has(item.userId)) {
      absent.set(item.userId, item);
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

async function decodeImage(image: Buffer): Promise<PixelImage> {
  const { data, info } = await sharp(image)
    .rotate()
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  return {
    data,
    width: info.width,
    height: info.height,
    channels: info.channels,
  };
}

function sampleWordSignal(image: PixelImage, bbox: OcrWord["bbox"]): WordSignal {
  const box = clampBox(image, {
    x0: bbox.x0 - 2,
    y0: bbox.y0 - 2,
    x1: bbox.x1 + 2,
    y1: bbox.y1 + 2,
  });
  const backdrop = clampBox(image, {
    x0: bbox.x0 - 12,
    y0: bbox.y0 - 8,
    x1: bbox.x1 + 24,
    y1: bbox.y1 + 8,
  });

  const textStats = sampleStats(image, box);
  const backdropStats = sampleStats(image, backdrop);
  const blueLift = backdropStats.avgB - Math.max(backdropStats.avgR, backdropStats.avgG);

  // White names have a meaningful high-luminance pixel ratio. Highlighted rally
  // rows are blue-backed even when text antialiasing is not bright enough.
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

function sampleStats(image: PixelImage, box: { x0: number; y0: number; x1: number; y1: number }) {
  let pixels = 0;
  let lum = 0;
  let bright = 0;
  let rTotal = 0;
  let gTotal = 0;
  let bTotal = 0;

  for (let y = box.y0; y < box.y1; y++) {
    for (let x = box.x0; x < box.x1; x++) {
      const i = (y * image.width + x) * image.channels;
      const r = image.data[i] ?? 0;
      const g = image.data[i + 1] ?? 0;
      const b = image.data[i + 2] ?? 0;
      const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      pixels++;
      lum += l;
      rTotal += r;
      gTotal += g;
      bTotal += b;
      if (l >= 150) bright++;
    }
  }

  const safePixels = Math.max(pixels, 1);
  return {
    avgLum: lum / safePixels,
    brightRatio: bright / safePixels,
    avgR: rTotal / safePixels,
    avgG: gTotal / safePixels,
    avgB: bTotal / safePixels,
  };
}

function clampBox(image: PixelImage, box: { x0: number; y0: number; x1: number; y1: number }) {
  const x0 = Math.max(0, Math.min(image.width - 1, Math.floor(box.x0)));
  const y0 = Math.max(0, Math.min(image.height - 1, Math.floor(box.y0)));
  const x1 = Math.max(x0 + 1, Math.min(image.width, Math.ceil(box.x1)));
  const y1 = Math.max(y0 + 1, Math.min(image.height, Math.ceil(box.y1)));
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
