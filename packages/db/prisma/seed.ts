// Reuse the package's configured client (engine-less + `pg` driver adapter).
// A bare `new PrismaClient()` fails with "Missing configured driver adapter".
import { prisma } from "../src/client";

// Boss catalog only. This script intentionally creates NO accounts, guilds,
// or other demo data — it only replaces the `Boss` table's contents, so it's
// safe to re-run against a real environment without wiping users, guilds, or
// any manually-provisioned admin account. (The old version of this script
// truncated every table and seeded a hardcoded superadmin account with a
// known password — removed after that credential was exposed publicly. Any
// real admin account is now provisioned directly in Supabase, not here.)
async function main() {
  const predefinedBosses = [
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

  // Scoped to just this table — deliberately not a full-DB TRUNCATE, so
  // re-running this against a real environment can't wipe accounts/guilds.
  await prisma.boss.deleteMany({});

  for (const b of predefinedBosses) {
    await prisma.boss.create({
      data: {
        name: b.name,
        level: b.level,
        type: b.type,
        cooldownHours: b.cooldownHours || null,
        location: b.location,
        fixedSpawns: b.fixedSpawns || null,
      },
    });
  }

  console.log(`✅ Seeded ${predefinedBosses.length} bosses.`);
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
