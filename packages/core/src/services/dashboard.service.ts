import { prisma, Prisma } from "@guild/db";
import { AttendanceType, AttendanceRecordStatus, BossEventStatus } from "@guild/db";

type DbClient = typeof prisma | Prisma.TransactionClient;
import { cache } from "../lib/cache";
import { cache as redisCache } from "../lib/redis";
import { cacheKeys, ttl as cacheTtl } from "../lib/cache-keys";
import { writeAuditLog } from "./audit.service";
import { createLedgerEntry } from "./ledger.service";
import { NotFoundError, ForbiddenError, BadRequestError } from "../utils/errors";
import * as crypto from "crypto";
import { PREDEFINED_BOSSES, getBossImageUrl, getNextBossSpawnTime } from "@guild/shared";
import { broadcastToUser } from "../lib/socket";
import { getDropCatalogMap } from "./equipment.service";
import { getGuildMemberByUser } from "./guild.service";
import { addDropsToStorage } from "./storage.service";
import { getEffectiveActivityPointRules } from "./activityPoints.service";
import { publicUrl } from "../lib/supabaseStorage";

// Anti-spam in-memory tracking: userId -> { attempts: number, blockedUntil: Date | null }
interface SpamRecord {
  attempts: number;
  blockedUntil: Date | null;
}
const failedAttemptsMap = new Map<string, SpamRecord>();

const ROTATION_MANAGER_ROLES = ["FACTION_LEADER", "GUILD_LEADER", "ADMIN"];
// Timer resets (full + maintenance) are also permitted for Officers, not just the
// faction/guild leaders who own the rotation queues.
const ROTATION_RESET_ROLES = ["FACTION_LEADER", "GUILD_LEADER", "ADMIN", "OFFICER"];
// Marking a boss "Taken" (logging the kill + advancing the rotation) is also
// permitted for Officers — reordering the rotation queue itself stays
// restricted to ROTATION_MANAGER_ROLES.
const BOSS_TAKEN_ROLES = ["FACTION_LEADER", "GUILD_LEADER", "ADMIN", "OFFICER"];
const BOSS_KILL_AUDIT_ACTIONS = ["BOSS_ROTATION_KILLED", "BOSS_KILLED_LOGGED", "BOSS_KILL_RECORDED"];
const SCHEDULE_CREATOR_ROLES = ["GUILD_LEADER", "FACTION_LEADER", "ADMIN", "OFFICER"];

// How long the self check-in window stays open after a boss kill is logged.
const CHECK_IN_WINDOW_MINUTES = 30;

// Process-level guard so we reconcile the boss registry at most once per server boot.
let registrySynced = false;

type PendingNotification = {
  userId: string;
  type: string;
  title: string;
  body: string;
  metadata: Record<string, unknown>;
};

// A single item recorded as dropped when a boss is taken. The client sends the
// icon's bucket+path; we resolve canonical name/rarity/type from the live catalog
// so stored drops can't be spoofed and always point at a real icon.
export interface BossDropInput {
  bucket: string;
  path: string;
  quantity?: number;
  // Client-supplied override for this drop's display name (e.g. to note a
  // specific roll/variant). Blank/whitespace-only falls back to the catalog
  // item name.
  customName?: string;
}

const MAX_DROP_CUSTOM_NAME_LENGTH = 60;

type StoredBossDrop = {
  itemName: string;
  type: string;
  category: string | null;
  rarity: string | null;
  bucket: string;
  path: string;
  quantity: number;
  iconUrl: string;
};

const MAX_DROPS_PER_KILL = 40;

/**
 * Validate submitted drops against the icon catalog and return canonical rows to
 * persist in the audit detail. Unknown icons are dropped silently (never blocks a
 * kill). Duplicate icons are merged by summing quantities.
 */
async function normalizeBossDrops(drops: BossDropInput[] | undefined): Promise<StoredBossDrop[]> {
  if (!Array.isArray(drops) || drops.length === 0) return [];
  const catalog = await getDropCatalogMap();
  const merged = new Map<string, StoredBossDrop>();
  for (const drop of drops.slice(0, MAX_DROPS_PER_KILL)) {
    if (!drop || typeof drop.bucket !== "string" || typeof drop.path !== "string") continue;
    const key = `${drop.bucket}::${drop.path}`;
    const item = catalog.get(key);
    if (!item) continue;
    const qty = Math.max(1, Math.min(999, Math.floor(Number(drop.quantity) || 1)));
    const customName = typeof drop.customName === "string" ? drop.customName.trim().slice(0, MAX_DROP_CUSTOM_NAME_LENGTH) : "";
    const existing = merged.get(key);
    if (existing) {
      existing.quantity += qty;
    } else {
      merged.set(key, {
        itemName: customName || item.itemName,
        type: item.type,
        category: item.category,
        rarity: item.rarity,
        bucket: item.bucket,
        path: item.path,
        quantity: qty,
        iconUrl: item.iconUrl,
      });
    }
  }
  return Array.from(merged.values());
}

type BossRegistryItem = {
  id: string;
  name: string;
  level: number;
  type: string;
  cooldownHours: number | null;
  location: string;
  fixedSpawns: unknown;
};

function canManageBossRotation(role: string) {
  return ROTATION_MANAGER_ROLES.includes(role);
}

function canMarkBossTaken(role: string) {
  return BOSS_TAKEN_ROLES.includes(role);
}

function normalizeQueue(rawQueue: unknown, activeGuildIds: string[]) {
  const queue = Array.isArray(rawQueue)
    ? rawQueue.filter((id): id is string => typeof id === "string")
    : [];
  const activeSet = new Set(activeGuildIds);
  const normalized = queue.filter((id) => activeSet.has(id));
  for (const guildId of activeGuildIds) {
    if (!normalized.includes(guildId)) {
      normalized.push(guildId);
    }
  }
  return normalized;
}

/**
 * Resolve the effective rotation queue for a boss, honoring the faction leader's
 * master list. When `participantsConfigured` is set, the stored queue is the
 * authoritative participant list — only listed (still-active) guilds take the
 * boss, in order, with NO auto-inclusion of every active guild. Otherwise it
 * falls back to the default "all active faction guilds" behavior.
 */
function resolveQueue(
  existing: { queueGuildIds: unknown; participantsConfigured?: boolean } | null | undefined,
  activeGuildIds: string[],
) {
  if (existing?.participantsConfigured) {
    const activeSet = new Set(activeGuildIds);
    const raw = Array.isArray(existing.queueGuildIds)
      ? existing.queueGuildIds.filter((id): id is string => typeof id === "string")
      : [];
    return raw.filter((id) => activeSet.has(id));
  }
  return normalizeQueue(existing?.queueGuildIds, activeGuildIds);
}

async function requireActiveGuildMember(actorId: string, guildId: string) {
  // Shared, short-TTL cached membership read (same cache key the RBAC guard
  // uses, so guard + dashboard requests warm each other). Role changes
  // invalidate the key — see guild.service.updateMemberRole.
  const membership = await getGuildMemberByUser(actorId, guildId);

  if (!membership || !membership.isActive) {
    throw new ForbiddenError("You must be an active member of this guild");
  }

  return membership;
}

async function requireBossRotationManager(actorId: string, guildId: string) {
  const membership = await requireActiveGuildMember(actorId, guildId);
  if (!canManageBossRotation(membership.role)) {
    throw new ForbiddenError("Only Faction Leaders, Guild Leaders, and Admins can manage boss rotations");
  }
  return membership;
}

async function requireBossTakenManager(actorId: string, guildId: string) {
  const membership = await requireActiveGuildMember(actorId, guildId);
  if (!canMarkBossTaken(membership.role)) {
    throw new ForbiddenError("Only Officers, Guild Leaders, Faction Leaders, and Admins can mark a boss taken");
  }
  return membership;
}

async function requireBossRotationResetManager(actorId: string, guildId: string) {
  const membership = await requireActiveGuildMember(actorId, guildId);
  if (!ROTATION_RESET_ROLES.includes(membership.role)) {
    throw new ForbiddenError("Only Leaders and Officers can reset boss timers");
  }
  return membership;
}

function isFactionLevelRole(role: string) {
  return role === "FACTION_LEADER" || role === "ADMIN";
}

/**
 * The master list (which guilds are scheduled for each boss) may only be edited
 * by Faction Leaders (and Admins), per faction policy.
 */
async function requireFactionLeader(actorId: string, guildId: string) {
  const membership = await requireActiveGuildMember(actorId, guildId);
  if (!isFactionLevelRole(membership.role)) {
    throw new ForbiddenError("Only Faction Leaders can modify the boss master list");
  }
  return membership;
}

// Resolves the faction a guild belongs to (null if unaffiliated). Boss
// rotation/schedule data is scoped by this id so factions never see or
// influence each other's rotations.
async function getGuildFactionId(guildId: string): Promise<string | null> {
  const guild = await prisma.guild.findUnique({ where: { id: guildId }, select: { factionId: true } });
  return guild?.factionId ?? null;
}

// Shared invalidation for every boss rotation / schedule mutation — resolves
// the same faction-or-solo scope key getBossRotation/getBossSchedules cache
// under, and clears both in one round trip. Called from every mutation below
// that changes rotation queue order, schedule state, or logs a kill.
async function invalidateBossRotationCache(guildId: string): Promise<void> {
  const factionId = await getGuildFactionId(guildId);
  const scopeKey = factionId ? factionId : `solo:${guildId}`;
  await redisCache.delMany([
    cacheKeys.bossRotationByFaction(scopeKey),
    cacheKeys.bossSchedules(scopeKey),
  ]);
}

// Shared invalidation for every attendance mutation — the sessions list and
// pending queue are always cleared (both are guild-wide summaries); the
// specific session's detail key is cleared too whenever the mutation names
// one (almost always, except session creation).
async function invalidateAttendanceCache(guildId: string, sessionId?: string): Promise<void> {
  const keys = [cacheKeys.attendSessions(guildId), cacheKeys.attendPending(guildId)];
  if (sessionId) keys.push(cacheKeys.attendSessionDetail(guildId, sessionId));
  await redisCache.delMany(keys);
}

// A confirm/mark-present/revoke also credits or debits the ledger, which
// feeds both the dashboard's guild-wide aggregate and page 1 of the
// accounting ledger — clear those alongside the attendance keys so the
// awarded/reversed points show up immediately instead of waiting on TTL.
async function invalidateAttendanceAndFinanceCache(guildId: string, sessionId?: string): Promise<void> {
  await invalidateAttendanceCache(guildId, sessionId);
  await redisCache.delMany([
    cacheKeys.dashboardStats(guildId),
    cacheKeys.acctBalance(guildId),
    cacheKeys.acctLedgerPage(guildId, 1, 25),
  ]);
}

// Every guild-list query that feeds a rotation queue MUST be scoped by
// factionId — an unscoped `isActive: true` guild list leaks every other
// faction's guilds into this faction's rotations/master list. A guild with no
// faction has nothing to rotate with but itself, so `factionId: null` must
// NOT be passed straight to Prisma (that would match every unaffiliated
// guild in the whole system) — `soloGuildId` scopes it down to just that one
// guild instead.
async function getActiveFactionGuilds(factionId: string | null, soloGuildId?: string) {
  if (!factionId) {
    if (!soloGuildId) return [];
    const guild = await prisma.guild.findFirst({
      where: { id: soloGuildId, isActive: true },
      select: { id: true, name: true, slug: true, avatarUrl: true },
    });
    return guild ? [guild] : [];
  }
  return prisma.guild.findMany({
    where: { isActive: true, factionId },
    select: { id: true, name: true, slug: true, avatarUrl: true },
    orderBy: { name: "asc" },
  });
}

function serializeBossScheduleForApi(schedule: any) {
  return {
    id: schedule.id,
    guildId: schedule.guildId,
    bossName: schedule.bossName,
    bossImageUrl: schedule.bossImageUrl,
    spawnTime: schedule.spawnTime.toISOString(),
    location: schedule.location,
    guildTurn: schedule.guildTurn,
    guildTurnGuildId: schedule.guildTurnGuildId,
    guildTurnGuildName: schedule.guildTurnGuild?.name || null,
    status: schedule.status,
    killedAt: schedule.killedAt ? schedule.killedAt.toISOString() : null,
    creatorId: schedule.creatorId,
    createdAt: schedule.createdAt.toISOString(),
    lootDrop: schedule.lootDrop,
    screenshotUrl: schedule.screenshotUrl,
  };
}

