export interface PredefinedBoss {
  name: string;
  level: number;
  type: "LONG_CYCLE" | "FIXED_SCHEDULE";
  cooldownHours?: number;
  fixedSpawns?: Array<{ day: number; hour: number; minute: number }>; // 0=Sunday, 1=Monday...
  /**
   * Optional active-spawn window in Singapore wall-clock hours (24h). When set,
   * a cooldown-based (LONG_CYCLE) respawn that lands outside [startHour, endHour)
   * is pushed to the next day's startHour. Used for the "short cycle" bosses
   * (Venatus / Viorent / Ego) whose 10:00–21:00 window the game enforces.
   */
  window?: { startHour: number; endHour: number };
  location: string;
}

// Singapore is UTC+8 with no daylight saving, so a fixed millisecond offset is exact.
const SGT_OFFSET_MS = 8 * 60 * 60 * 1000;
const SHORT_CYCLE_WINDOW = { startHour: 10, endHour: 21 } as const;

export const PREDEFINED_BOSSES: PredefinedBoss[] = [
  // ─── Long Cycle Bosses ─────────────────────────────
  { name: "Venatus", level: 60, type: "LONG_CYCLE", cooldownHours: 10, window: SHORT_CYCLE_WINDOW, location: "Corrupted Basin" },
  { name: "Viorent", level: 65, type: "LONG_CYCLE", cooldownHours: 10, window: SHORT_CYCLE_WINDOW, location: "Crescent Lake" },
  { name: "Ego", level: 70, type: "LONG_CYCLE", cooldownHours: 21, window: SHORT_CYCLE_WINDOW, location: "Ulan Canyon" },
  { name: "Livera", level: 90, type: "LONG_CYCLE", cooldownHours: 24, location: "Protector's Ruins" },
  { name: "Araneo", level: 83, type: "LONG_CYCLE", cooldownHours: 24, location: "Lower Tomb of Tyriosa 1F" },
  { name: "Undomiel", level: 85, type: "LONG_CYCLE", cooldownHours: 24, location: "Secret Laboratory" },
  { name: "Lady Dalia", level: 83, type: "LONG_CYCLE", cooldownHours: 18, location: "Twilight Hill" },
  { name: "General Aquleus", level: 85, type: "LONG_CYCLE", cooldownHours: 29, location: "Lower Tomb of Tyriosa 2F" },
  { name: "Amentis", level: 88, type: "LONG_CYCLE", cooldownHours: 29, location: "Land of Glory" },
  { name: "Baron Baraudmore", level: 88, type: "LONG_CYCLE", cooldownHours: 32, location: "Battlefield of Templar" },
  { name: "Wannitas", level: 93, type: "LONG_CYCLE", cooldownHours: 48, location: "Platue of Revolution" },
  { name: "Duplican", level: 93, type: "LONG_CYCLE", cooldownHours: 48, location: "Platue of Revolution" },
  { name: "Metus", level: 93, type: "LONG_CYCLE", cooldownHours: 48, location: "Platue of Revolution" },
  { name: "Shuliar", level: 95, type: "LONG_CYCLE", cooldownHours: 35, location: "Battlefield of Templar" },
  { name: "Gareth", level: 98, type: "LONG_CYCLE", cooldownHours: 32, location: "Deadman's Land 1F" },
  { name: "Larba", level: 98, type: "LONG_CYCLE", cooldownHours: 35, location: "Ruins of War" },
  { name: "Titore", level: 98, type: "LONG_CYCLE", cooldownHours: 37, location: "Deadman's Land 2F" },
  { name: "Catena", level: 100, type: "LONG_CYCLE", cooldownHours: 35, location: "Deadman's Land 3F" },
  { name: "Secreta", level: 100, type: "LONG_CYCLE", cooldownHours: 62, location: "Silvergrass Field" },
  { name: "Ordo", level: 100, type: "LONG_CYCLE", cooldownHours: 62, location: "Silvergrass Field" },
  { name: "Asta", level: 100, type: "LONG_CYCLE", cooldownHours: 62, location: "Silvergrass Field" },
  { name: "Supore", level: 100, type: "LONG_CYCLE", cooldownHours: 62, location: "Silvergrass Field" },

  // ─── Weekly Spawns ─────────────────────────────────
  {
    name: "Chaiflock",
    level: 120,
    type: "FIXED_SCHEDULE",
    fixedSpawns: [{ day: 0, hour: 15, minute: 0 }],
    location: "Silvergrass Field",
  },
  {
    name: "Benji",
    level: 120,
    type: "FIXED_SCHEDULE",
    fixedSpawns: [{ day: 0, hour: 21, minute: 0 }],
    location: "Barbas",
  },
  {
    name: "Libitina",
    level: 130,
    type: "FIXED_SCHEDULE",
    fixedSpawns: [
      { day: 1, hour: 21, minute: 0 },
      { day: 6, hour: 21, minute: 0 },
    ],
    location: "Volcano Dracas",
  },
  {
    name: "Rakajeth",
    level: 130,
    type: "FIXED_SCHEDULE",
    fixedSpawns: [
      { day: 2, hour: 22, minute: 0 },
      { day: 0, hour: 19, minute: 0 },
    ],
    location: "Volcano Dracas",
  },
  {
    name: "Tumier",
    level: 140,
    type: "FIXED_SCHEDULE",
    fixedSpawns: [{ day: 0, hour: 19, minute: 0 }],
    location: "Garbana 3F",
  },
  {
    name: "Clemantis",
    level: 70,
    type: "FIXED_SCHEDULE",
    fixedSpawns: [
      { day: 1, hour: 11, minute: 30 },
      { day: 4, hour: 19, minute: 0 },
    ],
    location: "Corrupted Basin",
  },
  {
    name: "Saphirus",
    level: 80,
    type: "FIXED_SCHEDULE",
    fixedSpawns: [
      { day: 0, hour: 17, minute: 0 },
      { day: 2, hour: 11, minute: 30 },
    ],
    location: "Crescent Lake",
  },
  {
    name: "Neutro",
    level: 80,
    type: "FIXED_SCHEDULE",
    fixedSpawns: [
      { day: 2, hour: 19, minute: 0 },
      { day: 4, hour: 11, minute: 30 },
    ],
    location: "Desert of Screaming",
  },
  {
    name: "Thymele",
    level: 85,
    type: "FIXED_SCHEDULE",
    fixedSpawns: [
      { day: 1, hour: 19, minute: 0 },
      { day: 3, hour: 11, minute: 30 },
    ],
    location: "Twilight Hill",
  },
  {
    name: "Milavy",
    level: 90,
    type: "FIXED_SCHEDULE",
    fixedSpawns: [{ day: 6, hour: 15, minute: 0 }],
    location: "Lower Tomb of Tyriosa 3F",
  },
  {
    name: "Ringor",
    level: 95,
    type: "FIXED_SCHEDULE",
    fixedSpawns: [{ day: 6, hour: 17, minute: 0 }],
    location: "Battlefield of Templar",
  },
  {
    name: "Roderick",
    level: 95,
    type: "FIXED_SCHEDULE",
    fixedSpawns: [{ day: 5, hour: 19, minute: 0 }],
    location: "Garbana 1F",
  },
  {
    name: "Auraq",
    level: 100,
    type: "FIXED_SCHEDULE",
    fixedSpawns: [
      { day: 5, hour: 22, minute: 0 },
      { day: 3, hour: 21, minute: 0 },
    ],
    location: "Garbana 2F",
  },

  // ─── World Bosses ──────────────────────────────────
  {
    name: "Icaruthia",
    level: 135,
    type: "FIXED_SCHEDULE",
    fixedSpawns: [
      { day: 2, hour: 21, minute: 0 },
      { day: 5, hour: 21, minute: 0 },
    ],
    location: "Kransia",
  },
  {
    name: "Motti",
    level: 135,
    type: "FIXED_SCHEDULE",
    fixedSpawns: [
      { day: 3, hour: 19, minute: 0 },
      { day: 6, hour: 19, minute: 0 },
    ],
    location: "Kransia",
  },
  {
    name: "Nevaeh",
    level: 140,
    type: "FIXED_SCHEDULE",
    fixedSpawns: [{ day: 0, hour: 22, minute: 0 }],
    location: "Kransia",
  },
  {
    name: "Lucus",
    level: 145,
    type: "FIXED_SCHEDULE",
    fixedSpawns: [{ day: 6, hour: 22, minute: 0 }],
    location: "Kransia",
  },
  {
    name: "Camalia",
    level: 135,
    type: "FIXED_SCHEDULE",
    fixedSpawns: [{ day: 4, hour: 21, minute: 0 }],
    location: "Hidden Laboratory",
  },
];

