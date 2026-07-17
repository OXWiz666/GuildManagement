---
name: ui-design-system
description: "Use when building, styling, or reviewing ANY UI in ForgeKeep — new pages, dashboard components, modals, cards, buttons, theming, animations, or design-consistency questions. Covers the obsidian + forge-gold visual system, design tokens in globals.css, and the shared component library in src/components/ui. Not a feature/data skill — pairs with feature skills (boss-rotation, etc.) for feature-specific UI work."
metadata:
  author: forgekeep
  version: "1.0.0"
---

# UI & Design System

## Purpose

Defines ForgeKeep's visual identity and the shared UI building blocks so all interfaces look and feel like one product: dark-only "Obsidian Guild Command" theme with a forge-gold accent, consistent typography, and a reusable component library.

---

## Responsibilities

- Enforce the obsidian + forge-gold visual language across new and existing UI.
- Point implementers to existing design tokens, utility classes, and components instead of reinventing them.
- Explain brand elements (logo, tagline, wordmark) and when/how to use them.
- Guide animation usage (which utilities exist, motion-reduction requirements).
- Flag visual inconsistency (wrong accent color, missing obsidian surface treatment, ad-hoc one-off styles duplicating an existing utility/component).

Out of scope: feature business logic and data (covered by feature-specific skills like `boss-rotation`).

---

## Capabilities

- Identify the correct token/utility/component for a given UI need instead of hand-rolling styles.
- Review a proposed component or page for adherence to the design system.
- Explain the brand system (Logo variants, tagline) and where they're defined.
- Advise on animation choices, including `prefers-reduced-motion` compliance.
- Point to the `/design-system` showcase page as the living reference.

---

## User Intents

- What color should I use for [accent / status / danger]?
- How do I make a card look like the rest of the dashboard?
- What font should headings use?
- How do I add a hover glow / spotlight effect to a card?
- Is there already a button/badge/toast component I should use?
- How do I show the ForgeKeep logo correctly?
- What's the guild tagline and where does it come from?
- Why does this page look inconsistent with the rest of the dashboard?
- How do I add a loading skeleton?
- How do I respect reduced-motion preferences?
- What's the difference between `.card-obsidian` and `.glass-obsidian`?
- How do I show a confirmation dialog?
- How do I display a toast notification?
- Is violet/fuchsia still used anywhere? (No — legacy, replaced.)
- Where do design tokens live?
- How do I add a new animation utility?
- What's the status/live color used for boss spawns?

---

## Required Backend Tools

None — this is a static styling/design-reference skill. No live data calls are needed. If a question requires knowing current component props or exact CSS values, read the actual source file rather than guessing:

- `apps/web/src/app/globals.css` — tokens, keyframes, utility classes
- `apps/web/src/components/ui/*` — shared component library
- `apps/web/src/components/common/Logo.tsx` — brand/logo exports
- `apps/web/src/app/(dashboard)/dashboard/design-system` (if present) — live showcase page

---

## Response Rules

- Point to the exact token, utility class, or component to use, with its file path.
- Prefer reusing an existing component/utility over proposing new CSS.
- Keep answers concise and actionable — a class name or component import, not a design essay.
- When a request conflicts with the theme (e.g., "make it blue" for a primary accent), note the conflict and suggest the on-brand alternative before complying, unless the user insists.
- Never invent a utility class or component name that doesn't exist — verify by reading `globals.css` or the `ui/` directory first.

---

## Safety Rules

- Never reintroduce the old violet/fuchsia theme — it was explicitly replaced and is dead.
- Never hardcode raw hex/oklch color values in components when a token exists for that purpose.
- Always gate new animations under `prefers-reduced-motion`, matching existing utilities.
- Don't duplicate an existing shared component (`Button`, `Card`, `Badge`, `Avatar`, `Input`, `ConfirmModal`, `Toast`, `Skeleton`, `Divider`/`VDivider`) with a bespoke inline version.
- Don't fabricate brand copy — the tagline is a single exported constant, not to be retyped or altered.

---

## Best Practices