function parseBossHistoryMonth(month?: string) {
  const now = new Date();
  const match = month?.match(/^(\d{4})-(\d{2})$/);
  const year = match ? Number(match[1]) : now.getUTCFullYear();
  const monthIndex = match ? Number(match[2]) - 1 : now.getUTCMonth();

  if (!Number.isInteger(year) || !Number.isInteger(monthIndex) || monthIndex < 0 || monthIndex > 11) {
    throw new BadRequestError("Month must use YYYY-MM format");
  }

  const start = new Date(Date.UTC(year, monthIndex, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, monthIndex + 1, 1, 0, 0, 0, 0));
  const key = `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
  return { key, start, end };
}

function getDetailString(detail: Record<string, unknown> | null, key: string) {
  const value = detail?.[key];
  return typeof value === "string" ? value : null;
}

function predefinedBossToRegistryItem(boss: (typeof PREDEFINED_BOSSES)[number]): BossRegistryItem {
  return {
    id: `predefined:${boss.name}`,
    name: boss.name,
    level: boss.level,
    type: boss.type,
    cooldownHours: boss.cooldownHours || null,
    location: boss.location,
    fixedSpawns: boss.fixedSpawns || null,
  };
}

export async function getBossRegistryForRotation() {
  try {
    const dbBosses = await prisma.boss.findMany({
      orderBy: [{ type: "asc" }, { level: "desc" }, { name: "asc" }],
    });
    const bossMap = new Map<string, BossRegistryItem>(
      dbBosses.map((boss) => [boss.name.toLowerCase(), boss]),
    );

    for (const boss of PREDEFINED_BOSSES) {
      if (!bossMap.has(boss.name.toLowerCase())) {
        bossMap.set(boss.name.toLowerCase(), predefinedBossToRegistryItem(boss));
      }
    }

    return Array.from(bossMap.values()).sort((a, b) => {
      const typeCompare = a.type.localeCompare(b.type);
      if (typeCompare !== 0) return typeCompare;
      if (b.level !== a.level) return b.level - a.level;
      return a.name.localeCompare(b.name);
    });
  } catch {
    return PREDEFINED_BOSSES
      .map(predefinedBossToRegistryItem)
      .sort((a, b) => {
        const typeCompare = a.type.localeCompare(b.type);
        if (typeCompare !== 0) return typeCompare;
        if (b.level !== a.level) return b.level - a.level;
        return a.name.localeCompare(b.name);
      });
  }
}

/**
 * Reconcile the `Boss` registry with the authoritative `PREDEFINED_BOSSES` list.
 * Upserts every boss so corrections (e.g. level/cooldown changes) reach an
 * already-seeded database, not just missing rows. Runs once per process.
 */
async function ensureBossRegistrySeeded() {
  if (registrySynced) {
    return;
  }

  await prisma.$transaction(
    PREDEFINED_BOSSES.map((boss) =>
      prisma.boss.upsert({
        where: { name: boss.name },
        update: {
          level: boss.level,
          type: boss.type,
          cooldownHours: boss.cooldownHours || null,
          location: boss.location,
          fixedSpawns: boss.fixedSpawns || undefined,
        },
        create: {
          name: boss.name,
          level: boss.level,
          type: boss.type,
          cooldownHours: boss.cooldownHours || null,
          location: boss.location,
          fixedSpawns: boss.fixedSpawns || undefined,
        },
      }),
    ),
  );

  registrySynced = true;
}

/**
 * Pick a sensible creator for system-generated boss schedules — an officer or
 * leader when possible, otherwise any active member. Returns null for an empty guild.
 */
async function getDefaultScheduleCreator(guildId: string): Promise<string | null> {
  const officer = await prisma.guildMember.findFirst({
    where: { guildId, isActive: true, role: { in: SCHEDULE_CREATOR_ROLES as any } },
    select: { userId: true },
    orderBy: { joinedAt: "asc" },
  });
  if (officer) return officer.userId;

  const anyMember = await prisma.guildMember.findFirst({
    where: { guildId, isActive: true },
    select: { userId: true },
    orderBy: { joinedAt: "asc" },
  });
  return anyMember?.userId ?? null;
}

/**
 * Ensure every registry boss has a live upcoming spawn for this guild so the
 * Boss Schedule / Rotation / Attendance pages always have something to count
 * down. Fixed-schedule bosses get their next Singapore-time spawn regardless of
 * kill history. Cycle bosses only get a schedule row once their first kill has
 * established a real `nextSpawnTime` on `BossRotation` — an untaken cycle boss
 * is intentionally left with NO schedule row (nothing to fake-countdown to).
 * Idempotent — only creates rows for bosses that have no UPCOMING/SPAWNED entry.
 */
async function ensureUpcomingSpawns(guildId: string, factionId: string | null) {
  // Faction-wide existence check: a boss schedule seeded by ANY guild in the
  // same faction (or shared, guildId === null) already covers every guild's
  // view of that boss. Checking only this guild's own rows let each guild
  // independently seed its own duplicate row for the same boss/spawn — e.g.
  // two guilds both loading the dashboard would each create their own
  // "Libitina" row with the identical fixed-schedule spawn time, so the
  // shared "Next spawns" list showed the same boss twice.
  const factionGuilds = factionId ? await getActiveFactionGuilds(factionId, guildId) : [];
  const visibleGuildIds = Array.from(new Set([guildId, ...factionGuilds.map((g) => g.id)]));

  const [existing, rotations] = await Promise.all([
    prisma.bossSchedule.findMany({
      where: {
        OR: [{ guildId: { in: visibleGuildIds } }, { guildId: null }],
        status: { in: [BossEventStatus.UPCOMING, BossEventStatus.SPAWNED] },
      },
      select: { id: true, bossName: true, spawnTime: true, status: true },
    }),
    factionId
      ? prisma.bossRotation.findMany({
          where: { factionId },
          select: { bossName: true, nextSpawnTime: true },
        })
      : Promise.resolve([]),
  ]);

  const now = new Date();

  // The rotation table is the source of truth for a cycle boss's next spawn once
  // it has been taken at least once. Keyed by lowercase name → future spawn time.
  const rotationNextSpawn = new Map<string, Date>();
  for (const r of rotations) {
    if (r.nextSpawnTime && r.nextSpawnTime.getTime() > now.getTime()) {
      rotationNextSpawn.set(r.bossName.toLowerCase(), r.nextSpawnTime);
    }
  }

  const fixedByName = new Map(
    PREDEFINED_BOSSES.filter((b) => b.type === "FIXED_SCHEDULE").map((b) => [b.name.toLowerCase(), b]),
  );

  // Roll forward stale spawns so no boss reads "LIVE" forever:
  //  • FIXED_SCHEDULE — advance to the next deterministic Singapore-time occurrence.
  //  • Cycle bosses   — advance to the rotation's real `nextSpawnTime` when one has
  //    been established by a kill. (A cycle boss with no future rotation time
  //    intentionally stays "live / ready" until its first kill sets the cadence.)
  const rollForward: Array<{ id: string; spawnTime: Date }> = [];
  for (const s of existing) {
    if (s.spawnTime.getTime() > now.getTime()) continue; // not stale
    const key = s.bossName.toLowerCase();
    if (fixedByName.has(key)) {
      rollForward.push({ id: s.id, spawnTime: getNextBossSpawnTime(s.bossName, now) });
    } else {
      const rotationSpawn = rotationNextSpawn.get(key);
      if (rotationSpawn) rollForward.push({ id: s.id, spawnTime: rotationSpawn });
    }
  }
  if (rollForward.length > 0) {
    await prisma.$transaction(
      rollForward.map((s) =>
        prisma.bossSchedule.update({
          where: { id: s.id },
          data: { spawnTime: s.spawnTime, status: BossEventStatus.UPCOMING },
        }),
      ),
    );
  }

  const have = new Set(existing.map((s) => s.bossName.toLowerCase()));
  // A cycle boss with no established rotation cadence has never been taken —
  // don't seed a fake "live now" schedule for it. It only gets a real
  // schedule row once the first kill sets `BossRotation.nextSpawnTime`.
  // Fixed-schedule bosses always get seeded since their spawn is a real,
  // deterministic clock time independent of any kill history.
  const missing = PREDEFINED_BOSSES.filter((boss) => {
    if (have.has(boss.name.toLowerCase())) return false;
    if (boss.type !== "FIXED_SCHEDULE" && !rotationNextSpawn.has(boss.name.toLowerCase())) return false;
    return true;
  });

  if (missing.length === 0) {
    return;
  }

  const creatorId = await getDefaultScheduleCreator(guildId);
  if (!creatorId) {
    return; // empty guild — nothing to attribute the schedules to
  }

  await prisma.bossSchedule.createMany({
    data: missing.map((boss) => {
      const spawnTime = boss.type === "FIXED_SCHEDULE"
        ? getNextBossSpawnTime(boss.name, now)
        : rotationNextSpawn.get(boss.name.toLowerCase())!;
      return {
        // Seed as a shared, faction-wide row (ownership TBD, resolved via
        // guildTurnGuildId / the rotation's current holder) when this guild
        // belongs to a faction, so no other guild re-seeds its own copy.
        // A solo guild (no faction) keeps owning its own row as before.
        guildId: factionId ? null : guildId,
        bossName: boss.name,
        bossImageUrl: getBossImageUrl(boss.name),
        spawnTime,
        location: boss.location,
        status: BossEventStatus.UPCOMING,
        creatorId,
      };
    }),
  });
}

/**
 * After a rotation boss is taken, make sure its live schedule reflects the real
 * next spawn instead of lingering at a past "live" time (which is what made a
 * just-taken cycle boss immediately flip back to LIVE). Rolls every still-open
 * schedule for the boss forward to `spawnTime` and assigns the next guild's turn;
 * creates one if none exist. Returns a representative next schedule (or null).
 */
async function syncNextRotationSchedule(
  params: {
    bossName: string;
    factionGuildIds: string[];
    fallbackGuildId: string | null;
    bossImageUrl: string | null;
    location: string;
    spawnTime: Date;
    nextGuildName: string | null;
    nextGuildId: string | null;
    creatorId: string;
  },
  db: DbClient = prisma,
) {
  const guildTurnInclude = {
    guildTurnGuild: { select: { id: true, name: true, slug: true, avatarUrl: true } },
  } as const;

  // Scoped to this faction's own guilds — `bossName` is no longer globally
  // unique across factions, so two factions' same-named boss must not stomp
  // each other's schedule rows.
  const openSchedules = await db.bossSchedule.findMany({
    where: {
      bossName: params.bossName,
      guildId: { in: params.factionGuildIds },
      status: { not: BossEventStatus.KILLED },
    },
    orderBy: { spawnTime: "asc" },
    select: { id: true },
  });

  if (openSchedules.length > 0) {
    await db.bossSchedule.updateMany({
      where: {
        bossName: params.bossName,
        guildId: { in: params.factionGuildIds },
        status: { not: BossEventStatus.KILLED },
      },
      data: {
        spawnTime: params.spawnTime,
        status: BossEventStatus.UPCOMING,
        guildTurn: params.nextGuildName,
        guildTurnGuildId: params.nextGuildId,
      },
    });
    return db.bossSchedule.findUnique({
      where: { id: openSchedules[0]!.id },
      include: guildTurnInclude,
    });
  }

  return db.bossSchedule.create({
    data: {
      guildId: params.fallbackGuildId,
      bossName: params.bossName,
      bossImageUrl: params.bossImageUrl,
      spawnTime: params.spawnTime,
      location: params.location,
      status: BossEventStatus.UPCOMING,
      guildTurn: params.nextGuildName,
      guildTurnGuildId: params.nextGuildId,
      creatorId: params.creatorId,
    },
    include: guildTurnInclude,
  });
}

/**
 * Open a code-free, single-active check-in window tied to a freshly-killed boss.
 * Members claim attendance via `checkInToBoss` (no code typing); officers verify
 * through the existing `confirmAttendanceRecord` flow. A `code` is still stored
 * internally to satisfy the unique constraint but is never surfaced.
 */
async function openBossCheckInSession(
  guildId: string,
  bossScheduleId: string,
  bossName: string,
) {
  await prisma.attendanceSession.updateMany({
    where: { guildId, isActive: true },
    data: { isActive: false },
  });

  const randomPin = crypto.randomBytes(3).toString("hex").toUpperCase();
  const code = `ATT-${randomPin.substring(0, 4)}`;
  const expiresAt = new Date(Date.now() + CHECK_IN_WINDOW_MINUTES * 60 * 1000);

  const created = await prisma.attendanceSession.create({
    data: {
      guildId,
      code,
      type: AttendanceType.GUILD,
      title: `${bossName} Check-In`,
      isActive: true,
      expiresAt,
      bossScheduleId,
    },
  });

  await invalidateAttendanceCache(guildId);
  return created;
}


// ─── Attendance Systems ─────────────────────────

export async function createAttendanceSession(
  guildId: string,
  title: string,
  type: AttendanceType,
  minutes: number,
  actorId: string,
  ipAddress?: string,
  userAgent?: string,
  bossScheduleId?: string,
) {
  // Validate actor is Guild Leader or Officer
  const actorMembership = await getGuildMemberByUser(actorId, guildId);

  if (!actorMembership || !actorMembership.isActive || !SCHEDULE_CREATOR_ROLES.includes(actorMembership.role as any)) {
    throw new ForbiddenError("Only Guild Leaders and Officers can start attendance sessions");
  }

  // Deactivate any existing active attendance sessions for this guild to keep only one active
  await prisma.attendanceSession.updateMany({
    where: { guildId, isActive: true },
    data: { isActive: false },
  });

  // Generate unique 6-character code
  const randomPin = crypto.randomBytes(3).toString("hex").toUpperCase(); // 6 chars like "8F2B9C"
  const code = `ATT-${randomPin.substring(0, 4)}`; // format like "ATT-8F2B"

  const expiresAt = new Date(Date.now() + minutes * 60 * 1000);

  // Auto-set title for Boss event-specific session if no custom title is provided
  let resolvedTitle = title;
  if (bossScheduleId) {
    const schedule = await prisma.bossSchedule.findUnique({
      where: { id: bossScheduleId },
    });
    if (schedule && (!title || title.trim() === "" || title.trim() === "Guild Attendance" || title.trim() === "Faction Attendance")) {
      resolvedTitle = `${schedule.bossName} Attendance (${new Date(schedule.spawnTime).toLocaleDateString("en-US", { month: "short", day: "numeric" })})`;
    }
  }

  const session = await prisma.attendanceSession.create({
    data: {
      guildId,
      code,
      type,
      title: resolvedTitle,
      isActive: true,
      expiresAt,
      bossScheduleId: bossScheduleId || null,
    },
  });

  await writeAuditLog({
    actorId,
    guildId,
    action: "ATTENDANCE_SESSION_STARTED",
    target: "AttendanceSession",
    targetId: session.id,
    detail: { title: resolvedTitle, code, type, minutes, bossScheduleId },
    ipAddress,
    userAgent,
  });

  await invalidateAttendanceCache(guildId);
  return session;
}

export async function submitAttendanceCode(userId: string, code: string) {
  const now = new Date();

  // Enforce Anti-Spam protection
  const spam = failedAttemptsMap.get(userId);
  if (spam && spam.blockedUntil && spam.blockedUntil > now) {
    const minutesLeft = Math.ceil((spam.blockedUntil.getTime() - now.getTime()) / 60000);
    throw new BadRequestError(`Too many incorrect attempts. You are temporarily blocked. Try again in ${minutesLeft} minute(s).`);
  }

  // Search for active, non-expired attendance session
  const cleanCode = code.trim().toUpperCase();
  const session = await prisma.attendanceSession.findFirst({
    where: {
      code: cleanCode,
      isActive: true,
      expiresAt: { gt: now },
    },
    select: { id: true, title: true, guildId: true, guild: { select: { name: true } } },
  });

  if (!session) {
    // Anti-spam count tracking
    const spamRecord = spam || { attempts: 0, blockedUntil: null };
    spamRecord.attempts += 1;
    if (spamRecord.attempts >= 3) {
      spamRecord.blockedUntil = new Date(now.getTime() + 5 * 60 * 1000); // block for 5 minutes
      failedAttemptsMap.set(userId, spamRecord);
      throw new BadRequestError("Invalid, inactive, or expired attendance code. You have been blocked from checking in for 5 minutes due to too many failed attempts.");
    } else {
      failedAttemptsMap.set(userId, spamRecord);
      const remaining = 3 - spamRecord.attempts;
      throw new BadRequestError(`Invalid, inactive, or expired attendance code. ${remaining} attempt(s) remaining before temporary block.`);
    }
  }

  // Clear anti-spam lock upon successful verification
  failedAttemptsMap.delete(userId);

  // Verify the user is a member of the guild that hosts this session
  const membership = await getGuildMemberByUser(userId, session.guildId);

  if (!membership || !membership.isActive) {
    throw new ForbiddenError("You must be an active member of the guild to check in");
  }

  // Check if they already submitted a check-in for this session
  const existingRecord = await prisma.attendanceRecord.findUnique({
    where: {
      userId_sessionId: {
        userId,
        sessionId: session.id,
      },
    },
  });

  if (existingRecord) {
    throw new BadRequestError("You have already checked in for this session");
  }

  // Create record in PENDING status
  const record = await prisma.attendanceRecord.create({
    data: {
      sessionId: session.id,
      userId,
      status: AttendanceRecordStatus.PENDING,
    },
    include: {
      user: {
        select: {
          id: true,
          displayName: true,
          email: true,
        },
      },
    },
  });

  await invalidateAttendanceCache(session.guildId, session.id);

  return {
    success: true,
    sessionTitle: session.title,
    guildName: session.guild.name,
    guildId: session.guildId,
    record,
  };
}

/**
 * Code-free self check-in for a specific killed boss. Resolves the active,
 * non-expired check-in window attached to that boss schedule and records the
 * member as PENDING for officer verification. Mirrors `submitAttendanceCode`
 * without the code-entry / anti-spam machinery (the boss id is the key).
 */
export async function checkInToBoss(userId: string, guildId: string, bossScheduleId: string) {
  const now = new Date();

  const membership = await getGuildMemberByUser(userId, guildId);
  if (!membership || !membership.isActive) {
    throw new ForbiddenError("You must be an active member of the guild to check in");
  }

  const session = await prisma.attendanceSession.findFirst({
    where: {
      bossScheduleId,
      isActive: true,
      expiresAt: { gt: now },
    },
    select: { id: true, title: true, guildId: true, guild: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });

  if (!session) {
    throw new BadRequestError("Check-in is closed for this boss");
  }
  if (session.guildId !== guildId) {
    throw new ForbiddenError("This check-in belongs to another guild");
  }

  const existingRecord = await prisma.attendanceRecord.findUnique({
    where: { userId_sessionId: { userId, sessionId: session.id } },
  });
  if (existingRecord) {
    throw new BadRequestError("You have already checked in for this boss");
  }

  const record = await prisma.attendanceRecord.create({
    data: {
      sessionId: session.id,
      userId,
      status: AttendanceRecordStatus.PENDING,
    },
    include: {
      user: { select: { id: true, displayName: true, email: true } },
    },
  });

  await invalidateAttendanceCache(session.guildId, session.id);

  return {
    success: true,
    sessionTitle: session.title,
    guildName: session.guild.name,
    guildId: session.guildId,
    bossScheduleId,
    record,
  };
}

async function assertAttendanceOfficer(guildId: string, actorId: string, action: string) {
  const actorMembership = await getGuildMemberByUser(actorId, guildId);

  if (!actorMembership || !actorMembership.isActive || !SCHEDULE_CREATOR_ROLES.includes(actorMembership.role as any)) {
    throw new ForbiddenError(`Only Guild Leaders and Officers can ${action}`);
  }

  return actorMembership;
}

// Shared by the live queue (single active session) and the past-session
// inspector (arbitrary session id): pulls every record for the session (not
// just pending) plus the boss it's tied to and the full active roster, so the
// queue can be organized per boss with a checked-in/not-checked-in split
// instead of a flat member list.
async function buildSessionAttendanceView(
  guildId: string,
  session: { id: string; bossScheduleId: string | null },
) {
  const [records, bossSchedule, activeMembers] = await Promise.all([
    prisma.attendanceRecord.findMany({
      where: { sessionId: session.id },
      include: {
        user: {
          select: {
            id: true,
            displayName: true,
            email: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: { joinedAt: "asc" },
    }),
    session.bossScheduleId
      ? prisma.bossSchedule.findUnique({
          where: { id: session.bossScheduleId },
          select: { bossName: true, bossImageUrl: true, location: true, spawnTime: true },
        })
      : null,
    prisma.guildMember.findMany({
      where: { guildId, isActive: true },
      select: {
        userId: true,
        ign: true,
        user: { select: { id: true, displayName: true, email: true, avatarUrl: true } },
      },
      orderBy: { joinedAt: "asc" },
    }),
  ]);

  const pendingRecords = records.filter((r) => r.status === AttendanceRecordStatus.PENDING);
  const confirmedRecords = records.filter((r) => r.status === AttendanceRecordStatus.CONFIRMED);
  const checkedInUserIds = new Set(records.map((r) => r.userId));
  const notCheckedInMembers = activeMembers.filter((m) => !checkedInUserIds.has(m.userId));

  return { bossSchedule, pendingRecords, confirmedRecords, notCheckedInMembers };
}

export async function getGuildPendingAttendance(guildId: string, actorId: string) {
  await assertAttendanceOfficer(guildId, actorId, "view pending attendance");

  return redisCache.getOrSet(cacheKeys.attendPending(guildId), cacheTtl.attendPending, async () => {
    const activeSession = await prisma.attendanceSession.findFirst({
      where: { guildId, isActive: true },
      orderBy: { createdAt: "desc" },
    });

    if (!activeSession) {
      return { activeSession: null, bossSchedule: null, pendingRecords: [], confirmedRecords: [], notCheckedInMembers: [] };
    }

    const view = await buildSessionAttendanceView(guildId, activeSession);
    return { activeSession, ...view };
  });
}

// Recent attendance sessions for a guild (most recent first), each with a
// present/pending tally — powers the "Past Attendance" browser so an officer
// can pick a closed/expired window to inspect or reopen. Only the default
// `limit` is cached (a non-default limit would return the wrong page count
// for anyone hitting the same key with `limit`'s default) — every caller in
// this codebase uses the default today.
export async function listAttendanceSessions(guildId: string, actorId: string, limit = 30) {
  await assertAttendanceOfficer(guildId, actorId, "view past attendance");

  if (limit !== 30) {
    return listAttendanceSessionsUncached(guildId, limit);
  }
  return redisCache.getOrSet(cacheKeys.attendSessions(guildId), cacheTtl.attendSessions, () =>
    listAttendanceSessionsUncached(guildId, limit),
  );
}

async function listAttendanceSessionsUncached(guildId: string, limit: number) {
  const sessions = await prisma.attendanceSession.findMany({
    where: { guildId },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      bossSchedule: {
        select: { bossName: true, bossImageUrl: true, location: true, spawnTime: true },
      },
      records: { select: { status: true } },
    },
  });

  return sessions.map((session) => ({
    id: session.id,
    title: session.title,
    type: session.type,
    isActive: session.isActive && session.expiresAt.getTime() > Date.now(),
    expiresAt: session.expiresAt.toISOString(),
    createdAt: session.createdAt.toISOString(),
    bossScheduleId: session.bossScheduleId,
    bossSchedule: session.bossSchedule
      ? {
          bossName: session.bossSchedule.bossName,
          bossImageUrl: session.bossSchedule.bossImageUrl,
          location: session.bossSchedule.location,
          spawnTime: session.bossSchedule.spawnTime.toISOString(),
        }
      : null,
    confirmedCount: session.records.filter((r) => r.status === AttendanceRecordStatus.CONFIRMED).length,
    pendingCount: session.records.filter((r) => r.status === AttendanceRecordStatus.PENDING).length,
  }));
}

// Full checked-in/not-checked-in breakdown for one arbitrary session (active
// or long closed) — same shape as getGuildPendingAttendance so the officer UI
// can reuse the same panel for "live queue" and "past attendance" detail.
export async function getAttendanceSessionDetail(guildId: string, sessionId: string, actorId: string) {
  await assertAttendanceOfficer(guildId, actorId, "view attendance session details");

  return redisCache.getOrSet(cacheKeys.attendSessionDetail(guildId, sessionId), cacheTtl.attendSessionDetail, async () => {
    const session = await prisma.attendanceSession.findUnique({ where: { id: sessionId } });
    if (!session || session.guildId !== guildId) {
      throw new NotFoundError("Attendance session not found");
    }

    const view = await buildSessionAttendanceView(guildId, session);
    return { activeSession: session, ...view };
  });
}

// Safely reopen a past (closed/expired) session for further self-check-ins.
// Unlike a bare updateAttendanceSession({isActive:true}) call, this also
// deactivates any other currently-active session first, preserving the
// single-active-session invariant the rest of the attendance system assumes.
export async function reopenAttendanceSession(
  guildId: string,
  sessionId: string,
  actorId: string,
  minutes: number,
  ipAddress?: string,
  userAgent?: string,
) {
  await assertAttendanceOfficer(guildId, actorId, "reopen attendance sessions");

  const session = await prisma.attendanceSession.findUnique({ where: { id: sessionId } });
  if (!session || session.guildId !== guildId) {
    throw new NotFoundError("Attendance session not found");
  }

  const expiresAt = new Date(Date.now() + minutes * 60 * 1000);

  const [, reopenedSession] = await prisma.$transaction([
    prisma.attendanceSession.updateMany({
      where: { guildId, isActive: true, id: { not: sessionId } },
      data: { isActive: false },
    }),
    prisma.attendanceSession.update({
      where: { id: sessionId },
      data: { isActive: true, expiresAt },
    }),
  ]);

  await writeAuditLog({
    actorId,
    guildId,
    action: "ATTENDANCE_SESSION_REOPENED",
    target: "AttendanceSession",
    targetId: sessionId,
    detail: { title: session.title, minutes },
    ipAddress,
    userAgent,
  });

  await invalidateAttendanceCache(guildId, sessionId);
  return reopenedSession;
}

// Officer retroactively confirms a member present on ANY session (past or
// active) — creates the record if the member never checked in themselves, or
// promotes an existing PENDING record straight to CONFIRMED. Mirrors
// confirmAttendanceRecord's point-crediting so past-attendance corrections
// pay out the same as a normal verification.
export async function markMemberPresent(
  guildId: string,
  sessionId: string,
  userId: string,
  actorId: string,
  ipAddress?: string,
  userAgent?: string,
) {
  await assertAttendanceOfficer(guildId, actorId, "manually record attendance");

  const session = await prisma.attendanceSession.findUnique({ where: { id: sessionId } });
  if (!session || session.guildId !== guildId) {
    throw new NotFoundError("Attendance session not found");
  }

  const member = await getGuildMemberByUser(userId, guildId);
  if (!member || !member.isActive) {
    throw new BadRequestError("That member is not an active member of this guild");
  }

  const existing = await prisma.attendanceRecord.findUnique({
    where: { userId_sessionId: { userId, sessionId } },
  });
  if (existing && existing.status === AttendanceRecordStatus.CONFIRMED) {
    throw new BadRequestError("This member is already confirmed present");
  }

  const settings = await prisma.guildSettings.findUnique({ where: { guildId } });
  const attendancePoints = settings?.attendancePoints || 10;
  const currencyCode = settings?.currencyCode || "PHP";

  const result = await prisma.$transaction(async (tx) => {
    const record = existing
      ? await tx.attendanceRecord.update({
          where: { id: existing.id },
          data: { status: AttendanceRecordStatus.CONFIRMED },
        })
      : await tx.attendanceRecord.create({
          data: { sessionId, userId, status: AttendanceRecordStatus.CONFIRMED },
        });

    const ledger = await createLedgerEntry({
      guildId,
      accountType: "MEMBER",
      accountId: userId,
      currency: currencyCode,
      amount: BigInt(attendancePoints),
      entryType: "CREDIT",
      referenceType: "ATTENDANCE",
      referenceId: record.id,
      idempotencyKey: `ATT-${record.id}`,
      actorId,
      description: `Manually marked present in session: ${session.title}`,
    });

    return { record, ledger };
  });

  await writeAuditLog({
    actorId,
    guildId,
    action: "MEMBER_ATTENDANCE_MANUALLY_ADDED",
    target: "AttendanceRecord",
    targetId: result.record.id,
    detail: { userId, sessionId, sessionTitle: session.title, pointsAwarded: attendancePoints },
    ipAddress,
    userAgent,
  });

  await invalidateAttendanceAndFinanceCache(guildId, sessionId);
  return { success: true, record: result.record, points: attendancePoints };
}

// Inverse of confirm/markMemberPresent: removes a member's attendance record
// entirely (for undoing a mis-click or a manual correction), reversing the
// ledger credit first if it had already been confirmed.
export async function revokeMemberAttendance(
  guildId: string,
  recordId: string,
  actorId: string,
  ipAddress?: string,
  userAgent?: string,
) {
  await assertAttendanceOfficer(guildId, actorId, "revoke attendance records");

  const record = await prisma.attendanceRecord.findUnique({
    where: { id: recordId },
    include: {
      user: { select: { displayName: true } },
      session: true,
    },
  });

  if (!record || record.session.guildId !== guildId) {
    throw new NotFoundError("Attendance record not found in this guild");
  }

  const wasConfirmed = record.status === AttendanceRecordStatus.CONFIRMED;

  if (wasConfirmed) {
    const settings = await prisma.guildSettings.findUnique({ where: { guildId } });
    const attendancePoints = settings?.attendancePoints || 10;
    const currencyCode = settings?.currencyCode || "PHP";

    await createLedgerEntry({
      guildId,
      accountType: "MEMBER",
      accountId: record.userId,
      currency: currencyCode,
      amount: BigInt(attendancePoints),
      entryType: "DEBIT",
      referenceType: "ATTENDANCE_REVOKE",
      referenceId: recordId,
      idempotencyKey: `ATT-REVOKE-${recordId}`,
      actorId,
      description: `Reversed attendance credit for session: ${record.session.title}`,
    });
  }

  await prisma.attendanceRecord.delete({ where: { id: recordId } });

  await writeAuditLog({
    actorId,
    guildId,
    action: "MEMBER_ATTENDANCE_REVOKED",
    target: "AttendanceRecord",
    targetId: recordId,
    detail: {
      userId: record.userId,
      displayName: record.user.displayName,
      sessionTitle: record.session.title,
      wasConfirmed,
    },
    ipAddress,
    userAgent,
  });

  await invalidateAttendanceAndFinanceCache(guildId, record.sessionId);
  return { success: true };
}

export async function confirmAttendanceRecord(
  guildId: string,
  recordId: string,
  actorId: string,
  ipAddress?: string,
  userAgent?: string,
) {
  // Validate actor is Guild Leader or Officer
  const actorMembership = await getGuildMemberByUser(actorId, guildId);

  if (!actorMembership || !actorMembership.isActive || !SCHEDULE_CREATOR_ROLES.includes(actorMembership.role as any)) {
    throw new ForbiddenError("Only Guild Leaders and Officers can confirm check-ins");
  }

  const record = await prisma.attendanceRecord.findUnique({
    where: { id: recordId },
    include: {
      user: { select: { displayName: true } },
      session: true,
    },
  });

  if (!record || record.session.guildId !== guildId) {
    throw new NotFoundError("Attendance record not found in this guild");
  }

  if (record.status === AttendanceRecordStatus.CONFIRMED) {
    throw new BadRequestError("This check-in has already been confirmed");
  }

  // Fetch guild settings for point awards
  const settings = await prisma.guildSettings.findUnique({
    where: { guildId },
  });

  const currencyCode = settings?.currencyCode || "PHP";

  // Boss-triggered sessions (openBossCheckInSession always sets bossScheduleId)
  // price attendance off the "BOSS" row in Register Activity — base points ×
  // the confirmed member's rank multiplier — superseding the old flat
  // GuildSettings.bossKillPoints, which is no longer editable in the UI.
  // Manual/general sessions (no bossScheduleId, e.g. createAttendanceSession
  // with a custom title) keep the flat GuildSettings.attendancePoints, since
  // they aren't tied to any specific registered activity.
  let attendancePoints = settings?.attendancePoints || 10;
  if (record.session.bossScheduleId) {
    const [rules, member] = await Promise.all([
      getEffectiveActivityPointRules(guildId),
      getGuildMemberByUser(record.userId, guildId),
    ]);
    const bossActivity = rules.activities.find((a) => a.key === "BOSS");
    if (bossActivity && member) {
      const multiplier = (bossActivity.multipliers as Record<string, number>)[member.role] ?? 1;
      attendancePoints = Math.round(bossActivity.basePoints * multiplier);
    }
  }

  // Use dynamic atomic transaction to check-in and credit points
  const result = await prisma.$transaction(async (tx) => {
    // 1. Mark as confirmed
    const updatedRecord = await tx.attendanceRecord.update({
      where: { id: recordId },
      data: { status: AttendanceRecordStatus.CONFIRMED },
    });

    // 2. Create Ledger Entry for points credit
    // Currency is standard e.g. "PHP", Amount is raw points value (cents units)
    const ledger = await createLedgerEntry({
      guildId,
      accountType: "MEMBER",
      accountId: record.userId,
      currency: currencyCode,
      amount: BigInt(attendancePoints),
      entryType: "CREDIT",
      referenceType: "ATTENDANCE",
      referenceId: recordId,
      idempotencyKey: `ATT-${recordId}`,
      actorId,
      description: `Checked present in session: ${record.session.title}`,
    });

    return { updatedRecord, ledger };
  });

  // Log in Audit trail
  await writeAuditLog({
    actorId,
    guildId,
    action: "MEMBER_ATTENDANCE_CONFIRMED",
    target: "AttendanceRecord",
    targetId: recordId,
    detail: {
      userId: record.userId,
      displayName: record.user.displayName,
      pointsAwarded: attendancePoints,
      sessionTitle: record.session.title,
    },
    ipAddress,
    userAgent,
  });

  await invalidateAttendanceAndFinanceCache(guildId, record.sessionId);
  return { success: true, record: result.updatedRecord, points: attendancePoints };
}

// ─── Boss schedules & Calendar systems ───────────

export async function getBossSchedules(guildId: string, requestingUserId?: string) {
  const factionId = await getGuildFactionId(guildId);
  // Make sure every boss has a live upcoming spawn so countdowns are never empty.
  await ensureUpcomingSpawns(guildId, factionId);

  // Faction-scoped, same reasoning as getBossRotation: this is the same
  // data regardless of which guild in the faction asks, so caching by
  // faction (or `solo:{guildId}` with no faction) means one invalidation
  // instead of a fan-out per guild.
  const scopeKey = factionId ? factionId : `solo:${guildId}`;
  const dedupedSchedules = await redisCache.getOrSet(
    cacheKeys.bossSchedules(scopeKey),
    cacheTtl.bossSchedules,
    () => getBossSchedulesShared(guildId, factionId),
  );

  // attendanceSessions[].records is cached UNFILTERED (every member's
  // records) since it's shared across every viewer in the faction — the
  // "just show me my own record" narrowing a specific caller wants happens
  // here, per-request, against the shared cached data, instead of baking
  // one viewer's filtered view into the cache entry (which would leak: the
  // next viewer without a matching userId would see an empty/wrong slice).
  const scoped = requestingUserId
    ? dedupedSchedules.map((s) => ({
        ...s,
        attendanceSessions: s.attendanceSessions.map((session) => ({
          ...session,
          records: session.records.filter((r) => r.userId === requestingUserId),
        })),
      }))
    : dedupedSchedules;

  return scoped;
}

async function getBossSchedulesShared(guildId: string, factionId: string | null) {
  // Faction-wide view: this guild's own schedules plus every other guild's
  // in the SAME faction (never another faction's rotation state).
  const factionGuilds = factionId ? await getActiveFactionGuilds(factionId) : [];
  const visibleGuildIds = Array.from(new Set([guildId, ...factionGuilds.map((g) => g.id)]));
  const schedules = await prisma.bossSchedule.findMany({
    where: {
      OR: [
        { guildId: { in: visibleGuildIds } },
        { guildId: null },
      ],
    },
    include: {
      guildTurnGuild: {
        select: { id: true, name: true, slug: true, avatarUrl: true },
      },
      attendanceSessions: {
        include: { records: true },
      },
    },
    orderBy: { spawnTime: "asc" },
  });

  // Defensive dedup: legacy rows from before the per-guild seeding fix (or
  // any other write path) can still leave two live rows for the same boss.
  // Keep every KILLED row (real history), but collapse UPCOMING/SPAWNED rows
  // to one per boss name — `schedules` is sorted by spawnTime ascending, so
  // the first (soonest) row encountered wins.
  const seenLive = new Set<string>();
  const dedupedSchedules = schedules.filter((s) => {
    if (s.status === BossEventStatus.KILLED) return true;
    const key = s.bossName.toLowerCase();
    if (seenLive.has(key)) return false;
    seenLive.add(key);
    return true;
  });

  // Fetch users for creator details
  const creatorIds = Array.from(new Set(dedupedSchedules.map((s) => s.creatorId)));
  const users = await prisma.user.findMany({
    where: { id: { in: creatorIds } },
    select: { id: true, displayName: true },
  });
  const userMap = new Map(users.map((u) => [u.id, u.displayName]));

  return dedupedSchedules.map((s) => ({
    id: s.id,
    guildId: s.guildId,
    bossName: s.bossName,
    bossImageUrl: s.bossImageUrl,
    spawnTime: s.spawnTime.toISOString(),
    location: s.location,
    guildTurn: s.guildTurn,
    guildTurnGuildId: s.guildTurnGuildId,
    guildTurnGuildName: s.guildTurnGuild?.name || null,
    status: s.status,
    killedAt: s.killedAt ? s.killedAt.toISOString() : null,
    creatorId: s.creatorId,
    creatorName: userMap.get(s.creatorId) || "System / Officer",
    createdAt: s.createdAt.toISOString(),
    attendanceSessions: s.attendanceSessions.map(session => ({
      id: session.id,
      code: session.code,
      title: session.title,
      type: session.type,
      // Computed at cache-write time, so it can read up to `cacheTtl.bossSchedules`
      // seconds stale once a window crosses its expiresAt — callers needing
      // exact freshness re-derive it from `expiresAt` against their own clock
      // (the client already does, in getUserRecordStatus/getCountdownText).
      isActive: session.isActive && new Date(session.expiresAt).getTime() > Date.now(),
      expiresAt: session.expiresAt.toISOString(),
      records: session.records.map(r => ({
        id: r.id,
        userId: r.userId,
        status: r.status,
        joinedAt: r.joinedAt.toISOString()
      }))
    }))
  }));
}

export async function getBossRotation(guildId: string, actorId: string) {
  // Auth is always checked fresh, cache or no cache — canManage/viewerRole
  // below are derived from it, never from the cached (shared) payload, since
  // they're specific to THIS caller and would otherwise leak another
  // member's role/permission onto whoever's request happens to hit the
  // cache next (see /docs/redis-caching-design.md principle #3).
  const [membership, factionId] = await Promise.all([
    requireActiveGuildMember(actorId, guildId),
    getGuildFactionId(guildId),
  ]);
  const canManage = canMarkBossTaken(membership.role);

  // The rotation queue is faction-shared (or, with no faction, scoped to
  // just this one solo guild — see getActiveFactionGuilds) — caching by that
  // scope instead of by guildId means one `boss_rotation_updated` event
  // invalidates a single key instead of fanning out across every guild in
  // the faction.
  const scopeKey = factionId ? cacheKeys.bossRotationByFaction(factionId) : cacheKeys.bossRotationByFaction(`solo:${guildId}`);

  const shared = await redisCache.getOrSet(scopeKey, cacheTtl.bossRotation, () =>
    getBossRotationShared(factionId, guildId),
  );

  return { ...shared, canManage, viewerRole: membership.role };
}

async function getBossRotationShared(factionId: string | null, guildId: string) {
  const bosses = await getBossRegistryForRotation();
  const guilds = await getActiveFactionGuilds(factionId, guildId);

  const activeGuildIds = guilds.map((g) => g.id);
  const guildMap = new Map(guilds.map((g) => [g.id, g]));

  // Bulk-fetch all rotation, active schedule, and killed schedule data in 3 parallel queries
  // instead of 3 sequential queries per boss (N+1 elimination). Schedules are
  // scoped to this faction's own guilds — `bossName` is not unique across
  // factions, so an unscoped query would show another faction's schedule.
  const bossNames = bosses.map((b) => b.name);
  const [allRotations, allActiveSchedules, allKilledSchedules] = await Promise.all([
    prisma.bossRotation.findMany({
      where: { factionId: factionId ?? "__none__", bossName: { in: bossNames } },
    }),
    prisma.bossSchedule.findMany({
      where: {
        bossName: { in: bossNames },
        guildId: { in: activeGuildIds },
        status: { not: BossEventStatus.KILLED },
      },
      include: { guildTurnGuild: { select: { id: true, name: true, slug: true, avatarUrl: true } } },
      orderBy: { spawnTime: "asc" },
    }),
    prisma.bossSchedule.findMany({
      where: {
        bossName: { in: bossNames },
        guildId: { in: activeGuildIds },
        status: BossEventStatus.KILLED,
      },
      include: { guildTurnGuild: { select: { id: true, name: true, slug: true, avatarUrl: true } } },
      orderBy: { killedAt: "desc" },
    }),
  ]);

  const rotationMap = new Map(allRotations.map((r) => [r.bossName, r]));
  // For active schedules, take the first (earliest spawn) per boss
  const activeScheduleMap = new Map<string, typeof allActiveSchedules[number]>();
  for (const s of allActiveSchedules) {
    if (!activeScheduleMap.has(s.bossName)) {
      activeScheduleMap.set(s.bossName, s);
    }
  }
  // For killed schedules, take the first (latest killed) per boss
  const killedScheduleMap = new Map<string, typeof allKilledSchedules[number]>();
  for (const s of allKilledSchedules) {
    if (!killedScheduleMap.has(s.bossName)) {
      killedScheduleMap.set(s.bossName, s);
    }
  }

  const rotations = [];
  for (const boss of bosses) {
    const existing = rotationMap.get(boss.name) || null;
    const queueGuildIds = resolveQueue(existing, activeGuildIds);
    const currentIndex = queueGuildIds.length
      ? Math.min(existing?.currentIndex || 0, queueGuildIds.length - 1)
      : 0;

    const activeSchedule = activeScheduleMap.get(boss.name) || null;
    const latestKilled = killedScheduleMap.get(boss.name) || null;

    const currentGuildId = queueGuildIds[currentIndex] || null;
    const nextGuildId = queueGuildIds.length
      ? queueGuildIds[(currentIndex + 1) % queueGuildIds.length] || currentGuildId
      : null;
    const currentGuild = currentGuildId ? guildMap.get(currentGuildId) || null : null;
    const nextGuild = nextGuildId ? guildMap.get(nextGuildId) || null : null;
    // A cycle boss with no active schedule, no established rotation cadence,
    // and no prior kill has simply never been taken — it has no real spawn
    // time to show, so it must not be reported as "live now". Fixed-schedule
    // bosses always have a real deterministic spawn regardless of history.
    const everTaken = boss.type === "FIXED_SCHEDULE"
      ? true
      : Boolean(activeSchedule || existing?.nextSpawnTime || latestKilled);
    const spawnTime = boss.type === "FIXED_SCHEDULE"
      ? (activeSchedule?.spawnTime || existing?.nextSpawnTime || getNextBossSpawnTime(boss.name, new Date()))
      : (activeSchedule?.spawnTime ||
         existing?.nextSpawnTime ||
         (latestKilled?.killedAt ? getNextBossSpawnTime(boss.name, latestKilled.killedAt) : null));

    rotations.push({
      id: existing?.id || `predefined:${boss.name}`,
      bossName: boss.name,
      bossImageUrl: getBossImageUrl(boss.name),
      level: boss.level,
      type: boss.type,
      cooldownHours: boss.cooldownHours,
      location: boss.location,
      currentIndex,
      queue: queueGuildIds.map((id) => guildMap.get(id)).filter(Boolean),
      currentGuild,
      nextGuild,
      everTaken,
      spawnTime: spawnTime ? spawnTime.toISOString() : null,
      status: activeSchedule
        ? activeSchedule.status
        : latestKilled
          ? BossEventStatus.KILLED
          : everTaken
            ? BossEventStatus.UPCOMING
            : "NOT_STARTED" as const,
      activeSchedule: activeSchedule ? serializeBossScheduleForApi(activeSchedule) : null,
      latestKilled: latestKilled ? serializeBossScheduleForApi(latestKilled) : null,
    });
  }

  return {
    serverTime: new Date().toISOString(),
    factionId,
    guilds,
    rotations,
  };
}

export async function updateBossRotationQueue(
  guildId: string,
  bossName: string,
  queueGuildIds: string[],
  actorId: string,
  ipAddress?: string,
  userAgent?: string,
) {
  await requireBossRotationManager(actorId, guildId);
  const factionId = await getGuildFactionId(guildId);
  if (!factionId) {
    throw new BadRequestError("This guild is not part of a faction yet");
  }
  const guilds = await getActiveFactionGuilds(factionId);
  const normalizedQueue = normalizeQueue(queueGuildIds, guilds.map((g) => g.id));

  if (normalizedQueue.length === 0) {
    throw new BadRequestError("Rotation queue needs at least one active guild");
  }

  const rotation = await prisma.bossRotation.upsert({
    where: { factionId_bossName: { factionId, bossName } },
    create: {
      factionId,
      bossName,
      queueGuildIds: normalizedQueue,
      currentIndex: 0,
      updatedById: actorId,
    },
    update: {
      queueGuildIds: normalizedQueue,
      currentIndex: 0,
      updatedById: actorId,
    },
  });

  await writeAuditLog({
    actorId,
    guildId,
    action: "BOSS_ROTATION_QUEUE_UPDATED",
    target: "BossRotation",
    targetId: rotation.id,
    detail: { bossName, queueGuildIds: normalizedQueue },
    ipAddress,
    userAgent,
  });

  await invalidateBossRotationCache(guildId);
  return getBossRotation(guildId, actorId);
}

/**
 * Kill-logging path for a guild with no faction. There is no cross-guild
 * queue to maintain — the guild just logs its own kill and records drops
 * (the whole point of this codepath: item registration must not require a
 * faction). Mirrors the faction path's side effects (schedule update,
 * check-in session, next-spawn scheduling, audit log with drops) minus the
 * BossRotation queue row and next-guild notifications, which only make sense
 * across multiple guilds.
 */
async function finishSoloBossKill(params: {
  guildId: string;
  guildName: string;
  bossName: string;
  existingSchedule: { id: string } | null;
  bossImageUrl: string | null;
  location: string;
  killedDate: Date;
  actorId: string;
  storedDrops: StoredBossDrop[];
  ipAddress?: string;
  userAgent?: string;
}) {
  const {
    guildId,
    guildName,
    bossName,
    existingSchedule,
    bossImageUrl,
    location,
    killedDate,
    actorId,
    storedDrops,
    ipAddress,
    userAgent,
  } = params;

  const nextSpawnTime = getNextBossSpawnTime(bossName, killedDate);

  const updatedEvent = existingSchedule
    ? await prisma.bossSchedule.update({
        where: { id: existingSchedule.id },
        data: {
          status: BossEventStatus.KILLED,
          killedAt: killedDate,
          guildTurn: guildName,
          guildTurnGuildId: guildId,
        },
      })
    : await prisma.bossSchedule.create({
        data: {
          guildId,
          bossName,
          bossImageUrl,
          spawnTime: killedDate,
          location,
          status: BossEventStatus.KILLED,
          killedAt: killedDate,
          guildTurn: guildName,
          guildTurnGuildId: guildId,
          creatorId: actorId,
        },
      });

  // Every recorded drop is unconditionally vaulted for this guild —
  // best-effort, never blocks the kill from being logged.
  try {
    await addDropsToStorage(guildId, actorId, bossName, storedDrops);
  } catch (error) {
    console.error("[Boss Rotation]: Failed to auto-vault drops to guild storage", error);
  }

  // Auto-open a code-free check-in window so members can claim attendance
  // for this kill immediately, same as the faction path.
  const checkInSession = await openBossCheckInSession(guildId, updatedEvent.id, bossName);

  const nextSchedule = await syncNextRotationSchedule({
    bossName,
    factionGuildIds: [guildId],
    fallbackGuildId: guildId,
    bossImageUrl,
    location,
    spawnTime: nextSpawnTime,
    nextGuildName: guildName,
    nextGuildId: guildId,
    creatorId: actorId,
  });

  await prisma.auditLog.create({
    data: {
      actorId,
      guildId,
      action: "BOSS_ROTATION_KILLED",
      target: "BossRotation",
      targetId: updatedEvent.id,
      detail: {
        bossName,
        killedAt: killedDate.toISOString(),
        takenGuildId: guildId,
        takenGuildName: guildName,
        nextSpawnTime: nextSpawnTime.toISOString(),
        nextGuildId: guildId,
        nextGuildName: guildName,
        nextScheduleId: nextSchedule?.id ?? null,
        scheduleId: updatedEvent.id,
        checkInSessionId: checkInSession.id,
        drops: storedDrops,
      },
      ipAddress,
      userAgent,
    },
  });

  return {
    schedule: serializeBossScheduleForApi(updatedEvent),
    nextSchedule: nextSchedule ? serializeBossScheduleForApi(nextSchedule) : null,
    rotationId: null as string | null,
    factionId: null as string | null,
  };
}

export async function markBossRotationKilled(
  guildId: string,
  scheduleId: string,
  killedAt: string,
  takenGuildId: string,
  actorId: string,
  ipAddress?: string,
  userAgent?: string,
  drops?: BossDropInput[],
) {
  await requireBossTakenManager(actorId, guildId);
  const killedDate = new Date(killedAt);
  if (Number.isNaN(killedDate.getTime())) {
    throw new BadRequestError("Killed timestamp is invalid");
  }
  const storedDrops = await normalizeBossDrops(drops);

  const [schedule, guild] = await Promise.all([
    prisma.bossSchedule.findUnique({
      where: { id: scheduleId },
    }),
    prisma.guild.findUnique({ where: { id: guildId }, select: { name: true, factionId: true } }),
  ]);

  if (!schedule) {
    throw new NotFoundError("Boss schedule not found");
  }
  if (schedule.status === BossEventStatus.KILLED) {
    throw new BadRequestError("This boss kill has already been logged");
  }

  // No faction — nothing to rotate with. The guild just logs its own kill and
  // drops; no cross-guild queue, notifications, or BossRotation row apply.
  if (!guild?.factionId) {
    if (takenGuildId !== guildId) {
      throw new BadRequestError("This guild has no faction — it can only take its own boss");
    }
    return finishSoloBossKill({
      guildId,
      guildName: guild?.name ?? "Guild",
      bossName: schedule.bossName,
      existingSchedule: schedule,
      bossImageUrl: schedule.bossImageUrl,
      location: schedule.location,
      killedDate,
      actorId,
      storedDrops,
      ipAddress,
      userAgent,
    });
  }

  const factionId = guild.factionId;
  const guilds = await getActiveFactionGuilds(factionId);
  const activeGuildIds = guilds.map((g) => g.id);
  const guildMap = new Map(guilds.map((g) => [g.id, g]));
  const takenGuild = guildMap.get(takenGuildId);

  if (!takenGuild) {
    throw new BadRequestError("Selected taking guild is not active");
  }

  const existingRotation = await prisma.bossRotation.findUnique({
    where: { factionId_bossName: { factionId, bossName: schedule.bossName } },
  });
  const queueGuildIds = resolveQueue(existingRotation, activeGuildIds);
  const takenIndex = queueGuildIds.indexOf(takenGuildId);
  const nextIndex = queueGuildIds.length ? ((takenIndex >= 0 ? takenIndex : 0) + 1) % queueGuildIds.length : 0;
  const nextGuildId = queueGuildIds[nextIndex] || null;
  const nextGuild = nextGuildId ? guildMap.get(nextGuildId) || null : null;
  const nextSpawnTime = getNextBossSpawnTime(schedule.bossName, killedDate);

  // Mark the kill, advance the faction queue, and roll the schedule forward
  // atomically — these three writes must land together or not at all, since a
  // partial failure here would either leave the boss KILLED with the queue
  // never advanced, or vice versa, corrupting whose turn it is faction-wide.
  const { updatedEvent, rotation, nextSchedule } = await prisma.$transaction(async (tx) => {
    const updatedEvent = await tx.bossSchedule.update({
      where: { id: scheduleId },
      data: {
        status: BossEventStatus.KILLED,
        killedAt: killedDate,
        guildTurn: takenGuild.name,
        guildTurnGuildId: takenGuild.id,
      },
    });

    const rotation = await tx.bossRotation.upsert({
      where: { factionId_bossName: { factionId, bossName: schedule.bossName } },
      create: {
        factionId,
        bossName: schedule.bossName,
        queueGuildIds,
        currentIndex: nextIndex,
        nextSpawnTime,
        updatedById: actorId,
      },
      update: {
        queueGuildIds,
        currentIndex: nextIndex,
        nextSpawnTime,
        updatedById: actorId,
      },
    });

    // Advance the boss's live schedule to its real next spawn (assigning the
    // next guild's turn) so it no longer reads "LIVE" the instant it is taken.
    const nextSchedule = await syncNextRotationSchedule(
      {
        bossName: schedule.bossName,
        factionGuildIds: activeGuildIds,
        fallbackGuildId: schedule.guildId,
        bossImageUrl: schedule.bossImageUrl,
        location: schedule.location,
        spawnTime: nextSpawnTime,
        nextGuildName: nextGuild?.name ?? null,
        nextGuildId,
        creatorId: actorId,
      },
      tx,
    );

    return { updatedEvent, rotation, nextSchedule };
  });

  // Every recorded drop is unconditionally vaulted for the taking guild —
  // best-effort, never blocks the kill from being logged, so it stays outside
  // the transaction above.
  try {
    await addDropsToStorage(takenGuild.id, actorId, schedule.bossName, storedDrops);
  } catch (error) {
    console.error("[Boss Rotation]: Failed to auto-vault drops to guild storage", error);
  }

  // Auto-open a code-free check-in window for the guild that just took this boss,
  // so its members can immediately claim attendance for the kill (feeds the loot
  // dividend split). The session belongs to the taking guild, not the actor's.
  const checkInSession = await openBossCheckInSession(
    takenGuild.id,
    updatedEvent.id,
    schedule.bossName,
  );

  const [leaders, auditLog] = await Promise.all([
    nextGuildId
      ? prisma.guildMember.findMany({
          where: {
            guildId: nextGuildId,
            isActive: true,
            role: { in: ["GUILD_LEADER", "FACTION_LEADER", "ADMIN"] },
          },
          select: { userId: true },
        })
      : Promise.resolve([]),
    prisma.auditLog.create({
      data: {
        actorId,
        guildId,
        action: "BOSS_ROTATION_KILLED",
        target: "BossRotation",
        targetId: rotation.id,
        detail: {
          bossName: schedule.bossName,
          killedAt: killedDate.toISOString(),
          takenGuildId: takenGuild.id,
          takenGuildName: takenGuild.name,
          nextSpawnTime: nextSpawnTime.toISOString(),
          nextGuildId,
          nextGuildName: nextGuild?.name || null,
          nextScheduleId: nextSchedule?.id ?? null,
          scheduleId: updatedEvent.id,
          checkInSessionId: checkInSession.id,
          drops: storedDrops,
        },
        ipAddress,
        userAgent,
      },
    }),
  ]);

  const notifications: PendingNotification[] = [];
  if (nextGuildId) {
    for (const leader of leaders) {
      notifications.push({
        userId: leader.userId,
        type: "BOSS_ROTATION_NOW",
        title: `${nextGuild?.name || "Your guild"}'s rotation turn`,
        body: `${nextGuild?.name || "Your guild"} is now up for ${schedule.bossName}.`,
        metadata: {
          bossName: schedule.bossName,
          takenGuildId: takenGuild.id,
          takenGuildName: takenGuild.name,
          guildId: nextGuildId,
          scheduleId: null,
          spawnTime: nextSpawnTime.toISOString(),
        },
      });
    }
  }

  if (notifications.length > 0) {
    await Promise.all(
      notifications.map(async (payload) => {
        try {
          const notification = await prisma.notification.create({
            data: {
              userId: payload.userId,
              type: payload.type,
              title: payload.title,
              body: payload.body,
              metadata: payload.metadata as any,
            },
          });

          void broadcastToUser(notification.userId, "notification_created", {
            id: notification.id,
            userId: notification.userId,
            type: notification.type,
            title: notification.title,
            body: notification.body,
            metadata: notification.metadata,
            readAt: null,
            createdAt: notification.createdAt.toISOString(),
          });
        } catch (error) {
          console.error("[Boss Rotation]: Failed to create notification after rotation update", error);
        }
      })
    );
  }

  await invalidateBossRotationCache(guildId);
  await redisCache.del(cacheKeys.bossKilledHistory(guildId, parseBossHistoryMonth().key));

  return {
    schedule: serializeBossScheduleForApi(updatedEvent),
    nextSchedule: nextSchedule ? serializeBossScheduleForApi(nextSchedule) : null,
    rotationId: rotation.id,
    factionId,
  };
}

