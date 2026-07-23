# Production Deployment Checklist

Use this before every production deployment. Do not deploy until every required
item for the release is checked, tested, or explicitly marked not applicable.

## Release Gate

- [ ] Confirm the branch/PR includes only intended changes.
- [ ] Confirm no local-only files are staged, especially `.env`, `.claude/*`, logs, screenshots, or temp files.
- [ ] Confirm the PR has passed CI or the equivalent local checks below.
- [ ] Confirm production environment variables are present in Vercel/Railway/Fly:
  - `DATABASE_URL`
  - `DIRECT_URL`
  - `JWT_ACCESS_SECRET`
  - `JWT_REFRESH_SECRET`
  - `SUPABASE_URL`
  - `SUPABASE_KEY`
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
  - bot variables such as `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, and command prefix settings
- [ ] Confirm production Redis/Upstash settings are configured if cache invalidation is expected across instances.
- [ ] Confirm the production bot points at the same database as the website.
- [ ] Confirm the target deployment URL and Discord bot environment are production, not staging/local.

## Database Migration Gate

- [ ] Review every SQL file in `packages/db/prisma/manual-migrations`.
- [ ] Confirm migrations are additive/idempotent when possible.
- [ ] Confirm destructive schema/data changes have a rollback plan and a backup.
- [ ] Apply required migrations to production before deploying app code that depends on them.
- [ ] Verify applied migrations with a read-only SQL assertion.
- [ ] For Prisma schema changes, run:

```bash
pnpm --filter @guild/db db:generate
pnpm --filter @guild/core typecheck
pnpm --filter @guild/web exec tsc --noEmit
pnpm --filter @guild/bot typecheck
```

## Required Local Checks

- [ ] `pnpm install --frozen-lockfile`
- [ ] `pnpm --filter @guild/db db:generate`
- [ ] `pnpm --filter @guild/core typecheck`
- [ ] `pnpm --filter @guild/web exec tsc --noEmit`
- [ ] `pnpm --filter @guild/bot typecheck`
- [ ] `pnpm --filter @guild/bot test -- registry`
- [ ] `pnpm --filter @guild/web exec eslint 'src/app/(dashboard)/dashboard/boss-attendance/components/AttendanceSessionModal.tsx'` when attendance UI changed
- [ ] Full `pnpm build` before major releases or shared package changes

## Smoke Test Accounts

Prepare or identify one account for each user level:

- [ ] Unlinked Discord user
- [ ] Linked Discord user with no active guild membership
- [ ] Member
- [ ] Elite/Core member, if custom ranks are used
- [ ] Officer
- [ ] Guild Leader
- [ ] Faction Leader
- [ ] Platform/Admin user, if admin routes changed

## Smoke Test: Authentication And Linking

- [ ] Email/password login works.
- [ ] Discord OAuth login works.
- [ ] Discord OAuth login links the ForgeKeep account without needing `!link`.
- [ ] Existing linked Discord user can run member commands immediately after website login.
- [ ] Unlinked Discord user sees the link message only when truly unlinked.
- [ ] Linked but non-member Discord user sees the guild-membership message, not the link message.
- [ ] Logout clears the web session.
- [ ] Refreshing the dashboard keeps the user authenticated.

## Smoke Test: Guild Joining And Membership

- [ ] Member can create or submit a guild join request.
- [ ] Member appears in pending applications without manual refresh.
- [ ] Guild Leader/Officer can approve a join request.
- [ ] Newly approved member appears in Members without manual refresh.
- [ ] Member can leave guild only through the intended flow.
- [ ] Role change in Members succeeds.
- [ ] Role rename in Guild Settings succeeds.
- [ ] Member role badge updates in sidebar/header/member list.
- [ ] Bot permissions update after role change.

## Smoke Test: Dashboard Overview

- [ ] Overview loads without long skeleton delay.
- [ ] Next boss spawn card renders the correct boss, timer, status, turn, and image.
- [ ] Commitment controls render in the Next boss spawn card.
- [ ] Upcoming bosses list loads and scrolls.
- [ ] Affiliations/Your guilds section renders.
- [ ] Recent Activity renders without blocking the main overview.
- [ ] A solo guild without a faction can create a faction from Overview.
- [ ] Creating or joining a guild/faction updates the dashboard without manual refresh.

## Smoke Test: Boss Rotation And Schedule

- [ ] Boss Rotation tab loads.
- [ ] Upcoming tab loads.
- [ ] Guild Event tab loads.
- [ ] Faction Schedule tab loads.
- [ ] Activity tab loads.
- [ ] Fixed-hour boss ledger loads.
- [ ] Fixed-schedule boss ledger loads.
- [ ] History has aligned Edit and Details buttons.
- [ ] Edit boss history opens, saves, and refreshes the row.
- [ ] Details opens and shows the correct kill data.
- [ ] Reset Timers works for permitted roles only.
- [ ] Maintenance Reset works for permitted roles only.
- [ ] Refresh reloads the latest timers.

## Smoke Test: Boss Attendance

- [ ] Boss Attendance page loads sessions.
- [ ] Member can check in during an open window.
- [ ] Member sees Pending after check-in.
- [ ] Officer/Guild Leader can mark a single member present.
- [ ] Officer/Guild Leader can confirm a pending member.
- [ ] Officer/Guild Leader can revoke attendance.
- [ ] Officer/Guild Leader can set confirmed attendance back to pending.
- [ ] Mark All Present works for one member and multiple members.
- [ ] Verify Checked works for selected pending records.
- [ ] Batch actions show partial failure messages when any request fails.
- [ ] Reopen Window works on a closed session.
- [ ] Close Window removes or expires the session as intended.
- [ ] Attendance stats update after confirm/revoke.

## Smoke Test: AI Attendance Scanner

- [ ] `!attendance <boss> [minutes]` accepts a valid rally screenshot.
- [ ] White/highlighted member names are marked Confirmed.
- [ ] Gray member names are queued as Pending for officer review.
- [ ] Already confirmed members are not duplicated or downgraded.
- [ ] Unmatched OCR names appear under Needs Review.
- [ ] Scanner output references the correct boss/session.
- [ ] Officer can confirm gray/pending names in the web attendance modal.

## Smoke Test: Discord Bot Commands

Run as Member:

- [ ] `!commands` shows only member-available commands.
- [ ] `!spawn` lists boss spawns and events.
- [ ] `!spawn <boss>` shows single-boss details.
- [ ] `!cp` updates combat power or gives a clear upload instruction.

Run as Officer/Guild Leader/Faction Leader:

- [ ] `!kill <boss>` logs a boss kill.
- [ ] `!editkilltime <boss>` corrects the kill time.
- [ ] `!setspawn <boss>` sets the next spawn.
- [ ] `!forcespawn <boss>` forces one boss live.
- [ ] `!forcespawnall` forces fixed-schedule bosses live.
- [ ] `!attendance <boss>` scans attendance.
- [ ] `!party <boss>` shows committed members.
- [ ] `!items` returns boss-drop item names.
- [ ] `!alias` list/add/remove works for permitted roles.
- [ ] `!bindguild`, `!cmdhere`, `!notifhere`, `!threadhere`, and `!webhookhere` are restricted to the correct roles.

Run as Unlinked:

- [ ] `!commands` shows only link/help commands.
- [ ] Protected commands show the correct unlinked message.

## Smoke Test: Faction

- [ ] Faction page loads for affiliated guilds.
- [ ] Solo guild can create a faction.
- [ ] Faction Leader can manage faction-level data.
- [ ] Guild Leader/Officer cannot perform Faction Leader-only actions.
- [ ] Faction-wide boss rotations show the correct participating guilds.
- [ ] Solo Boss rotations remain scoped to the solo guild.

## Smoke Test: Members

- [ ] Search by name, IGN, and member code works.
- [ ] Role filter works.
- [ ] Sort works.
- [ ] Change Role opens and saves.
- [ ] Custom role assignment works.
- [ ] Role display names update after Guild Settings save.
- [ ] Member CP, balance, and guild points display.
- [ ] Current user row is correctly labeled.

## Smoke Test: Guild Settings

- [ ] General Settings saves.
- [ ] Guild Points System saves.
- [ ] Activities Multiplier saves.
- [ ] Distribution Rules saves.
- [ ] Moderator and Permission role names save.
- [ ] Built-in rank rename saves.
- [ ] Custom role create/update/delete works.
- [ ] Discord Integration settings save.
- [ ] No `guild_settings.settings_template_name` error appears in Vercel logs.

## Smoke Test: Gear And Combat Power

- [ ] My Gear page loads.
- [ ] Gear edits save.
- [ ] CP screenshot scan works from the web, if changed.
- [ ] `!cp` screenshot scan works from Discord.
- [ ] Class detection still uses configured guild classes.
- [ ] CP history updates after a successful scan.

## Smoke Test: Guild Market

- [ ] Guild Market page loads.
- [ ] Member can submit item requests within limits.
- [ ] Request limits enforce rank/CP tier rules.
- [ ] Officer/Guild Leader can approve/decline/fulfill requests.
- [ ] Wishlist save/load works.
- [ ] Legendary priority queue loads and updates.
- [ ] Market rules save.
- [ ] Officer notifications fire for new requests.

## Smoke Test: Guild Storage

- [ ] Storage page loads.
- [ ] Officer can add storage item.
- [ ] Officer can list item in next market.
- [ ] Officer can recall listed item.
- [ ] Officer can mark listed item sold.
- [ ] Sold item creates the expected ledger/loot sale entry.
- [ ] Storage updates appear without manual refresh.

## Smoke Test: Distribution

- [ ] Distribution page loads.
- [ ] Officer can distribute item to eligible member.
- [ ] Distribution limits apply by rank/tier.
- [ ] Override flow works only for permitted roles.
- [ ] Member wishlist fulfillment updates after distribution.
- [ ] Distribution appears in audit/activity logs.

## Smoke Test: Auction Hall

- [ ] Auction Hall page loads.
- [ ] Officer/Guild Leader can create auction.
- [ ] Member can bid when allowed.
- [ ] Auction close/cancel permissions work.
- [ ] Winning bid and ledger entries are correct.

## Smoke Test: Boss Operations And Activity

- [ ] Boss Operations Objectives page loads.
- [ ] Officer can create/update/delete objective.
- [ ] Member can view objectives.
- [ ] Activity/Events list loads.
- [ ] Member check-in/commitment state updates.
- [ ] Officer confirmation updates related stats.

## Smoke Test: Accounting And Audit

- [ ] Accounting dashboard loads.
- [ ] Currency symbols/codes display correctly.
- [ ] Treasury balances update after attendance, loot sales, and adjustments.
- [ ] Ledger page loads and paginates.
- [ ] Audit Log page loads.
- [ ] Role changes, attendance changes, market actions, storage actions, and boss kills appear in audit logs.

## Smoke Test: Notifications And Realtime

- [ ] Web realtime updates work after role/member/attendance changes.
- [ ] Bot notification channel receives configured spawn/kill notifications.
- [ ] Duplicate notification prevention works.
- [ ] Wrong command channel is ignored when `!cmdhere` is configured.
- [ ] Notification channel and command channel can be changed by permitted roles.

## Post-Deployment Production Checks

- [ ] Open the production web app.
- [ ] Login as Member and Guild Leader.
- [ ] Run `!commands`, `!spawn`, and one officer-only command in Discord.
- [ ] Check Vercel logs for Prisma, auth, and API errors.
- [ ] Check bot logs for command rejection spikes or uncaught errors.
- [ ] Check Supabase logs for failed SQL or auth calls.
- [ ] Confirm no users report stale role/link state after 60 seconds.
- [ ] Confirm production migration assertions still pass.

## Rollback Plan

- [ ] Identify the previous stable deployment.
- [ ] Keep the previous bot deployment artifact/commit available.
- [ ] For additive DB migrations, prefer forward-fix over rollback.
- [ ] For destructive DB migrations, restore from verified backup or execute the documented down migration.
- [ ] If bot commands fail, disable or roll back bot deployment first; leave web read paths online when possible.
- [ ] If auth/linking fails, stop deploy rollout and verify Supabase OAuth settings before retrying.

