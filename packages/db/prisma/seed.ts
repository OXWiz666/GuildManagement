// Reuse the package's configured client (engine-less + `pg` driver adapter).
// A bare `new PrismaClient()` fails with "Missing configured driver adapter".
import { prisma } from "../src/client";

async function main() {

  // ─── Truncate every table in one shot ───
  // TRUNCATE ... CASCADE resolves FK order automatically, so this stays correct
  // as new models are added (no more hand-maintained delete ordering).
  const tableRows = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  `;
  const tableList = tableRows.map((r) => `"public"."${r.tablename}"`).join(", ");
  if (tableList) {
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE`);
  }

  // ─── Users ───────────────────────────────────────
  // Password: "Admin123!" for all (bcrypt hash, 12 rounds)
  const passwordHash =
    "$2a$12$.oif3hOd38kI/VLuLWyyyOcrX1b3TF2TVsoY2JJi7faKQyndAngpO";

  // ── Super Admin Account (highest platform authority) ──
  const superAdmin = await prisma.user.create({
    data: {
      email: "superadmin@guildmaster.dev",
      username: "superadmin",
      passwordHash,
      displayName: "SuperAdmin",
      avatarUrl: "https://images.unsplash.com/photo-1531123897727-8f129e1688ce?q=80&w=256&auto=format&fit=crop",
      ign: "SuperAdmin",
      cp: 130000,
      class: "Destroyer",
      weapon: "Staff",
      emailVerifiedAt: new Date(),
    },
  });

  // ─── Guilds ──────────────────────────────────────
  const guild1 = await prisma.guild.create({
    data: {
      name: "Valhalla",
      slug: "valhalla",
      description:
        "Elite PvE and PVP guild focused on boss raids and world events. Philippine-based.",
      inviteCode: "VAL-JOIN-9A21", // Testing code
      settings: {
        create: {
          currencyCode: "PHP",
          currencySymbol: "₱",
          secondaryCurrencyCode: "DIAMOND",
          secondaryCurrencySymbol: "💎",
          taxRatePercent: 10,
          attendancePoints: 10,
          bossKillPoints: 50,
          rankMultipliers: {
            GUILD_LEADER: 2.0,
            OFFICER: 1.5,
            CORE_MEMBER: 1.2,
            ELITE_MEMBER: 1.1,
            MEMBER: 1.0,
          },
          activeShareModel: "RANK_WEIGHTED",
        },
      },
    },
  });

  const guild2 = await prisma.guild.create({
    data: {
      name: "Sausage",
      slug: "sausage",
      description: "Competitive PvP faction. Diamond-based economy.",
      inviteCode: "SAU-JOIN-8B32", // Testing code
      settings: {
        create: {
          currencyCode: "DIAMOND",
          currencySymbol: "💎",
          secondaryCurrencyCode: "PHP",
          secondaryCurrencySymbol: "₱",
          taxRatePercent: 15,
          attendancePoints: 15,
          bossKillPoints: 75,
          rankMultipliers: {
            GUILD_LEADER: 2.5,
            OFFICER: 1.8,
            CORE_MEMBER: 1.3,
            MEMBER: 1.0,
          },
          activeShareModel: "DKP",
        },
      },
    },
  });

  // ─── Guild Members ────────────────────────────────
  // Add SuperAdmin to Valhalla as ADMIN (highest platform authority)
  await prisma.guildMember.create({
    data: {
      userId: superAdmin.id,
      guildId: guild1.id,
      role: "ADMIN",
      rankName: "Super Admin",
      ign: "SuperAdmin",
      cp: 130000,
      class: "Destroyer",
      weapon: "Staff",
      isActive: true,
      memberCode: "MEM-VAL-ADMIN-001",
    },
  });

  // ─── Platform Admin (SaaS-level Super Admin) ──────
  // Grants access to the platform-wide Super Admin area (separate from guild roles).
  await prisma.platformAdmin.create({
    data: {
      userId: superAdmin.id,
      role: "SUPER_ADMIN",
      isActive: true,
    },
  });

  // ─── Initial Boss Schedules ─────────────────────────
  const mockSchedule1 = await prisma.bossSchedule.create({
    data: {
      guildId: guild1.id,
      bossName: "Viorent",
      location: "Crescent Lake",
      spawnTime: new Date(Date.now() - 2 * 3600 * 1000), // Spawned 2 hours ago
      status: "KILLED",
      killedAt: new Date(Date.now() - 1.5 * 3600 * 1000), // Killed 1.5 hours ago
      creatorId: superAdmin.id,
      lootDrop: "Staff",
    },
  });

  await prisma.bossSchedule.create({
    data: {
      guildId: guild1.id,
      bossName: "Venatus",
      location: "Corrupted Basin",
      spawnTime: new Date(Date.now() + 4 * 3600 * 1000), // Spawns in 4 hours
      status: "UPCOMING",
      creatorId: superAdmin.id,
    },
  });

  // ─── Realistic Ledger Entries (PHP splits & Attendance) ─
  // DKP Attendance Check-in points (ATTENDANCE referenceType)
  await prisma.ledgerEntry.create({
    data: {
      guildId: guild1.id,
      accountType: "MEMBER",
      accountId: superAdmin.id,
      currency: "PHP",
      amount: 150n, // 150 DKP points total
      entryType: "CREDIT",
      referenceType: "ATTENDANCE",
      referenceId: "attendance-session-1",
      idempotencyKey: "idem-att-admin-1",
      actorId: superAdmin.id,
      description: "Attendance Check-In: Viorent Raid",
    },
  });

  // Boss Kill loot sale payout split (BOSS_KILL referenceType)
  await prisma.ledgerEntry.create({
    data: {
      guildId: guild1.id,
      accountType: "MEMBER",
      accountId: superAdmin.id,
      currency: "PHP",
      amount: 350050n, // 3500.50 PHP
      entryType: "CREDIT",
      referenceType: "BOSS_KILL",
      referenceId: mockSchedule1.id,
      idempotencyKey: "idem-bk-admin-1",
      actorId: superAdmin.id,
      description: "Boss Defeated Payout Split: Viorent",
    },
  });

  // ─── Initial Audit Logs ────────────────────────────
  await prisma.auditLog.create({
    data: {
      actorId: superAdmin.id,
      guildId: guild1.id,
      action: "BOSS_KILLED_LOGGED",
      target: "BossSchedule",
      targetId: mockSchedule1.id,
      detail: {
        bossName: "Viorent",
        killedAt: new Date(Date.now() - 1.5 * 3600 * 1000).toISOString(),
        lootDrop: "Viorent Archmage Staff",
      },
    },
  });


  // ─── Predefined Bosses ─────────────────────────────
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

  console.log("✅ Seed completed successfully!");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