export async function markBossRotationKilledByName(
  guildId: string,
  bossName: string,
  killedAt: string,
  takenGuildId: string,
  actorId: string,
  ipAddress?: string,
  userAgent?: string,
  drops?: BossDropInput[],
) {
  await requireBossTakenManager(actorId, guildId);
  const killedDate = new Date(killedAt);
  if (Number.isNaN(killedDate.getTime())) {
    throw new BadRequestError("Killed timestamp is invalid");
  }
  const storedDrops = await normalizeBossDrops(drops);
  const guild = await prisma.guild.findUnique({ where: { id: guildId }, select: { name: true, factionId: true } });
  const factionId = guild?.factionId ?? null;
  const guilds = await getActiveFactionGuilds(factionId, guildId);
  const factionGuildIds = guilds.map((g) => g.id);

  // Load registry, active schedule, and existing rotation in parallel
  const [bosses, activeSchedule, existingRotation] = await Promise.all([
    getBossRegistryForRotation(),
    prisma.bossSchedule.findFirst({
      where: {
        bossName: bossName.trim(),
        guildId: { in: factionGuildIds },
        status: { not: BossEventStatus.KILLED },
      },
      orderBy: { spawnTime: "asc" },
    }),
    factionId
      ? prisma.bossRotation.findUnique({
          where: { factionId_bossName: { factionId, bossName: bossName.trim() } },
        })
      : Promise.resolve(null),
  ]);

  const registryBoss = bosses.find((boss) => boss.name.toLowerCase() === bossName.trim().toLowerCase());
  if (!registryBoss) {
    throw new BadRequestError("Boss is not available in the boss registry");
  }

  if (activeSchedule) {
    return markBossRotationKilled(
      guildId,
      activeSchedule.id,
      killedAt,
      takenGuildId,
      actorId,
      ipAddress,
      userAgent,
      drops,
    );
  }

  // No faction and no live schedule yet — first time this (unaffiliated)
  // guild takes this boss. Log the kill for just this guild; no cross-guild
  // queue or BossRotation row applies.
  if (!factionId) {
    if (takenGuildId !== guildId) {
      throw new BadRequestError("This guild has no faction — it can only take its own boss");
    }
    return finishSoloBossKill({
      guildId,
      guildName: guild?.name ?? "Guild",
      bossName: registryBoss.name,
      existingSchedule: null,
      bossImageUrl: getBossImageUrl(registryBoss.name),
      location: registryBoss.location,
      killedDate,
      actorId,
      storedDrops,
      ipAddress,
      userAgent,
    });
  }

  const activeGuildIds = guilds.map((g) => g.id);
  const guildMap = new Map(guilds.map((g) => [g.id, g]));
  const takenGuild = guildMap.get(takenGuildId);

  if (!takenGuild) {
    throw new BadRequestError("Selected taking guild is not active");
  }

  // Every recorded drop is unconditionally vaulted for the taking guild —
  // best-effort, never blocks the kill from being logged.
  try {
    await addDropsToStorage(takenGuild.id, actorId, registryBoss.name, storedDrops);
  } catch (error) {
    console.error("[Boss Rotation]: Failed to auto-vault drops to guild storage", error);
  }

  const queueGuildIds = resolveQueue(existingRotation, activeGuildIds);
  const takenIndex = queueGuildIds.indexOf(takenGuildId);
  const nextIndex = queueGuildIds.length ? ((takenIndex >= 0 ? takenIndex : 0) + 1) % queueGuildIds.length : 0;
  const nextGuildId = queueGuildIds[nextIndex] || null;
  const nextGuild = nextGuildId ? guildMap.get(nextGuildId) || null : null;
  const nextSpawnTime = getNextBossSpawnTime(registryBoss.name, killedDate);

  const rotation = await prisma.bossRotation.upsert({
    where: { factionId_bossName: { factionId, bossName: registryBoss.name } },
    create: {
      factionId,
      bossName: registryBoss.name,
      queueGuildIds,
      currentIndex: nextIndex,
      nextSpawnTime,
      updatedById: actorId,
    },
    update: {
      queueGuildIds,
      currentIndex: nextIndex,
      nextSpawnTime,
      updatedById: actorId,
    },
  });

  // Seed the boss's first upcoming schedule at its real next spawn so the freshly
  // established cycle stops reading "LIVE" immediately after being taken.
  const nextSchedule = await syncNextRotationSchedule({
    bossName: registryBoss.name,
    factionGuildIds,
    fallbackGuildId: guildId,
    bossImageUrl: getBossImageUrl(registryBoss.name),
    location: registryBoss.location,
    spawnTime: nextSpawnTime,
    nextGuildName: nextGuild?.name ?? null,
    nextGuildId,
    creatorId: actorId,
  });

  const [leaders, auditLog] = await Promise.all([
    nextGuildId
      ? prisma.guildMember.findMany({
          where: {
            guildId: nextGuildId,
            isActive: true,
            role: { in: ["GUILD_LEADER", "FACTION_LEADER", "ADMIN"] },
          },
          select: { userId: true },
        })
      : Promise.resolve([]),
    prisma.auditLog.create({
      data: {
        actorId,
        guildId,
        action: "BOSS_ROTATION_KILLED",
        target: "BossRotation",
        targetId: rotation.id,
        detail: {
          bossName: registryBoss.name,
          killedAt: killedDate.toISOString(),
          takenGuildId: takenGuild.id,
          takenGuildName: takenGuild.name,
          nextSpawnTime: nextSpawnTime.toISOString(),
          nextGuildId,
          nextGuildName: nextGuild?.name || null,
          nextScheduleId: nextSchedule?.id ?? null,
          scheduleId: null,
          drops: storedDrops,
        },
        ipAddress,
        userAgent,
      },
    }),
  ]);

  const notifications: PendingNotification[] = [];
  if (nextGuildId) {
    for (const leader of leaders) {
      notifications.push({
        userId: leader.userId,
        type: "BOSS_ROTATION_NOW",
        title: `${nextGuild?.name || "Your guild"}'s rotation turn`,
        body: `${nextGuild?.name || "Your guild"} is now up for ${registryBoss.name}.`,
        metadata: {
          bossName: registryBoss.name,
          takenGuildId: takenGuild.id,
          takenGuildName: takenGuild.name,
          guildId: nextGuildId,
          scheduleId: null,
          spawnTime: nextSpawnTime.toISOString(),
        },
      });
    }
  }

  if (notifications.length > 0) {
    await Promise.all(
      notifications.map(async (payload) => {
        try {
          const notification = await prisma.notification.create({
            data: {
              userId: payload.userId,
              type: payload.type,
              title: payload.title,
              body: payload.body,
              metadata: payload.metadata as any,
            },
          });

          void broadcastToUser(notification.userId, "notification_created", {
            id: notification.id,
            userId: notification.userId,
            type: notification.type,
            title: notification.title,
            body: notification.body,
            metadata: notification.metadata,
            readAt: null,
            createdAt: notification.createdAt.toISOString(),
          });
        } catch (error) {
          console.error("[Boss Rotation]: Failed to create notification after rotation update", error);
        }
      })
    );
  }

  await invalidateBossRotationCache(guildId);
  await redisCache.del(cacheKeys.bossKilledHistory(guildId, parseBossHistoryMonth().key));

  return {
    schedule: null,
    nextSchedule: nextSchedule ? serializeBossScheduleForApi(nextSchedule) : null,
    rotationId: rotation.id,
    factionId,
  };
}

