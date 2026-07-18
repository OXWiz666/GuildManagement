# ForgeKeep Discord Bot

A Discord bot for the ForgeKeep guild platform. It shares the website's
PostgreSQL database — there is no second source of truth, and no sync job.

## Architecture

```
src/
  bot/
    client.ts            Discord client, intents, event wiring
    commands/            One file per command + the registry
    events/              messageCreate → the dispatch pipeline
  config/env.ts          Zod-validated bot configuration
  embeds/                ForgeKeep branding + embed builders
  middleware/            Permission gate (UX layer — see below)
  notifications/queue.ts Rate-limit-aware, retrying Discord sender
  repositories/          Data access (the only layer that touches Prisma)
  services/              Business logic + the DI container
  types/                 Command/context contracts
  utils/                 Logging, errors, timezone math
```

**Dependency flow:** `commands → services → repositories → Prisma`. Commands
never touch Prisma; services never import a singleton. The container
(`services/container.ts`) is the composition root, which is what makes services
testable with fakes.

> **Setting this up for the first time?** See [SETUP.md](./SETUP.md) — Discord
> app creation through to screenshot scanning, with the failure modes called out.

## Three decisions worth knowing

**1. Boss math is not reimplemented here.** Respawn cooldowns, the Singapore
spawn windows and fixed schedules live in `@guild/shared`, and kills go through
`@guild/core`'s `markBossRotationKilledByName` — the same function the website
calls. That service advances the rotation queue, writes the audit log and
broadcasts the realtime event. The bot adds no boss logic of its own, so the bot
and the site cannot disagree about a timer.

**2. Identity is the trust boundary.** A Discord user has no rights until they
link. The website mints a short-lived one-time code
(`POST /api/discord/link-code`); the user redeems it with `!link <code>`. The
bot never sees a password. `middleware/permissions.ts` is a *UX gate* that
produces friendly errors — the real authorization is re-checked against the
database inside `@guild/core` on every call.

**3. Deduplication is a database constraint, not a cache.**
`notification_history.dedupe_key` is UNIQUE. Senders insert the key *before*
sending and treat a unique violation as "already sent". Dedup is therefore
atomic and survives restarts and multiple instances. Redis, if configured,
caches in front of this — it is never the authority.

## Caching & rate limiting

Both reuse `@guild/core`'s Redis layer (Upstash, with an automatic in-memory
fallback), and every key is built from `cacheKeys` so writes and invalidations
stay paired — no keyspace scans.

| Cached | TTL | Invalidation |
|---|---|---|
| Server binding (read on *every* message) | 600s | Active, on `!bindguild` |
| Actor + role | **30s** | Active, on `!unlink` |
| Boss aliases | 300s | TTL |
| OCR class candidates | 300s | Active, when a scan fills a blank class |

> The actor cache holds a member's **role**, which an officer can change on the
> website at any time — the bot can't observe that, so this cache is
> occasionally stale by design. That is safe *only* because the cached role
> feeds `middleware/permissions.ts`, which exists to produce friendly errors:
> every `@guild/core` service re-reads authorization from the database on each
> call. **Don't lengthen that TTL, and don't start trusting the cached role for
> enforcement.**

