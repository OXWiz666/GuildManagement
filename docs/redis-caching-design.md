# Redis Caching Layer — Design

**Platform:** Upstash Redis (Free Tier), accessed via REST (`@upstash/redis`) — no persistent TCP connection, which is what makes it viable from Next.js Route Handlers / Vercel serverless functions.

**Status:** Design + scaffold only. Nothing in the existing services has been rewired to use this yet — see [Rollout](#rollout--migration-path).

This document grounds every key in the real Prisma models and route handlers in this repo (`packages/core/src/services/*.service.ts`, `packages/db/prisma/schema.prisma`), and in the real Supabase Realtime event names already broadcast today (`packages/core/src/lib/socket.ts` → `broadcastToGuild/Faction/User`). Those events are the invalidation triggers throughout — they already fire at every mutation and already carry the IDs needed for targeted deletes, so wiring cache invalidation onto them is additive, not a new mutation-tracking system.

---

## Table of contents

1. [General principles](#general-principles)
2. [Key naming convention](#key-naming-convention)
3. [The two invalidation patterns used throughout](#the-two-invalidation-patterns-used-throughout)
4. Per-domain design: [Dashboard](#1-dashboard) · [Guild](#2-guild) · [Faction](#3-faction) · [Boss Rotation](#4-boss-rotation) · [Marketplace](#5-marketplace) · [Attendance](#6-attendance) · [Inventory / Equipment](#7-inventory--equipment) · [Accounting](#8-accounting) · [Statistics](#9-statistics) · [Leaderboards](#10-leaderboards)
5. [Upstash Free Tier considerations](#upstash-free-tier-considerations)
6. [Rollout / migration path](#rollout--migration-path)

---

## General principles

1. **TTL is a safety net, not the freshness mechanism.** Every mutation already broadcasts a Supabase Realtime event with the affected `guildId` (and often the exact entity id). Invalidation happens on that event via a direct `DEL` of the known key(s). TTL only bounds staleness for the rare case a broadcast is missed (client offline, bug, etc.) — so TTLs here are deliberately looser than they'd need to be if TTL were the only defense.
2. **No `KEYS`, no `SCAN`-based deletion, no pattern `DEL`.** The existing in-memory `cache.ts` has an `invalidatePattern(prefix)` that walks every key — fine for a single-process `Map`, actively dangerous on shared Redis (O(N) over the whole keyspace, blocks other tenants on Upstash's shared infra, and it's the exact anti-pattern this design is told to avoid). The Redis layer **does not implement `invalidatePattern`**. Every invalidation call names its exact key(s).
3. **Every response that is scoped to "the calling user," not just to a guild, must include the userId in the key.** `attendance_stats` is the concrete example that would otherwise leak: the client fetches it as `attendance_stats:{guildId}`, but the payload (`presenceRate`, `currentStreak`, `history`) is personal to the caller. A server cache keyed only by `guildId` would serve one member's stats to the next member who happens to load the page. Any domain below with a "per-user" row calls this out explicitly.
4. **Avoid unbounded fan-out keys.** A few endpoints are conceptually "one resource, many viewers" where a single mutation would otherwise need to invalidate one key per viewer (e.g., boss rotation is faction-shared but requested per-guild). Two ways this is resolved without ever touching `KEYS`/`SCAN`:
   - **Prefer re-shaping the cache to match the mutation's scope.** If the *computation* is faction-wide, cache it by `factionId`, and do the (cheap) per-guild viewpoint filter after the cache read, not before. Then a `boss_rotation_updated` event invalidates exactly one key.
   - **When that's not practical without a service refactor, use a small index Set** (e.g. `boss:rotation:guilds:{factionId}` → the bounded set of guildIds that currently have a warm cache for this faction). Invalidation does `SMEMBERS` (bounded by faction size, typically single digits to low tens) then issues one `DEL` per member. This is still 100% targeted — every key deleted is named explicitly, just enumerated from a maintained index instead of hand-written — it is not a keyspace scan.
5. **Prefer Redis-native structures over JSON blobs where the data is naturally incremental.** Leaderboards are the standout case: a sorted set (`ZADD`/`ZINCRBY`/`ZREVRANGE`) updates a single member's score in one command and is *always* correct — there's no cached blob to invalidate at all. See [§10](#10-leaderboards).
6. **Read-through helper, not scattered `get`/`set` pairs.** Every domain below is written as `cache.getOrSet(key, ttl, loader)`, mirroring the existing in-memory `cache.ts` API (see [`redis.ts`](#rollout--migration-path)) so migrating an existing `cache.getOrSet(...)` call site to Redis is a one-line import swap.

---

## Key naming convention

```
fk:{domain}:{scope}:{...ids}[:{subresource}]
```

- `fk:` — app namespace prefix. Upstash free-tier projects are sometimes shared/reused across environments; a static prefix means `flushdb`-style accidents in a shared project can't collide with another app, and lets you tell production/staging apart at a glance if they ever share a database (`fk:` vs `fk-stg:`).
- `{domain}` — one of `dash`, `guild`, `faction`, `boss`, `market`, `attend`, `equip`, `acct`, `stats`, `lb`.
- `{scope}` — what the key is about (`stats`, `settings`, `members`, `rotation`, …).
- `{...ids}` — `guildId`, `userId`, `factionId`, `sessionId`, etc., in a fixed order per key shape (documented per-domain below).
- Pagination/period suffixes (`:p{page}`, `:{period}`) come last.

No key ever ends in a bare wildcard segment — every key is a value some code path can compute directly at write **and** at invalidation time, from IDs the mutation already has.

---

## The two invalidation patterns used throughout

**Pattern A — Direct key delete (the default, used almost everywhere).**
The mutation knows the exact scope (`guildId`, sometimes `+userId`/`+sessionId`), so invalidation is just:

```ts
await cache.del(cacheKeys.dashboardStats(guildId));
```

**Pattern B — Index-set delete (only for the handful of genuine fan-out cases).**
Used only where §4 above applies (boss rotation's per-guild views of a faction-wide queue; per-page audit-log caches where only page 1 is worth actively invalidating). Example:

```ts
const guildIds = await cache.smembers(cacheKeys.rotationGuildIndex(factionId));
await cache.del(...guildIds.map((id) => cacheKeys.bossRotation(id)));
await cache.del(cacheKeys.rotationGuildIndex(factionId)); // reset the index too
```

Both are O(1) or O(bounded-N) named-key operations. Neither ever calls `KEYS` or `SCAN`.

---

## 1. Dashboard

Source: `dashboard.service.ts` → `getDashboardSummary()`. Currently cached in-memory as `stats:guild:${guildId}` (30s) + a per-user wrapper `stats:${guildId}:user:${userId}` (30s).

| Cache key | TTL | Invalidated on | Pattern |
|---|---|---|---|
| `fk:dash:stats:{guildId}` | 30s | `boss_rotation_updated`, `boss_schedule_deleted`, `attendance_record_created/confirmed/revoked`, `treasury_adjusted`, `loot_sale_recorded`, `member_profile_updated` | A |

**Design change from today:** drop the per-user wrapper cache (`stats:{guildId}:user:{userId}`). It's the dashboard's only fan-out risk, and the per-user portion of the response (the caller's own claim/attendance flags) is cheap to compute fresh on every request against already-cached-or-cheap data — not worth an index-set just to avoid one lightweight query. Only the expensive guild-wide aggregate (member counts, boss-kills-today, ledger rollups) is cached, and it's a single key per guild.

## 2. Guild

Source: `guild.service.ts`, `GuildSettings`, `GuildRoleDefinition`, `GuildMember`.

| Cache key | TTL | Invalidated on | Pattern |
|---|---|---|---|
| `fk:guild:settings:{guildId}` | 300s | Settings update, `custom_roles_updated`, `activity_point_rules_updated`, `invite_code_updated` | A |
| `fk:guild:roles:{guildId}` | 300s | `custom_roles_updated` | A |
| `fk:guild:members:{guildId}` | 60s | `member_role_updated`, `member_profile_updated`, `join_request_processed` | A |
| `fk:guild:members-simple:{guildId}` | 300s | same as above (delete alongside `members`) | A |
| `fk:guild:applications:{guildId}` | 30s | `join_request_created/cancelled/processed` | A |
| `fk:guild:invite-code:{guildId}` | 3600s | `invite_code_updated` | A |

The member roster is a single list keyed by `guildId` — a role change or new join always invalidates exactly one (or two, for the simple/full pair) named key. No per-member key exists for the roster itself.

## 3. Faction

Source: `faction.ts` routes.

| Cache key | TTL | Invalidated on | Pattern |
|---|---|---|---|
| `fk:faction:overview:{factionId}` | 60s | guild joins/leaves faction, `join_request_processed` | A |
| `fk:faction:members:{factionId}` | 60s | guild joins/leaves faction | A |
| `fk:faction:announcements:{factionId}` | 120s | announcement created/deleted | A |
| `fk:faction:events:{factionId}` | 60s | `guild_activity_updated`, event CRUD | A |
| `fk:faction:invite-code:{factionId}` | 3600s | invite code regenerated | A |
| `fk:faction:join-requests:{factionId}` | 30s | `join_request_created/cancelled/processed` | A |

## 4. Boss Rotation

Source: `getBossRotation()` — the single most expensive uncached read in the app today (membership check + faction/registry/active-guilds lookups + 3 bulk `Promise.all` queries across every boss name). Zero server-side caching exists for it currently, so this is the highest-value target in the whole design.

| Cache key | TTL | Invalidated on | Pattern |
|---|---|---|---|
| `fk:boss:rotation:{factionId}` *(recommended target shape)* | 30s | `boss_rotation_updated`, `boss_schedule_deleted` | A |
| `fk:boss:rotation:{guildId}` *(current per-guild shape, if the faction-scoped refactor isn't done yet)* | 30s | `boss_rotation_updated`, `boss_schedule_deleted`, via index set `fk:boss:rotation:guilds:{factionId}` | B |
| `fk:boss:schedules:{guildId}` | 15s | `boss_rotation_updated`, `boss_schedule_deleted`, `boss_commitment_updated` | A |
| `fk:boss:audit:{guildId}:p1` | 30s | new rotation audit-log entry (only page 1 is invalidated; pages 2+ rely on TTL — see note) | A |
| `fk:boss:killed-history:{guildId}:{yyyy-mm}` | 60s | `boss_rotation_updated` with a KILLED transition, **only for the current month's key** — past months are immutable and are never invalidated | A |
| `fk:boss:commitments:{guildId}:{scheduleId}` | 20s | `boss_commitment_updated` (event carries `scheduleId`) | A |
| `fk:boss:registry` | 3600s | admin edits the boss registry (rare, manual) | A |

**Why the faction-scoped shape is recommended:** `getBossRotation()` already computes faction-wide queue state and active-faction-guild data before shaping a guild's viewpoint. Caching the faction-wide computation and applying the guild-specific view as a cheap post-cache transform turns every rotation update into a single-key invalidation instead of a fan-out across every guild in the faction. Until that refactor happens, the index-set fallback (`fk:boss:rotation:guilds:{factionId}` — a Set of guildIds with a warm cache for the faction) keeps invalidation targeted without it: on `boss_rotation_updated`, read the (small, bounded-by-faction-size) set and `DEL` each named key plus the index itself.

**Paginated audit log note:** this "invalidate only the newest page" approach recurs for every paginated audit/history endpoint in this design (boss rotation, marketplace, ledger). It's a deliberate, principled use of TTL-only expiry for older pages rather than an oversight — those pages don't change once a new entry lands on page 1, so actively invalidating them would just be extra commands for no correctness gain.

## 5. Marketplace

Source: `market.service.ts` — currently **zero server-side caching**, all load falls on Postgres today; second-highest-value target after boss rotation.

| Cache key | TTL | Invalidated on | Pattern |
|---|---|---|---|
| `fk:market:requests:{guildId}` | 30s | item request created/updated | A |
| `fk:market:legendary:{guildId}` | 30s | `legendary_priority_submitted`, `legendary_priority_updated` | A |
| `fk:market:priority:{guildId}` | 30s | `priority_sequence_changed` | A |
| `fk:market:distributions:{guildId}` | 60s | `item_distributed` | A |
| `fk:market:wishlist:mine:{guildId}:{userId}` | 60s | `market_wishlist_updated` *(requires the event payload to carry `userId` — see gap note)* | A |
| `fk:market:wishlist:master:{guildId}` | 60s | `market_wishlist_updated` | A |
| `fk:market:rules:{guildId}` | 300s | `market_rules_updated` | A |
| `fk:market:audit:{guildId}:p1` | 60s | new market audit-log entry (page 1 only, same as boss audit) | A |
| `fk:market:mounts:{guildId}` | 60s | `mount_catalog_updated`, `mount_distributed` | A |
| `fk:market:auction:{guildId}` | 15s | `auction_updated` | A |
| `fk:market:storage:{guildId}` | 30s | `storage_updated` | A |

**Gap to close before implementing `market:wishlist:mine`:** `market_wishlist_updated` today broadcasts guild-wide; confirm (or add) a `userId` field on the payload so the invalidation can target the one member's wishlist key directly instead of falling back to TTL-only expiry for that key.

## 6. Attendance

Source: `attendance` routes, `AttendanceSession` / `AttendanceRecord`.

| Cache key | TTL | Invalidated on | Pattern |
|---|---|---|---|
| `fk:attend:sessions:{guildId}` | 20s | `attendance_session_created/updated/deleted` | A |
| `fk:attend:session-detail:{guildId}:{sessionId}` | 10s | `attendance_record_created/confirmed/revoked` (event carries `sessionId`) | A |
| `fk:attend:pending:{guildId}` | 15s | any `attendance_record_*` / `attendance_session_*` event | A |
| `fk:attend:stats:{guildId}:{userId}` | 60s | **TTL-only — no active invalidation** | — |

**`attend:stats` correctness note (important):** the client fetches this as `attendance_stats:{guildId}` with no visible `userId`, but the payload is the *caller's own* presence rate / streak / history — it must be keyed `{guildId}:{userId}` server-side or two members loading the page back-to-back would see each other's stats. Given each user's history changes infrequently and briefly-stale personal stats are low-stakes, this is the one place in the whole design where plain TTL expiry (no event wiring) is the deliberate choice — an index-set just to actively invalidate a low-stakes per-user key isn't worth the extra commands on a free tier.

## 7. Inventory / Equipment

Source: `equipment.service.ts`, `MemberEquipment`.

| Cache key | TTL | Invalidated on | Pattern |
|---|---|---|---|
| `fk:equip:catalog` | 3600s | admin catalog change (rare, manual) | A |
| `fk:equip:drops-catalog` | 3600s | admin catalog change (rare, manual) | A |
| `fk:equip:mine:{guildId}:{userId}` | 120s | `member_equipment_updated` (event carries `userId`) | A |

`equip:mine` is a legitimate per-user key, not a fan-out: the mutation is always the member scanning their *own* gear, so the event that invalidates it always already names the one key to delete.

## 8. Accounting

Source: ledger routes, `LedgerEntry` (append-only, `BigInt` amounts, balances always derived by summing).

| Cache key | TTL | Invalidated on | Pattern |
|---|---|---|---|
| `fk:acct:balance:{guildId}` | 30s | `treasury_adjusted`, `loot_sale_recorded` | A |
| `fk:acct:ledger:{guildId}:p1:l{limit}` | 60s | `treasury_adjusted`, `loot_sale_recorded` (page 1 only) | A |
| `fk:acct:ledger:{guildId}:p{n>1}:l{limit}` | 60s | never actively invalidated — append-only means older pages are immutable | — |
| `fk:acct:loot-sales:{guildId}` | 120s | `loot_sale_recorded` | A |

Because `LedgerEntry` rows are never edited or deleted once written, this is the cleanest domain in the whole design: everything past page 1 is provably immutable for as long as the cache entry could possibly live, so TTL-only expiry for those pages isn't a compromise, it's the objectively correct strategy.

## 9. Statistics

The dedicated Statistics page reuses guild-wide aggregate data — same shape and same fan-out concern as Dashboard, so it shares the identical cache entry rather than duplicating it.

| Cache key | TTL | Invalidated on | Pattern |
|---|---|---|---|
| `fk:dash:stats:{guildId}` *(shared with Dashboard, §1 — not a separate key)* | 30s | same triggers as §1 | A |
| `fk:stats:leaderboard-snapshot:{guildId}:{period}` *(if the Statistics page shows a point-in-time table rather than the live sorted set)* | 300s | on the periodic leaderboard rebuild job (§10) | A |

No new cache key is introduced for the aggregate numbers themselves — reusing `dash:stats` avoids a second cache that could drift out of sync with the dashboard's.

## 10. Leaderboards

**No leaderboard endpoint exists in the codebase yet** — this section is forward-looking, designed against `GuildMember.bidPoints` / `GuildPointsSnapshot` as the natural score sources.

Unlike every other domain, leaderboards should **not** be cached as a JSON blob behind TTL + invalidation. Redis sorted sets (`ZSET`) are a better native fit: a point change updates one member's score in a single command, and the leaderboard is correct on every read with no invalidation step at all.

| Structure | Key | TTL | Update |
|---|---|---|---|
| Sorted set (score = points) | `fk:lb:points:{guildId}:{period}` (`period` = `all` \| `weekly` \| `monthly`) | 3600s, refreshed (`EXPIRE`) on every write | `ZINCRBY fk:lb:points:{guildId}:{period} {delta} {userId}` on every point-affecting event (`treasury_adjusted`, activity completion, boss kill attendance confirmation, etc.) |
| Read | `ZREVRANGE fk:lb:points:{guildId}:{period} 0 24 WITHSCORES` for a top-25 view, or `ZREVRANK` + `ZSCORE` for one member's rank | — | — |

A nightly (or on-demand admin) rebuild job repopulates the sorted set from `GuildMember`/`GuildPointsSnapshot` via `ZADD ... GT` to correct any drift from a missed increment, without ever needing a delete-then-rebuild — the running TTL means an abandoned/stale leaderboard for an inactive guild simply expires instead of needing manual cleanup.

---

## Upstash Free Tier considerations

(Verify exact current numbers on the Upstash console — these change; design conservatively regardless.)

- **Command budget is the scarce resource, not memory.** Every `getOrSet` miss costs 1 read + 1 write; every hit costs 1 read; every invalidation costs 1 (Pattern A) or 1 + N (Pattern B, where N is small and bounded). At the TTLs above, the *entire* dashboard+boss-rotation+marketplace surface for one active guild is well under a few hundred commands/hour even under heavy use — the design deliberately favors slightly longer TTLs plus event-driven invalidation over short TTLs, since short TTLs directly multiply command volume.
- **Batch reads with pipelining, not sequential round trips.** `@upstash/redis`'s `pipeline()` sends multiple commands in one HTTP request. Use it for the leaderboard top-N + a specific member's rank (2 commands, 1 request), or when a dashboard widget needs 3–4 small keys at once.
- **No reliance on keyspace notifications.** Free tier REST access doesn't give a good story for Redis pub/sub-based expiry hooks — this design doesn't need them, since invalidation is driven by the app's own Realtime broadcasts, not by Redis expiry events.
- **Graceful degradation when unconfigured.** `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` are optional env vars (see `env.ts`). When absent (local dev, a preview environment without Redis provisioned), the cache client falls back to the existing in-memory `cache.ts` transparently — every call site keeps working with zero conditional logic of its own.

---

## Rollout / migration path

This PR adds the scaffold only — no existing service has been switched over:

- **`packages/core/src/lib/redis.ts`** — Upstash-backed client with the same `get` / `set` / `getOrSet` / `del` shape as the existing `cache.ts`, plus `delMany(keys[])` and `smembers`/`sadd`/`zincrby`/`zrevrange` for the index-set and leaderboard patterns above. Falls back to the in-memory `cache` when Upstash env vars aren't set.
- **`packages/core/src/lib/cache-keys.ts`** — typed key-builder functions for every key in this document (e.g. `cacheKeys.dashboardStats(guildId)`), so call sites never hand-write a template string and can't typo a key shape used for both writing and invalidating.
- **`packages/core/src/config/env.ts`** — `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` added as optional.

To migrate an existing call site (e.g. `dashboard.service.ts`'s `cache.getOrSet("stats:guild:" + guildId, 30, loader)`):

1. Swap the import from `../lib/cache` to `../lib/redis` (still exported as `cache`, same call signature).
2. Swap the hand-written key for `cacheKeys.dashboardStats(guildId)`.
3. Add the matching `cache.del(...)` call at the mutation site(s) listed in this doc's table for that key — most of those mutation sites already call `broadcastToGuild(guildId, "eventName", ...)`, so the invalidation line goes right next to the existing broadcast call.

Recommended order: Boss Rotation and Marketplace first (currently uncached, biggest DB load reduction), then Dashboard/Guild/Faction (already cached in-memory, swap for correctness across multiple server instances), Attendance/Equipment/Accounting last (lower traffic), Leaderboards whenever that feature is actually built.
