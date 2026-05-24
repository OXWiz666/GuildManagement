# Guild Management System — Design Brief

Responsive web + mobile app for managing online gaming guilds and factions.
Multi-tenant: one account belongs to several guilds/factions, separate balance and
standing in each. Dark-mode-first; light mode must also work. Clean dashboard
aesthetic, game-adjacent but professional — not a cluttered game HUD.

## Roles (per guild, ascending; higher inherits lower)
member -> officer -> core -> leader
Leader-only controls must be visually obvious.

## Output format for design work
Build the **frontend design system and components in code** (React + TypeScript +
your chosen styling), committed to the repo — NOT throwaway mockups. Each module:
1. A short README note: screen purpose + who uses it (member/officer/core/leader).
2. The actual components/screens, styled, with realistic placeholder data.
3. States that matter: empty, loading, error, permission-denied.
4. Mobile layout (or a note when it differs from desktop).
Keep everything responsive. Reuse the design-system primitives — no one-off styles.

## Design system (build FIRST, before any module)
- Color: dark-first palette, one primary accent + one secondary + semantic
  success/warning/danger. Define light-mode equivalents. Use design tokens/CSS vars.
- Typography: clean UI sans, a scale (display/heading/body/caption). Sentence case everywhere.
- Components: buttons (primary/secondary/ghost/danger), inputs, cards, tables, tabs,
  badges/pills for ranks & statuses, modals, toasts, avatars, empty states.
- Rank visual language: distinct, dignified treatments for the four tiers — Core,
  Officer, Vanguard, Reserve. Vanguard/Reserve are member tiers ordered by combat
  power; Reserve must NOT look like a punishment.
- 8px spacing grid; one consistent icon set.
Deliver a `/design-system` route or Storybook-style page showing every primitive.

## Product constraints the UI must serve
- Highly auditable: money and points are serious. Numbers legible, tables scannable.
- Anything touching currency or points needs an explicit confirm step and a visible
  link to its audit trail.
- Currency is configurable (same screens serve a PHP/peso share or a diamond share);
  never hard-code a currency symbol — use a token/placeholder.

## Modules (build one at a time, in this order)
1.  Design system & navigation shell — global nav, guild/faction switcher, role-aware menu, responsive frame.
2.  Landing page (public, logged-out) — marketing page selling the product to prospective guild leaders. See "Landing page spec" below. Reuses the design system; its own public nav (logo, section links, Log in, Sign up) distinct from the app shell.
3.  Individual profile — customisable profile; combat identity card (IGN, CP, rank, role, class, weapon, member code); per-guild & per-game balance; personal income/expense record.
4.  Main dashboard — member home: profile summary, balances, next boss, standing.
5.  Boss timer & schedule — countdown timers + alarm toggle; unified guild+faction schedule with boss image, location, guild turn.
6.  Ranking & leaderboard — four-tier display; CP-derived member tiers; sortable leaderboard.
7.  Attendance — officer opens session with a unique code; member enters code; officer confirmation list; guild/faction toggle.
8.  Guild points — leader config for activity values & rank multipliers; member-facing points history & leaderboard.
9.  Market history — sold-items table (spreadsheet-style); tax-to-guild-funds shown clearly; officer add-sale form.
10. Accounting — double-entry ledger view; member balance (total & net); total guild balance; current guild funds; expenses; share-distribution screen with selectable models (pro-rata points, equal split, DKP-optional) + live preview of who gets what.
11. Bidding — bid-point balance; live auction list; place-bid flow; auction result/history.
12. Requests — member requests items or withdrawals; officer offers items; leader approval queue.
13. Priority sequence — transparent ordered queue combining guild points + CP, showing each member's position and why.
14. Logs / history — filterable record of guild actions, items distributed, items received per member, currency payouts.
15. Communication — announcements + comments; guild chat; member wall; CP-confirmation image channel; flex channel; guides channel.
16. Officer tab — officer attendance; salary; task delegation.

## Landing page spec (Module 2)
A public marketing page. Goal: convince a guild leader to sign up. Sections, top to bottom:
- **Hero** — product name, one-line value proposition (centralized guild & faction management), primary CTA (Sign up / Start free) + secondary (see features). Strong dark-first visual.
- **Services / features grid** — one card per service below, each with icon, title, and a short benefit line:
  1. Boss Timer & Schedule — never miss a spawn; unified guild + faction schedule with alarms.
  2. Smart Attendance System — unique-code check-ins, officer-confirmed, guild & faction.
  3. Centralized Guild & Faction Management — run multiple guilds and factions from one place.
  4. Guild Points System — configurable activity points and rank multipliers driving ranking, shares, and bidding.
  5. Accounting System — double-entry ledger with per-member balances (total & net), total guild balance, current guild funds, and expenses. Highlight the share engine: PHP share / diamond share with multiple selectable models — pro-rata guild points, equal split among present members, DKP (optional) — and configurable tax for guild funds.
  6. Bidding System — bid-point auctions for fair item distribution.
- **Accounting spotlight** — give the Accounting/share system its own expanded section (it's the headline feature): show the share-model choices and the tax-to-guild-funds idea visually (e.g. a simple split illustration), since this is what sells leaders.
- **How it works** — 3–4 step flow: create your guild → log activities & attendance → earn points → distribute shares fairly.
- **Social proof placeholder** — testimonial/quote cards with placeholder content.
- **Pricing placeholder** — simple tiers (e.g. Free / Pro) with placeholder copy, clearly marked as placeholder.
- **Final CTA + footer** — repeat sign-up CTA; footer with links, currency note (supports PHP & diamond economies).
Responsive, with the mobile layout stacking cards into a single column. Use placeholder copy and stock-style illustration placeholders; no real testimonials or prices invented as fact.

## Working agreement
Build the design system first, commit it, then STOP and wait for me to name the next
module. Do exactly one module per turn. Don't scaffold backend logic — this is the
design/UI pass; use placeholder data and stub handlers.