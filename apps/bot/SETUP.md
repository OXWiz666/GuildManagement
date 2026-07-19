# ForgeKeep Discord Bot — Setup

End-to-end setup, from a fresh Discord application to a member scanning their
Combat Power from a screenshot.

The bot shares the website's database. There is **no second database and no sync
job** — a kill logged in Discord is on the website immediately, and vice versa.

---

## Prerequisites

- Node.js ≥ 20, pnpm 10
- Access to the ForgeKeep repo and its Supabase project
- A Discord account with **Manage Server** permission on the target server

### Do I need Docker? No.

- **Local development** — `pnpm --filter @guild/bot dev` runs the bot directly
  on Node. Docker is not involved.
- **Deploying to Fly.io** — Fly builds the image on **its own remote builders**.
  The `Dockerfile` is a recipe Fly follows; you don't need a local Docker daemon.
  Use `fly deploy --remote-only` to make that explicit (see Step 9).

The only reason to install Docker is if you want to debug the image build
locally. Nothing in the normal workflow requires it.

---

## Step 1 — Create the Discord application

1. Go to <https://discord.com/developers/applications> → **New Application**.
   Name it (e.g. `ForgeKeep`) → **Create**.
2. **General Information** → copy the **Application ID** → this is your
   `DISCORD_CLIENT_ID`.
3. **Bot** (left sidebar) → **Reset Token** → copy it → this is your
   `DISCORD_TOKEN`.
   > Treat it like a password. Anyone with this token controls the bot. It is
   > shown **once** — if you lose it, reset it again.

### 1a. Enable the Message Content Intent — do not skip this

Still on the **Bot** page → scroll to **Privileged Gateway Intents** → turn on
**MESSAGE CONTENT INTENT** → **Save Changes**.

> **This is the single most common setup failure.** The bot requests this intent
> because every command is a prefix message (`!spawn`) — without the message
> text there is nothing to parse.
>
> If it isn't enabled, the bot **fails to start** with:
>
> ```
> {"level":"error","message":"Fatal startup error","err":"Used disallowed intents"}
> ```
>
> That's Discord closing the gateway with code **4014**: the app asked for an
> intent it isn't approved for. Enable it in the portal and restart — no code
> change is needed.
>
> (A bot in 100+ servers must additionally apply to Discord for verification to
> keep using this intent. Below that threshold, the portal toggle is all it takes.)

---

## Step 2 — Invite the bot to your server

**OAuth2 → URL Generator**:

- **Scopes**: `bot`
- **Bot Permissions**:

| Permission | Why |
|---|---|
| Send Messages | Every reply |
| Embed Links | All output is embeds |
| Read Message History | Reading commands |
| Attach Files | Future notification images |
| Manage Messages | Deletes `!link <code>` messages so codes don't sit in channel history |
| Manage Webhooks | Lets officers create channel webhooks with `!webhookhere` |

Copy the generated URL, open it, pick your server, **Authorize**.

`Manage Messages` is optional — without it the bot still links accounts, it just
can't tidy the code out of the channel afterwards. `Manage Webhooks` is only
needed if you want `!webhookhere` to create webhooks from Discord.

---

## Step 3 — Apply the database migrations

The bot needs migrations **0019** (Discord tables + CP history) and **0020**
(OCR fields).

They are already applied to **ForgeKeep Development** (`pibnwquhrnvxpzbagcyo`).
For any other environment, run them in order:

```
packages/db/prisma/manual-migrations/0019_discord_bot.sql
packages/db/prisma/manual-migrations/0020_cp_ocr.sql
```

Apply via the Supabase SQL editor (or your usual path for this repo's
hand-written migrations), then confirm zero drift:

```bash
cd packages/db
npx prisma migrate diff \
  --from-schema-datamodel prisma/schema.prisma \
  --to-schema-datasource prisma/schema.prisma --script
# Expected output: "-- This is an empty migration."
```

Then regenerate the client:

```bash
pnpm --filter @guild/db db:generate
```

> **Restart any running dev server after generating.** A running Next.js dev
> server keeps the old client in memory and will throw confusing errors until
> it's restarted.

