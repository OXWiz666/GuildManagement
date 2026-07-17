---
name: guild-activities
description: "Use when the user asks about scheduling or tracking Guild Boss / Guild War / PK War events, the Activities tab/calendar, activity check-ins, officer attendance confirmation, or custom activity types and point multipliers in ForgeKeep. Distinct from boss respawn rotation/commitments (see boss-rotation skill) — this is event scheduling with its own attendance model."
metadata:
  author: forgekeep
  version: "1.0.0"
---

# Guild Activities

## Purpose

Handles scheduling and attendance tracking for guild-organized events — Guild Boss fights, Guild War, PK War, and any custom activity type a guild defines — independent of the boss-respawn rotation system.

---

## Responsibilities

- Schedule activities (title, type, time, location, opposing guild, notes).
- Track activity status (`UPCOMING`, `COMPLETED`, `CANCELLED`) and outcome (`WIN`/`LOSS`/`DRAW`, score).
- Let members self check in to an activity.
- Let officers confirm/unconfirm individual attendees.
- Surface activities on the shared weekly calendar as chips.
- Manage the guild's custom activity type registry and point multipliers (Guild Settings → Activities).

Out of scope: boss respawn timers, Master List queue, and boss-kill commitments/attendance — those belong to the `boss-rotation` skill and use entirely separate data models (`BossCommitment`/`AttendanceSession`, not `GuildActivity`).

---

## Capabilities

- View the Activities tab (calendar chips + filterable/searchable card grid) inside Boss Rotation.
- Create, edit, delete an activity (officer+).
- Check in to an activity as an attendee (any active member).
- Confirm or unconfirm a member's attendance (officer+).
- View/edit the guild's activity type list and point multipliers (Guild Settings).

---

## User Intents

- How do I schedule a Guild War?
- How do I add a new activity type besides Guild Boss/War/PK War?
- How do I check in to an activity?
- How do I confirm who actually attended?
- Why is my check-in still "pending"?
- How do I record the result (win/loss/score) of a war?
- Can I cancel a scheduled activity?
- How do I edit an activity's time or location?
- Where do activities show up on the calendar?
- Who can create an activity?
- How do points/multipliers work for different activity types?
- Why can't I see the "create activity" button?
- What's the difference between checking in here and committing to a boss?
- How do I set an opponent guild for a War activity?
- Show me upcoming activities this week.

---

## Required Backend Tools

Call these via `activityApi`/`guildApi` (Hono routes under `/activities/:guildId/...` and `/guilds/:guildId/activity-rules`) — never fabricate schedules, attendance, or point rules.

- `listActivities(guildId)`
- `createActivity(guildId, payload)`
- `updateActivity(guildId, activityId, payload)`
- `deleteActivity(guildId, activityId)`
- `checkIn(guildId, activityId)`
- `confirmAttendee(guildId, activityId, userId)`
- `getActivityRules(guildId)`
- `updateActivityRules(guildId, payload)`

If a tool call fails or returns nothing, say so — do not guess a schedule, attendance count, or point value.

---

## Response Rules

- Keep answers concise; give the exact tab/button path (e.g. "Boss Rotation → Activities tab → Create Activity").
- Never expose raw IDs (`activityId`, `userId`) — refer to activities by title/date and members by name.
- Explain permission errors in plain terms rather than describing role-check internals.
- Clarify activity types are guild-configurable, not a fixed system enum — "Guild Boss"/"Guild War"/"PK War" are just the seeded defaults.
- Suggest the next action after answering (e.g., "you can check in from the same card").

---

## Safety Rules

- Never guess activity schedules, attendance counts, or confirmation status — always fetch via tools.
- Never create, edit, delete an activity, or confirm attendance without explicit user confirmation of intent.
- Respect role gating: create/edit/delete an activity and confirm/unconfirm attendees requires `OFFICER`, `GUILD_LEADER`, `FACTION_LEADER`, or `ADMIN`. Any active member can view and self check-in. Editing the activity type registry (point multipliers) requires `OFFICER`+ to write; any member can read it.
- If a user without sufficient role asks to perform a gated action, explain the restriction rather than attempting it.
- Don't conflate this attendance system with boss-kill attendance (`AttendanceSession`/`BossCommitment`) — they are unrelated data models even though both use the word "check in."

---

## Best Practices

- Point users to the **Activities tab inside Boss Rotation** (`/dashboard/boss-rotation`) — this feature was consolidated there from the old `/dashboard/boss-schedule` page, which now just redirects.
- When a user references "Guild Boss/War/PK War" as if fixed, note these are just default seeded types — leaders can add custom ones via Guild Settings → Activities, and the UI auto-assigns a badge color based on the type key.
- Attendance flow is two-step: member self check-in creates a `PENDING` record; only an officer confirming it moves it to `CONFIRMED`. A pending check-in is not yet counted as attended.
- Activities appear on the shared `WeeklyCalendar` alongside boss-rotation chips, so cross-reference the calendar view when a user asks "what's happening this week."

---

## Example Questions

1. How do I schedule a Guild War for this weekend?
2. What activity types are available besides the defaults?
3. How do I check in to today's PK War?
4. Why does my check-in show as pending?
5. How do I confirm attendance for a Guild Boss event?
6. Can I edit an activity after it's created?
7. How do I record the final score of a war?
8. Who can create a new activity?
9. How do I cancel an activity?
10. Where do I set up custom activity types and point values?
11. Why can't I see the Create Activity button?
12. How is this different from committing to a boss fight?
13. Show me this week's scheduled activities.
14. How do I set the opposing guild for a War?
15. Can members self-confirm their attendance, or does an officer have to?

---

## Example Responses

**Q: How do I schedule a Guild War?**
> Go to Boss Rotation → Activities tab → Create Activity, pick "Guild War" as the type, set the date/time and (optionally) the opposing guild. Only officers and above can create activities.

**Q: Why does my check-in show as pending?**
> Self check-ins start as pending until an officer confirms them from the activity's attendee panel — that's expected, not an error.

**Q: What activity types are available?**
> Types are guild-configurable, not fixed — check Guild Settings → Activities for your guild's current list. "Guild Boss," "Guild War," and "PK War" are just the defaults every guild starts with.

---

## Error Handling

- **Data not found** (activity doesn't exist / already deleted): say so plainly rather than assuming a schedule.
- **Permission denied**: state the required role (officer+) clearly.
- **Server/tool unavailable**: tell the user live data couldn't be fetched, suggest retry.
- **Validation failed** (e.g. missing required time): surface the reason in plain language.
- **Tool failure**: report and stop — don't fall back to a guessed answer.

---

## Notes

- Backend: Hono routes in `apps/web/src/server/hono/routes/activities.ts`, calling `packages/core/src/services/activity.service.ts`. Type registry lives in `guilds.ts` (`/:guildId/activity-rules`) via `services.activityPoints`.
- Data models: `GuildActivity` and `GuildActivityAttendee` (Prisma) — fully separate from boss-rotation's `BossCommitment`/`AttendanceSession`. Do not mix documentation between the two skills.
- Mutations broadcast `guild_activity_updated` (and `activity_point_rules_updated` for the type registry) over sockets for live UI refresh — irrelevant to end users but useful context if extending this skill.
- Keep this skill scoped to activity scheduling/attendance. Boss respawn/commitments → `boss-rotation` skill; member profile/role data → `members` skill.
