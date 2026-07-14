// Cache key builders + TTLs for the Redis layer. See /docs/redis-caching-design.md
// for the full design, invalidation triggers, and rationale per key.
//
// Every key used to WRITE a cache entry is built from one of these
// functions, and every key used to INVALIDATE it is built from the same
// function — that pairing is the whole reason this file exists instead of
// hand-written template strings scattered across services.

const NS = "fk";

export const ttl = {
  dashboardStats: 30,
  guildSettings: 300,
  guildRoles: 300,
  guildMembers: 60,
  guildMembersSimple: 300,
  guildApplications: 30,
  guildInviteCode: 3600,
  factionOverview: 60,
  factionMembers: 60,
  factionAnnouncements: 120,
  factionEvents: 60,
  factionInviteCode: 3600,
  factionJoinRequests: 30,
  bossRotation: 30,
  bossSchedules: 15,
  bossAudit: 30,
  bossKilledHistory: 60,
  bossCommitments: 20,
  bossRegistry: 3600,
  marketRequests: 30,
  marketLegendary: 30,
  marketPriority: 30,
  marketDistributions: 60,
  marketWishlistMine: 60,
  marketWishlistMaster: 60,
  marketRules: 300,
  marketAudit: 60,
  marketMounts: 60,
  marketAuction: 15,
  marketStorage: 30,
  attendSessions: 20,
  attendSessionDetail: 10,
  attendPending: 15,
  attendStats: 60,
  equipCatalog: 3600,
  equipMine: 120,
  acctBalance: 30,
  acctLedgerPage1: 60,
  acctLedgerOtherPages: 60,
  acctLootSales: 120,
  leaderboardIndex: 3600,
} as const;

export const cacheKeys = {
  // ─── 1. Dashboard (shared with §9 Statistics) ───
  dashboardStats: (guildId: string) => `${NS}:dash:stats:${guildId}`,

  // ─── 2. Guild ───
  guildSettings: (guildId: string) => `${NS}:guild:settings:${guildId}`,
  guildRoles: (guildId: string) => `${NS}:guild:roles:${guildId}`,
  guildMembers: (guildId: string) => `${NS}:guild:members:${guildId}`,
  guildMembersSimple: (guildId: string) => `${NS}:guild:members-simple:${guildId}`,
  guildApplications: (guildId: string) => `${NS}:guild:applications:${guildId}`,
  guildInviteCode: (guildId: string) => `${NS}:guild:invite-code:${guildId}`,

  // ─── 3. Faction ───
  factionOverview: (factionId: string) => `${NS}:faction:overview:${factionId}`,
  factionMembers: (factionId: string) => `${NS}:faction:members:${factionId}`,
  factionAnnouncements: (factionId: string) => `${NS}:faction:announcements:${factionId}`,
  factionEvents: (factionId: string) => `${NS}:faction:events:${factionId}`,
  factionInviteCode: (factionId: string) => `${NS}:faction:invite-code:${factionId}`,
  factionJoinRequests: (factionId: string) => `${NS}:faction:join-requests:${factionId}`,

  // ─── 4. Boss Rotation ───
  /** Recommended target shape — cache the faction-wide computation once. */
  bossRotationByFaction: (factionId: string) => `${NS}:boss:rotation:${factionId}`,
  /** Current per-guild shape — pair with `rotationGuildIndex` (Pattern B) until the faction-scoped refactor lands. */
  bossRotationByGuild: (guildId: string) => `${NS}:boss:rotation:${guildId}`,
  /** Index set of guildIds with a warm per-guild rotation cache for this faction. */
  rotationGuildIndex: (factionId: string) => `${NS}:boss:rotation:guilds:${factionId}`,
  bossSchedules: (guildId: string) => `${NS}:boss:schedules:${guildId}`,
  bossAuditPage1: (guildId: string) => `${NS}:boss:audit:${guildId}:p1`,
  bossKilledHistory: (guildId: string, yyyyMm: string) => `${NS}:boss:killed-history:${guildId}:${yyyyMm}`,
  bossCommitments: (guildId: string, scheduleId: string) => `${NS}:boss:commitments:${guildId}:${scheduleId}`,
  bossRegistry: () => `${NS}:boss:registry`,

  // ─── 5. Marketplace ───
  marketRequests: (guildId: string) => `${NS}:market:requests:${guildId}`,
  marketLegendary: (guildId: string) => `${NS}:market:legendary:${guildId}`,
  marketPriority: (guildId: string) => `${NS}:market:priority:${guildId}`,
  marketDistributions: (guildId: string) => `${NS}:market:distributions:${guildId}`,
  marketWishlistMine: (guildId: string, userId: string) => `${NS}:market:wishlist:mine:${guildId}:${userId}`,
  marketWishlistMaster: (guildId: string) => `${NS}:market:wishlist:master:${guildId}`,
  marketRules: (guildId: string) => `${NS}:market:rules:${guildId}`,
  marketAuditPage1: (guildId: string) => `${NS}:market:audit:${guildId}:p1`,
  marketMounts: (guildId: string) => `${NS}:market:mounts:${guildId}`,
  marketAuction: (guildId: string) => `${NS}:market:auction:${guildId}`,
  marketStorage: (guildId: string) => `${NS}:market:storage:${guildId}`,

  // ─── 6. Attendance ───
  attendSessions: (guildId: string) => `${NS}:attend:sessions:${guildId}`,
  attendSessionDetail: (guildId: string, sessionId: string) => `${NS}:attend:session-detail:${guildId}:${sessionId}`,
  attendPending: (guildId: string) => `${NS}:attend:pending:${guildId}`,
  /** Per-user — see design doc §6 correctness note. TTL-only, no active invalidation. */
  attendStats: (guildId: string, userId: string) => `${NS}:attend:stats:${guildId}:${userId}`,

  // ─── 7. Inventory / Equipment ───
  equipCatalog: () => `${NS}:equip:catalog`,
  equipDropsCatalog: () => `${NS}:equip:drops-catalog`,
  equipMine: (guildId: string, userId: string) => `${NS}:equip:mine:${guildId}:${userId}`,

  // ─── 8. Accounting ───
  acctBalance: (guildId: string) => `${NS}:acct:balance:${guildId}`,
  acctLedgerPage: (guildId: string, page: number, limit: number) => `${NS}:acct:ledger:${guildId}:p${page}:l${limit}`,
  acctLootSales: (guildId: string) => `${NS}:acct:loot-sales:${guildId}`,

  // ─── 10. Leaderboards (sorted sets — see redis.ts zincrby/ztopN/zrank) ───
  leaderboardPoints: (guildId: string, period: "all" | "weekly" | "monthly") => `${NS}:lb:points:${guildId}:${period}`,
} as const;