**Production note:** migrations 0019 and 0020 are **not yet applied to
production** (`tsjuckpzfuaozktqhior`). They're additive and safe, but they join
the existing pending stack (0012–0014) — apply them together, deliberately.

---

## Step 4 — Configure the bot

```bash
cp apps/bot/.env.example apps/bot/.env
```

Fill in:

| Variable | Where from |
|---|---|
| `DISCORD_TOKEN` | Step 1 |
| `DISCORD_CLIENT_ID` | Step 1 |
| `DATABASE_URL` / `DIRECT_URL` | **Same values as the website.** Do not point at a new database. |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `SUPABASE_URL`, `SUPABASE_KEY` | Same as the website |

> **Why the bot needs JWT secrets it never uses:** it imports `@guild/core` for
> the boss-kill service, and that package validates its whole environment at
> import time. The bot issues no tokens; the vars just have to be present or the
> process won't boot.

Optional but recommended:

| Variable | Default | Notes |
|---|---|---|
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | — | Shared cache + rate-limit counters. Without it, both fall back to an in-memory store — correct for a single instance, wrong if you ever run more. |
| `COMMAND_PREFIX` | `!` | |
| `CP_MAX_VALUE` | `100000000` | Rejects fat-fingered input |
| `RATE_LIMIT_COMMANDS_PER_MIN` | `20` | Per user |
| `RATE_LIMIT_SCANS_PER_HOUR` | `10` | Per user; OCR is expensive — see Step 8 |
| `OCR_CACHE_PATH` | `/tmp/tesseract` | Must be writable |
| `CP_MAX_GROWTH_RATIO` | `0.3` | CP jump above +30% in one scan gets flagged |
| `OCR_MIN_CONFIDENCE` | `0.6` | Below this, a scan is flagged for review |

---

## Step 5 — Run it

```bash
pnpm install
pnpm --filter @guild/db db:generate
pnpm --filter @guild/bot dev
```

Expected:

```json
{"level":"info","message":"Bot ready","tag":"ForgeKeep#1234","guilds":1,"prefix":"!"}
```

The bot should now show online in your server.

---

## Step 6 — Bind the Discord server to your guild

One Discord server serves one ForgeKeep guild. Until it's bound, the bot answers
nothing — it has no idea whose data to read.

1. On the website: **Guild Settings → Integrations → Discord**. It shows the
   full command with your invite code already filled in — copy it. (If the guild
   has no code yet, the panel generates one. The same code also appears on the
   **Members** page, where it doubles as the member-invite code.)
2. Paste it in Discord as a **Guild Leader**:

```
!bindguild <invite-code>
```

Only a Guild Leader (or Faction Leader / Admin) **of that specific guild** can
bind it. Being a leader elsewhere grants nothing.

Then set where alerts go:

```
!notifhere     # boss spawn/kill notifications post here
!cmdhere       # optional: restrict commands to this channel
!threadhere    # optional: boss threads get created here
!webhookhere   # optional: create a webhook here; URL is sent by DM
```

Binding and channels stay Discord-side commands because both need context the
website doesn't have — which server the command came from, and which channel
you're standing in. To *see* the result, use **Guild Settings → Integrations →
Discord**, which shows the connected server and every channel.

### Boss aliases

Map your guild's shorthand onto real boss names, so `!spawn kuracorp` works even
though the registry calls it "Baron Baraudmore":

```
!alias                                  # list
!alias add kuracorp Baron Baraudmore       # add (Officer+)
!alias remove kuracorp                     # remove
```

Or use **Guild Settings → Integrations → Discord**, which has a boss picker —
harder to typo than a chat command. Both write the same rows.

An alias must point at a real registry boss, and can't shadow an existing boss
name (`!kill ego` must always mean Ego). A server alias overrides a global one.

---

## Step 7 — Link member accounts

Each member links themselves. The bot never sees a password.

> **Two different pages, easy to mix up:**
> - **`/dashboard/settings` → Integrations → Discord** — *your own* account link.
>   Every member uses this. It's where the code is generated.
> - **`/dashboard/guild-settings` → Integrations → Discord** — *guild-level*
>   config: which Discord server is connected, its channels, and boss aliases.
>   Guild Leader only.

