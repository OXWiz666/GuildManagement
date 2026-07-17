---
name: members-tab
description: "Use when the user asks about the guild member roster, member search/sort/filter, member profile cards ('stalk' popup), role changes/promotions, custom roles, join applications, invite codes, or member combat-power/class/weapon fields in ForgeKeep. Covers /dashboard/members only — not boss/activity attendance or storage/DKP."
metadata:
  author: forgekeep
  version: "1.0.0"
---

# Members Tab

## Purpose

Manages the guild member roster: viewing, searching, sorting members, editing character profile fields, changing roles, and handling join applications and invite codes.

---

## Responsibilities

- List and search/filter active guild members.
- Sort members by name, ranking, guild points, balance, class, combat power, or join date.
- Show a per-member profile popup ("stalk" card) with character stats and role.
- Let a member edit their own character profile fields (IGN, class, weapon, CP, avatar, banner).
- Let a Guild Leader change another member's role, including custom roles and leadership transfer.
- Manage custom role definitions.
- Handle join applications (officer review) and invite codes (generate/view).

Out of scope: balance/guild-points *computation* (owned by the accounting/ledger system — this tab only displays it), boss/activity attendance, and guild storage/DKP (separate skills).

---

## Capabilities

- Search members by display name, IGN, or member code.
- Filter by role (`ALL`/`GUILD_LEADER`/`OFFICER`/`CORE_MEMBER`/`ELITE_MEMBER`/`MEMBER`).
- Sort by Name, Ranking, Guild Points, Balance, Class, CP, or Joined date.
- Open a member's profile popup to view character stats, role, balance, guild points.
- (Self) Edit own IGN, class, weapon, CP, avatar, and banner.
- (Guild Leader) Change any member's role, assign a custom role, or transfer guild leadership.
- (Guild Leader) Create/edit/delete custom role definitions.
- (Officer) Review pending join applications (approve/reject).
- (Officer) View the guild invite code; (Guild Leader) regenerate it.
- View aggregate member statistics (Statistics tab).

---

## User Intents

- How do I find a specific member?
- How do I sort members by combat power / balance / guild points?
- How do I change my IGN or class?
- How do I promote/demote a member?
- How do I transfer guild leadership?
- How do I create a custom role?
- Why can't I change someone's role?
- How do I approve a join application?
- Where's the guild invite code?
- How do I regenerate the invite code?
- What does the member profile popup show?
- Can I edit another member's character stats?
- How do I remove/kick a member?
- What's the difference between "balance" and "guild points"?
- How do I upload my avatar/banner?
- Why is a member showing as offline/online?
- What roles are assignable?

---

## Required Backend Tools

Call these via `guildApi`/`authApi`/`dashboardApi` — never fabricate roster data, balances, or role state.

- `getMembers(guildId)`
- `updateMemberRole(guildId, memberId, { role?, customRoleId? })`
- `getCustomRoles(guildId)` / create / update / delete custom role
- `getApplications(guildId)` / `updateApplication(guildId, requestId, decision)`
- `getInviteCode(guildId)` / generate invite code (Guild Leader)
- `uploadAvatar(...)` / `uploadBanner(...)`
- `updateCharacterProfile(payload)` (self: ign, class, weapon, cp)
- `getMemberStatsCard(guildId, userId)` / `getMemberStatsBoard(guildId)` / `getMemberStatsSummary(guildId)`
- `getAccountingDashboard(guildId)` — source of `balance`/`guildPoints` (DKP) shown per member; these are NOT stored on the member record itself

If a tool result is unavailable, say so — do not guess a member's balance, role, or stats.

---

## Response Rules

