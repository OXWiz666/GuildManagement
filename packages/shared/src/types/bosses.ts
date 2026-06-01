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
  { name: "Venatus", level: 60, type: "LONG_CYCLE", cooldownHours: 10, location: "Corrupted Basin" },
  { name: "Viorent", level: 65, type: "LONG_CYCLE", cooldownHours: 10, location: "Crescent Lake" },
  { name: "Ego", level: 70, type: "LONG_CYCLE", cooldownHours: 21, location: "Ulan Canyon" },
  { name: "Livera", level: 75, type: "LONG_CYCLE", cooldownHours: 24, location: "Protector's Ruins" },
  { name: "Araneo", level: 83, type: "LONG_CYCLE", cooldownHours: 24, location: "Lower Tomb of Tyriosa 1F" },
  { name: "Undomiel", level: 85, type: "LONG_CYCLE", cooldownHours: 24, location: "Secret Laboratory" },
  { name: "Lady Dalia", level: 85, type: "LONG_CYCLE", cooldownHours: 18, location: "Twilight Hill" },
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