**On the website:** **Settings** → **Discord** → **Generate link code** → copy.

**In Discord:**

```
!link 7QK2ZP
```

The code is single-use and expires in ~15 minutes. The bot deletes the message
afterwards (with Manage Messages) so it doesn't linger in channel history.

Verify:

```
!cp        # your CP, rank, last updated
!spawn     # upcoming boss spawns
!commands  # everything you can run
```

Unlinked members get a clear "link your account first" reply rather than silence.

---

## Step 8 — Combat Power from a screenshot (OCR)

Attach a screenshot to `!cp` — no text needed:

```
!cp   [screenshot attached]
```

The bot detects **Combat Power**, verifies the **character name**, detects the
**class**, updates the database, and replies with a confirmation showing what it
read and the resulting rank.

**How it decides what to trust:**

- **CP** — anchored on the "Combat Power" label, not "biggest number on screen"
  (the HUD also shows gold, EXP and level). Tolerates common OCR slips
  (`Cornbat Fower`).
- **Name** — used **only to verify** the screenshot is yours. A scan always
  updates the *sender's* row, resolved from their Discord link. A crafted image
  cannot rewrite someone else's CP.
- **Class** — matched against classes already on your roster plus any configured
  in `GuildSettings.characterClasses`. There is no canonical class list in the
  codebase, so it never guesses; with no candidates it simply skips detection.
  It only fills a **blank** class — it will not overwrite one you've set.

**Flagging.** The update always applies immediately, but a scan is marked for
officer review when the name doesn't match, OCR confidence is below
`OCR_MIN_CONFIDENCE`, or CP jumps more than `CP_MAX_GROWTH_RATIO` in one step.
Officers review with:

```
!cp flagged
```

Every scan stores its image URL, confidence and source (`DISCORD_OCR`) in
`combat_power_history`. Note Discord expires attachment URLs after roughly 24h,
so review flagged scans promptly.

### Configuring the class list (optional)

To improve class detection before members have filled in profiles, set
`guild_settings.character_classes` to a JSON array:

```sql
UPDATE guild_settings
SET character_classes = '["Destroyer","Hunter","Mage"]'::jsonb
WHERE guild_id = '<your-guild-id>';
```

### First scan is slow

The first scan downloads ~15MB of OCR language data (~10s). Subsequent scans are
fast. The worker is created once and reused; set `OCR_CACHE_PATH` to a persisted
path so a restart doesn't re-download.

---

## Step 9 — Deploy

Deploying to Railway instead of Fly? See **[RAILWAY.md](./RAILWAY.md)** —
same Dockerfile, different host-specific config. The Fly guide below and the
env var table above still apply either way.

### Fly.io

**No local Docker needed** — `--remote-only` builds the image on Fly's builders.

Run from the **repo root**: the image needs the whole workspace, because the bot
imports `@guild/core`, `@guild/db` and `@guild/shared`.

```bash
fly launch --config apps/bot/fly.toml --dockerfile apps/bot/Dockerfile --no-deploy

fly secrets set \
  DISCORD_TOKEN=... \
  DISCORD_CLIENT_ID=... \
  DATABASE_URL=... \
  DIRECT_URL=... \
  JWT_ACCESS_SECRET=... \
  JWT_REFRESH_SECRET=... \
  SUPABASE_URL=... \
  SUPABASE_KEY=...

fly deploy --config apps/bot/fly.toml --dockerfile apps/bot/Dockerfile --remote-only
```

**Run exactly one instance.** Two would each hold a gateway session and reply to
every command twice. Scheduled notifications are protected by a database-level
dedupe, but command replies are not. Never scale this to zero — a Discord
gateway client must stay connected.

OCR needs headroom: 512MB is the configured minimum. If scans OOM, raise it.

---

## Troubleshooting