- **Brand**: product name is **ForgeKeep**. Wordmark renders "Forge" in white + "Keep" in gold. Tagline **"Forged in trust, kept in order."** is exported as `TAGLINE` from `src/components/common/Logo.tsx` — import it, never retype. Logo exports: `LogoMark`, `LogoBadge` (hover conic forge-ring, needs parent `group` class), default `Logo` (lockup), `LogoTagline` (stacked lockup + tagline).
- **Theme**: dark-only. Background near-black (`--color-surface-50` ≈ `#050608`/`#08080a` range). Forge-gold accent (`--color-accent-400/500`, CSS var `--forge-gold`/`--forge-gold-bright`/dim variant). Emerald (`--color-success-500`, `#10D99A`) = live/status color. Red (`--color-danger-500`) = "live spawn"/danger.
- **Typography**: Inter (`--font-sans`/`--font-display`) for body/UI, Cinzel (`--font-fantasy`, class `.font-fantasy`) for headline/fantasy display text, JetBrains Mono (`--font-mono`) for numbers/labels/timers.
- **Tokens**: Tailwind v4 `@theme` block in `apps/web/src/app/globals.css` — primary (slate/ice), accent (forged gold), surface (obsidian), status (success/warning/danger) all defined in `oklch()`. Functional animation tokens (`--animate-fade-in`, `--animate-slide-up`, `--animate-shimmer`, `--animate-aurora`, `--animate-glow-pulse`, `--animate-forge-shimmer`, etc.) are also declared here.
- **Surface/glass utilities**: `.card-obsidian`, `.glass-obsidian`, `.text-gold-gradient` (+ `-light` variant), `.glow-gold` (+ `-sm`/`-active`), `bg-grid`, `aurora-mesh`, `noise-overlay`.
- **Motion utilities**: `.text-gold-sheen` (gold light pass over gradient text), `.word-rise` (staggered headline word reveal via `--i`/`--base` custom props), `.brand-keyline`, `.spotlight-card` (cursor-follow border glow), `.beam-host`/`.beam` (hover sweep), `.ember` (rising embers), `live-breathe` keyframe (status orbs), `forge-ring-spin`. All must respect `prefers-reduced-motion`.
- **Shared components** (`apps/web/src/components/ui/`): `Button`, `Card`, `Input`, `Badge` (role-aware — auto-resolves custom rank labels, see `customName`/`customColor` props), `Avatar`, `ConfirmModal`, `Toast`/`ToastProvider`/`useToast`, `Skeleton`/`SkeletonText`/`SkeletonAvatar`/`SkeletonCard`, `Divider`/`VDivider`. Use these instead of ad-hoc markup for anything they already cover.
- Fonts are self-hosted via `next/font` (declared in `app/layout.tsx`) — never add a remote `@import` or `<link>` for fonts; that would reintroduce a render-blocking request the setup was built to avoid.

---

## Example Questions

1. What accent color do I use for a primary CTA button?
2. How do I get the obsidian card look for a new dashboard panel?
3. Where's the ForgeKeep tagline defined?
4. How do I add a hover glow effect to a card?
5. Is there a reusable Badge component for guild roles?
6. What font should a page headline use?
7. How do I show a toast after a successful save?
8. How do I add a confirmation dialog before a destructive action?
9. What's the loading skeleton component for a list row?
10. How do I keep an animation from running for reduced-motion users?
11. Should I use violet or gold for this new feature's accent?
12. What's the "live" status color for an active boss spawn?
13. How do I add the ember particle effect to a hero section?
14. Where do I add a brand-new animation utility?
15. What's the difference between `Divider` and `VDivider`?
16. How do I render the logo with the hover ring effect?
17. Can I use a raw hex color for a new component?
18. Why does my new page look different from the rest of the dashboard?
19. What monospace font is used for numeric/timer displays?
20. Is there a design-system showcase page I can reference?

---

## Example Responses

**Q: What accent color do I use for a primary CTA button?**
> Use the forge-gold accent tokens (`--color-accent-400`/`500` in `globals.css`, or the `Button` component's default variant) — don't introduce a new hex value. `Button` from `src/components/ui/Button.tsx` already wires this up.

**Q: How do I get the obsidian card look?**
> Apply the `.card-obsidian` utility class (defined in `apps/web/src/app/globals.css`), or use the `Card` component from `src/components/ui/Card.tsx` which already applies it.

**Q: Should I use violet or gold for this new feature's accent?**
> Gold — violet/fuchsia was the old theme and was fully replaced by obsidian + forge-gold. Any violet you see in older code is stale and should be migrated, not matched.

---

## Error Handling

- **Uncertain whether a utility/component exists**: read `globals.css` or `components/ui/` before answering rather than guessing a class name.
- **Conflicting request** (off-brand color, reintroducing old theme): explain the conflict and recommend the on-brand equivalent; proceed only if the user explicitly overrides.
- **Component doesn't cover the need**: say so plainly and propose extending the existing component/token system rather than a one-off style.

---

## Notes

- Source of truth for tokens/utilities is `apps/web/src/app/globals.css`; source of truth for shared components is `apps/web/src/components/ui/`. Re-verify against these files before asserting a class name or prop exists — the design system evolves.
- Keep this skill UI/visual-only. Feature data, permissions, and business logic belong in the relevant feature skill (e.g., `boss-rotation`).
- This app runs a customized Next.js — check `node_modules/next/dist/docs/` per `apps/web/AGENTS.md` before assuming standard Next.js API behavior when building UI.
