# ForgeKeep Discord Bot — Member Guide

Copy/paste this into your server (a **#welcome** or **#bot-help** channel works
well, or pin it). It's written for members, not admins — for inviting,
binding, and deploying the bot, see [SETUP.md](./SETUP.md) instead.

Discord messages cap at ~2000 characters, so this is broken into chunks with
`--- ✂ ---` markers — paste each chunk as its own message (or use a Forum
post / Server Guide, which allow more per post).

---

## 📌 Invite the bot

> ⚠️ **Before posting this publicly**: confirm this is your bot's real
> Application ID (Discord Developer Portal → your app → General Information →
> **Application ID**). The one below was pulled from local dev config —
> replace it if your live bot uses a different one.

```
https://discord.com/api/oauth2/authorize?client_id=1516471109917085829&permissions=309774904384&scope=bot
```

Only someone with **Manage Server** on your Discord can complete the invite.
The permissions above cover everything the bot needs: reading/sending
messages, embeds, managing its own messages (it cleans up `!link` codes after
use), reactions, boss threads, and officer-created webhooks.

--- ✂ ---

## 🔗 Step 1 — Link your ForgeKeep account

The bot never sees your password — linking works with a one-time code.

1. On the website: **Settings → Discord → Generate link code**.
2. In Discord, run:
   ```
   !link <your code>
   ```
3. The code expires in ~15 minutes and the bot deletes your message after
   reading it, so it doesn't sit in the channel.

Check it worked:
```
!cp
```
If you see your Combat Power, rank, and last-updated time, you're linked.

--- ✂ ---

## ⚔️ Everyday commands

| Command | What it does |
|---|---|
| `!cp` | Your Combat Power, rank, and when it was last updated |
| `!cp <value>` | Manually update your CP |
| `!cp [attach a screenshot]` | Scan your CP straight from a screenshot — no typing needed |
| `!spawn` | Upcoming boss spawns |
| `!party` | Who's committed to the next boss fight |
| `!commands` | Full list of everything you can run |

--- ✂ ---

## 📸 Updating CP from a screenshot

Attach a screenshot to `!cp` instead of typing a number:

```
!cp   (with your character screen attached)
```

The bot reads your **Combat Power** off the image, double-checks it's really
your character, and updates your rank automatically. First scan after the bot
restarts is a bit slower (~10s) while it loads — every scan after that is
fast.

If a scan looks off (huge unexplained jump, blurry screenshot, name mismatch),
it still updates your CP but flags the entry for an officer to double-check —
you don't need to do anything else.

--- ✂ ---

## 🛠️ Troubleshooting

| Problem | Fix |
|---|---|
| Bot doesn't respond at all | Someone with **Manage Server** needs to bind this Discord server to your guild first — that's a one-time setup step, ask your Guild Leader. |
| "Your Discord account isn't linked" | Run `!link <code>` — get a fresh code from **Settings → Discord** on the website (Step 1 above). |
| "I couldn't find a Combat Power value" | Make sure the CP number is visible and unobstructed in the screenshot, or just type it: `!cp 1234567` |
| Commands only work in one channel | An officer restricted commands to a specific channel with `!cmdhere` — try there. |

---
*Need more than this covers? Full setup and troubleshooting docs are in
[SETUP.md](./SETUP.md).*
