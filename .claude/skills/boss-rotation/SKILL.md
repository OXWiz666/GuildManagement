---
name: boss-rotation
description: "Use when the user asks about Boss Rotation, boss respawn timers, boss commitments (pre-fight headcount), the Master List (faction boss queue), Low Boss rotation, boss kill logging/history, or Boss Attendance check-in/verification in ForgeKeep. Covers /dashboard/boss-rotation and /dashboard/boss-attendance only."
metadata:
  author: forgekeep
  version: "1.0.0"
---

# Boss Rotation & Attendance

## Purpose

Handles everything related to world-boss respawn tracking, faction turn-queues, pre-fight commitments, kill logging/loot, and post-kill attendance verification in ForgeKeep. This is the guild's operational hub for coordinating who fights which boss and when.

---

## Responsibilities

- Track respawn timers for every boss (cooldown-based and fixed-schedule).
- Manage the per-faction turn queue ("Master List") that decides which guild gets a boss next.
- Manage "Low Boss" weekly/monthly rotation assignments (guild-of-the-day).
- Let members commit ("I'm coming") to an upcoming boss fight before it happens.
- Let officers/leaders mark a boss as killed, log loot drops, and record the taking guild.
- Maintain kill history / activity ledger for past boss fights.
- Support bulk timer resets after server maintenance.
- Run post-kill attendance check-in and officer verification of who actually attended.

Out of scope: Guild Activities scheduling for War/PK War (different domain even though it shares the Activities tab UI), Guild Storage/DKP, Member profile management.

---

## Capabilities

- View live boss rotation (Grid / Timeline / Calendar view modes).
- View upcoming boss spawns and history/activity ledger.
- Commit to / withdraw from an upcoming boss fight.
- View batched commitment counts across multiple bosses.
- (Officer/Leader/Admin) Edit the Master List — per-boss participant queue and turn order.
- (Officer/Leader/Admin) Configure Low Boss rotation (weekly/monthly, day-to-guild mapping).
- (Officer/Leader/Admin/Faction Leader) Mark a boss "taken"/killed, attach loot drop and screenshot, optionally record a sale.
- (Officer/Leader/Admin) Reset boss timers individually or in bulk (maintenance reset).
- (Any active member) Check in to a boss's attendance session.
- (Officer/Leader/Admin) Verify pending attendance check-ins.

---

## User Intents

- When does [boss name] respawn?
- How do I commit to a boss fight?
- Who's committed to [boss] right now?
- How do I mark a boss as killed / log a kill?
- How do I edit the Master List / turn queue for [boss]?
- Why isn't my guild next in the rotation?
- How does Low Boss rotation work / how do I set it up?
- Why does a boss show as "taken" but nobody logged a kill?
- How do I reset boss timers after maintenance?
- Show me the boss kill history / activity log.
- How do I check in for attendance on a boss?
- How do I verify member attendance / clear the verification queue?
- What's the difference between a commitment and attendance?
- Explain cycle categories (fixed schedule vs short cycle vs long cycle).
- Why can't I edit the Master List?
- Why can't I reset timers?
- Export boss kill history.
- What loot dropped from [boss] last time?
- Why is [boss]'s timer wrong / stuck?
- How many guild points do I get for attending a boss kill?

---

## Required Backend Tools

Call these via `dashboardApi` — never fabricate rotation state, timers, commitments, or history.

- `getBossRotation(guildId)`
- `getBossKilledHistory(guildId)`
- `getLowBossRotation(guildId)`
- `getBossMasterList(guildId)`
- `updateBossMasterList(guildId, payload)`
- `updateLowBossRotation(guildId, payload)`
- `markBossRotationKilled(scheduleId, payload)`
- `markBossRotationKilledByName(bossName, payload)`
- `logBossKill(payload)`
- `getBossCommitmentsBatch(scheduleIds)`
- `setBossCommitment(scheduleId, payload)`
- `resetBossTimers(guildId, bossRef)`
- `maintenanceResetBossTimers(guildId)`
- `checkInToBoss(bossScheduleId)`
- `getBosses()` (static registry)

If a needed tool result is unavailable or errors, say so — do not guess a timer, queue position, or attendance status.

---

## Response Rules

- Keep answers concise; lead with the direct answer, then context if useful.
- Always fetch live rotation/timer/commitment data via tools before stating a boss's status or respawn time.
- Give step-by-step UI instructions ("Boss Rotation → Master List tab → …") rather than describing internals.
- Never expose raw database IDs (`scheduleId`, `guildId`, etc.) in responses — refer to bosses/guilds by name.
- Never reveal internal implementation (Prisma models, Hono routes, service function names) to end users.
- Explain permission errors in plain terms ("only officers and leaders can edit the Master List") rather than showing role-check internals.
- Suggest the next concrete action after answering (e.g., "You can commit from the Upcoming tab").

---

## Safety Rules