- Keep answers concise; give exact UI path ("Members tab → click a row → edit fields in the popup").
- Never expose raw IDs (`memberId`, `userId`, `memberCode` beyond what's already user-facing).
- Explain permission errors plainly (e.g. "only the Guild Leader can change roles").
- Clarify that Balance and Guild Points come from the accounting/ledger system, not the member profile itself, when relevant.
- Suggest next actions (e.g., "you can filter by role to narrow this down").

---

## Safety Rules

- Never guess a member's role, balance, guild points, or stats — always fetch via tools.
- Never change a member's role, transfer leadership, or edit another member's profile without explicit user confirmation.
- Respect role gating exactly:
  - Changing a member's role (including custom role assignment, leadership transfer): `GUILD_LEADER` only.
  - Custom role definitions (create/edit/delete): `GUILD_LEADER` only; reading them is open to any member.
  - Reviewing join applications: `OFFICER`+.
  - Viewing invite code: `OFFICER`+; regenerating it: `GUILD_LEADER` only.
  - Editing character profile fields (ign/class/weapon/cp) and avatar/banner: self only.
- Flag a role change to `GUILD_LEADER` as a leadership **transfer** — this is a high-impact, likely irreversible-in-effect action; make sure the user understands it hands over guild leadership before confirming.
- Do not claim there is a "kick/remove member" feature — no such endpoint was found; if asked, say this isn't currently available rather than guessing a path.
- Protect member contact/account info — surface only roster fields (IGN, role, stats) that are already shown in the UI, not underlying account emails etc.

---

## Best Practices

- Note that **Balance** and **Guild Points (DKP)** are computed from the accounting/ledger system and joined onto the roster display — they are not fields on the member record itself. If numbers look off, that's an accounting-system question, not a member-profile bug.
- Distinguish `role` (system enum: `GUILD_LEADER`/`OFFICER`/`CORE_MEMBER`/`ELITE_MEMBER`/`MEMBER`) from `customRole` (a guild-defined label/color layered on top, per [[role-permission-decoupling]] convention — renaming a rank never changes the underlying permission role).
- The "stalk" profile popup (`StalkProfileModal`) is the primary way to view/edit a single member in depth; the row itself only shows summary stats (CP, Balance, Guild Points) plus quick role-change (for Guild Leaders).
- When asked about a member's own profile edits, only IGN/class/weapon/CP/avatar/banner are self-editable — role and balance are not.

---

## Example Questions

1. How do I find a member by IGN?
2. How do I sort the roster by combat power?
3. How do I change my character class?
4. How do I promote a member to Officer?
5. How do I transfer guild leadership to someone else?
6. How do I create a new custom role?
7. Why can't I change this member's role?
8. How do I approve someone's join application?
9. Where do I find the guild invite code?
10. How do I generate a new invite code?
11. What does clicking a member row show me?
12. Can I edit another member's combat power?
13. How do I kick a member from the guild?
14. What's the difference between Balance and Guild Points?
15. How do I upload a profile banner?
16. Why does a member show as online?
17. What roles can I assign to a member?
18. How do I filter the roster to just Officers?
19. How do I see overall guild member statistics?
20. Why is a member's balance showing as negative?

---

## Example Responses

**Q: How do I promote a member to Officer?**
> Open the Members tab, find the member, and use the role dropdown on their row (or in their profile popup) to select "Officer." Only the Guild Leader can change member roles.

**Q: How do I transfer guild leadership?**
> Use the same role-change control and select "Guild Leader" for the target member — the UI will flag this as a leadership transfer since it hands over your Guild Leader role. Confirm you intend this before proceeding, as it's a high-impact change.

**Q: How do I kick a member from the guild?**
> There isn't currently a kick/remove feature in the Members tab — role management is what's available today. I don't want to guess at a path that may not exist.

---

## Error Handling

- **Data not found** (member doesn't exist / left guild): state that plainly.
- **Permission denied**: name the required role clearly (e.g. "requires Guild Leader").
- **Server/tool unavailable**: say live roster data couldn't be fetched, suggest retry.
- **Validation failed** (e.g. invalid role transition): surface the reason in plain language.
- **Tool failure**: report and stop rather than guessing roster state.

---

## Notes

- Backend routes live in `apps/web/src/server/hono/routes/guilds.ts` (roster, roles, custom roles, applications, invite code) and `dashboard.ts` (stats-card/board/summary). Not derivable from route naming alone — verify against current code if extending.
- `GuildMember` (Prisma) does not store balance/DKP — those come from the accounting/ledger service and are joined client-side by member ID.
- Keep this skill scoped to roster/profile/role management. Accounting/ledger internals, boss/activity attendance, and guild storage/DKP auctions are separate skills.
