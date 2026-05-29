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
  const name = bossName.toLowerCase();
  
  // Curated high-quality, relevant fantasy creature/MMORPG artwork from Unsplash
  if (name.includes("dragon") || name.includes("viorent") || name.includes("icaruthia")) {
    return "https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?w=300&auto=format&fit=crop&q=80"; // Golden/red dragon/creature
  }
  if (name.includes("spider") || name.includes("araneo") || name.includes("larba")) {
    return "https://images.unsplash.com/photo-1525310072745-f49212b5ac6d?w=300&auto=format&fit=crop&q=80"; // Alien/spider neon look
  }
  if (name.includes("lich") || name.includes("lord") || name.includes("baron") || name.includes("gareth") || name.includes("roderick") || name.includes("ringor")) {
    return "https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=300&auto=format&fit=crop&q=80"; // Knight/Deathlord anime/fantasy armor
  }
  if (name.includes("aquleus") || name.includes("shuliar") || name.includes("lucus") || name.includes("saphirus")) {
    return "https://images.unsplash.com/photo-1534447677768-be436bb09401?w=300&auto=format&fit=crop&q=80"; // Deep sea/kraken/blue magic abstract
  }
  if (name.includes("dalia") || name.includes("undomiel") || name.includes("libitina") || name.includes("milavy") || name.includes("clemantis") || name.includes("thymele")) {
    return "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=300&auto=format&fit=crop&q=80"; // Fantasy goddess/elf queen
  }
  if (name.includes("venatus") || name.includes("ego") || name.includes("amentis") || name.includes("auraq")) {
    return "https://images.unsplash.com/photo-1550684848-fac1c5b4e853?w=300&auto=format&fit=crop&q=80"; // Neon dark monolith/glowing runes
  }
  if (name.includes("metus") || name.includes("abyss") || name.includes("supore") || name.includes("crypt") || name.includes("neutro")) {
    return "https://images.unsplash.com/photo-1509248961158-e54f6934749c?w=300&auto=format&fit=crop&q=80"; // Ghostly spirit/grim reaper
  }
  if (name.includes("motti") || name.includes("tumier") || name.includes("chaiflock")) {
    return "https://images.unsplash.com/photo-1559827291-72ee739d0d9a?w=300&auto=format&fit=crop&q=80"; // Golem/giant monster
  }
  
  // Generic beautiful fantasy artwork default
  return "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=300&auto=format&fit=crop&q=80";
}

