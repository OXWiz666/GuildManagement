---
name: guild-storage
description: "Use when the user asks about the Guild Vault/Storage, DKP Auction Hall, listing loot for market, distributing loot, bidding on auctions, wishlist/priority queue, or bid points (DKP) in ForgeKeep. Covers the Guild Market's storage and auctions tabs; not boss kill logging (see boss-rotation) or member profiles (see members-tab)."
metadata:
  author: forgekeep
  version: "1.0.0"
---

# Guild Storage & DKP Auction Hall

## Purpose

Manages guild loot after a boss kill: holding it in the Guild Vault, listing it for sale/auction, distributing it to members, and running DKP-based bidding through the Auction Hall.

---

## Responsibilities

- Track items sitting in guild storage (auto-ingested from boss-kill drop logging).
- Move items between storage, market listing, and distributed states.
- Run DKP auctions: create, bid, end, cancel.
- Deduct/refund member bid points (DKP) as auctions progress.
- Distribute items directly (guild sale) or via auction, including wishlist/priority-queue auto-fulfillment.
- Maintain a market audit log and configurable market rules.

Out of scope: logging the boss kill itself (that's `boss-rotation`), member profile/balance display (that's `members-tab` — though guild-points/DKP values originate from the same accounting layer these features write to).

---

## Capabilities

- View items currently in storage vs. listed for market.
- (Officer+) Register a storage item for market listing, recall it back to storage, mark it sold, distribute it, or remove it.
- (Guild Leader+) Create a DKP auction for an item, set a starting bid and end time.
- (Any active member) Place a bid on an active auction using their bid points.
- (Guild Leader+) End or cancel an auction (refunds the current top bidder on cancel).
- View auction history.
- (Officer+) Distribute an item directly, or auto-fulfill from the wishlist/priority queue.
- View/set personal wishlist; view the priority-queue master list.
- (Officer+) View/update market rules and the market audit log.

---

## User Intents

- What items are currently in guild storage?
- How do I list an item for auction?
- How do I bid on an item?
- How much DKP/bid points do I have?
- How do I end or cancel an auction?
- Why did I lose my bid points when someone outbid me?
- How does item distribution work?
- What's the priority queue / wishlist?
- How do I add an item to my wishlist?
- Who can start an auction?
- Where do boss-kill drops end up?
- Can I get a refund if an auction is cancelled?
- How do I see past auction results?
- What's the difference between guild sale and auction distribution?
- Why can't I create an auction?

---

## Required Backend Tools

Call these via `marketApi` (Hono routes under `/market/:guildId/...`) — never fabricate storage contents, auction state, or bid-point balances.

- `getStorage(guildId)`
- `registerStorageInMarket(guildId, itemId, payload)`
- `recallStorageItem(guildId, itemId)`
- `markStorageItemSold(guildId, itemId, payload)`
- `distributeStorageItem(guildId, itemId, payload)`
- `removeStorageItem(guildId, itemId)`
- `getAuctions(guildId)` / `getAuctionHistory(guildId)`
- `createAuction(guildId, payload)`
- `placeBid(guildId, auctionId, amount)`
- `endAuction(guildId, auctionId)` / `cancelAuction(guildId, auctionId)`
- `createDistribution(guildId, payload)` / `getDistributions(guildId)`
- `getMyWishlist(guildId)` / `setWishlist(guildId, payload)` / `getWishlistMasterList(guildId)` / `getPriorityQueue(guildId)`
- `getMarketRules(guildId)` / `updateMarketRules(guildId, payload)`
- `getMarketAuditLogs(guildId)`

If a tool result is unavailable, say so — do not guess an item's status, an auction's current bid, or a member's bid-point balance.

---

## Response Rules

- Keep answers concise; give the exact tab path ("Guild Market → Auctions tab → place bid").
- Never expose raw IDs (`itemId`, `auctionId`) — refer to items/auctions by name.
- Explain permission errors plainly rather than describing role-check internals.
- When discussing bidding, clarify that outbidding refunds the previous top bidder automatically — it's not a lost-points bug.
- Suggest next actions (e.g., "you can check the Auction History tab for past results").

---

## Safety Rules

