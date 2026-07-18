import { prisma } from "@guild/db";
import { redisCache, cacheKeys, cacheTtl } from "@guild/core";
import {
  assessCpChange,
  detectClass,
  parseCombatPower,
  verifyName,
  type ClassDetection,
  type NameVerification,
} from "@guild/shared";
import { env } from "../config/env.js";
import type { CpRepository } from "../repositories/cp.repository.js";
import type { OcrService } from "./ocr.service.js";
import { UserFacingError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";

export interface ScanInput {
  imageUrl: string;
  imageSize: number;
  contentType: string | null;
  memberId: string;
  guildId: string;
  userId: string;
  ign: string | null;
  actorDiscordId: string;
}

export interface ScanResult {
  cp: number;
  oldCp: number | null;
  delta: number | null;
  rank: number | null;
  confidence: number;
  name: NameVerification;
  detectedClass: ClassDetection;
  /** Set when the class on the member's profile was updated by this scan. */
  classUpdated: string | null;
  flagged: boolean;
  flagReason: string | null;
  changed: boolean;
  ms: number;
}

/**
 * Screenshot → Combat Power.
 *
 * Pipeline: download → OCR → parse (shared with the website) → verify identity
 * → assess plausibility → write with provenance.
 *
 * Security posture (per the agreed trust model): the scan ALWAYS updates the
 * sender's own member row, resolved from their Discord link. The name read off
 * the image is only ever used to confirm the screenshot is theirs — it is never
 * used to look up who to update. That's what stops a crafted image from
 * rewriting another member's CP.
 */
export class CpScanService {
  constructor(
    private readonly ocr: OcrService,
    private readonly cp: CpRepository,
  ) {}

  /**
   * Class candidates for a guild: the distinct classes already on the roster,
   * plus any configured in GuildSettings.characterClasses.
   *
   * Data-driven because `guild_members.class` is free text with no canonical
   * list — there is nothing authoritative to hardcode. An empty result means
   * detection is skipped entirely rather than guessed at.
   */
  async getClassCandidates(guildId: string): Promise<string[]> {
    const key = cacheKeys.discordClassCandidates(guildId);

    const cached = await redisCache.get<string[]>(key);
    if (cached) return cached;

    const [roster, settings] = await Promise.all([
      // `distinct` does the dedupe in Postgres rather than pulling every
      // member row back to reduce in JS.
      prisma.guildMember.findMany({
        where: { guildId, isActive: true, class: { not: null } },
        select: { class: true },
        distinct: ["class"],
      }),
      prisma.guildSettings.findUnique({
        where: { guildId },
        select: { characterClasses: true },
      }),
    ]);

    const configured = Array.isArray(settings?.characterClasses)
      ? (settings.characterClasses as unknown[]).filter(
          (value): value is string => typeof value === "string" && value.trim().length > 0,
        )
      : [];

    const fromRoster = roster
      .map((row) => row.class)
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0);

    // Case-insensitive dedupe, preserving the first-seen spelling.
    const seen = new Map<string, string>();
    for (const value of [...configured, ...fromRoster]) {
      const normalized = value.trim().toLowerCase();
      if (!seen.has(normalized)) seen.set(normalized, value.trim());
    }

    const candidates = [...seen.values()];
    await redisCache.set(key, candidates, cacheTtl.discordClassCandidates);
    return candidates;
  }

  /** Drop the cached class candidates — called when a member's class changes. */
  async invalidateClassCandidates(guildId: string): Promise<void> {
    await redisCache.del(cacheKeys.discordClassCandidates(guildId));
  }

  async scan(input: ScanInput): Promise<ScanResult> {
    const started = Date.now();

    const image = await this.ocr.fetchImage(input.imageUrl, input.imageSize, input.contentType);
    const { text, confidence } = await this.ocr.recognize(image);

    const cp = parseCombatPower(text);
    if (cp === null) {
      logger.info("CP scan found no label", { confidence, textLength: text.length });
      throw new UserFacingError(
        "I couldn't find a **Combat Power** value in that screenshot.",
        "Make sure the CP number and its label are both visible and unobstructed — or set it manually with `!cp <value>`.",
      );
    }

    if (cp > env.CP_MAX_VALUE) {
      throw new UserFacingError(
        `The scanned value (${cp.toLocaleString("en-US")}) is above the maximum allowed Combat Power.`,
        "That's usually a misread — try a sharper screenshot, or use `!cp <value>`.",
      );
    }

    // Identity check. With no IGN on file there's nothing to verify against, so
    // treat it as matched (can't fail a check that can't be performed) — the
    // low-confidence and growth checks still apply.
    const name: NameVerification = input.ign
      ? verifyName(text, input.ign)
      : { matched: true, score: 0, bestToken: null };

    const candidates = await this.getClassCandidates(input.guildId);
    const detectedClass = detectClass(text, candidates);

    const profile = await this.cp.getProfile(input.memberId);
    const oldCp = profile?.cp ?? null;

    const plausibility = assessCpChange({
      oldCp,
      newCp: cp,
      confidence,
      nameMatched: name.matched,
      maxGrowthRatio: env.CP_MAX_GROWTH_RATIO,
      minConfidence: env.OCR_MIN_CONFIDENCE,
    });

    // Auto-apply even when flagged — the member isn't blocked, the row is just
    // marked for officer review.
    const updated = await this.cp.updateCp({
      memberId: input.memberId,
      guildId: input.guildId,
      userId: input.userId,
      newCp: cp,
      actorId: input.userId,
      actorDiscordId: input.actorDiscordId,
      source: "DISCORD_OCR",
      imageUrl: input.imageUrl,
      ocrConfidence: confidence,
      flagged: plausibility.suspicious,
      flagReason: plausibility.reason,
    });

    // Only fill a BLANK class. Overwriting an existing one on a fuzzy OCR match
    // would let a bad read silently rewrite a member's profile.
    let classUpdated: string | null = null;
    if (detectedClass.className && !profile?.className) {
      await this.cp.setClass(input.memberId, detectedClass.className);
      classUpdated = detectedClass.className;
      await redisCache.del(cacheKeys.discordClassCandidates(input.guildId));
    }

    const rank = await this.cp.getRank({ guildId: input.guildId, cp });

    logger.info("CP scan complete", {
      guildId: input.guildId,
      confidence,
      cp,
      flagged: plausibility.suspicious,
      nameMatched: name.matched,
      ms: Date.now() - started,
    });

    return {
      cp,
      oldCp: updated?.oldCp ?? oldCp,
      delta: updated?.delta ?? null,
      rank,
      confidence,
      name,
      detectedClass,
      classUpdated,
      flagged: plausibility.suspicious,
      flagReason: plausibility.reason,
      changed: updated !== null,
      ms: Date.now() - started,
    };
  }
}
