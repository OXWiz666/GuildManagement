-- Discord Bot integration — purely additive.
--
-- Design note on what is NOT here: the brief asked for `boss_kills` and
-- `boss_spawns` tables. Those already exist as ONE table — `boss_schedules`
-- (status UPCOMING|SPAWNED|KILLED + killed_at). Creating separate kill/spawn
-- tables would fork the source of truth and break the core requirement that a
-- bot write is instantly visible on the website. Likewise `guild_members`,
-- `guild_profiles` (= guilds/users) and `audit_logs` already exist and are
-- reused as-is. Only genuinely new concepts are created below.

-- ═══════════════════════════════════════════════════
-- DISCORD IDENTITY — links a Discord user to a ForgeKeep account.
-- Every write command (!kill, !cp, !forcespawn) resolves through this to a
-- User.id, which the existing @guild/core services take as `actorId` and
-- permission-check against guild membership. Without a link, a Discord user
-- has no identity and no rights.
-- ═══════════════════════════════════════════════════
ALTER TABLE "users" ADD COLUMN "discord_id" TEXT;
ALTER TABLE "users" ADD COLUMN "discord_username" TEXT;
ALTER TABLE "users" ADD COLUMN "discord_linked_at" TIMESTAMP(3);

-- One Discord account may link to at most one ForgeKeep account.
CREATE UNIQUE INDEX "users_discord_id_key" ON "users"("discord_id");

-- Short-lived one-time codes minted by the website ("Link Discord" button) and
-- redeemed in Discord via `!link <code>`. Proves account ownership without the
-- bot ever handling a password, and reuses the existing web session as the
-- trust anchor.
CREATE TABLE "discord_link_codes" (
    "code" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "consumed_by_discord_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "discord_link_codes_pkey" PRIMARY KEY ("code")
);

ALTER TABLE "discord_link_codes" ADD CONSTRAINT "discord_link_codes_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "discord_link_codes_user_id_idx" ON "discord_link_codes"("user_id");
CREATE INDEX "discord_link_codes_expires_at_idx" ON "discord_link_codes"("expires_at");