// ─── Boss timer resets (Leaders + Officers) ─────────────────────
// Recompute spawn timers in bulk. `resetAllBossTimers` restarts EVERY boss from
// "now" (as if each were just killed at the reset moment). `maintenanceReset`
// restarts only the cycle-based bosses relative to a maintenance-end time, so a
// game maintenance can be reflected without touching fixed-schedule bosses.

async function applyBossTimerReset(
  guildId: string,
  actorId: string,
  bosses: BossRegistryItem[],
  computeSpawn: (boss: BossRegistryItem) => Date,
  auditAction: string,
  auditDetail: Record<string, unknown>,
  ipAddress?: string,
  userAgent?: string,
) {
  const affectedNames = bosses.map((b) => b.name);
  const factionId = await getGuildFactionId(guildId);
  if (!factionId) {
    throw new BadRequestError("This guild is not part of a faction yet");
  }
  const factionGuildIds = (await getActiveFactionGuilds(factionId)).map((g) => g.id);

  // Recompute per-boss next spawn, then persist both the rotation pointer and any
  // live (non-killed) schedule rows so the rotation cards + overview agree.
  for (const boss of bosses) {
    const nextSpawn = computeSpawn(boss);

    await prisma.bossRotation.upsert({
      where: { factionId_bossName: { factionId, bossName: boss.name } },
      create: {
        factionId,
        bossName: boss.name,
        queueGuildIds: [],
        currentIndex: 0,
        nextSpawnTime: nextSpawn,
        updatedById: actorId,
      },
      update: {
        nextSpawnTime: nextSpawn,
        updatedById: actorId,
      },
    });

    await prisma.bossSchedule.updateMany({
      where: { bossName: boss.name, guildId: { in: factionGuildIds }, status: { not: BossEventStatus.KILLED } },
      data: { spawnTime: nextSpawn, status: BossEventStatus.UPCOMING },
    });
  }

  await writeAuditLog({
    actorId,
    guildId,
    action: auditAction,
    target: "BossRotation",
    targetId: guildId,
    detail: { ...auditDetail, affectedCount: affectedNames.length, affectedBosses: affectedNames },
    ipAddress,
    userAgent,
  });

  await invalidateBossRotationCache(guildId);
  return getBossRotation(guildId, actorId);
}

