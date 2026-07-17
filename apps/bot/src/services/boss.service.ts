import { PREDEFINED_BOSSES, getRealtimeBossTimer } from "@guild/shared";
// The core package exposes its services as one namespace object rather than
// flat exports — same entrypoint the website's Hono routes use.
import { services as core } from "@guild/core";
import type { AliasRepository } from "../repositories/alias.repository.js";
import type { BossRepository, UpcomingSpawn } from "../repositories/boss.repository.js";
import { UnknownBossError } from "../utils/errors.js";

export interface ResolvedSpawn extends UpcomingSpawn {
  /** True when the boss is up right now. */
  live: boolean;
  /** Countdown to the next spawn ("HH:MM:SS"), or the literal "LIVE" when up. */
  timerText: string;
  /** How long the boss has been up ("MM:SS"/"HH:MM:SS"); empty when not live. */
  liveElapsedText: string;
  /** Projected next spawn — may differ from spawnTime once overdue. */
  nextSpawn: Date;
}

/** The schedule row a kill just rolled forward to, resolved for display. */
export interface KillNextSpawn {
  scheduleId: string;
  nextSpawn: Date;
  guildTurn: string | null;
  live: boolean;
}

/**
 * Boss reads + the kill write path.
 *
 * Every respawn calculation delegates to @guild/shared, which the website also
 * uses. That is the whole point: the bot cannot drift from the site's timers,
 * because there is only one implementation of the rules.
 */
export class BossService {
  constructor(
    private readonly bosses: BossRepository,
    private readonly aliases: AliasRepository,
  ) {}

  /**
   * Resolve user input to a canonical registry boss name.
   *
   * Precedence: exact (case-insensitive) → server alias → global alias →
   * unique prefix. Prefix matching only resolves when exactly one boss matches,
   * so `!kill l` is an error rather than a coin-flip between Livera and Larba.
   */
  async resolveBossName(input: string, discordServerId: string): Promise<string> {
    const query = input.trim().toLowerCase();
    if (!query) throw new UnknownBossError(input);

    const exact = PREDEFINED_BOSSES.find((b) => b.name.toLowerCase() === query);
    if (exact) return exact.name;

    const aliases = await this.aliases.listForServer(discordServerId);

    // Server-scoped aliases override globals with the same name.
    const scoped = aliases.find((a) => a.alias === query && a.discordServerId !== null);
    const global = aliases.find((a) => a.alias === query && a.discordServerId === null);
    const matched = scoped ?? global;

    if (matched) {
      // An alias may point at a boss that was later renamed/removed from the
      // registry. Verify rather than trusting stored text.
      const target = PREDEFINED_BOSSES.find(
        (b) => b.name.toLowerCase() === matched.bossName.toLowerCase(),
      );
      if (target) return target.name;
    }

    const prefixed = PREDEFINED_BOSSES.filter((b) => b.name.toLowerCase().startsWith(query));
    if (prefixed.length === 1) return prefixed[0]!.name;

    // Ambiguous or unknown — offer the near-misses rather than a bare "no".
    const suggestions = (prefixed.length > 1 ? prefixed : this.fuzzyMatches(query))
      .slice(0, 5)
      .map((b) => b.name);

    throw new UnknownBossError(input, suggestions);
  }

  /** Bosses whose name contains the query — a cheap "did you mean". */
  private fuzzyMatches(query: string) {
    return PREDEFINED_BOSSES.filter((b) => b.name.toLowerCase().includes(query));
  }

  /**
   * Upcoming spawns for a guild, enriched with live/countdown state computed by
   * the same @guild/shared helper the website's boss cards use.
   */
  async listUpcoming(params: {
    guildId: string;
    bossName?: string;
    now?: Date;
  }): Promise<ResolvedSpawn[]> {
    const now = params.now ?? new Date();
    const factionGuildIds = await this.bosses.getFactionGuildIds(params.guildId);

    const rows = await this.bosses.listUpcoming({
      guildId: params.guildId,
      factionGuildIds,
      ...(params.bossName ? { bossName: params.bossName } : {}),
    });

    return rows.map((row) => {
      const timer = getRealtimeBossTimer(row.bossName, row.spawnTime.toISOString(), now.getTime(), {
        status: row.status,
      });

      return {
        ...row,
        live: timer.live,
        timerText: timer.text,
        liveElapsedText: timer.liveElapsedText,
        nextSpawn: new Date(timer.nextSpawn),
      };
    });
  }