Rate limits are per-user fixed-window (matching the website's API middleware),
with two separate budgets: commands (`20/min`) and OCR scans (`10/hour`). Scans
are far tighter because OCR is CPU-bound and serialized behind a single worker.
The limiter **fails open** — if Redis is unreachable it logs and allows, since a
cache outage shouldn't become a bot outage.

## Setup

1. **Discord Developer Portal** → create an application → Bot → Reset Token.
2. Enable the **Message Content Intent** (Bot → Privileged Gateway Intents).
   Without it the bot connects and silently ignores every command.
3. Invite with scope `bot` and permissions: Send Messages, Embed Links,
   Read Message History, Manage Messages (used to delete `!link` codes from
   public channels), Manage Webhooks.
4. `cp apps/bot/.env.example apps/bot/.env` and fill it in.
5. `pnpm install && pnpm --filter @guild/db db:generate`
6. `pnpm --filter @guild/bot dev`

### Binding a server

```
!bindguild <invite-code>   # Guild Leader only — from ForgeKeep → Guild Settings
!notifhere                 # where spawn/kill alerts go
!webhookhere [name]        # creates a Discord webhook and DMs the URL
!commands                  # everything available to you
```

## Commands

| Command | Who | Notes |
|---|---|---|
| `!spawn [boss]` | Members | Grouped Today / Tomorrow / Future |
| `!kill <boss> [item drop] [HH:MM]` | Officers | `HH:MM` is wall-clock in the server's timezone; a matched/unmatched item drop is auto-vaulted to Guild Storage |
| `!editkilltime <boss> <HH:MM>` | Officers | Corrects a kill time; does NOT re-advance the queue |
| `!forcespawn <boss>` | Officers | Marks a boss live now; stays live until killed |
| `!forcespawnall` | Guild Leader | Every fixed-schedule boss live — stricter by design |
| `!party [boss]` | Members | Committed members for the next fight |
| `!cp` | Members | Your CP, rank, last update |
| `!cp` + screenshot | Members | OCR: detects CP, verifies name, detects class |
| `!cp <value>` | Members | Update your own CP only |
| `!cp leaderboard [page]` / `!cp top10` | Members | Paginated in SQL |
| `!cp history` | Members | Your CP changes |
| `!cp flagged` | Officers | Scans marked for review |
| `!link <code>` / `!unlink` | Anyone | Account linking |
| `!bindguild <invite>` | Guild Leader | Bind this server to a guild |
| `!notifhere` / `!cmdhere` / `!threadhere` | Officers | Channel routing |
| `!webhookhere [name]` | Officers | Create a channel webhook; URL is delivered by DM |
| `!alias [add\|remove]` | Officers | Boss nicknames; also editable in Guild Settings |
| `!commands [name]` | Anyone | Generated from the live registry |

Boss names accept aliases (`discord_aliases`) and unique prefixes — `!kill ven`
resolves to Venatus, while `!kill la` is rejected as ambiguous rather than
guessed. An item drop after the boss (`!kill Livera Ancient Boots`) only
splits out when the boss is given by its full name or a configured alias —
prefix shorthand like `!kill ven` still works, but only for a boss-only kill.
The item text is matched against the live drop catalog for a real icon/rarity;
if nothing matches closely enough it's still added to Guild Storage as a plain
entry rather than lost.

## Website surfaces

Two distinct pages, easy to confuse:

| Page | Scope | Who |
|---|---|---|
| `/dashboard/settings` → Integrations → Discord | **Per-user** account link; mints the `!link` code | Every member |
| `/dashboard/guild-settings` → Integrations → Discord | **Per-guild**: connected server, channels, boss aliases | Guild Leader |

Binding (`!bindguild`) and channel selection (`!notifhere`) stay Discord-side
because both need context the website doesn't have — which server sent the
command, and which channel you're in. The guild panel surfaces their result and
owns the one piece needing no Discord context: aliases.

## Testing

```bash
pnpm --filter @guild/bot test        # 47 unit tests
pnpm --filter @guild/bot typecheck
```

Unit tests use injected fakes and never touch a database. `vitest.config.ts`
supplies throwaway env values because `@guild/core` validates its environment at
import time.

## Deploying (Fly.io)

Build from the repo root — the image needs the whole workspace:

```bash
fly deploy --config apps/bot/fly.toml --dockerfile apps/bot/Dockerfile
fly secrets set DISCORD_TOKEN=... DATABASE_URL=... # etc, see .env.example
```

Run exactly **one** instance. Two gateway sessions would answer every command
twice; scheduled notifications are dedupe-protected, but command replies are not.

## Notifications

`scheduler/` polls every 30s and dispatches spawn warnings, spawn alerts and a
periodic guild CP report; `!kill` announces through the same path. Dedup is the
UNIQUE `notification_history.dedupe_key`, claimed *before* sending — so the
worst case is a lost notification, never a duplicate.

Polling beats a timer-per-boss here because a timer lives in memory: a restart
loses it, and a kill logged on the website (which the bot never observes) leaves
a stale timer firing for a dead boss. Re-reading the database each tick means
the bot always works from current state, and stable dedupe keys make repeated
evaluation free.

## Realtime

`realtime/subscriber.ts` subscribes to the same `guild-{guildId}` topics the
website's clients use, and treats realtime strictly as a **cache-invalidation
signal — never a data source**. The bot and website share one database, so data
changes are already visible by reading; the gap realtime closes is knowing that
something *cached* (chiefly a member's role) changed underneath it.

Treating payloads as hints rather than data is what keeps a dropped or
out-of-order message harmless: worst case the cache expires on its TTL instead.
Realtime failing to connect logs and degrades to TTL staleness — it is never a
correctness dependency.

## Deploying

No local Docker required — Fly builds remotely. See [SETUP.md](./SETUP.md) Step 9.