export async function resetAllBossTimers(
  guildId: string,
  actorId: string,
  ipAddress?: string,
  userAgent?: string,
) {
  await requireBossRotationResetManager(actorId, guildId);
  const bosses = await getBossRegistryForRotation();
  const now = new Date();
  return applyBossTimerReset(
    guildId,
    actorId,
    bosses,
    (boss) => getNextBossSpawnTime(boss.name, now),
    "BOSS_TIMERS_RESET",
    { resetAt: now.toISOString() },
    ipAddress,
    userAgent,
  );
}

export async function maintenanceResetBossTimers(
  guildId: string,
  actorId: string,
  maintenanceEndTime: string,
  ipAddress?: string,
  userAgent?: string,
) {
  await requireBossRotationResetManager(actorId, guildId);
  const endDate = new Date(maintenanceEndTime);
  if (Number.isNaN(endDate.getTime())) {
    throw new BadRequestError("Maintenance end time is invalid");
  }
  const bosses = (await getBossRegistryForRotation()).filter(
    (boss) => boss.type !== "FIXED_SCHEDULE",
  );
  return applyBossTimerReset(
    guildId,
    actorId,
    bosses,
    // getNextBossSpawnTime advances a cycle boss by its cooldown from the given
    // instant, so passing the maintenance-end time yields "end + cooldown".
    (boss) => getNextBossSpawnTime(boss.name, endDate),
    "BOSS_MAINTENANCE_RESET",
    { maintenanceEndTime: endDate.toISOString() },
    ipAddress,
    userAgent,
  );
}

// ─── Boss Master List (faction-leader owned) ───────────────────
// Defines which guilds are scheduled to take each boss. Guilds omitted from a
// boss's list simply don't rotate on it (e.g. low-boss-only guilds). Everyone in
// the faction can read the list; only Faction Leaders / Admins can edit it.

export async function getBossMasterList(guildId: string, actorId: string) {
  const [membership, factionId, bosses] = await Promise.all([
    requireActiveGuildMember(actorId, guildId),
    getGuildFactionId(guildId),
    getBossRegistryForRotation(),
  ]);
  const [guilds, rotations] = await Promise.all([
    getActiveFactionGuilds(factionId, guildId),
    factionId ? prisma.bossRotation.findMany({ where: { factionId } }) : Promise.resolve([]),
  ]);

  const activeGuildIds = guilds.map((g) => g.id);
  const rotationMap = new Map(rotations.map((r) => [r.bossName.toLowerCase(), r]));

  const bossEntries = bosses.map((boss) => {
    const rotation = rotationMap.get(boss.name.toLowerCase()) || null;
    return {
      bossName: boss.name,
      level: boss.level,
      type: boss.type,
      location: boss.location,
      cooldownHours: boss.cooldownHours ?? null,
      // A boss is "configured" once a faction leader has saved its participant
      // list; until then it defaults to every active guild.
      configured: Boolean(rotation?.participantsConfigured),
      participantGuildIds: resolveQueue(rotation, activeGuildIds),
    };
  });

  return {
    canManage: isFactionLevelRole(membership.role),
    viewerRole: membership.role,
    factionId,
    guilds,
    bosses: bossEntries,
  };
}

