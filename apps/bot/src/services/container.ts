import { AliasRepository } from "../repositories/alias.repository.js";
import { BossRepository } from "../repositories/boss.repository.js";
import { CpRepository } from "../repositories/cp.repository.js";
import { DiscordServerRepository } from "../repositories/discordServer.repository.js";
import { IdentityRepository } from "../repositories/identity.repository.js";
import { NotificationRepository } from "../repositories/notification.repository.js";
import { BossService } from "./boss.service.js";
import { CpService } from "./cp.service.js";
import { CpScanService } from "./cpScan.service.js";
import { LinkService } from "./link.service.js";
import { OcrService } from "./ocr.service.js";
import { SmartAttendanceService } from "./smartAttendance.service.js";
import { RateLimiter } from "../middleware/rateLimit.js";

/**
 * Composition root.
 *
 * Dependencies are constructed here and injected downward; nothing below
 * imports a singleton service. That's what lets a test build a container with
 * fake repositories and exercise a command end-to-end without a database.
 */
export interface ServiceContainer {
  readonly repositories: {
    alias: AliasRepository;
    boss: BossRepository;
    cp: CpRepository;
    discordServer: DiscordServerRepository;
    identity: IdentityRepository;
    notification: NotificationRepository;
  };
  readonly boss: BossService;
  readonly cp: CpService;
  readonly cpScan: CpScanService;
  readonly link: LinkService;
  readonly ocr: OcrService;
  readonly smartAttendance: SmartAttendanceService;
  readonly rateLimiter: RateLimiter;
}

export function createContainer(): ServiceContainer {
  const repositories = {
    alias: new AliasRepository(),
    boss: new BossRepository(),
    cp: new CpRepository(),
    discordServer: new DiscordServerRepository(),
    identity: new IdentityRepository(),
    notification: new NotificationRepository(),
  };

  // One OCR service for the process — it owns the single tesseract worker, so
  // constructing more than one would defeat the reuse it exists to provide.
  const ocr = new OcrService();

  return {
    repositories,
    boss: new BossService(repositories.boss, repositories.alias),
    cp: new CpService(repositories.cp),
    cpScan: new CpScanService(ocr, repositories.cp),
    link: new LinkService(repositories.identity),
    ocr,
    smartAttendance: new SmartAttendanceService(ocr),
    rateLimiter: new RateLimiter(),
  };
}
