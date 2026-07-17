# Full-Test.md — Pre-Production QA Checklist

Branch: `fix/boss-rotation-layout`
Covers: Boss Rotation/Guild Activities redesign, Members/Statistics redesign, performance pass, Guild Activities customization (color/repeat/defaults), notification sounds.

Run this against a build pointed at the **Development** Supabase project first. Do not check items off from reading the code — click through the actual app.

---

## 0. Pre-flight

- [ ] `pnpm install` clean (no lockfile drift)
- [ ] `npx tsc --noEmit` clean in `apps/web`, `packages/core`, `packages/shared`
- [ ] `npx eslint .` — no new errors (warnings pre-existing in this repo are OK, do not chase them)
- [ ] `next build --webpack` succeeds
- [ ] `npx prisma generate` run, **dev server restarted after** (stale Prisma Client is a known footgun in this repo — old client silently rejects new columns with "Unknown argument")
- [ ] Confirm `.env` points at the Supabase project you intend to test against

---

## 1. Boss Rotation — Activities tab (redesigned)

- [ ] Activities tab loads under Boss Rotation without console errors
- [ ] Weekly calendar renders chips for both boss spawns and activities on the correct days
- [ ] Create a new activity of each type (Field Boss, Guild Boss, Guild Arena, PVP, PVE, Custom) — each appears with its assigned color badge on the card and calendar chip
- [ ] Edit an existing activity — title/date/time/location/opponent/notes all save and reflect immediately
- [ ] Self check-in as a member — status shows PENDING
- [ ] Officer confirms the check-in — status flips to CONFIRMED, count updates for all connected clients (test with two browser sessions / two tabs)
- [ ] Delete an activity — disappears from list and calendar
- [ ] History Ledger view renders past activities correctly, filters work

## 2. Guild Activities — Repeat Schedule (new)

- [ ] Create an activity with Repeat = Weekly
- [ ] Mark it Completed — a new UPCOMING activity is auto-created exactly 7 days after the original's `scheduledAt`, same title/type/location/opponent/notes, repeat interval carried forward
- [ ] Repeat the test for Biweekly (14 days) and Monthly (30 days)
- [ ] Create an activity with Repeat = "Does not repeat", mark Completed — confirm **no** new activity is created
- [ ] Cancel a repeating activity (status = CANCELLED, not COMPLETED) — confirm no auto-repeat fires
- [ ] Edit an existing repeating activity's interval mid-flight (e.g. Weekly → Monthly) and confirm the next auto-created occurrence uses the new interval

## 3. Guild Activities — Color picker & new defaults (new)

- [ ] Guild Settings → Activities: color dot picker shows 8 swatches per row, clicking one highlights it and updates the row
- [ ] Save, reload the page — chosen colors persist
- [ ] A brand-new guild (or a guild that has never saved custom activity rules) shows the new default 6 types: Field Boss, Guild Boss, Guild Arena, PVP, PVE, Custom — each with a distinct pre-assigned color, no two the same
- [ ] Add a brand-new custom activity type with no color chosen — confirm it still gets a stable, distinct badge color (hash fallback) instead of the neutral/unknown badge
- [ ] Existing guild with previously-saved activity rules (pre-dating this change) still shows its own saved list, unaffected by the new defaults

## 4. Members tab & Statistics

- [ ] Members roster loads, search/filter/sort all work and feel instant on repeat interaction (no visible lag typing in search)
- [ ] Members Statistics sub-tab renders KPI cards with real numbers, no NaN/undefined
- [ ] Stalk Profile modal opens/loads/closes cleanly for a few different members

## 5. Guild Market — Distribution & Inventory

- [ ] Legendary Priority tab: search/category/status filters respond instantly
- [ ] Wishlist / Member Wishlist: set your own wishlist, confirm it saves and appears in the officer Master List **within a couple seconds**, not minutes
- [ ] Distribution History (audit log) tab: search/action filters respond instantly
- [ ] Guild Storage (Vault): mark an item **Sold** — confirm it appears in **Loot Sales** (Guild Market → Treasury → Loot Sales) within a few seconds, not up to 2 minutes
- [ ] Record a direct loot sale (non-storage flow) — still works and appears immediately (regression check)
- [ ] Auction Hall: create an auction, place a bid — still fresh/live, not stale (this path was deliberately left uncached — confirm it still behaves correctly)

## 6. Equipment / OCR scanner

- [ ] Equipment tab loads, catalog and drops-catalog show real icons (not blank/broken images) — this depends on the target Supabase project's storage buckets being populated
- [ ] Start a scan — Crop Selector, Correction Picker, and (if used) Scan Debug Overlay all load correctly (these are now `next/dynamic`-loaded — confirm no flash-of-missing-component or hydration error)
- [ ] "Record Drops" picker (boss-rotation → Take boss → log drops) shows real items, not "No items match your filters" (again, storage-bucket dependent on target project)

## 7. Notifications

- [ ] Notification bell dropdown shows the sound picker next to the mute toggle
- [ ] Selecting a different sound plays a preview immediately
- [ ] Trigger a real notification (e.g. have another account submit a join request) — confirm the **selected** sound plays, not always the default
- [ ] Mute — confirm no sound plays on a new notification; sound dropdown becomes disabled
- [ ] Refresh the page — muted state and selected sound both persist

## 8. API / backend regression sweep

- [ ] Network tab: API responses show `content-encoding: gzip`
- [ ] No 500s in server logs during the above flows
- [ ] Auth flows unaffected: login, refresh, logout all still work
- [ ] Role changes on the Members tab still work and broadcast live to other sessions
- [ ] Join request → accept flow still adds the member to the roster live

## 9. Database — before promoting to Production

- [ ] Confirm target Production project id before running anything (`tsjuckpzfuaozktqhior` — NOT the Development project)
- [ ] Take a manual Supabase backup/snapshot point (or confirm PITR is enabled) before applying migrations
- [ ] Apply `manual-migrations/0017_perf_indexes.sql` and `0018_activity_repeat.sql` to Production (see workflow doc) — both are additive only (`CREATE INDEX IF NOT EXISTS`, `ADD COLUMN`), no data loss risk
- [ ] After applying, spot-check: `guild_members_guild_id_is_active_idx`, `sessions_user_id_last_active_idx` exist; `guild_activities.repeat_interval` column exists
- [ ] Do NOT run any RLS-enabling SQL against Production as part of this push — that's a separate, deliberate decision already in place there

## 10. Rollback plan

- [ ] Know how to revert the Vercel deployment (redeploy previous build) if the frontend misbehaves
- [ ] Both new migrations are non-destructive (additive index/column) — no rollback SQL is strictly required, but if needed: `DROP INDEX IF EXISTS guild_members_guild_id_is_active_idx;`, `DROP INDEX IF EXISTS sessions_user_id_last_active_idx;`, `ALTER TABLE guild_activities DROP COLUMN IF EXISTS repeat_interval;`
- [ ] Confirm which git branch Vercel's Production Branch setting actually points at before assuming a revert took effect

---

## Sign-off

- [ ] All sections above checked on Development
- [ ] Migrations applied to Production DB
- [ ] Code merged to `main` (PR) and promoted to `production` branch
- [ ] Post-deploy smoke test repeated against the live production URL (sections 1–8, abbreviated)
