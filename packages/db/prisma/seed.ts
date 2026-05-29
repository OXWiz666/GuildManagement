import { PrismaClient, GuildRole } from "@prisma/client";
import * as crypto from "crypto";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database...\n");

  // ─── Clean existing data ─────────────────────────
  await prisma.boss.deleteMany();
  await prisma.bossSchedule.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.ledgerEntry.deleteMany();
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
      displayName: "Guild Admin",
      avatarUrl: null,
    },
  });
  console.log(`✅ Created admin user: ${admin.email}`);

  const player1 = await prisma.user.create({
    data: {
      email: "player1@guildmaster.dev",
      passwordHash,
      displayName: "DragonSlayer99",
    },
  });
  console.log(`✅ Created player: ${player1.email}`);

  const player2 = await prisma.user.create({
    data: {
      email: "player2@guildmaster.dev",
      passwordHash,
      displayName: "ShadowMage",
    },
  });
  console.log(`✅ Created player: ${player2.email}`);

  const player3 = await prisma.user.create({
    data: {
      email: "player3@guildmaster.dev",
      passwordHash,
      displayName: "TankLord",
    },
  });
  console.log(`✅ Created player: ${player3.email}`);

  const player4 = await prisma.user.create({
    data: {
      email: "player4@guildmaster.dev",
      passwordHash,
      displayName: "HealerQueen",
    },
  });
  console.log(`✅ Created player: ${player4.email}`);

  const player5 = await prisma.user.create({
    data: {
      email: "player5@guildmaster.dev",
      passwordHash,
      displayName: "StormArcher",
    },
  });
  console.log(`✅ Created player: ${player5.email}`);

  // ─── Guilds ──────────────────────────────────────
  const guild1 = await prisma.guild.create({
    data: {
      name: "Dragon Knights",
      slug: "dragon-knights",
      description:
        "Elite PvE guild focused on boss raids and world events. Philippine-based.",
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
  console.log(`✅ Created guild: ${guild1.name}`);

  const guild2 = await prisma.guild.create({
    data: {
      name: "Shadow Alliance",
      slug: "shadow-alliance",
      description: "Competitive PvP faction. Diamond-based economy.",
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
  console.log(`✅ Created guild: ${guild2.name}`);

  // ─── Guild Memberships ───────────────────────────
  // admin is GUILD_LEADER in guild1, OFFICER in guild2 (multi-tenant roles)
  await prisma.guildMember.createMany({
    data: [
      {
        userId: admin.id,
        guildId: guild1.id,
        role: GuildRole.GUILD_LEADER,
        rankName: "Guild Leader",
        ign: "GuildAdmin",
        cp: 85000,
        class: "Paladin",
        weapon: "Divine Sword",
        memberCode: "DK-001",
      },
      {
        userId: admin.id,
        guildId: guild2.id,
        role: GuildRole.OFFICER,
        rankName: "Officer",
        ign: "GuildAdmin",
        cp: 82000,
        class: "Paladin",
        weapon: "Divine Sword",
        memberCode: "SA-001",
      },
      {
        userId: player1.id,
        guildId: guild1.id,
        role: GuildRole.OFFICER,
        rankName: "Officer",
        ign: "DragonSlyr",
        cp: 72000,
        class: "Berserker",
        weapon: "Flame Axe",
        memberCode: "DK-002",
      },
      {
        userId: player1.id,
        guildId: guild2.id,
        role: GuildRole.GUILD_LEADER,
        rankName: "Guild Leader",
        ign: "DragonSlyr",
        cp: 72000,
        class: "Berserker",
        weapon: "Flame Axe",
        memberCode: "SA-002",
      },
      {
        userId: player2.id,
        guildId: guild1.id,
        role: GuildRole.CORE_MEMBER,
        rankName: "Core",
        ign: "ShdwMage",
        cp: 65000,
        class: "Mage",
        weapon: "Staff of Shadows",
        memberCode: "DK-003",
      },
      {
        userId: player3.id,
        guildId: guild1.id,
        role: GuildRole.MEMBER,
        rankName: "Lower Rank",
        ign: "TankLrd",
        cp: 48000,
        class: "Guardian",
        weapon: "Aegis Shield",
        memberCode: "DK-004",
      },
      {
        userId: player3.id,
        guildId: guild2.id,
        role: GuildRole.MEMBER,
        rankName: "Lower Rank",
        ign: "TankLrd",
        cp: 48000,
        class: "Guardian",
        weapon: "Aegis Shield",
        memberCode: "SA-003",
      },
      {
        userId: player4.id,
        guildId: guild1.id,
        role: GuildRole.ELITE_MEMBER,
        rankName: "Higher Rank",
        ign: "HealQueen",
        cp: 55000,
        class: "Priest",
        weapon: "Holy Staff",
        memberCode: "DK-005",
      },
      {
        userId: player5.id,
        guildId: guild1.id,
        role: GuildRole.MEMBER,
        rankName: "Lower Rank",
        ign: "StrmArcher",
        cp: 42000,
        class: "Ranger",
        weapon: "Windwalker Bow",
        memberCode: "DK-006",
      },
    ],
  });
  console.log("✅ Created guild memberships");

  // ─── Sample Ledger Entries ───────────────────────
  // Demonstrates immutable ledger — balances are derived from these
  const ledgerData = [
    // Guild1 boss kill payout: 10,000 PHP (100_00 cents) total
    {
      guildId: guild1.id,
      accountType: "GUILD_FUND" as const,
      accountId: guild1.id,
      currency: "PHP",
      amount: BigInt(100000), // 1000.00 PHP in cents
      entryType: "CREDIT" as const,
      referenceType: "BOSS_KILL",
      referenceId: "boss-event-001",
      idempotencyKey: `boss-event-001-guild-fund`,
      actorId: admin.id,
      description: "World Boss: Ancient Dragon defeated — guild fund share",
    },
    // Tax collected
    {
      guildId: guild1.id,
      accountType: "TAX" as const,
      accountId: guild1.id,
      currency: "PHP",
      amount: BigInt(10000), // 100.00 PHP
      entryType: "CREDIT" as const,
      referenceType: "BOSS_KILL",
      referenceId: "boss-event-001",
      idempotencyKey: `boss-event-001-tax`,
      actorId: admin.id,
      description: "10% tax on boss kill payout",
    },
    // Member payouts
    {
      guildId: guild1.id,
      accountType: "MEMBER" as const,
      accountId: player1.id,
      currency: "PHP",
      amount: BigInt(30000), // 300.00 PHP
      entryType: "CREDIT" as const,
      referenceType: "BOSS_KILL",
      referenceId: "boss-event-001",
      idempotencyKey: `boss-event-001-${player1.id}`,
      actorId: admin.id,
      description: "Boss kill share (Officer multiplier: 1.5x)",
    },
    {
      guildId: guild1.id,
      accountType: "MEMBER" as const,
      accountId: player2.id,
      currency: "PHP",
      amount: BigInt(24000), // 240.00 PHP
      entryType: "CREDIT" as const,
      referenceType: "BOSS_KILL",
      referenceId: "boss-event-001",
      idempotencyKey: `boss-event-001-${player2.id}`,
      actorId: admin.id,
      description: "Boss kill share (Core multiplier: 1.2x)",
    },
    {
      guildId: guild1.id,
      accountType: "MEMBER" as const,
      accountId: player3.id,
      currency: "PHP",
      amount: BigInt(20000), // 200.00 PHP
      entryType: "CREDIT" as const,
      referenceType: "BOSS_KILL",
      referenceId: "boss-event-001",
      idempotencyKey: `boss-event-001-${player3.id}`,
      actorId: admin.id,
      description: "Boss kill share (Member multiplier: 1.0x)",
    },
    // A payout/withdrawal from player1
    {
      guildId: guild1.id,
      accountType: "MEMBER" as const,
      accountId: player1.id,
      currency: "PHP",
      amount: BigInt(15000), // 150.00 PHP
      entryType: "DEBIT" as const,
      referenceType: "PAYOUT",
      referenceId: "payout-001",
      idempotencyKey: `payout-001-${player1.id}`,
      actorId: player1.id,
      description: "Cash out to GCash",
    },
  ];

  for (const entry of ledgerData) {
    await prisma.ledgerEntry.create({ data: entry });
  }
  console.log(`✅ Created ${ledgerData.length} ledger entries`);

  // ─── Sample Audit Logs ───────────────────────────
  const auditData = [
    {
      actorId: admin.id,
      action: "GUILD_CREATED",
      target: "Guild",
      targetId: guild1.id,
      detail: { guildName: guild1.name },
    },
    {
      actorId: admin.id,
      action: "GUILD_CREATED",
      target: "Guild",
      targetId: guild2.id,
      detail: { guildName: guild2.name },
    },
    {
      actorId: admin.id,
      guildId: guild1.id,
      action: "MEMBER_ADDED",
      target: "GuildMember",
      targetId: player1.id,
      detail: { role: "OFFICER", displayName: "DragonSlayer99" },
    },
    {
      actorId: admin.id,
      guildId: guild1.id,
      action: "BOSS_KILL_RECORDED",
      target: "BossEvent",
      targetId: "boss-event-001",
      detail: {
        bossName: "Ancient Dragon",
        totalLoot: 100000,
        currency: "PHP",
      },
    },
    {
      actorId: player1.id,
      guildId: guild1.id,
      action: "PAYOUT_REQUESTED",
      target: "LedgerEntry",
      targetId: "payout-001",
      detail: { amount: 15000, currency: "PHP", method: "GCash" },
    },
  ];

  for (const log of auditData) {
    await prisma.auditLog.create({ data: log });
  }
  console.log(`✅ Created ${auditData.length} audit log entries`);

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
  console.log(`✅ Seeded ${predefinedBosses.length} predefined bosses into registry`);

  // ─── Verify derived balances ─────────────────────
  console.log("\n📊 Verifying derived balances:\n");

  const balances = await prisma.ledgerEntry.groupBy({
    by: ["accountType", "accountId", "currency"],
    _sum: { amount: true },
    where: {
      guildId: guild1.id,
      entryType: "CREDIT",
    },
  });

  const debits = await prisma.ledgerEntry.groupBy({
    by: ["accountType", "accountId", "currency"],
    _sum: { amount: true },
    where: {
      guildId: guild1.id,
      entryType: "DEBIT",
    },
  });

  console.log("Credits:", balances.map((b) => ({
    account: `${b.accountType}:${b.accountId.slice(0, 8)}...`,
    currency: b.currency,
    total: `${Number(b._sum.amount ?? 0n) / 100}`,
  })));

  console.log("Debits:", debits.map((d) => ({
    account: `${d.accountType}:${d.accountId.slice(0, 8)}...`,
    currency: d.currency,
    total: `${Number(d._sum.amount ?? 0n) / 100}`,
  })));

  console.log("\n✨ Seed complete!");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