  /**
   * Record a kill.
   *
   * Delegates wholesale to @guild/core rather than writing boss_schedules here.
   * That service already: authorizes the actor, advances the faction rotation
   * queue, computes the next spawn, writes the audit log, and broadcasts the
   * realtime event the website listens on. Reimplementing any of it in the bot
   * would be the duplicated logic the brief forbids — and would silently
   * desync the two clients.
   *
   * Returns the exact schedule row the write path just rolled forward to,
   * taken from its own return value rather than re-querying afterward. A
   * broad re-query (`listUpcoming` + take the first result) is fragile
   * whenever more than one open schedule can exist for the same boss — e.g. a
   * leftover faction-unified row alongside a freshly created guild-scoped one
   * — because "first" depends on sort order, and a stale, already-elapsed row
   * can sort ahead of the correct one. Using the write's own result sidesteps
   * that ambiguity entirely: there's no guessing which row is authoritative.
   */
  async recordKill(params: {
    guildId: string;
    bossName: string;
    killedAt: Date;
    actorId: string;
    takenGuildId?: string;
  }): Promise<{ nextSpawn: KillNextSpawn | null }> {
    const result = await core.dashboard.markBossRotationKilledByName(
      params.guildId,
      params.bossName,
      params.killedAt.toISOString(),
      // Which guild took the boss. Defaults to the actor's own guild — the
      // overwhelmingly common case for a kill reported from that guild's server.
      params.takenGuildId ?? params.guildId,
      params.actorId,
      // ipAddress/userAgent: the audit log's request-provenance fields. A
      // Discord message has neither, so mark the channel instead of inventing
      // a plausible-looking IP.
      undefined,
      "discord-bot",
    );

    const next = result.nextSchedule;
    if (!next) return { nextSpawn: null };

    // Same live/countdown projection every other read uses — a freshly rolled
    // schedule can itself already be "live" (e.g. a fixed-schedule boss whose
    // computed next slot falls within the live-grace window), so this still
    // needs the shared timer, not just the raw spawnTime.
    const timer = getRealtimeBossTimer(next.bossName, next.spawnTime, Date.now(), {
      status: next.status,
    });

    return {
      nextSpawn: {
        scheduleId: next.id,
        nextSpawn: new Date(timer.nextSpawn),
        guildTurn: next.guildTurnGuildName ?? next.guildTurn ?? null,
        live: timer.live,
      },
    };
  }

  /**
   * Force bosses live now (`!forcespawn` / `!forcespawnall`).
   * Empty `bossNames` ⇒ every fixed-schedule boss.
   */
  async forceSpawn(params: {
    guildId: string;
    bossNames: string[];
    actorId: string;
  }): Promise<void> {
    await core.dashboard.forceSpawnBosses(
      params.guildId,
      params.actorId,
      params.bossNames,
      undefined,
      "discord-bot",
    );
  }

  /**
   * Correct a logged kill's timestamp and roll the next spawn forward from it
   * (`!editkilltime`). The queue is deliberately not re-advanced — see
   * `editBossKillTime` in @guild/core.
   */
  async editKillTime(params: {
    guildId: string;
    bossName: string;
    killedAt: Date;
    actorId: string;
  }) {
    return core.dashboard.editBossKillTime(
      params.guildId,
      params.bossName,
      params.killedAt.toISOString(),
      params.actorId,
      undefined,
      "discord-bot",
    );
  }

  /** Registry metadata (level, location, cooldown) for embeds. */
  getRegistryBoss(bossName: string) {
    return PREDEFINED_BOSSES.find((b) => b.name.toLowerCase() === bossName.toLowerCase()) ?? null;
  }

  /**
   * The current (nearest upcoming, not-yet-killed) schedule row for a boss —
   * what `!attendance <boss>` attaches a smart-attendance session to, so the
   * website renders the real boss card instead of a generic session.
   */
  async findScheduleForBoss(bossName: string, guildId: string): Promise<UpcomingSpawn | null> {
    const factionGuildIds = await this.bosses.getFactionGuildIds(guildId);
    return this.bosses.findLiveSchedule({
      bossName,
      scopeGuildIds: factionGuildIds.length > 0 ? factionGuildIds : [guildId],
    });
  }

  /** Committed members for a spawn — backs `!party`. */
  async listParty(scheduleId: string) {
    return this.bosses.listCommitments(scheduleId);
  }
}