-- ═══════════════════════════════════════════════════
-- DISCORD SERVERS — binds a Discord guild to a ForgeKeep guild.
-- Scoping every command through this row is what keeps one Discord server from
-- reading or writing another tenant's data.
-- ═══════════════════════════════════════════════════
CREATE TABLE "discord_servers" (
    "id" TEXT NOT NULL,
    "discord_guild_id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    -- IANA zone used to interpret bare `!kill <boss> HH:MM` wall-clock input.
    -- Defaults to the game's server time (Singapore, UTC+8, no DST).
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Singapore',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "linked_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- No DB default: Prisma's @updatedAt supplies this on every write, matching
    -- the convention in every prior migration (see 0011/0012).
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "discord_servers_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "discord_servers" ADD CONSTRAINT "discord_servers_guild_id_fkey"
  FOREIGN KEY ("guild_id") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "discord_servers" ADD CONSTRAINT "discord_servers_linked_by_id_fkey"
  FOREIGN KEY ("linked_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "discord_servers_discord_guild_id_key" ON "discord_servers"("discord_guild_id");
CREATE INDEX "discord_servers_guild_id_idx" ON "discord_servers"("guild_id");

-- ═══════════════════════════════════════════════════
-- DISCORD CHANNELS — !notifhere / !cmdhere / !threadhere targets.
-- One channel per purpose per server; re-running a command overwrites (upsert
-- on the unique pair) rather than accumulating stale rows.
-- ═══════════════════════════════════════════════════
CREATE TABLE "discord_channels" (
    "id" TEXT NOT NULL,
    "discord_server_id" TEXT NOT NULL,
    "purpose" TEXT NOT NULL, -- NOTIFICATION | COMMAND | THREAD
    "channel_id" TEXT NOT NULL,
    "set_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "discord_channels_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "discord_channels" ADD CONSTRAINT "discord_channels_discord_server_id_fkey"
  FOREIGN KEY ("discord_server_id") REFERENCES "discord_servers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "discord_channels" ADD CONSTRAINT "discord_channels_set_by_id_fkey"
  FOREIGN KEY ("set_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "discord_channels_discord_server_id_purpose_key"
  ON "discord_channels"("discord_server_id", "purpose");

-- ═══════════════════════════════════════════════════
-- DISCORD ALIASES — nickname → registry boss name (e.g. "baron" → "Baron
-- Baraudmore"). A NULL discord_server_id makes the alias global; a server row
-- overrides the global one. Also read by `!commands` to render help.
-- ═══════════════════════════════════════════════════
CREATE TABLE "discord_aliases" (
    "id" TEXT NOT NULL,
    "discord_server_id" TEXT,
    "alias" TEXT NOT NULL, -- stored lowercase; lookups lowercase the input
    "boss_name" TEXT NOT NULL,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "discord_aliases_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "discord_aliases" ADD CONSTRAINT "discord_aliases_discord_server_id_fkey"
  FOREIGN KEY ("discord_server_id") REFERENCES "discord_servers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Two partial indexes rather than one: NULL never equals NULL in a unique
-- index, so a plain UNIQUE(discord_server_id, alias) would silently permit
-- duplicate global aliases.
CREATE UNIQUE INDEX "discord_aliases_server_alias_key"
  ON "discord_aliases"("discord_server_id", "alias") WHERE "discord_server_id" IS NOT NULL;
CREATE UNIQUE INDEX "discord_aliases_global_alias_key"
  ON "discord_aliases"("alias") WHERE "discord_server_id" IS NULL;

-- ═══════════════════════════════════════════════════
-- NOTIFICATION HISTORY — the deduplication primitive.
-- `dedupe_key` is UNIQUE: the sender inserts the key BEFORE sending and treats
-- a unique-violation as "already sent, skip". That makes dedup atomic at the
-- database level, so concurrent bot instances (or a restart mid-send) cannot
-- double-post the same 5-minute warning or spawn alert. Redis is a cache in
-- front of this, never the authority.
-- ═══════════════════════════════════════════════════
CREATE TABLE "notification_history" (
    "id" TEXT NOT NULL,
    "discord_server_id" TEXT,
    "guild_id" TEXT,
    "kind" TEXT NOT NULL, -- SPAWN_WARNING | SPAWN | KILL | CP_UPDATE | MAINTENANCE | ANNOUNCEMENT
    "dedupe_key" TEXT NOT NULL,
    "channel_id" TEXT,
    "message_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING', -- PENDING | SENT | FAILED
    "error" TEXT,
    "payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMP(3),
    CONSTRAINT "notification_history_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "notification_history" ADD CONSTRAINT "notification_history_discord_server_id_fkey"
  FOREIGN KEY ("discord_server_id") REFERENCES "discord_servers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "notification_history" ADD CONSTRAINT "notification_history_guild_id_fkey"
  FOREIGN KEY ("guild_id") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "notification_history_dedupe_key_key" ON "notification_history"("dedupe_key");
-- Index names below follow Prisma's default naming (<table>_<cols>_idx) so that
-- `prisma migrate diff` reports zero drift against schema.prisma.
CREATE INDEX "notification_history_kind_created_at_idx" ON "notification_history"("kind", "created_at");
CREATE INDEX "notification_history_discord_server_id_created_at_idx" ON "notification_history"("discord_server_id", "created_at");

-- ═══════════════════════════════════════════════════
-- COMBAT POWER — history + provenance.
-- guild_members.cp already exists as a bare Int with no audit trail. Add
-- who/when to the member row (for cheap reads: `!cp` shows "last updated"),
-- and an append-only history table (for `!cp history` and growth stats).
-- ═══════════════════════════════════════════════════
ALTER TABLE "guild_members" ADD COLUMN "cp_updated_at" TIMESTAMP(3);
ALTER TABLE "guild_members" ADD COLUMN "cp_updated_by_id" TEXT;

ALTER TABLE "guild_members" ADD CONSTRAINT "guild_members_cp_updated_by_id_fkey"
  FOREIGN KEY ("cp_updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "guild_members_cp_updated_by_id_idx" ON "guild_members"("cp_updated_by_id");

CREATE TABLE "combat_power_history" (
    "id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "old_cp" INTEGER,
    "new_cp" INTEGER NOT NULL,
    -- Denormalized (new_cp - old_cp). Stored rather than computed so growth
    -- queries stay a plain SUM and never have to window over the whole table.
    "delta" INTEGER,
    "source" TEXT NOT NULL DEFAULT 'DISCORD', -- DISCORD | WEB | SYSTEM
    -- Brief explicitly requires the raw Discord user id of the updater.
    -- The canonical actor is `actor_id`; this is the Discord-side provenance.
    "actor_id" TEXT,
    "actor_discord_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "combat_power_history_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "combat_power_history" ADD CONSTRAINT "combat_power_history_guild_id_fkey"
  FOREIGN KEY ("guild_id") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "combat_power_history" ADD CONSTRAINT "combat_power_history_member_id_fkey"
  FOREIGN KEY ("member_id") REFERENCES "guild_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "combat_power_history" ADD CONSTRAINT "combat_power_history_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "combat_power_history" ADD CONSTRAINT "combat_power_history_actor_id_fkey"
  FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- `!cp history` for one member, newest first.
CREATE INDEX "combat_power_history_member_id_created_at_idx" ON "combat_power_history"("member_id", "created_at" DESC);
-- Guild-wide growth windows (weekly/monthly stats jobs).
CREATE INDEX "combat_power_history_guild_id_created_at_idx" ON "combat_power_history"("guild_id", "created_at" DESC);

-- ═══════════════════════════════════════════════════
-- GUILD CP SNAPSHOTS — periodic aggregates for the scheduled CP monitor.
-- Precomputed so trend/growth reads never re-scan combat_power_history.
-- ═══════════════════════════════════════════════════
CREATE TABLE "guild_cp_snapshots" (
    "id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "highest_cp" INTEGER,
    "lowest_cp" INTEGER,
    "average_cp" INTEGER,
    "total_cp" BIGINT,
    "members_counted" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "guild_cp_snapshots_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "guild_cp_snapshots" ADD CONSTRAINT "guild_cp_snapshots_guild_id_fkey"
  FOREIGN KEY ("guild_id") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "guild_cp_snapshots_guild_id_created_at_idx" ON "guild_cp_snapshots"("guild_id", "created_at" DESC);

-- Leaderboard / stats read path: `!cp leaderboard` sorts active members by cp.
-- Partial (active only) and DESC NULLS LAST to match the query exactly.
CREATE INDEX "guild_members_guild_cp_idx"
  ON "guild_members"("guild_id", "cp" DESC NULLS LAST) WHERE "is_active" = true;