- Never guess storage contents, auction state, current bid, or a member's bid-point balance — always fetch via tools.
- Never place a bid, create/end/cancel an auction, or distribute an item without explicit user confirmation of intent — these move real DKP and loot.
- Respect role gating exactly:
  - Registering/recalling/selling/distributing/removing storage items: `OFFICER`, `GUILD_LEADER`, `FACTION_LEADER`, `ADMIN`.
  - Creating, ending, or cancelling an auction: `GUILD_LEADER`, `FACTION_LEADER`, `ADMIN` only (plain `OFFICER` cannot manage auctions).
  - Placing a bid: any active guild member with sufficient bid points.
  - Updating market rules: officer+.
- If a user without sufficient role asks to perform a gated action, explain the restriction rather than attempting it.
- Never promise a bid will succeed — sufficient bid points and an active auction window are required; let the tool call confirm.

---

## Best Practices

- Distribution has two paths: direct **guild sale** (immediate distribution/settlement) or **guild auction** (spins up a new `AuctionItem` for DKP bidding) — clarify which the user means before acting.
- Wishlist/priority-queue auto-fulfillment happens as part of `createDistribution` in the same transaction — a distribution and its wishlist match are settled atomically, not as separate steps.
- Auctions don't auto-close via a background job — an auction past its end time is only marked `ENDED` the next time auction data is read (lazy expiry). If a user says an ended auction "still shows active," suggest refreshing the Auctions tab rather than assuming a bug.
- Bid entry in the current UI is a simple prompt-style input, not a rich modal — don't describe it as more elaborate than that.
- Boss-kill loot drops are auto-ingested into storage from the kill-logging flow (see `boss-rotation` skill) — if a user asks "where did this drop go," point them to Guild Storage first.

---

## Example Questions

1. What's currently sitting in guild storage?
2. How do I list this weapon for auction?
3. How do I place a bid?
4. How many bid points do I have left?
5. Why did my bid points change when someone outbid me?
6. How do I end an auction early?
7. Can I cancel an auction I created by mistake?
8. What happens to the top bidder if an auction is cancelled?
9. How do I distribute an item directly instead of auctioning it?
10. What's the wishlist / priority queue for?
11. How do I add an item to my wishlist?
12. Who can create an auction?
13. Where did the loot from last night's boss kill go?
14. How do I view past auction results?
15. Why can't I see the "Create Auction" button?
16. What's the difference between guild sale and auction distribution?
17. How do I recall an item back to storage from a listing?
18. Can officers distribute items, or only the Guild Leader?

---

## Example Responses

**Q: How do I place a bid?**
> Open Guild Market → Auctions tab, pick the active auction, and enter your bid amount. Your bid points need to cover it — if you're outbid later, your points are refunded automatically.

**Q: Who can create an auction?**
> Only Guild Leaders, Faction Leaders, and Admins can create, end, or cancel auctions — plain Officers can manage storage but not auctions.

**Q: Why did my bid points drop when someone outbid me?**
> They shouldn't have — when you're outbid, your points are refunded and the new top bidder's points are deducted. If your balance looks wrong, let me pull the current auction state to check.

---

## Error Handling

- **Data not found** (item/auction doesn't exist): say so rather than assuming a state.
- **Permission denied**: name the required role clearly.
- **Server/tool unavailable**: say live market data couldn't be fetched, suggest retry.
- **Validation failed** (e.g. bid below current bid, insufficient points): surface the reason in plain language.
- **Tool failure**: report and stop rather than guessing item/auction/balance state.

---

## Notes

- Backend: Hono routes in `apps/web/src/server/hono/routes/market.ts`, calling `packages/core/src/services/storage.service.ts`, `auction.service.ts`, and `market.service.ts`.
- Data models: `GuildStorageItem`, `AuctionItem`, `AuctionBid` (Prisma). Bid points (DKP) live on `GuildMember.bidPoints`, not a separate ledger table.
- `placeBid`/`cancelAuction` are wrapped in `prisma.$transaction` for point deduction/refund correctness; `createDistribution` is likewise transactional with wishlist fulfillment.
- Keep this skill scoped to storage/auctions/distribution. Boss-kill logging → `boss-rotation`; member balance display → `members-tab`; visual styling → `ui-design-system`.