export async function updateBossMasterList(
  guildId: string,
  actorId: string,
  entries: Array<{ bossName: string; participantGuildIds: string[] }>,
  ipAddress?: string,
  userAgent?: string,
) {
  await requireFactionLeader(actorId, guildId);
  const factionId = await getGuildFactionId(guildId);
  if (!factionId) {
    throw new BadRequestError("This guild is not part of a faction yet");
  }

  if (!Array.isArray(entries) || entries.length === 0) {
    throw new BadRequestError("No master list changes provided");
  }

  const [guilds, bosses] = await Promise.all([
    getActiveFactionGuilds(factionId),
    getBossRegistryForRotation(),
  ]);
  const activeGuildIds = new Set(guilds.map((g) => g.id));
  const bossByName = new Map(bosses.map((b) => [b.name.toLowerCase(), b]));

  const normalizedEntries = entries.map((entry) => {
    const boss = bossByName.get(entry.bossName?.trim().toLowerCase());
    if (!boss) {
      throw new BadRequestError(`Unknown boss: ${entry.bossName}`);
    }
    const ids = Array.isArray(entry.participantGuildIds) ? entry.participantGuildIds : [];
    // Keep only active guilds, de-duped, in the given order.
    const seen = new Set<string>();
    const participantGuildIds = ids.filter((id) => {
      if (typeof id !== "string" || !activeGuildIds.has(id) || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
    return { bossName: boss.name, participantGuildIds };
  });

  const existing = await prisma.bossRotation.findMany({
    where: { factionId, bossName: { in: normalizedEntries.map((e) => e.bossName) } },
  });
  const existingMap = new Map(existing.map((r) => [r.bossName, r]));

  await prisma.$transaction(
    normalizedEntries.map((entry) => {
      const prev = existingMap.get(entry.bossName);
      // Preserve whose turn it is where possible; clamp if the list shrank.
      const clampedIndex = entry.participantGuildIds.length
        ? Math.min(prev?.currentIndex ?? 0, entry.participantGuildIds.length - 1)
        : 0;
      return prisma.bossRotation.upsert({
        where: { factionId_bossName: { factionId, bossName: entry.bossName } },
        create: {
          factionId,
          bossName: entry.bossName,
          queueGuildIds: entry.participantGuildIds,
          currentIndex: 0,
          participantsConfigured: true,
          updatedById: actorId,
        },
        update: {
          queueGuildIds: entry.participantGuildIds,
          currentIndex: clampedIndex,
          participantsConfigured: true,
          updatedById: actorId,
        },
      });
    }),
  );

  await writeAuditLog({
    actorId,
    guildId,
    action: "BOSS_ROTATION_MASTER_LIST_UPDATED",
    target: "BossRotation",
    targetId: guildId,
    detail: {
      updatedBosses: normalizedEntries.map((e) => ({
        bossName: e.bossName,
        participantCount: e.participantGuildIds.length,
      })),
    },
    ipAddress,
    userAgent,
  });

  return getBossMasterList(guildId, actorId);
}

// ─── Low-boss day rotation (faction-leader owned) ──────────────
// A single-row config: whichever guild is assigned to a day takes ALL flagged
// "low" bosses that day. Supports a repeating WEEKLY pattern (weekday → guild)
// and a MONTHLY calendar (date → guild).

const LOW_ROTATION_MODES = ["WEEKLY", "MONTHLY"] as const;

function parseStringMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

function parseStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

export async function getLowBossRotation(guildId: string, actorId: string) {
  const [membership, factionId, bosses] = await Promise.all([
    requireActiveGuildMember(actorId, guildId),
    getGuildFactionId(guildId),
    getBossRegistryForRotation(),
  ]);
  const [guilds, config] = await Promise.all([
    getActiveFactionGuilds(factionId, guildId),
    factionId ? prisma.bossLowRotation.findUnique({ where: { factionId } }) : Promise.resolve(null),
  ]);

  const activeIds = new Set(guilds.map((g) => g.id));

  // Drop assignments to guilds that are no longer active.
  const cleanWeekly: Record<string, string> = {};
  for (const [k, v] of Object.entries(parseStringMap(config?.weekly))) {
    if (activeIds.has(v)) cleanWeekly[k] = v;
  }
  const cleanDays: Record<string, string> = {};
  for (const [k, v] of Object.entries(parseStringMap(config?.days))) {
    if (activeIds.has(v)) cleanDays[k] = v;
  }

  const bossNameSet = new Set(bosses.map((b) => b.name.toLowerCase()));
  const lowBossNames = parseStringArray(config?.lowBossNames).filter((n) => bossNameSet.has(n.toLowerCase()));

  return {
    canManage: isFactionLevelRole(membership.role),
    viewerRole: membership.role,
    factionId,
    mode: config?.mode === "WEEKLY" ? "WEEKLY" : "MONTHLY",
    lowBossNames,
    weekly: cleanWeekly,
    days: cleanDays,
    guilds,
    bosses: bosses.map((b) => ({ bossName: b.name, level: b.level, type: b.type, location: b.location })),
  };
}

export async function updateLowBossRotation(
  guildId: string,
  actorId: string,
  payload: {
    mode?: string;
    lowBossNames?: string[];
    weekly?: Record<string, string>;
    daysPatch?: Record<string, string | null>;
  },
  ipAddress?: string,
  userAgent?: string,
) {
  await requireFactionLeader(actorId, guildId);
  const factionId = await getGuildFactionId(guildId);
  if (!factionId) {
    throw new BadRequestError("This guild is not part of a faction yet");
  }

  const [guilds, bosses, existing] = await Promise.all([
    getActiveFactionGuilds(factionId),
    getBossRegistryForRotation(),
    prisma.bossLowRotation.findUnique({ where: { factionId } }),
  ]);
  const activeIds = new Set(guilds.map((g) => g.id));
  const bossByLower = new Map(bosses.map((b) => [b.name.toLowerCase(), b.name]));

  let mode = existing?.mode === "WEEKLY" ? "WEEKLY" : "MONTHLY";
  if (payload.mode !== undefined) {
    if (!LOW_ROTATION_MODES.includes(payload.mode as (typeof LOW_ROTATION_MODES)[number])) {
      throw new BadRequestError("Mode must be WEEKLY or MONTHLY");
    }
    mode = payload.mode;
  }

  let lowBossNames = parseStringArray(existing?.lowBossNames);
  if (payload.lowBossNames !== undefined) {
    const seen = new Set<string>();
    lowBossNames = [];
    for (const n of payload.lowBossNames) {
      const canon = bossByLower.get(String(n).toLowerCase());
      if (canon && !seen.has(canon)) {
        seen.add(canon);
        lowBossNames.push(canon);
      }
    }
  }

  // Weekly is a full replace (only 7 possible keys).
  let weekly = parseStringMap(existing?.weekly);
  if (payload.weekly !== undefined) {
    weekly = {};
    for (const [k, v] of Object.entries(payload.weekly)) {
      const wd = Number(k);
      if (Number.isInteger(wd) && wd >= 0 && wd <= 6 && typeof v === "string" && activeIds.has(v)) {
        weekly[String(wd)] = v;
      }
    }
  }

  // Days is a merge patch: `null` clears a date, a valid guild id sets it.
  const days = parseStringMap(existing?.days);
  if (payload.daysPatch !== undefined) {
    for (const [k, v] of Object.entries(payload.daysPatch)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(k)) continue;
      if (v === null) {
        delete days[k];
      } else if (typeof v === "string" && activeIds.has(v)) {
        days[k] = v;
      }
    }
  }

  await prisma.bossLowRotation.upsert({
    where: { factionId },
    create: { factionId, mode, lowBossNames, weekly, days, updatedById: actorId },
    update: { mode, lowBossNames, weekly, days, updatedById: actorId },
  });

  await writeAuditLog({
    actorId,
    guildId,
    action: "BOSS_LOW_ROTATION_UPDATED",
    target: "BossLowRotation",
    targetId: factionId,
    detail: { mode, lowBossCount: lowBossNames.length, dayCount: Object.keys(days).length },
    ipAddress,
    userAgent,
  });

  return getLowBossRotation(guildId, actorId);
}

export async function getBossKilledHistory(guildId: string, actorId: string, month?: string) {
  await requireActiveGuildMember(actorId, guildId);
  const { key } = parseBossHistoryMonth(month);

  // Not viewer-specific — same history for everyone in the guild. Every
  // month is cacheable, but only the current month is ever actively
  // invalidated (past months are immutable once the month rolls over).
  return redisCache.getOrSet(cacheKeys.bossKilledHistory(guildId, key), cacheTtl.bossKilledHistory, () =>
    getBossKilledHistoryUncached(guildId, month),
  );
}

async function getBossKilledHistoryUncached(guildId: string, month?: string) {
  const { key, start, end } = parseBossHistoryMonth(month);

  const logs = await prisma.auditLog.findMany({
    where: {
      guildId,
      action: { in: BOSS_KILL_AUDIT_ACTIONS },
    },
    include: {
      actor: {
        select: {
          id: true,
          displayName: true,
          avatarUrl: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 1000,
  });

  const days = new Map<string, {
    date: string;
    total: number;
    kills: Array<{
      id: string;
      action: string;
      bossName: string;
      bossImageUrl: string;
      killedAt: string;
      recordedAt: string;
      recordedBy: {
        id: string;
        displayName: string;
        avatarUrl: string | null;
      };
      nextGuildName: string | null;
      nextSpawnTime: string | null;
      bossScheduleId: string | null;
      drops: Array<{
        itemName: string;
        type: string | null;
        category: string | null;
        rarity: string | null;
        iconUrl: string;
        quantity: number;
      }>;
    }>;
  }>();

  for (const log of logs) {
    const detail = log.detail && typeof log.detail === "object" && !Array.isArray(log.detail)
      ? log.detail as Record<string, unknown>
      : null;
    const killedAtValue = getDetailString(detail, "killedAt") || log.createdAt.toISOString();
    const killedDate = new Date(killedAtValue);

    if (Number.isNaN(killedDate.getTime()) || killedDate < start || killedDate >= end) {
      continue;
    }

    const dayKey = killedDate.toISOString().slice(0, 10);
    const existingDay = days.get(dayKey) || { date: dayKey, total: 0, kills: [] };
    const bossName = getDetailString(detail, "bossName") || log.target || "World Boss";
    const rawDrops = detail && Array.isArray(detail["drops"]) ? (detail["drops"] as unknown[]) : [];
    const drops = rawDrops
      .filter((d): d is Record<string, unknown> => !!d && typeof d === "object" && !Array.isArray(d))
      .map((d) => {
        const bucket = typeof d["bucket"] === "string" ? (d["bucket"] as string) : "";
        const path = typeof d["path"] === "string" ? (d["path"] as string) : "";
        return {
          itemName: typeof d["itemName"] === "string" ? (d["itemName"] as string) : "Item",
          type: typeof d["type"] === "string" ? (d["type"] as string) : null,
          category: typeof d["category"] === "string" ? (d["category"] as string) : null,
          rarity: typeof d["rarity"] === "string" ? (d["rarity"] as string) : null,
          iconUrl: bucket && path ? publicUrl(bucket, path) : "",
          quantity: Math.max(1, Math.floor(Number(d["quantity"]) || 1)),
        };
      })
      .filter((d) => d.iconUrl);
    existingDay.total += 1;
    existingDay.kills.push({
      id: log.id,
      action: log.action,
      bossName,
      bossImageUrl: getBossImageUrl(bossName),
      killedAt: killedDate.toISOString(),
      recordedAt: log.createdAt.toISOString(),
      recordedBy: {
        id: log.actor.id,
        displayName: log.actor.displayName,
        avatarUrl: log.actor.avatarUrl,
      },
      nextGuildName: getDetailString(detail, "nextGuildName") || getDetailString(detail, "nextGuildTurn"),
      nextSpawnTime: getDetailString(detail, "nextSpawnTime"),
      bossScheduleId: getDetailString(detail, "scheduleId"),
      drops,
    });
    days.set(dayKey, existingDay);
  }

  const groupedDays = Array.from(days.values())
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((day) => ({
      ...day,
      kills: day.kills.sort((a, b) => new Date(b.killedAt).getTime() - new Date(a.killedAt).getTime()),
    }));

  return {
    month: key,
    total: groupedDays.reduce((sum, day) => sum + day.total, 0),
    days: groupedDays,
  };
}

/**
 * Distinct items a specific boss has been recorded dropping (union across recent
 * kills, deduped by icon). Powers the "Log sold items" loot picker so a guild can
 * only pick items that this boss actually drops.
 */
export async function getBossDropsForBoss(actorId: string, guildId: string, bossName: string) {
  await requireActiveGuildMember(actorId, guildId);
  const target = bossName.trim().toLowerCase();
  if (!target) return { bossName: bossName.trim(), drops: [] as Array<{
    itemName: string; type: string | null; category: string | null; rarity: string | null; iconUrl: string;
  }> };

  const logs = await prisma.auditLog.findMany({
    where: { action: { in: BOSS_KILL_AUDIT_ACTIONS } },
    orderBy: { createdAt: "desc" },
    take: 300,
  });

  const seen = new Set<string>();
  const drops: Array<{ itemName: string; type: string | null; category: string | null; rarity: string | null; iconUrl: string }> = [];

  for (const log of logs) {
    const detail = log.detail && typeof log.detail === "object" && !Array.isArray(log.detail)
      ? (log.detail as Record<string, unknown>)
      : null;
    if (!detail) continue;
    if (String(detail["bossName"] || "").toLowerCase() !== target) continue;
    const raw = Array.isArray(detail["drops"]) ? (detail["drops"] as unknown[]) : [];
    for (const d of raw) {
      if (!d || typeof d !== "object" || Array.isArray(d)) continue;
      const row = d as Record<string, unknown>;
      const bucket = typeof row["bucket"] === "string" ? (row["bucket"] as string) : "";
      const path = typeof row["path"] === "string" ? (row["path"] as string) : "";
      if (!bucket || !path) continue;
      const key = `${bucket}::${path}`;
      if (seen.has(key)) continue;
      seen.add(key);
      drops.push({
        itemName: typeof row["itemName"] === "string" ? (row["itemName"] as string) : "Item",
        type: typeof row["type"] === "string" ? (row["type"] as string) : null,
        category: typeof row["category"] === "string" ? (row["category"] as string) : null,
        rarity: typeof row["rarity"] === "string" ? (row["rarity"] as string) : null,
        iconUrl: publicUrl(bucket, path),
      });
    }
  }

  drops.sort((a, b) => a.itemName.localeCompare(b.itemName));
  return { bossName: bossName.trim(), drops };
}

export async function createBossSchedule(
  guildId: string | null,
  payload: {
    bossName: string;
    bossImageUrl?: string;
    spawnTime: string;
    location: string;
    guildTurn?: string;
    guildTurnGuildId?: string | null;
  },
  actorId: string,
  ipAddress?: string,
  userAgent?: string,
) {
  // If guildId is provided, check actor's role. Faction (null) events require standard verification too.
  // We can let any guild leader/officer of any tenant create faction events, or just check their active guild
  const checkGuildId = guildId || (await prisma.guildMember.findFirst({ where: { userId: actorId, isActive: true } }))?.guildId;

  if (!checkGuildId) {
    throw new ForbiddenError("You must belong to a guild to create schedules");
  }

  const actorMembership = await getGuildMemberByUser(actorId, checkGuildId);

  if (!actorMembership || !actorMembership.isActive || !SCHEDULE_CREATOR_ROLES.includes(actorMembership.role as any)) {
    throw new ForbiddenError("Only Guild Leaders and Officers can schedule boss events");
  }

  const event = await prisma.bossSchedule.create({
    data: {
      guildId, // Null represents Faction calendar event
      bossName: payload.bossName,
      bossImageUrl: payload.bossImageUrl || null,
      spawnTime: new Date(payload.spawnTime),
      location: payload.location,
      guildTurn: payload.guildTurn || null,
      guildTurnGuildId: payload.guildTurnGuildId || null,
      status: BossEventStatus.UPCOMING,
      creatorId: actorId,
    },
  });

  await writeAuditLog({
    actorId,
    guildId: checkGuildId,
    action: "BOSS_EVENT_SCHEDULED",
    target: "BossSchedule",
    targetId: event.id,
    detail: { bossName: payload.bossName, spawnTime: payload.spawnTime, isFactionWide: !guildId },
    ipAddress,
    userAgent,
  });

  await invalidateBossRotationCache(checkGuildId);
  return event;
}

export async function logBossKill(
  guildId: string,
  scheduleId: string,
  killedAt: string,
  actorId: string,
  lootDrop?: string,
  screenshotUrl?: string,
  ipAddress?: string,
  userAgent?: string,
) {
  // Validate actor is Guild Leader or Officer
  const actorMembership = await getGuildMemberByUser(actorId, guildId);

  if (!actorMembership || !actorMembership.isActive || !SCHEDULE_CREATOR_ROLES.includes(actorMembership.role as any)) {
    throw new ForbiddenError("Only Guild Leaders and Officers can log boss kills");
  }

  const schedule = await prisma.bossSchedule.findUnique({
    where: { id: scheduleId },
  });

  if (!schedule) {
    throw new NotFoundError("Boss schedule not found");
  }

  if (schedule.status === BossEventStatus.KILLED) {
    throw new BadRequestError("This boss kill has already been logged");
  }

  // Faction (null) events or guild-specific events can be logged
  if (schedule.guildId && schedule.guildId !== guildId) {
    throw new ForbiddenError("You cannot edit another guild's schedule");
  }

  // Roll the timer forward: create the next upcoming spawn so the countdown
  // continues automatically (Singapore-time aware via getNextBossSpawnTime).
  const killDate = new Date(killedAt);
  const nextSpawnTime = getNextBossSpawnTime(schedule.bossName, killDate);

  // Mark the kill and create the next spawn atomically — a failure between
  // the two would leave a boss "killed" with no upcoming countdown row.
  const [updatedEvent, nextSchedule] = await prisma.$transaction([
    prisma.bossSchedule.update({
      where: { id: scheduleId },
      data: {
        status: BossEventStatus.KILLED,
        killedAt: killDate,
        lootDrop,
        screenshotUrl,
      },
    }),
    prisma.bossSchedule.create({
      data: {
        guildId: schedule.guildId,
        bossName: schedule.bossName,
        bossImageUrl: schedule.bossImageUrl,
        spawnTime: nextSpawnTime,
        location: schedule.location,
        guildTurn: schedule.guildTurn,
        guildTurnGuildId: schedule.guildTurnGuildId,
        status: BossEventStatus.UPCOMING,
        creatorId: actorId,
      },
    }),
  ]);

  // Open the code-free check-in window for the boss that was just killed.
  // Faction-wide (null guild) kills attribute the session to the actor's guild.
  const checkInSession = await openBossCheckInSession(guildId, scheduleId, schedule.bossName);

  await writeAuditLog({
    actorId,
    guildId,
    action: "BOSS_KILLED_LOGGED",
    target: "BossSchedule",
    targetId: scheduleId,
    detail: {
      bossName: schedule.bossName,
      killedAt,
      nextSpawnTime: nextSpawnTime.toISOString(),
      nextScheduleId: nextSchedule.id,
      checkInSessionId: checkInSession.id,
      lootDrop,
      screenshotUrl
    },
    ipAddress,
    userAgent,
  });

  await invalidateBossRotationCache(guildId);
  await redisCache.del(cacheKeys.bossKilledHistory(guildId, parseBossHistoryMonth().key));

  return { updatedEvent, nextSchedule, checkInSession };
}

export async function updateBossSchedule(
  guildId: string,
  scheduleId: string,
  payload: {
    bossName?: string;
    bossImageUrl?: string;
    spawnTime?: string;
    location?: string;
    guildTurn?: string;
    guildTurnGuildId?: string | null;
    isFaction?: boolean;
  },
  actorId: string,
  ipAddress?: string,
  userAgent?: string,
) {
  // Validate actor is Guild Leader or Officer
  const actorMembership = await getGuildMemberByUser(actorId, guildId);

  if (!actorMembership || !actorMembership.isActive || (actorMembership.role !== "GUILD_LEADER" && actorMembership.role !== "OFFICER" && actorMembership.role !== "FACTION_LEADER" && actorMembership.role !== "ADMIN")) {
    throw new ForbiddenError("Only Guild Leaders and Officers can edit schedules");
  }

  const schedule = await prisma.bossSchedule.findUnique({
    where: { id: scheduleId },
  });

  if (!schedule) {
    throw new NotFoundError("Boss schedule not found");
  }

  // Faction (null) events or guild-specific events can be edited
  if (schedule.guildId && schedule.guildId !== guildId) {
    throw new ForbiddenError("You cannot edit another guild's schedule");
  }

  // Faction Leader check for guildTurn
  const isFactionLeader = actorMembership.role === "FACTION_LEADER" || actorMembership.role === "ADMIN";
  let resolvedGuildTurn = payload.guildTurn;
  if (!isFactionLeader) {
    // If not faction leader, do not allow changing or adding guild turn
    resolvedGuildTurn = schedule.guildTurn || undefined;
  }

  const updatedEvent = await prisma.bossSchedule.update({
    where: { id: scheduleId },
    data: {
      bossName: payload.bossName,
      bossImageUrl: payload.bossImageUrl,
      spawnTime: payload.spawnTime ? new Date(payload.spawnTime) : undefined,
      location: payload.location,
      guildTurn: isFactionLeader ? payload.guildTurn : resolvedGuildTurn,
      guildTurnGuildId: isFactionLeader ? payload.guildTurnGuildId : undefined,
      guildId: payload.isFaction ? null : (payload.isFaction === false ? guildId : undefined),
    },
  });

  await writeAuditLog({
    actorId,
    guildId,
    action: "BOSS_EVENT_UPDATED",
    target: "BossSchedule",
    targetId: scheduleId,
    detail: { ...payload },
    ipAddress,
    userAgent,
  });

  await invalidateBossRotationCache(guildId);
  return updatedEvent;
}

export async function deleteBossSchedule(
  guildId: string,
  scheduleId: string,
  actorId: string,
  ipAddress?: string,
  userAgent?: string,
) {
  // Validate actor is Guild Leader or Officer
  const actorMembership = await getGuildMemberByUser(actorId, guildId);

  if (!actorMembership || !actorMembership.isActive || (actorMembership.role !== "GUILD_LEADER" && actorMembership.role !== "OFFICER" && actorMembership.role !== "FACTION_LEADER" && actorMembership.role !== "ADMIN")) {
    throw new ForbiddenError("Only Guild Leaders and Officers can delete schedules");
  }

  const schedule = await prisma.bossSchedule.findUnique({
    where: { id: scheduleId },
  });

  if (!schedule) {
    throw new NotFoundError("Boss schedule not found");
  }

  if (schedule.guildId && schedule.guildId !== guildId) {
    throw new ForbiddenError("You cannot delete another guild's schedule");
  }

  await prisma.bossSchedule.delete({
    where: { id: scheduleId },
  });

  await writeAuditLog({
    actorId,
    guildId,
    action: "BOSS_EVENT_DELETED",
    target: "BossSchedule",
    targetId: scheduleId,
    detail: { bossName: schedule.bossName },
    ipAddress,
    userAgent,
  });

  await invalidateBossRotationCache(guildId);
  return { success: true };
}

export async function updateAttendanceSession(
  guildId: string,
  sessionId: string,
  payload: {
    title?: string;
    expiresAt?: string;
    isActive?: boolean;
  },
  actorId: string,
  ipAddress?: string,
  userAgent?: string,
) {
  const actorMembership = await getGuildMemberByUser(actorId, guildId);

  if (!actorMembership || !actorMembership.isActive || (actorMembership.role !== "GUILD_LEADER" && actorMembership.role !== "OFFICER" && actorMembership.role !== "FACTION_LEADER" && actorMembership.role !== "ADMIN")) {
    throw new ForbiddenError("Only Guild Leaders and Officers can edit attendance sessions");
  }

  const session = await prisma.attendanceSession.findUnique({
    where: { id: sessionId },
  });

  if (!session || session.guildId !== guildId) {
    throw new NotFoundError("Attendance session not found");
  }

  const updatedSession = await prisma.attendanceSession.update({
    where: { id: sessionId },
    data: {
      title: payload.title,
      expiresAt: payload.expiresAt ? new Date(payload.expiresAt) : undefined,
      isActive: payload.isActive,
    },
  });

  await writeAuditLog({
    actorId,
    guildId,
    action: "ATTENDANCE_SESSION_UPDATED",
    target: "AttendanceSession",
    targetId: sessionId,
    detail: { ...payload },
    ipAddress,
    userAgent,
  });

  await invalidateAttendanceCache(guildId, sessionId);
  return updatedSession;
}

export async function deleteAttendanceSession(
  guildId: string,
  sessionId: string,
  actorId: string,
  ipAddress?: string,
  userAgent?: string,
) {
  const actorMembership = await getGuildMemberByUser(actorId, guildId);

  if (!actorMembership || !actorMembership.isActive || (actorMembership.role !== "GUILD_LEADER" && actorMembership.role !== "OFFICER" && actorMembership.role !== "FACTION_LEADER" && actorMembership.role !== "ADMIN")) {
    throw new ForbiddenError("Only Guild Leaders and Officers can delete attendance sessions");
  }

  const session = await prisma.attendanceSession.findUnique({
    where: { id: sessionId },
  });

  if (!session || session.guildId !== guildId) {
    throw new NotFoundError("Attendance session not found");
  }

  await prisma.attendanceSession.delete({
    where: { id: sessionId },
  });

  await writeAuditLog({
    actorId,
    guildId,
    action: "ATTENDANCE_SESSION_DELETED",
    target: "AttendanceSession",
    targetId: sessionId,
    detail: { title: session.title },
    ipAddress,
    userAgent,
  });

  await invalidateAttendanceCache(guildId, sessionId);
  return { success: true };
}

export async function getBosses() {
  await ensureBossRegistrySeeded();
  return prisma.boss.findMany({
    orderBy: { level: "asc" },
  });
}

export async function getMemberAttendanceStats(guildId: string, userId: string) {
  // Per-user (presenceRate/streak/history are all specific to `userId`) —
  // the key MUST include userId or two members would see each other's
  // cached stats. TTL-only, deliberately no active invalidation: a personal
  // history view being briefly stale is low-stakes, and wiring up an event
  // for every ledger/attendance mutation just for this one key isn't worth
  // the extra commands (see /docs/redis-caching-design.md §6).
  return redisCache.getOrSet(cacheKeys.attendStats(guildId, userId), cacheTtl.attendStats, () =>
    getMemberAttendanceStatsUncached(guildId, userId),
  );
}

async function getMemberAttendanceStatsUncached(guildId: string, userId: string) {
  // Sessions and the ledger points sum are independent reads — run them
  // concurrently instead of one after another.
  const [sessions, ledgerSum] = await Promise.all([
    prisma.attendanceSession.findMany({
      where: { guildId },
      include: {
        records: {
          where: { userId }
        },
        bossSchedule: {
          select: { bossName: true, bossImageUrl: true, location: true, spawnTime: true },
        },
      },
      orderBy: { createdAt: "desc" }
    }),
    // Contribution points from ledger
    prisma.ledgerEntry.aggregate({
      where: {
        guildId,
        accountId: userId,
        accountType: "MEMBER",
        referenceType: "ATTENDANCE"
      },
      _sum: {
        amount: true
      }
    }),
  ]);

  // Streaks (expired sessions chronologically consecutive confirmed)
  let currentStreak = 0;
  for (const session of sessions) {
    const isExpired = new Date(session.expiresAt).getTime() < Date.now();
    if (!isExpired) {
      const userRecord = session.records[0];
      if (userRecord && userRecord.status === AttendanceRecordStatus.CONFIRMED) {
        currentStreak++;
      }
      continue;
    }
    const userRecord = session.records[0];
    if (userRecord && userRecord.status === AttendanceRecordStatus.CONFIRMED) {
      currentStreak++;
    } else {
      break; // Streak broken
    }
  }

  // Attendance metrics
  const totalSessions = sessions.filter(s => new Date(s.expiresAt).getTime() < Date.now()).length;
  const confirmedSessions = sessions.filter(s => s.records[0]?.status === AttendanceRecordStatus.CONFIRMED).length;
  const presenceRate = totalSessions > 0 ? Math.round((confirmedSessions / totalSessions) * 100) : 100;
  const participationCount = confirmedSessions;
  const totalPoints = Number(ledgerSum._sum.amount || 0);

  // Missed attendance alerts (expired in the last 7 days where the user had no confirmed record)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const missedSessions = sessions.filter(s => {
    const isExpired = new Date(s.expiresAt).getTime() < Date.now();
    const isRecent = new Date(s.createdAt).getTime() > sevenDaysAgo.getTime();
    const hasConfirmedRecord = s.records[0]?.status === AttendanceRecordStatus.CONFIRMED;
    return isExpired && isRecent && !hasConfirmedRecord;
  });

  const missedAlerts = missedSessions.map(s => ({
    sessionId: s.id,
    title: s.title,
    createdAt: s.createdAt.toISOString(),
    expiresAt: s.expiresAt.toISOString()
  }));

  const history = sessions.map(session => {
    const record = session.records[0];
    let status: "CONFIRMED" | "PENDING" | "MISSED" | "UNCHECKED" = "UNCHECKED";
    
    if (record) {
      if (record.status === AttendanceRecordStatus.CONFIRMED) {
        status = "CONFIRMED";
      } else {
        status = "PENDING";
      }
    } else {
      const isExpired = new Date(session.expiresAt).getTime() < Date.now();
      if (isExpired) {
        status = "MISSED";
      } else {
        status = "UNCHECKED";
      }
    }
    
    return {
      sessionId: session.id,
      title: session.title,
      type: session.type,
      createdAt: session.createdAt.toISOString(),
      expiresAt: session.expiresAt.toISOString(),
      status,
      joinedAt: record ? record.joinedAt.toISOString() : null,
      bossName: session.bossSchedule?.bossName ?? null,
      bossImageUrl: session.bossSchedule?.bossImageUrl ?? null,
      location: session.bossSchedule?.location ?? null,
      spawnTime: session.bossSchedule?.spawnTime ? session.bossSchedule.spawnTime.toISOString() : null,
    };
  });

  return {
    presenceRate,
    currentStreak,
    participationCount,
    totalPoints,
    missedAlerts,
    history
  };
}

export async function getDashboardSummary(guildId: string, userId: string) {
  // Verify membership
  const membership = await getGuildMemberByUser(userId, guildId);

  if (!membership || !membership.isActive) {
    throw new ForbiddenError("You must be an active member of this guild to view dashboard stats");
  }

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
  const guildCacheKey = cacheKeys.dashboardStats(guildId);

  // 1 & 2. Guild settings (for currency symbol/code) and guild-wide stats
  // (Redis-cached globally for the guild — see /docs/redis-caching-design.md
  // §1) are independent of each other — fetch/compute them concurrently
  // instead of one after another. Only the guild-wide aggregate is cached;
  // the per-user ledger/balance data below is always computed fresh, since
  // caching it under a guild-scoped key would leak one member's balance to
  // the next member who loads the page within the TTL window.
  const [settings, guildStats] = await Promise.all([
    prisma.guildSettings.findUnique({
      where: { guildId },
    }),
    redisCache.getOrSet(guildCacheKey, cacheTtl.dashboardStats, async () => {
      const [
        activeMembers,
        bossKillsToday,
        totalBossKills,
        guildAudit,
        claims,
      ] = await Promise.all([
        // Fetch active members to count total and online members
        prisma.guildMember.findMany({
          where: { guildId, isActive: true },
          select: {
            userId: true,
            user: {
              select: {
                sessions: {
                  where: {
                    lastActive: { gte: fifteenMinutesAgo },
                  },
                  take: 1,
                  select: {
                    id: true,
                  },
                },
              },
            },
          },
        }),
        // Boss Kills Today count
        prisma.bossSchedule.count({
          where: {
            OR: [
              { guildId },
              { guildId: null },
            ],
            status: BossEventStatus.KILLED,
            killedAt: { gte: startOfToday },
          },
        }),
        // Total Boss Kills count
        prisma.bossSchedule.count({
          where: {
            OR: [
              { guildId },
              { guildId: null },
            ],
            status: BossEventStatus.KILLED,
          },
        }),
        // Guild Audit timeline
        prisma.auditLog.findMany({
          where: { guildId },
          orderBy: { createdAt: "desc" },
          take: 10,
        }),
        // Claims ratio by guild turn
        prisma.bossSchedule.groupBy({
          by: ["guildTurn"],
          where: {
            status: BossEventStatus.KILLED,
            guildTurn: { not: null },
          },
          _count: {
            id: true,
          },
        }),
      ]);

      const totalMembers = activeMembers.length;
      const onlineMembersCount = activeMembers.filter((m) => m.user.sessions.length > 0).length;

      return {
        totalMembers,
        onlineMembersCount,
        bossKillsToday,
        totalBossKills,
        guildAudit,
        claims,
      };
    }),
  ]);

  const currencySymbol = settings?.currencySymbol || "₱";
  const currencyCode = settings?.currencyCode || "PHP";

  // 3. Fetch user-specific metrics in parallel
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const sevenDaysAgoTime = new Date();
  sevenDaysAgoTime.setDate(sevenDaysAgoTime.getDate() - 6);
  sevenDaysAgoTime.setHours(0, 0, 0, 0);

  // We query all CREDIT entries since 7 days ago to calculate weekly counts and chart details in JS
  const [
    ledgerAggregates,
    weeklyCredits,
    memberLedger,
  ] = await Promise.all([
    // Combine overall balances (CREDIT and DEBIT) and total points (ATTENDANCE)
    prisma.ledgerEntry.groupBy({
      by: ["entryType", "referenceType"],
      where: {
        accountType: "MEMBER",
        accountId: userId,
        currency: currencyCode,
        guildId,
      },
      _sum: { amount: true },
    }),
    // Fetch user credits since 7 days ago (superset of both weekly balance credit and chart credit history)
    prisma.ledgerEntry.findMany({
      where: {
        guildId,
        accountId: userId,
        accountType: "MEMBER",
        entryType: "CREDIT",
        createdAt: { gte: sevenDaysAgo },
      },
      select: {
        amount: true,
        referenceType: true,
        createdAt: true,
      },
    }),
    // User ledger timeline
    prisma.ledgerEntry.findMany({
      where: {
        guildId,
        accountId: userId,
        accountType: "MEMBER",
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);

  // Compute balance (credits - debits) and total points in Javascript
  let credits = 0n;
  let debits = 0n;
  for (const row of ledgerAggregates) {
    if (row.entryType === "CREDIT") {
      credits += row._sum.amount ?? 0n;
    } else {
      debits += row._sum.amount ?? 0n;
    }
  }
  const balanceCents = credits - debits;
  const balanceValue = `${currencySymbol} ${(Number(balanceCents) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // Compute total attendance points
  const totalPoints = ledgerAggregates
    .filter((row) => row.referenceType === "ATTENDANCE")
    .reduce((sum, row) => sum + Number(row._sum.amount ?? 0n), 0);
  const guildPointsValue = totalPoints.toLocaleString();

  // Compute weekly stats from weeklyCredits in JS
  const weeklyCredit = weeklyCredits.reduce((sum, entry) => sum + Number(entry.amount), 0) / 100;
  const balanceSub = `+${currencySymbol}${weeklyCredit.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} this week`;

  const weeklyPoints = weeklyCredits
    .filter((entry) => entry.referenceType === "ATTENDANCE")
    .reduce((sum, entry) => sum + Number(entry.amount), 0);
  const guildPointsSub = `+${weeklyPoints.toLocaleString()} this week`;

  const membersValue = guildStats.totalMembers.toString();
  const membersSub = `${guildStats.onlineMembersCount} online`;

  const bossTodayValue = guildStats.bossKillsToday.toString();
  const bossTodaySub = `${guildStats.totalBossKills} this season`;

  const activities: Array<{
    type: "CREDIT" | "DEBIT" | "POINTS" | "INFO" | "CONFIG";
    action: string;
    detail: string;
    createdAt: Date;
  }> = [];

  for (const entry of memberLedger) {
    if (entry.referenceType === "ATTENDANCE") {
      activities.push({
        type: "POINTS",
        action: "Attendance Check-In",
        detail: `Earned +${entry.amount.toString()} points for attendance`,
        createdAt: entry.createdAt,
      });
    } else if (entry.entryType === "CREDIT") {
      const amountFormatted = `${currencySymbol}${(Number(entry.amount) / 100).toFixed(2)}`;
      activities.push({
        type: "CREDIT",
        action: entry.referenceType === "BOSS_KILL" ? "Boss Kill Payout" : "Ledger Credit",
        detail: entry.description || `Received ${amountFormatted} credit payout`,
        createdAt: entry.createdAt,
      });
    } else {
      const amountFormatted = `${currencySymbol}${(Number(entry.amount) / 100).toFixed(2)}`;
      activities.push({
        type: "DEBIT",
        action: entry.referenceType === "PAYOUT" ? "Cash Out" : "Ledger Debit",
        detail: entry.description || `Withdrew ${amountFormatted} from ledger`,
        createdAt: entry.createdAt,
      });
    }
  }

  for (const log of guildStats.guildAudit) {
    if (log.action === "MEMBER_ADDED" || log.action === "GUILD_JOIN_REQUEST_ACCEPTED") {
      const addedMemberName = (log.detail as any)?.displayName || "New member";
      activities.push({
        type: "INFO",
        action: "Member Joined",
        detail: `${addedMemberName} joined the guild`,
        createdAt: log.createdAt,
      });
    } else if (log.action.includes("SETTINGS") || log.action.includes("CONFIG")) {
      activities.push({
        type: "CONFIG",
        action: "Settings Updated",
        detail: "Guild configuration was modified",
        createdAt: log.createdAt,
      });
    } else if (log.action === "BOSS_KILLED_LOGGED" || log.action === "BOSS_KILL_RECORDED") {
      const bossName = (log.detail as any)?.bossName || "World Boss";
      activities.push({
        type: "CREDIT",
        action: "Boss Defeated",
        detail: `${bossName} was successfully recorded killed`,
        createdAt: log.createdAt,
      });
    }
  }

  activities.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const formattedActivities = activities.slice(0, 5).map((act) => {
    const diffMs = Date.now() - act.createdAt.getTime();
    const diffMins = Math.floor(diffMs / (60 * 1000));
    const diffHours = Math.floor(diffMs / (3600 * 1000));
    const diffDays = Math.floor(diffMs / (24 * 3600 * 1000));

    let timeStr = "Just now";
    if (diffMins > 0 && diffMins < 60) {
      timeStr = `${diffMins}m ago`;
    } else if (diffHours > 0 && diffHours < 24) {
      timeStr = `${diffHours}h ago`;
    } else if (diffDays === 1) {
      timeStr = "Yesterday";
    } else if (diffDays > 1) {
      timeStr = `${diffDays}d ago`;
    }

    return {
      type: act.type,
      action: act.action,
      detail: act.detail,
      time: timeStr,
    };
  });

  if (formattedActivities.length === 0) {
    formattedActivities.push({
      type: "INFO",
      action: "Welcome",
      detail: "Welcome to your guild dashboard!",
      time: "Just now",
    });
  }

  // 7. Performance history (Ledger credit accumulations over the last 7 calendar days)
  const performanceHistory: Array<{ dayName: string; amount: number }> = [];
  const daysOfWeek = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const dailyAmounts: { [key: string]: number } = {};
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toDateString();
    dailyAmounts[dateStr] = 0;
  }

  // Filter weeklyCredits for creditsHistory (createdAt >= sevenDaysAgoTime)
  const creditsHistory = weeklyCredits.filter((entry) => entry.createdAt >= sevenDaysAgoTime);

  for (const entry of creditsHistory) {
    const dateStr = entry.createdAt.toDateString();
    if (dailyAmounts[dateStr] !== undefined) {
      dailyAmounts[dateStr] += Number(entry.amount) / 100;
    }
  }

  const generatedPerformanceHistory = Object.keys(dailyAmounts).map((dateStr) => {
    const d = new Date(dateStr);
    return {
      dayName: daysOfWeek[d.getDay()],
      amount: dailyAmounts[dateStr],
    };
  });

  // 8. Faction claim ratios (Group boss schedules by guild turn)
  const totalClaimsCount = guildStats.claims.reduce((acc, c) => acc + c._count.id, 0);
  const factionClaims = guildStats.claims
    .map((c) => {
      const claimsCount = c._count.id;
      const percentage = totalClaimsCount > 0 ? Math.round((claimsCount / totalClaimsCount) * 100) : 0;
      return {
        guildName: c.guildTurn || "Unknown",
        claimsCount,
        percentage,
      };
    })
    .sort((a, b) => b.claimsCount - a.claimsCount);

  return {
    balance: {
      raw: Number(balanceCents) / 100,
      value: balanceValue,
      sub: balanceSub,
      currencySymbol,
    },
    guildPoints: {
      raw: totalPoints,
      value: guildPointsValue,
      sub: guildPointsSub,
    },
    members: {
      raw: guildStats.totalMembers,
      value: membersValue,
      sub: membersSub,
      online: guildStats.onlineMembersCount,
    },
    bossToday: {
      raw: guildStats.bossKillsToday,
      value: bossTodayValue,
      sub: bossTodaySub,
      total: guildStats.totalBossKills,
    },
    recentActivity: formattedActivities,
    performanceHistory: generatedPerformanceHistory,
    factionClaims: factionClaims,
  };
}

/**
 * Resolves the "Guild Points reset" window into a cutoff date. Guild Points
 * (attendance ledger points) are only counted from this cutoff forward, which
 * gives a rolling weekly / monthly reset WITHOUT deleting any ledger history —
 * members' money balances and dividends are untouched.
 *
 * - WEEKLY  → counts from the start of the current week (Monday 00:00)
 * - MONTHLY → counts from the first day of the current month
 * - MANUAL / unset → no cutoff (lifetime points)
 */
export function getGuildPointsCutoff(pointsResetCycle?: string | null): Date | null {
  const now = new Date();
  if (pointsResetCycle === "WEEKLY") {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const daysSinceMonday = (start.getDay() + 6) % 7; // Sun=0 → 6, Mon=1 → 0
    start.setDate(start.getDate() - daysSinceMonday);
    return start;
  }
  if (pointsResetCycle === "MONTHLY") {
    return new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  }
  return null;
}

export async function getAccountingDashboard(guildId: string, actorId: string, page: number = 1, limit: number = 25) {
  // Validate actor is Guild Leader, Officer, or Faction Leader — always
  // checked fresh, cache or no cache, before any cached data is returned.
  const actorMembership = await getGuildMemberByUser(actorId, guildId);

  if (!actorMembership || !actorMembership.isActive) {
    throw new ForbiddenError("You must be an active member of this guild to view accounting");
  }

  // Not viewer-specific (same data for every officer), so it's safe to cache
  // by guild+page+limit alone. Ledger is append-only, so only page 1 is ever
  // actively invalidated (createTreasuryAdjustment / loot sales) — later
  // pages rely on TTL expiry since they can never change once written.
  return redisCache.getOrSet(
    cacheKeys.acctLedgerPage(guildId, page, limit),
    page === 1 ? cacheTtl.acctLedgerPage1 : cacheTtl.acctLedgerOtherPages,
    async () => getAccountingDashboardUncached(guildId, page, limit),
  );
}

async function getAccountingDashboardUncached(guildId: string, page: number, limit: number) {
  const settings = await prisma.guildSettings.findUnique({
    where: { guildId },
  });

  const currencySymbol = settings?.currencySymbol || "₱";
  const currencyCode = settings?.currencyCode || "PHP";
  const secondarySymbol = settings?.secondaryCurrencySymbol || "💎";
  const secondaryCode = settings?.secondaryCurrencyCode || "DIAMOND";
  const pointsCutoff = getGuildPointsCutoff(settings?.pointsResetCycle);
  const skip = (page - 1) * limit;
  const take = limit;

  // The treasury balances, member roster, DKP totals, member balances,
  // transaction count, and ledger history page are all independent reads —
  // previously issued as 17 sequential round trips (10 of them were the same
  // treasury aggregate repeated per currency/account/entry combination, now
  // collapsed into 1 groupBy). Fetch everything in a single round trip batch.
  const [
    treasuryAggregates,
    members,
    dkpAggregates,
    balanceAggregates,
    totalTransactions,
    ledgerHistory,
  ] = await Promise.all([
    // 1. Treasury balances — one groupBy replaces the 10 separate aggregate()
    // calls (fund/tax × credit/debit × primary/secondary currency).
    prisma.ledgerEntry.groupBy({
      by: ["currency", "accountType", "entryType"],
      where: {
        guildId,
        accountType: { in: ["GUILD_FUND", "TAX"] },
        currency: { in: [currencyCode, secondaryCode] },
      },
      _sum: { amount: true },
    }),
    // 2. Member Balance Board - OPTIMIZED O(1) BATCH QUERIES. `select` (not
    // `include`) so this skips `marketWishlist` and other unused columns —
    // only the fields the board below actually renders are pulled.
    prisma.guildMember.findMany({
      where: { guildId, isActive: true },
      select: {
        id: true,
        userId: true,
        ign: true,
        role: true,
        rankName: true,
        cp: true,
        class: true,
        user: {
          select: {
            id: true,
            displayName: true,
            email: true,
            avatarUrl: true,
          },
        },
        customRole: { select: { id: true, name: true, color: true } },
      },
    }),
    // A. DKP points for all guild members in a single query. Apply the Guild
    // Points reset window so points roll over weekly / monthly.
    prisma.ledgerEntry.groupBy({
      by: ["accountId"],
      where: {
        guildId,
        accountType: "MEMBER",
        referenceType: "ATTENDANCE",
        ...(pointsCutoff ? { createdAt: { gte: pointsCutoff } } : {}),
      },
      _sum: { amount: true },
    }),
    // B. Credits and debits for ALL members and ALL currencies in a single query
    prisma.ledgerEntry.groupBy({
      by: ["accountId", "entryType", "currency"],
      where: {
        guildId,
        accountType: "MEMBER",
      },
      _sum: { amount: true },
    }),
    // 3. Paginated Transaction Ledger history
    prisma.ledgerEntry.count({
      where: { guildId },
    }),
    prisma.ledgerEntry.findMany({
      where: { guildId },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
  ]);

  const treasurySum = (
    currency: string,
    accountType: "GUILD_FUND" | "TAX",
    entryType: "CREDIT" | "DEBIT",
  ): bigint =>
    treasuryAggregates.find(
      (r) => r.currency === currency && r.accountType === accountType && r.entryType === entryType,
    )?._sum.amount || 0n;

  // A. Guild Treasury Balance
  const fundBalanceCents = treasurySum(currencyCode, "GUILD_FUND", "CREDIT") - treasurySum(currencyCode, "GUILD_FUND", "DEBIT");
  // B. Guild Tax Balance
  const taxBalanceCents = treasurySum(currencyCode, "TAX", "CREDIT") - treasurySum(currencyCode, "TAX", "DEBIT");
  // C. Total Expenses (GUILD_FUND + TAX debits combined — identical to the
  // former separate aggregate, since it summed the same two account types)
  const totalExpensesCents = treasurySum(currencyCode, "GUILD_FUND", "DEBIT") + treasurySum(currencyCode, "TAX", "DEBIT");

  // Secondary Currency Treasury
  const secFundBalanceCents = treasurySum(secondaryCode, "GUILD_FUND", "CREDIT") - treasurySum(secondaryCode, "GUILD_FUND", "DEBIT");
  const secTaxBalanceCents = treasurySum(secondaryCode, "TAX", "CREDIT") - treasurySum(secondaryCode, "TAX", "DEBIT");
  const secExpensesCents = treasurySum(secondaryCode, "GUILD_FUND", "DEBIT") + treasurySum(secondaryCode, "TAX", "DEBIT");

  const memberDkpMap: Record<string, number> = {};
  for (const row of dkpAggregates) {
    memberDkpMap[row.accountId] = Number(row._sum.amount || 0n);
  }

  // memberBalancesMap[userId][currencyCode][entryType] = amount
  const memberBalancesMap: Record<string, Record<string, { CREDIT: bigint; DEBIT: bigint }>> = {};

  for (const row of balanceAggregates) {
    const userId = row.accountId;
    const currency = row.currency;
    const entryType = row.entryType as "CREDIT" | "DEBIT";
    const amount = row._sum.amount || 0n;

    if (!memberBalancesMap[userId]) {
      memberBalancesMap[userId] = {};
    }
    if (!memberBalancesMap[userId][currency]) {
      memberBalancesMap[userId][currency] = { CREDIT: 0n, DEBIT: 0n };
    }
    memberBalancesMap[userId][currency][entryType] = amount;
  }

  const memberBalances = members.map((m) => {
    const userId = m.userId;
    const dkp = memberDkpMap[userId] || 0;

    // Primary Currency Balance
    const prim = memberBalancesMap[userId]?.[currencyCode] || { CREDIT: 0n, DEBIT: 0n };
    const balance = Number(prim.CREDIT - prim.DEBIT) / 100;
    const totalEarned = Number(prim.CREDIT) / 100;

    // Secondary Currency Balance
    const sec = memberBalancesMap[userId]?.[secondaryCode] || { CREDIT: 0n, DEBIT: 0n };
    const secBalance = Number(sec.CREDIT - sec.DEBIT) / 100;
    const secTotalEarned = Number(sec.CREDIT) / 100;

    return {
      memberId: m.id,
      userId: m.userId,
      ign: m.ign || m.user.displayName,
      role: m.role,
      rankName: m.rankName,
      customRole: m.customRole ? { id: m.customRole.id, name: m.customRole.name, color: m.customRole.color } : null,
      cp: m.cp || 0,
      class: m.class || "Unknown",
      dkp,
      balance,
      totalEarned,
      secBalance,
      secTotalEarned,
      user: m.user,
    };
  });

  const formattedHistory = ledgerHistory.map((item) => ({
    id: item.id,
    accountType: item.accountType,
    accountId: item.accountId,
    currency: item.currency,
    amount: Number(item.amount) / 100,
    entryType: item.entryType,
    referenceType: item.referenceType,
    referenceId: item.referenceId,
    description: item.description,
    createdAt: item.createdAt.toISOString(),
  }));

  return {
    treasury: {
      primary: {
        currencyCode,
        currencySymbol,
        fundBalance: Number(fundBalanceCents) / 100,
        taxBalance: Number(taxBalanceCents) / 100,
        totalExpenses: Number(totalExpensesCents) / 100,
      },
      secondary: {
        currencyCode: secondaryCode,
        currencySymbol: secondarySymbol,
        fundBalance: Number(secFundBalanceCents) / 100,
        taxBalance: Number(secTaxBalanceCents) / 100,
        totalExpenses: Number(secExpensesCents) / 100,
      },
    },
    memberBalances,
    transactions: formattedHistory,
    pagination: {
      page,
      limit,
      total: totalTransactions,
      totalPages: Math.ceil(totalTransactions / limit),
    },
  };
}

export async function createTreasuryAdjustment(
  guildId: string,
  payload: {
    accountId: string; // userId or guildId
    accountType: "MEMBER" | "GUILD_FUND" | "TAX";
    entryType: "CREDIT" | "DEBIT";
    amount: number; // in floating decimal standard format (e.g. 150.50)
    currency: string;
    description: string;
  },
  actorId: string,
  ipAddress?: string,
  userAgent?: string,
) {
  // Validate actor is Guild Leader, Officer, or Faction Leader
  const actorMembership = await getGuildMemberByUser(actorId, guildId);

  if (!actorMembership || !actorMembership.isActive || (actorMembership.role !== "GUILD_LEADER" && actorMembership.role !== "OFFICER" && actorMembership.role !== "FACTION_LEADER" && actorMembership.role !== "ADMIN")) {
    throw new ForbiddenError("Only Guild Leaders and Officers can make treasury adjustments");
  }

  const centsAmount = BigInt(Math.round(payload.amount * 100));
  const idKey = `ADJ-${crypto.randomBytes(8).toString("hex").toUpperCase()}`;

  const entry = await createLedgerEntry({
    guildId,
    accountType: payload.accountType,
    accountId: payload.accountId,
    currency: payload.currency,
    amount: centsAmount,
    entryType: payload.entryType,
    referenceType: "MANUAL_ADJUSTMENT",
    referenceId: idKey,
    idempotencyKey: idKey,
    actorId,
    description: payload.description,
  });

  await writeAuditLog({
    actorId,
    guildId,
    action: "TREASURY_ADJUSTMENT",
    target: "LedgerEntry",
    targetId: entry.id,
    detail: {
      accountId: payload.accountId,
      accountType: payload.accountType,
      entryType: payload.entryType,
      amount: payload.amount.toString(),
      currency: payload.currency,
      description: payload.description,
    },
    ipAddress,
    userAgent,
  });

  // Ledger is append-only — only the guild-wide stats, derived balance, and
  // the newest ledger page are affected. Older pages are immutable and are
  // never actively invalidated (see /docs/redis-caching-design.md §8).
  await redisCache.delMany([
    cacheKeys.dashboardStats(guildId),
    cacheKeys.acctBalance(guildId),
    cacheKeys.acctLedgerPage(guildId, 1, 25),
  ]);

  return entry;
}
