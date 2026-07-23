import { PREDEFINED_BOSSES, getRealtimeBossTimer } from "@guild/shared";
// The core package exposes its services as one namespace object rather than
// flat exports — same entrypoint the website's Hono routes use.
import { services as core } from "@guild/core";
import type { AliasRepository } from "../repositories/alias.repository.js";
import type { BossRepository, UpcomingActivity, UpcomingSpawn } from "../repositories/boss.repository.js";
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

/** Result of matching freeform `!kill <boss> <item>` text against the live drop catalog. */
export interface MatchedDropItem {
  bucket: string;
  path: string;
  itemName: string;
  iconUrl: string;
}

export interface DropCatalogNameItem {
  itemName: string;
  type: string;
  category: string | null;
  rarity: string | null;
}

export type ResolvedActivity = UpcomingActivity;

// Catalog item names are short, clean, human-typed text (unlike OCR'd rally
// screenshots), so a plain normalized-Levenshtein ratio is enough — no need
// for the pixel/confidence signals smartAttendance.service.ts's word matcher uses.
const MIN_DROP_MATCH_SCORE = 0.72;

function normalizeItemText(input: string): string {
  return input.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function stripExt(name: string): string {
  return name.replace(/\.(png|jpe?g|webp)$/i, "");
}

function pathLeaf(path: string): string {
  return stripExt(path.split("/").filter(Boolean).pop() ?? "");
}

function catalogNameCandidates(item: { itemName: string; path: string }): string[] {
  return Array.from(new Set([item.itemName, pathLeaf(item.path)].filter(Boolean)));
}

function itemNameScore(a: string, b: string): number {
  if (a === b) return 1;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 0;
  if (a.length >= 4 && b.includes(a)) return a.length / b.length;
  if (b.length >= 4 && a.includes(b)) return b.length / a.length;
  return 1 - levenshtein(a, b) / maxLen;
}

function levenshtein(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  const curr = Array.from({ length: b.length + 1 }, () => 0);

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      curr[j] =
        a[i - 1] === b[j - 1]
          ? prev[j - 1]!
          : Math.min(prev[j - 1]!, prev[j]!, curr[j - 1]!) + 1;
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j]!;
  }

  return prev[b.length]!;
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
   * Split `!kill <boss> <item>[, <item>...]`'s free-text tail into a boss name
   * and zero or more comma-separated item-drop names.
   *
   * Boss names/aliases are a small closed vocabulary — aliases are always a
   * single token (enforced at `!alias add`), and the longest registry name
   * is two words — so trying only EXACT (case-insensitive) matches at each
   * prefix length is safe. Unlike `resolveBossName`'s unique-prefix fuzzy
   * matching, it can never accidentally swallow the start of an item name.
   */
  async matchBossAndItem(
    tokens: string[],
    discordServerId: string,
  ): Promise<{ bossName: string; itemDrops?: string[] }> {
    const aliases = await this.aliases.listForServer(discordServerId);
    const maxWords = Math.min(tokens.length, 2);

    for (let n = maxWords; n >= 1; n--) {
      const candidate = tokens.slice(0, n).join(" ");
      const query = candidate.toLowerCase();

      const exact = PREDEFINED_BOSSES.find((b) => b.name.toLowerCase() === query);
      const scoped = aliases.find((a) => a.alias === query && a.discordServerId !== null);
      const global = aliases.find((a) => a.alias === query && a.discordServerId === null);
      const aliasTarget = (scoped ?? global) &&
        PREDEFINED_BOSSES.find(
          (b) => b.name.toLowerCase() === (scoped ?? global)!.bossName.toLowerCase(),
        );

      const resolved = exact ?? aliasTarget;
      if (resolved) {
        const tail = tokens.slice(n).join(" ").trim();
        const itemDrops = tail
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        return { bossName: resolved.name, itemDrops: itemDrops.length ? itemDrops : undefined };
      }
    }

    // No exact/alias hit at any split point — fall back to the full fuzzy
    // resolver (unique-prefix shorthand like `!kill l`). No item in this
    // path: fuzzy-matching a boss out of leftover freeform text would be
    // unreliable, so a kill typed this way is boss-only.
    const bossName = await this.resolveBossName(tokens.join(" "), discordServerId);
    return { bossName };
  }

  /**
   * Fuzzy-match freeform item text against the live drop catalog (the same
   * icon-backed list the website's kill-drop picker uses), so a drop typed
   * from Discord gets a real icon/rarity when the name is close enough to a
   * known item instead of always falling back to a bare string.
   */
  async matchDropItem(query: string): Promise<MatchedDropItem | null> {
    const normalized = normalizeItemText(query);
    if (!normalized) return null;

    const { items } = await core.equipment.getDropsCatalog();

    let best: { itemName: string; bucket: string; path: string; iconUrl: string; score: number } | null = null;
    for (const item of items) {
      const score = Math.max(
        ...catalogNameCandidates(item).map((candidate) => itemNameScore(normalized, normalizeItemText(candidate))),
      );
      if (!best || score > best.score) {
        best = { itemName: item.itemName, bucket: item.bucket, path: item.path, iconUrl: item.iconUrl, score };
      }
    }

    if (!best || best.score < MIN_DROP_MATCH_SCORE) return null;
    return { bucket: best.bucket, path: best.path, itemName: best.itemName, iconUrl: best.iconUrl };
  }

  /**
   * Resolve a trailing `!kill <boss> [...] <guild>` token to one of this
   * server's faction-mates, for logging a kill on behalf of a guild that
   * didn't run the command itself (e.g. it forgot to `!kill` its own spawn).
   * Returns null for no match — including plain item-drop text, which is the
   * overwhelmingly common case, so the caller falls back to treating the
   * token as normal input.
   */
  async resolveTakingGuild(guildId: string, token: string) {
    return core.dashboard.resolveTakingGuildByToken(guildId, token);
  }

  /** Human-readable item catalog for Discord (`!items`) and operator audits. */
  async listDropItemNames(query?: string): Promise<DropCatalogNameItem[]> {
    const needle = normalizeItemText(query ?? "");
    const { items } = await core.equipment.getDropsCatalog();
    const seen = new Set<string>();
    const out: DropCatalogNameItem[] = [];

    for (const item of items) {
      if (needle) {
        const haystack = normalizeItemText(
          [item.itemName, item.type, item.category, item.rarity].filter(Boolean).join(" "),
        );
        if (!haystack.includes(needle)) continue;
      }

      const key = [item.itemName, item.type, item.category ?? "", item.rarity ?? ""].join("\u0000").toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        itemName: item.itemName,
        type: item.type,
        category: item.category,
        rarity: item.rarity,
      });
    }

    return out.sort(
      (a, b) =>
        a.type.localeCompare(b.type) ||
        (a.rarity ?? "").localeCompare(b.rarity ?? "") ||
        a.itemName.localeCompare(b.itemName),
    );
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

    const [rows, holderNames] = await Promise.all([
      this.bosses.listUpcoming({
        guildId: params.guildId,
        factionGuildIds,
        ...(params.bossName ? { bossName: params.bossName } : {}),
      }),
      // The schedule row's own `guildTurn` text column is a legacy snapshot
      // that never gets updated when the rotation queue advances — resolve
      // the real current holder the same way the website does instead of
      // trusting it. Best-effort: a lookup failure shouldn't take down
      // `!spawn`, it just means this fallback keeps using the raw row data.
      core.dashboard.getBossHolderNames(params.guildId).catch(() => null),
    ]);

    return rows.map((row) => {
      const timer = getRealtimeBossTimer(row.bossName, row.spawnTime.toISOString(), now.getTime(), {
        status: row.status,
      });

      return {
        ...row,
        guildTurn: holderNames?.has(row.bossName) ? holderNames.get(row.bossName)! : row.guildTurn,
        live: timer.live,
        timerText: timer.text,
        liveElapsedText: timer.liveElapsedText,
        nextSpawn: new Date(timer.nextSpawn),
      };
    });
  }

  async listUpcomingActivities(guildId: string, limit = 5): Promise<ResolvedActivity[]> {
    return this.bosses.listUpcomingActivities(guildId, limit);
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
    // Freeform item names from `!kill <boss> <item>, <item>, ...`. Each is
    // matched against the drop catalog independently; unmatched names still
    // get vaulted as plain entries (see the fallback below) rather than
    // silently lost. Order is preserved in the returned `drops` array so the
    // embed lists them the way the officer typed them.
    itemDrops?: string[];
  }): Promise<{
    nextSpawn: KillNextSpawn | null;
    drops: Array<{ itemName: string; matched: boolean; iconUrl: string | null }>;
    alreadyLogged: boolean;
    killedAt: Date;
    /** Who actually logged the kill — only meaningful when alreadyLogged is true. */
    loggedBy: { id: string; displayName: string } | null;
  }> {
    // Which guild took the boss. Defaults to the actor's own guild — the
    // overwhelmingly common case for a kill reported from that guild's server.
    const takenGuildId = params.takenGuildId ?? params.guildId;
    // Was the guild named explicitly (`!kill <boss> <guild>`)? Only that, not
    // the default-to-own-guild fallback above, is allowed to claim a shared
    // rotation boss out of turn — see the guard in markBossRotationKilled.
    const explicitTakenGuild = params.takenGuildId !== undefined;
    const names = params.itemDrops ?? [];

    // Match each typed name against the catalog independently — a kill can
    // easily drop a mix of catalog items and one-off/event items in the same
    // message, and one miss shouldn't affect the others.
    const matches = await Promise.all(names.map((name) => this.matchDropItem(name)));

    const catalogDrops = matches
      .map((m) => (m ? { bucket: m.bucket, path: m.path, quantity: 1 } : null))
      .filter((d): d is { bucket: string; path: string; quantity: number } => d !== null);

    const result = await core.dashboard.markBossRotationKilledByName(
      params.guildId,
      params.bossName,
      params.killedAt.toISOString(),
      takenGuildId,
      params.actorId,
      // ipAddress/userAgent: the audit log's request-provenance fields. A
      // Discord message has neither, so mark the channel instead of inventing
      // a plausible-looking IP.
      undefined,
      "discord-bot",
      catalogDrops.length ? catalogDrops : undefined,
      explicitTakenGuild,
    );

    // Typed item text that didn't match any catalog icon — vault each anyway
    // (best-effort, same as the catalog path above) instead of silently
    // losing the drops the officer just reported.
    const alreadyLogged = result.alreadyLogged === true;
    const unmatchedNames = alreadyLogged ? [] : names.filter((_, i) => !matches[i]);
    if (unmatchedNames.length) {
      try {
        await core.storage.addDropsToStorage(
          takenGuildId,
          params.actorId,
          params.bossName,
          unmatchedNames.map((itemName) => ({ itemName, type: "Other", rarity: null, quantity: 1 })),
        );
      } catch (error) {
        console.error("[bot] Failed to vault unmatched kill drop(s) to guild storage", error);
      }
    }

    const drops = alreadyLogged
      ? []
      : names.map((name, i) => {
          const matched = matches[i];
          return {
            itemName: matched?.itemName ?? name,
            matched: !!matched,
            iconUrl: matched?.iconUrl ?? null,
          };
        });

    const next = result.nextSchedule;
    const killedAt = result.schedule.killedAt ? new Date(result.schedule.killedAt) : params.killedAt;
    const loggedBy = result.loggedBy ?? null;
    if (!next) return { nextSpawn: null, drops, alreadyLogged, killedAt, loggedBy };

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
      drops,
      alreadyLogged,
      killedAt,
      loggedBy,
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

  /**
   * Overwrite a boss's next spawn time directly (`!setspawn`) — for when the
   * real spawn is known from outside observation (a rival guild's own timer,
   * a screenshot of the in-game clock) rather than from a kill logged here.
   * Skips the usual kill-plus-cooldown math entirely; see `setBossSpawnTime`
   * in @guild/core.
   */
  async setSpawnTime(params: {
    guildId: string;
    bossName: string;
    spawnTime: Date;
    actorId: string;
  }) {
    return core.dashboard.setBossSpawnTime(
      params.guildId,
      params.bossName,
      params.spawnTime,
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
  /**
   * The schedule row `!attendance <boss>` attaches a smart-attendance scan to.
   * This must be an already-open killed-boss attendance window; future or
   * not-yet-killed bosses are intentionally rejected.
   */
  async findScheduleForBoss(bossName: string, guildId: string): Promise<UpcomingSpawn | null> {
    return this.bosses.findOpenSessionSchedule({ bossName, guildId });
  }

  /** Committed members for a spawn — backs `!party`. */
  async listOpenKilledAttendanceWindows(guildId: string) {
    return this.bosses.listOpenKilledAttendanceWindows({ guildId });
  }

  async getOpenKilledAttendanceWindow(guildId: string, bossName: string) {
    return this.bosses.findOpenKilledAttendanceWindow({ guildId, bossName });
  }

  async checkInToOpenKilledAttendance(guildId: string, bossName: string, userId: string) {
    const window = await this.getOpenKilledAttendanceWindow(guildId, bossName);
    if (!window) return null;
    const result = await core.dashboard.checkInToBoss(userId, guildId, window.scheduleId);
    return { window, result };
  }

  async listParty(scheduleId: string) {
    return this.bosses.listCommitments(scheduleId);
  }
}