/**
 * Clamp a cooldown-based respawn to a boss's daily spawn window, evaluated in
 * Singapore wall-clock time. If the instant already falls inside the window it
 * is returned unchanged; otherwise it is moved to the next window opening.
 */
function clampToWindowSGT(date: Date, window: { startHour: number; endHour: number }): Date {
  const sgt = new Date(date.getTime() + SGT_OFFSET_MS); // SGT wall clock as UTC fields
  const decimalHour = sgt.getUTCHours() + sgt.getUTCMinutes() / 60;

  if (decimalHour >= window.startHour && decimalHour < window.endHour) {
    return date; // already within the active window
  }

  // After the window closes, jump to the *next* day's opening; before it opens, same day.
  const targetDay = decimalHour >= window.endHour
    ? new Date(sgt.getTime() + 24 * 60 * 60 * 1000)
    : sgt;

  const openSgtMs = Date.UTC(
    targetDay.getUTCFullYear(),
    targetDay.getUTCMonth(),
    targetDay.getUTCDate(),
    window.startHour,
    0,
    0,
    0,
  );
  return new Date(openSgtMs - SGT_OFFSET_MS);
}

export function getNextBossSpawnTime(bossName: string, killedAt: Date): Date {
  const boss = PREDEFINED_BOSSES.find((b) => b.name.toLowerCase() === bossName.toLowerCase());
  if (!boss) {
    // Default fallback to 24 hours if not in registry
    return new Date(killedAt.getTime() + 24 * 60 * 60 * 1000);
  }

  if (boss.type === "LONG_CYCLE" && boss.cooldownHours) {
    const next = new Date(killedAt.getTime() + boss.cooldownHours * 60 * 60 * 1000);
    // Short-cycle bosses only respawn inside their Singapore-time window.
    return boss.window ? clampToWindowSGT(next, boss.window) : next;
  }

  if (boss.type === "FIXED_SCHEDULE" && boss.fixedSpawns && boss.fixedSpawns.length > 0) {
    // Fixed spawns are authored in Singapore wall-clock time (24h). Search the
    // next 7 days in SGT, then convert the chosen instant back to UTC.
    const killedSgt = new Date(killedAt.getTime() + SGT_OFFSET_MS);
    let bestUtc: number | null = null;

    for (let offset = 0; offset <= 7; offset++) {
      const daySgt = new Date(killedSgt.getTime() + offset * 24 * 60 * 60 * 1000);
      const dayOfWeek = daySgt.getUTCDay(); // day-of-week in Singapore

      for (const spawn of boss.fixedSpawns) {
        if (spawn.day !== dayOfWeek) continue;

        const candidateSgtMs = Date.UTC(
          daySgt.getUTCFullYear(),
          daySgt.getUTCMonth(),
          daySgt.getUTCDate(),
          spawn.hour,
          spawn.minute,
          0,
          0,
        );
        const candidateUtc = candidateSgtMs - SGT_OFFSET_MS;

        if (candidateUtc > killedAt.getTime() && (bestUtc === null || candidateUtc < bestUtc)) {
          bestUtc = candidateUtc;
        }
      }
    }

    if (bestUtc !== null) return new Date(bestUtc);
  }

  // Fallback
  return new Date(killedAt.getTime() + 24 * 60 * 60 * 1000);
}

