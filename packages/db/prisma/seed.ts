import { PrismaClient } from "@prisma/client";


const prisma = new PrismaClient();

async function main() {

  // ─── Truncate all tables (order matters for FK constraints) ───
  // Children first, then parents
  await prisma.lootSale.deleteMany();
  await prisma.auctionBid.deleteMany();
  await prisma.auctionItem.deleteMany();
  await prisma.itemRequest.deleteMany();
  await prisma.guildPointsSnapshot.deleteMany();
  await prisma.attendanceRecord.deleteMany();
  await prisma.attendanceSession.deleteMany();
  await prisma.bossSchedule.deleteMany();
  await prisma.boss.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.ledgerEntry.deleteMany();
  await prisma.guildJoinRequest.deleteMany();
  await prisma.guildMember.deleteMany();
  await prisma.guildSettings.deleteMany();
  await prisma.guild.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.session.deleteMany();
  await prisma.passwordResetToken.deleteMany();
  await prisma.user.deleteMany();

  // ─── Users ───────────────────────────────────────
  // Password: "Admin123!" for all (bcrypt hash, 12 rounds)
  const passwordHash =
    "$2a$12$.oif3hOd38kI/VLuLWyyyOcrX1b3TF2TVsoY2JJi7faKQyndAngpO";

  const admin = await prisma.user.create({
    data: {
      email: "admin@guildmaster.dev",
      passwordHash,
      displayName: "Mavis08",
      avatarUrl: "https://images.unsplash.com/photo-1578632767115-351597cf2477?q=80&w=256&auto=format&fit=crop", // Gorgeous cute anime PFP
      ign: "Mavis08",
      cp: 120000,
      class: "Destroyer",
      weapon: "Staff",
    },
  });

  const factionLeader = await prisma.user.create({
    data: {
      email: "faction.leader@guildmaster.dev",
      passwordHash,
      displayName: "FactionLead",
      avatarUrl: "https://images.unsplash.com/photo-1568602471122-7832951cc4c5?q=80&w=256&auto=format&fit=crop",
      ign: "FactionLead",
      cp: 115000,
      class: "Destroyer",
      weapon: "Greatsword",
    },
  });

  const player1 = await prisma.user.create({
    data: {
      email: "Dragz69@guildmaster.dev",
      passwordHash,
      displayName: "Dragz69",
      avatarUrl: "https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=256&auto=format&fit=crop",
      ign: "Dragz69",
      cp: 98000,
      class: "Hunter",
      weapon: "Sword and Shield",
    },
  });

  const player2 = await prisma.user.create({
    data: {
      email: "Wiz@guildmaster.dev",
      passwordHash,
      displayName: "Wiz",
      avatarUrl: "https://images.unsplash.com/photo-1566492031773-4f4e44671857?q=80&w=256&auto=format&fit=crop",
      ign: "Wiz",
      cp: 95000,
      class: "Immortal Knight",
      weapon: "Dual Dagger",
    },
  });

  const player3 = await prisma.user.create({
    data: {
      email: "Daylili@guildmaster.dev",
      passwordHash,
      displayName: "Daylili",
      avatarUrl: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=256&auto=format&fit=crop",
      ign: "Daylili",
      cp: 75000,
      class: "Striker",
      weapon: "Greatsword",
    },
  });

  const player4 = await prisma.user.create({
    data: {
      email: "Hou13@guildmaster.dev",
      passwordHash,
      displayName: "Hou13",
      avatarUrl: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?q=80&w=256&auto=format&fit=crop",
      ign: "Hou13",
      cp: 88000,
      class: "Destroyer",
      weapon: "XBow",
    },
  });

  const player5 = await prisma.user.create({
    data: {
      email: "Lael@guildmaster.dev",
      passwordHash,
      displayName: "Lael",
      avatarUrl: "https://images.unsplash.com/photo-1580489944761-15a19d654956?q=80&w=256&auto=format&fit=crop",
      ign: "Lael",
      cp: 85000,
      class: "Blitzblade",
      weapon: "Dual Dagger",
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
  // Add admin (Mavis08) to Valhalla as ADMIN
  await prisma.guildMember.create({
    data: {
      userId: admin.id,
      guildId: guild1.id,
      role: "ADMIN",
      rankName: "Admin",
      ign: "Mavis08",
      cp: 120000,
      class: "Destroyer",
      weapon: "Staff",
      isActive: true,
      memberCode: "MEM-VAL-001",
    },
  });

  // Add FactionLead to Valhalla as FACTION_LEADER
  await prisma.guildMember.create({
    data: {
      userId: factionLeader.id,
      guildId: guild1.id,
      role: "FACTION_LEADER",
      rankName: "Faction Leader",
      ign: "FactionLead",
      cp: 115000,
      class: "Warlord",
      weapon: "Greatsword",
      isActive: true,
      memberCode: "MEM-VAL-FACTION-001",
    },
  });

  // Add Dragz69 to Valhalla as OFFICER
  await prisma.guildMember.create({
    data: {
      userId: player1.id,
      guildId: guild1.id,
      role: "OFFICER",
      rankName: "Officer",
      ign: "Dragz69",
      cp: 98000,
      class: "Hunter",
      weapon: "Sword and Shield",
      isActive: true,
      memberCode: "MEM-VAL-002",
    },
  });

  // Add Wiz to Valhalla as OFFICER and Sausage as GUILD_LEADER
  await prisma.guildMember.create({
    data: {
      userId: player2.id,
      guildId: guild1.id,
      role: "OFFICER",
      rankName: "Officer",
      ign: "Wiz",
      cp: 95000,
      class: "Immortal Knight",
      weapon: "Dual Dagger",
      isActive: true,
      memberCode: "MEM-VAL-003",
    },
  });

  await prisma.guildMember.create({
    data: {
      userId: player2.id,
      guildId: guild2.id,
      role: "GUILD_LEADER",
      rankName: "Guild Master",
      ign: "Wiz",
      cp: 95000,
      class: "Immortal Knight",
      weapon: "Dual Dagger",
      isActive: true,
      memberCode: "MEM-SAU-001",
    },
  });

  // Add Daylili to Valhalla as MEMBER
  await prisma.guildMember.create({
    data: {
      userId: player3.id,
      guildId: guild1.id,
      role: "MEMBER",
      rankName: "Lower Rank",
      ign: "Daylili",
      cp: 75000,
      class: "Striker",
      weapon: "Greatsword",
      isActive: true,
      memberCode: "MEM-VAL-004",
    },
  });

  // Add Hou13 to Valhalla as CORE_MEMBER
  await prisma.guildMember.create({
    data: {
      userId: player4.id,
      guildId: guild1.id,
      role: "CORE_MEMBER",
      rankName: "Core Member",
      ign: "Hou13",
      cp: 88000,
      class: "Destroyer",
      weapon: "XBow",
      isActive: true,
      memberCode: "MEM-VAL-005",
    },
  });

  // Add Lael to Valhalla as ELITE_MEMBER
  await prisma.guildMember.create({
    data: {
      userId: player5.id,
      guildId: guild1.id,
      role: "ELITE_MEMBER",
      rankName: "Elite Member",
      ign: "Lael",
      cp: 85000,
      class: "Blitzblade",
      weapon: "Dual Dagger",
      isActive: true,
      memberCode: "MEM-VAL-006",
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
      creatorId: admin.id,
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
      creatorId: admin.id,
    },
  });

  // ─── Realistic Ledger Entries (PHP splits & Attendance) ─
  // DKP Attendance Check-in points (ATTENDANCE referenceType)
  await prisma.ledgerEntry.create({
    data: {
      guildId: guild1.id,
      accountType: "MEMBER",
      accountId: admin.id,
      currency: "PHP",
      amount: 150n, // 150 DKP points total
      entryType: "CREDIT",
      referenceType: "ATTENDANCE",
      referenceId: "attendance-session-1",
      idempotencyKey: "idem-att-admin-1",
      actorId: admin.id,
      description: "Attendance Check-In: Viorent Raid",
    },
  });

  await prisma.ledgerEntry.create({
    data: {
      guildId: guild1.id,
      accountType: "MEMBER",
      accountId: player2.id, // Wiz
      currency: "PHP",
      amount: 120n,
      entryType: "CREDIT",
      referenceType: "ATTENDANCE",
      referenceId: "attendance-session-1",
      idempotencyKey: "idem-att-wiz-1",
      actorId: admin.id,
      description: "Attendance Check-In: Viorent Raid",
    },
  });

  // Boss Kill loot sale payout splits (BOSS_KILL referenceType)
  // Let's credit the admin 3500.50 PHP balance
  await prisma.ledgerEntry.create({
    data: {
      guildId: guild1.id,
      accountType: "MEMBER",
      accountId: admin.id,
      currency: "PHP",
      amount: 350050n, // 3500.50 PHP
      entryType: "CREDIT",
      referenceType: "BOSS_KILL",
      referenceId: mockSchedule1.id,
      idempotencyKey: "idem-bk-admin-1",
      actorId: admin.id,
      description: "Boss Defeated Payout Split: Viorent",
    },
  });

  await prisma.ledgerEntry.create({
    data: {
      guildId: guild1.id,
      accountType: "MEMBER",
      accountId: player2.id, // Wiz
      currency: "PHP",
      amount: 280020n, // 2800.20 PHP
      entryType: "CREDIT",
      referenceType: "BOSS_KILL",
      referenceId: mockSchedule1.id,
      idempotencyKey: "idem-bk-wiz-1",
      actorId: admin.id,
      description: "Boss Defeated Payout Split: Viorent",
    },
  });

  // ─── Initial Audit Logs ────────────────────────────
  await prisma.auditLog.create({
    data: {
      actorId: admin.id,
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

  await prisma.auditLog.create({
    data: {
      actorId: admin.id,
      guildId: guild1.id,
      action: "MEMBER_ADDED",
      target: "GuildMember",
      targetId: player2.id,
      detail: {
        displayName: "Wiz",
        role: "OFFICER",
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
