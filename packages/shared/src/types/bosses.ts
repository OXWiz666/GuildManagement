export interface PredefinedBoss {
  name: string;
  level: number;
  type: "LONG_CYCLE" | "FIXED_SCHEDULE";
  cooldownHours?: number;
  fixedSpawns?: Array<{ day: number; hour: number; minute: number }>; // 0=Sunday, 1=Monday...
  location: string;
}

export const PREDEFINED_BOSSES: PredefinedBoss[] = [
  // ─── Long Cycle Bosses ─────────────────────────────
  { name: "Venatus", level: 60, type: "LONG_CYCLE", cooldownHours: 10, location: "Venatus Chamber" },
  { name: "Viorent", level: 65, type: "LONG_CYCLE", cooldownHours: 10, location: "Viorent Lair" },
  { name: "Ego", level: 70, type: "LONG_CYCLE", cooldownHours: 21, location: "Ego Ruins" },
  { name: "Lady Dalia", level: 83, type: "LONG_CYCLE", cooldownHours: 18, location: "Dalia Sanctuary" },
  { name: "Araneo", level: 83, type: "LONG_CYCLE", cooldownHours: 24, location: "Araneo Weblands" },
  { name: "Undomiel", level: 85, type: "LONG_CYCLE", cooldownHours: 24, location: "Undomiel Grove" },
  { name: "General Aquleus", level: 85, type: "LONG_CYCLE", cooldownHours: 29, location: "Aquleus Citadel" },
  { name: "Amentis", level: 88, type: "LONG_CYCLE", cooldownHours: 29, location: "Amentis Vault" },
  { name: "Baron Baraudmore", level: 88, type: "LONG_CYCLE", cooldownHours: 32, location: "Baraudmore Keep" },
  { name: "Livera", level: 90, type: "LONG_CYCLE", cooldownHours: 24, location: "Livera Garden" },
  { name: "Wannitas", level: 93, type: "LONG_CYCLE", cooldownHours: 48, location: "Wannitas Peak" },
  { name: "Duplican", level: 93, type: "LONG_CYCLE", cooldownHours: 48, location: "Duplican Hall" },
  { name: "Metus", level: 93, type: "LONG_CYCLE", cooldownHours: 48, location: "Metus Abyss" },
  { name: "Shuliar", level: 95, type: "LONG_CYCLE", cooldownHours: 35, location: "Shuliar Trench" },
  { name: "Gareth", level: 98, type: "LONG_CYCLE", cooldownHours: 32, location: "Gareth Bastion" },
  { name: "Larba", level: 98, type: "LONG_CYCLE", cooldownHours: 35, location: "Larba Nest" },
  { name: "Titore", level: 98, type: "LONG_CYCLE", cooldownHours: 37, location: "Titore Temple" },
  { name: "Catena", level: 100, type: "LONG_CYCLE", cooldownHours: 35, location: "Catena Colosseum" },
  { name: "Secreta", level: 100, type: "LONG_CYCLE", cooldownHours: 62, location: "Secreta Vault" },
  { name: "Ordo", level: 100, type: "LONG_CYCLE", cooldownHours: 62, location: "Ordo Shrine" },
  { name: "Asta", level: 100, type: "LONG_CYCLE", cooldownHours: 62, location: "Asta Sanctum" },
  { name: "Supore", level: 100, type: "LONG_CYCLE", cooldownHours: 62, location: "Supore Crypt" },

  // ─── Weekly Spawns ─────────────────────────────────
  {
    name: "Chaiflock",
    level: 120,
    type: "FIXED_SCHEDULE",
    fixedSpawns: [{ day: 0, hour: 15, minute: 0 }],
    location: "Chaiflock Arena",
  },
  {
    name: "Benji",
    level: 120,
    type: "FIXED_SCHEDULE",
    fixedSpawns: [{ day: 0, hour: 21, minute: 0 }],
    location: "Benji Coliseum",
  },
  {
    name: "Libitina",
    level: 130,
    type: "FIXED_SCHEDULE",
    fixedSpawns: [
      { day: 1, hour: 21, minute: 0 },
      { day: 6, hour: 21, minute: 0 },
    ],
    location: "Libitina Catacombs",
  },
  {
    name: "Rakajeth",
    level: 130,
    type: "FIXED_SCHEDULE",
    fixedSpawns: [
      { day: 2, hour: 22, minute: 0 },
      { day: 0, hour: 19, minute: 0 },
    ],
    location: "Rakajeth Platform",
  },
  {
    name: "Tumier",
    level: 140,
    type: "FIXED_SCHEDULE",
    fixedSpawns: [{ day: 0, hour: 19, minute: 0 }],
    location: "Tumier Throne",
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
    location: "Kransia Peak",
  },
  {
    name: "Motti",
    level: 135,
    type: "FIXED_SCHEDULE",
    fixedSpawns: [
      { day: 3, hour: 19, minute: 0 },
      { day: 6, hour: 19, minute: 0 },
    ],
    location: "Kransia Valley",
  },
  {
    name: "Nevae",
    level: 140,
    type: "FIXED_SCHEDULE",
    fixedSpawns: [{ day: 0, hour: 22, minute: 0 }],
    location: "Kransia Ridge",
  },
  {
    name: "Lucus",
    level: 145,
    type: "FIXED_SCHEDULE",
    fixedSpawns: [{ day: 6, hour: 22, minute: 0 }],
    location: "Kransia Coast",
  },
];

export function getNextBossSpawnTime(bossName: string, killedAt: Date): Date {
  const boss = PREDEFINED_BOSSES.find((b) => b.name.toLowerCase() === bossName.toLowerCase());
  if (!boss) {
    // Default fallback to 24 hours if not in registry
    return new Date(killedAt.getTime() + 24 * 60 * 60 * 1000);
  }

  if (boss.type === "LONG_CYCLE" && boss.cooldownHours) {
    return new Date(killedAt.getTime() + boss.cooldownHours * 60 * 60 * 1000);
  }

  if (boss.type === "FIXED_SCHEDULE" && boss.fixedSpawns) {
    let nextDate: Date | null = null;

    // Check days starting from killedAt up to 7 days ahead
    for (let offset = 0; offset <= 7; offset++) {
      const candidateDay = new Date(killedAt.getTime() + offset * 24 * 60 * 60 * 1000);
      const dayOfWeek = candidateDay.getDay();

      for (const spawn of boss.fixedSpawns) {
        if (spawn.day === dayOfWeek) {
          const candidate = new Date(candidateDay);
          candidate.setHours(spawn.hour, spawn.minute, 0, 0);

          if (candidate.getTime() > killedAt.getTime()) {
            if (!nextDate || candidate.getTime() < nextDate.getTime()) {
              nextDate = candidate;
            }
          }
        }
      }
    }

    if (nextDate) return nextDate;
  }

  // Fallback
  return new Date(killedAt.getTime() + 24 * 60 * 60 * 1000);
}