| Symptom | Cause |
|---|---|
| `Fatal startup error … "Used disallowed intents"` | **Message Content Intent off** (Step 1a). By far the most common failure. The bot now prints step-by-step guidance when this happens. |
| `An invalid token was provided` | `DISCORD_TOKEN` is wrong or was rotated. Reset it in the portal (Step 1). |
| Bot online, ignores everything | A `!cmdhere` restriction pointing at another channel, or the server isn't bound (Step 6). |
| "There's no Discord section in Guild Settings" | Your personal link is in **Settings** (`/dashboard/settings`), not Guild Settings. Guild Settings → Integrations → Discord is the *guild-level* panel, and is Guild Leader-only. |
| "This Discord server isn't bound to a ForgeKeep guild" | Run `!bindguild <invite-code>` (Step 6) |
| "Your Discord account isn't linked" | Member needs `!link <code>` (Step 7) |
| Bot boots then exits with "Invalid bot environment variables" | Missing env var — the message names it |
| Commands work in one channel only | `!cmdhere` was set. Re-run it in the channel you want. |
| "I couldn't find a Combat Power value" | The CP label must be visible and unobstructed. `!cp <value>` still works. |
| First scan hangs ~10s | Language-data download. Normal once. |
| Prisma errors after a schema change | Re-run `db:generate` **and restart the dev server** |
| Everything is rate limited | Check `RATE_LIMIT_*`. If Redis is down the limiter fails **open** and logs a warning — it never blocks commands. |

---

## Verifying your install

```bash
pnpm --filter @guild/bot typecheck   # clean
pnpm --filter @guild/bot test        # 79 tests
```

In Discord, a healthy install answers all of:

```
!commands
!spawn
!cp
!cp leaderboard
```

---

## Notifications (automatic)

Once `!notifhere` is set, the bot posts to that channel on its own:

| Notification | When |
|---|---|
| ⏰ Spawn warning | `SPAWN_WARNING_MINUTES` (default 5) before a spawn |
| 🟢 Spawn | The boss goes live |
| 💀 Kill | Someone runs `!kill` (skipped if it'd echo the same channel) |
| 📊 Guild CP report | Every `CP_REPORT_INTERVAL_HOURS` (default 12), with a historical snapshot |

**Nothing double-posts.** Every notification claims a UNIQUE `dedupe_key` in
`notification_history` *before* sending, so a restart, an overlapping tick, or a
second instance can't repeat an alert. Worst case is a missed ping, never a
duplicate — the right trade, since double-pings train people to mute the bot.

The scheduler polls (default 30s) rather than setting a timer per boss: a timer
would live in memory, so a restart would lose it and a kill logged *on the
website* would leave a stale timer firing for a boss that's already down.
Polling means the bot always works from current database state. The cost is up
to one tick of latency on a warning.

Set `SCHEDULER_ENABLED=false` to run an instance with no notifications — useful
for a dev instance pointed at the same database.

## Officer boss corrections

```
!editkilltime <boss> <HH:MM>   # fix a mis-logged kill time
!forcespawn <boss>             # mark a boss live right now
!forcespawnall                 # mark every fixed-schedule boss live (Guild Leader)
```

`!editkilltime` is the everyday one: someone logs the kill twenty minutes late,
so every downstream timer is twenty minutes wrong. It restates *only* what
derives from the timestamp — the kill time, the rotation's next spawn, and the
live schedule row — and deliberately does **not** re-advance the rotation queue.
The turn already happened; re-running it would hand the boss to the wrong guild.

`!forcespawnall` is Guild Leader-only, a rung above `!forcespawn`: it rewrites
timers for the entire fixed roster across every guild in the faction.

A force-spawned boss stays live until someone logs a kill. That's intentional —
`SPAWNED` is an officer asserting "it IS up", so the automatic roll-forward that
fixes stale timers leaves it alone.

## Realtime

The bot subscribes to the same `guild-{guildId}` topics the website's own
clients use, and treats realtime strictly as a **cache-invalidation signal** —
never as a data source. Both share one database, so the bot already sees data
changes by reading; what it can't otherwise see is that something it *cached*
changed underneath it (chiefly a member's role).

That distinction is deliberate: if payloads were treated as data, a dropped
message would leave the bot silently wrong. As an invalidation hint, a lost
message is merely a delay — the cache TTL is still the backstop, and correctness
never depends on delivery. Realtime failing to connect degrades to TTL staleness
and logs; it never takes the bot down.

## What's not built yet

Nothing from the original brief remains outstanding.