// ─── Real-time respawn timer ───────────────────────────────
// A boss whose scheduled spawn passed should NOT read "LIVE" forever. We project
// it forward along its real respawn cycle (cooldown / fixed schedule) so the
// timer is always a live, future-facing countdown — exactly how an in-game boss
// timer behaves. A boss only reads LIVE when it genuinely just appeared (within
// `liveGraceMs` of its spawn) or the server has flagged it SPAWNED.

const ONE_HOUR_MS = 60 * 60 * 1000;

export interface RealtimeBossTimer {
  /** Boss is up right now (server-flagged SPAWNED or within the live grace window). */
  live: boolean;
  /** Less than an hour until the next spawn. */
  warning: boolean;
  /** "HH:MM:SS" countdown to the next spawn, or "LIVE" when up. */
  text: string;
  /** Timestamp (ms) of the projected next spawn. */
  nextSpawn: number;
  /** How long the boss has been live (ms); 0 when not live. */
  liveSinceMs: number;
  /** Elapsed up-time formatted ("MM:SS" or "HH:MM:SS"); empty when not live. */
  liveElapsedText: string;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function formatHMS(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
}

function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${pad2(h)}:${pad2(m)}:${pad2(s)}` : `${pad2(m)}:${pad2(s)}`;
}

export function getRealtimeBossTimer(
  bossName: string,
  spawnTime: string,
  now: number,
  opts: { status?: string | null; liveGraceMs?: number } = {},
): RealtimeBossTimer {
  const grace = opts.liveGraceMs ?? ONE_HOUR_MS;
  const scheduled = new Date(spawnTime).getTime();
  const overdue = now - scheduled;
  const isSpawned = opts.status === "SPAWNED";

  // Genuinely live: server says it's up, or it just spawned within the grace window.
  if (isSpawned || (overdue >= 0 && overdue <= grace)) {
    const liveSince = Math.max(0, overdue);
    return {
      live: true,
      warning: false,
      text: "LIVE",
      nextSpawn: scheduled,
      liveSinceMs: liveSince,
      liveElapsedText: formatElapsed(liveSince),
    };
  }

  // Otherwise project forward along the boss's real cycle until the spawn is in the future.
  let target = scheduled;
  if (target <= now) {
    let cursor = new Date(scheduled);
    let guard = 0;
    while (cursor.getTime() <= now && guard++ < 128) {
      const next = getNextBossSpawnTime(bossName, cursor);
      // Safety: never let the cursor stall (unknown boss / degenerate schedule).
      cursor = next.getTime() > cursor.getTime() ? next : new Date(cursor.getTime() + ONE_HOUR_MS);
    }
    target = cursor.getTime();
  }

  const diff = Math.max(0, target - now);
  return {
    live: false,
    warning: diff <= ONE_HOUR_MS,
    text: formatHMS(diff),
    nextSpawn: target,
    liveSinceMs: 0,
    liveElapsedText: "",
  };
}

// ─── High Boss / Low Boss categorisation ────────────────────
// "Low Boss" bosses are scheduled via the faction's day-based Low Boss
// rotation (BossLowRotation — guild-of-the-day, not a per-boss turn queue)
// instead of the standalone per-boss BossRotation/Master List queue; a boss
// is one or the other, never both. A faction leader can override the
// category per boss (BossLowRotation.lowBossNames); until they've picked
// anything explicitly, it defaults from level.
export type BossCategory = "HIGH" | "LOW";
export const DEFAULT_LOW_BOSS_MAX_LEVEL = 75;

export function getDefaultBossCategory(level: number): BossCategory {
  return level <= DEFAULT_LOW_BOSS_MAX_LEVEL ? "LOW" : "HIGH";
}

// ─── Boss cycle categorisation (for rotation filters) ───────
export type BossCycleCategory = "FIXED_SCHEDULE" | "SHORT_CYCLE" | "LONG_CYCLE";

// Bosses that respawn at least once a day (windowed bosses or a cooldown of a
// day or less) are "short cycle"; longer multi-day cooldowns are "long cycle".
export const SHORT_CYCLE_MAX_HOURS = 24;

export function getBossCycleCategory(
  bossName: string,
  type?: string | null,
  cooldownHours?: number | null,
): BossCycleCategory {
  const predef = PREDEFINED_BOSSES.find((b) => b.name.toLowerCase() === bossName.toLowerCase());
  const resolvedType = type ?? predef?.type ?? "LONG_CYCLE";
  if (resolvedType === "FIXED_SCHEDULE") return "FIXED_SCHEDULE";

  const cooldown = cooldownHours ?? predef?.cooldownHours ?? null;
  if (predef?.window || (cooldown !== null && cooldown <= SHORT_CYCLE_MAX_HOURS)) {
    return "SHORT_CYCLE";
  }
  return "LONG_CYCLE";
}

// ─── Faction Schedule "Daily" cadence ────────────────────────
// For sub-24h-cooldown bosses that can spawn more than once in a day, the
// Faction Schedule's "Daily" mode auto-rotates the guild-of-the-day instead
// of requiring a leader to fill in a calendar. Anchored to the Unix epoch so
// it's a pure function of (guild count, date) — no per-day map to store or
// keep refilling; the pattern only shifts if the guild roster itself changes.
export function getDailyRotationIndex(guildCount: number, date: Date = new Date()): number {
  if (guildCount <= 0) return -1;
  const daysSinceEpoch = Math.floor(date.getTime() / 86400000);
  return ((daysSinceEpoch % guildCount) + guildCount) % guildCount;
}

export function getBossImageUrl(bossName: string): string {
  const BASE = "https://tsjuckpzfuaozktqhior.supabase.co/storage/v1/object/public/Bosses";

  // ─── Supabase Storage Boss Images ────────────────────────────────────────────
  // Map of lowercase boss name → Supabase Storage public URL.
  // To add a new boss image: upload <BossName>.png to the "Bosses" bucket,
  // then add an entry here as "boss name lowercase": `${BASE}/BossName.png`
  const SUPABASE_IMAGES: Record<string, string> = {
    "venatus":          `${BASE}/Venatus.png`,
    "viorent":          `${BASE}/Viorent.png`,
    "livera":           `${BASE}/Livera.png`,
    "araneo":           `${BASE}/Araneo.png`,
    "ego":              `${BASE}/Ego.png`,
    "lady dalia":       `${BASE}/LadyDalia.png`,
    "neutro":           `${BASE}/Neutro.png`,
    "undomiel":         `${BASE}/Undomiel.png`,
    "clemantis":        `${BASE}/Clemantis.png`,
    "general aquleus":  `${BASE}/GeneralAquleus.png`,
    "amentis":          `${BASE}/Amentis.png`,
    "baron baraudmore": `${BASE}/BaronBaraudmore.png`,
    "wannitas":         `${BASE}/Wannitas.png`,
    "duplican":         `${BASE}/Duplican.png`,
    "metus":            `${BASE}/Metus.png`,
    "shuliar":          `${BASE}/Shuliar.png`,
    "gareth":           `${BASE}/Gareth.png`,
    "larba":            `${BASE}/Larba.png`,
    "titore":           `${BASE}/Titore.png`,
    "catena":           `${BASE}/Catena.png`,
    "secreta":          `${BASE}/Secreta.png`,
    "ordo":             `${BASE}/Ordo.png`,
    "asta":             `${BASE}/Asta.png`,
    "supore":           `${BASE}/Supore.png`,
    "chaiflock":        `${BASE}/Chaiflock.png`,
    "benji":            `${BASE}/Benji.png`,
    "libitina":         `${BASE}/Libitina.png`,
    "rakajeth":         `${BASE}/Rakajeth.png`,
    "tumier":           `${BASE}/Tumier.png`,
    "saphirus":         `${BASE}/Saphirus.png`,
    "thymele":          `${BASE}/Thymele.png`,
    "milavy":           `${BASE}/Milavy.png`,
    "ringor":           `${BASE}/Ringor.png`,
    "roderick":         `${BASE}/Roderick.png`,
    "auraq":            `${BASE}/Auraq.png`,
    "icaruthia":        `${BASE}/Icaruthia.png`,
    "motti":            `${BASE}/Motti.png`,
    "camalia":          `${BASE}/Camalia.jpg`,
    "nevaeh":           `${BASE}/Nevaeh.png`,
    "lucus":            `${BASE}/Lucus.png`,
  };

  const name = bossName.toLowerCase().trim();

  // 1. Exact match
  if (SUPABASE_IMAGES[name]) return SUPABASE_IMAGES[name];

  // 2. Partial match — handles aliases, typos, or sub-string boss names
  for (const [key, url] of Object.entries(SUPABASE_IMAGES)) {
    if (name.includes(key) || key.includes(name)) return url;
  }

  // Generic fantasy artwork default (for any boss not yet in Supabase)
  return "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=300&auto=format&fit=crop&q=80";
}