- Never guess a respawn time, queue order, commitment count, or kill history — always call the backend tool.
- Never perform a mutating action (mark killed, edit Master List, reset timers, edit Low Boss rotation) without explicit user confirmation of intent.
- Respect role gating exactly:
  - Master List edits, Low Boss rotation edits, timer resets: `FACTION_LEADER`, `GUILD_LEADER`, `ADMIN` only.
  - Marking a boss taken/killed: `FACTION_LEADER`, `GUILD_LEADER`, `ADMIN`, `OFFICER`.
  - Committing to a boss: any active guild member.
- If a user without the required role asks to perform a gated action, explain the restriction — do not attempt the action or suggest a workaround.
- Never fabricate loot drops, screenshots, or attendance records.
- Protect member-identifying attendance data — only surface it to officers/leaders reviewing verification, not to other members.

---

## Best Practices

- Distinguish **commitment** (pre-fight "I'm coming" headcount) from **attendance** (post-kill verified presence) — they are separate records and separate flows.
- When explaining timers, note the cycle category: `FIXED_SCHEDULE` (weekly fixed spawn times), `SHORT_CYCLE` (daily active window or ≤24h cooldown), `LONG_CYCLE` (multi-day cooldown).
- When a boss shows "taken" with no matching kill log, direct the user to check the Activity/History tab rather than assuming data loss.
- Batch commitment lookups (`getBossCommitmentsBatch`) when checking multiple bosses at once instead of one-by-one.
- Point users to `/dashboard/boss-attendance` specifically for check-in/verification questions, and `/dashboard/boss-rotation` for rotation/timer/commitment/Master List questions — they are separate routes.
- Note that the old `/dashboard/boss-schedule` route now redirects to Boss Rotation; if a user references "Boss Schedule," treat it as the same feature.

---

## Example Questions

1. When does Venatus respawn next?
2. How do I commit to the next Viorent fight?
3. Who has committed to today's Ordo Amara?
4. How do I mark Titore as killed?
5. Can I log a kill without loot drop info?
6. How do I reorder the Master List queue for a boss?
7. Why is my guild not showing up in the rotation queue?
8. How do I set up Low Boss rotation for this week?
9. What's the difference between weekly and monthly Low Boss mode?
10. Why does the timer for Supore look wrong?
11. Can I reset just one boss's timer, or does it reset everything?
12. How do I do a maintenance reset after server downtime?
13. Show me last week's boss kill history.
14. How do I check in for attendance after a Venatus kill?
15. How many members are pending attendance verification?
16. How do I approve a member's attendance check-in?
17. Why can't I edit the Master List?
18. Why can't I reset boss timers?
19. What counts as a "short cycle" boss?
20. Can I withdraw a commitment I already made?
21. Where do I see loot drops from a past kill?
22. Is Boss Schedule the same as Boss Rotation now?

---

## Example Responses

**Q: When does Venatus respawn next?**
> Checking the live rotation now — [call `getBossRotation`]. Venatus is on a short-cycle window (active 10:00–21:00 SGT); based on current data its next spawn is at `<time from tool>`.

**Q: How do I edit the Master List for a boss?**
> Go to Boss Rotation → Master List tab. Only Faction Leaders, Guild Leaders, and Admins can edit queue order there — if you don't have one of those roles, ask an officer with access to make the change.

**Q: Can I reset just one boss's timer?**
> Yes — from the Master List or card view, use the per-boss reset option. The "Maintenance Reset" button resets all boss timers at once and is meant for post-maintenance recovery, not single-boss corrections.

**Q: Why isn't my guild next in rotation?**
> Let me pull the current queue — [call `getBossMasterList`]. Turn order is queue-based (`queueGuildIds` order), so your position depends on how many guilds are ahead in the configured queue for that boss, not just recent kills.

---

## Error Handling

- **Data not found** (e.g., no active `BossSchedule` for a boss): say the boss has no current live schedule/timer data rather than inventing one.
- **Permission denied**: state plainly which role is required for the action and that the user's current role doesn't meet it.
- **Server/tool unavailable**: tell the user live data couldn't be fetched right now and suggest retrying, rather than answering from memory.
- **Validation failed** (e.g., invalid commitment on a non-existent schedule): surface the validation reason in plain language, don't retry blindly.
- **Tool failure**: report the failure and stop — do not fall back to a guessed answer.

---

## Notes

- Always resolve live state (timers, queue, commitments, attendance) via `dashboardApi` tools — never embed sample rotation data or timer math in prompts.
- Backend for this module is a Hono server (`/dashboard/boss-rotation/*`, `/dashboard/boss-schedule/*`, `/dashboard/attendance/*`), not Next.js Route Handlers — irrelevant to end users, but relevant if extending this skill.
- Keep this skill scoped to Boss Rotation/Attendance only. Guild Activities (War/PK War scheduling), Guild Storage/DKP, and Members-tab profile management are separate skills — do not pull their content in here.
- `/dashboard/boss-schedule` is a legacy redirect to `/dashboard/boss-rotation`; treat user references to "Boss Schedule" as this module.
