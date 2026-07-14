// One-time backfill: vault historical boss-kill drops into GuildStorageItem
// for kills that were logged (via the Boss Rotation "BOSS_ROTATION_KILLED"
// audit action) before the live auto-vault hook existed, or for any reason
// never made it into storage.
//
// Safe to re-run: each processed kill gets a "STORAGE_BACKFILL_PROCESSED"
// audit-log marker (targetId = the original kill's AuditLog.id), checked
// before reprocessing, so this will never double-vault the same kill twice.
//
// Usage (run from packages/core):
//   pnpm run backfill:storage-drops              # dry run — no writes
//   pnpm run backfill:storage-drops -- --commit   # actually writes

import { prisma } from "@guild/db";
import { addDropsToStorage } from "../src/services/storage.service";

const COMMIT = process.argv.includes("--commit");
const KILL_ACTION = "BOSS_ROTATION_KILLED";
const MARKER_ACTION = "STORAGE_BACKFILL_PROCESSED";
const PAGE_SIZE = 200;

interface StoredDrop {
  itemName: string;
  type: string;
  category?: string | null;
  rarity: string | null;
  bucket?: string;
  path?: string;
  quantity: number;
  iconUrl?: string;
}

async function main() {
  console.log(`[Backfill] Mode: ${COMMIT ? "COMMIT — writing to the database" : "DRY RUN — no writes"}`);
  console.log(`[Backfill] Target: ${process.env["DATABASE_URL"]?.replace(/:[^:@]*@/, ":****@")}`);

  let cursor: string | undefined;
  let scanned = 0;
  let skippedNoDrops = 0;
  let alreadyProcessed = 0;
  let eligible = 0;
  let itemsCreated = 0;
  const perGuild = new Map<string, { kills: number; items: number }>();
  const preview: Array<{ guildId: string; bossName: string; killLogId: string; drops: number }> = [];

  for (;;) {
    const rows = await prisma.auditLog.findMany({
      where: { action: KILL_ACTION, guildId: { not: null } },
      orderBy: { id: "asc" },
      take: PAGE_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (rows.length === 0) break;
    scanned += rows.length;

    for (const row of rows) {
      cursor = row.id;
      const guildId = row.guildId;
      if (!guildId) continue;

      const detail = row.detail as { bossName?: string; drops?: StoredDrop[] } | null;
      const drops = Array.isArray(detail?.drops) ? detail!.drops!.filter((d) => d && d.quantity > 0) : [];
      if (drops.length === 0) {
        skippedNoDrops++;
        continue;
      }

      const marker = await prisma.auditLog.findFirst({
        where: { action: MARKER_ACTION, targetId: row.id },
        select: { id: true },
      });
      if (marker) {
        alreadyProcessed++;
        continue;
      }

      eligible++;
      const bossName = detail?.bossName || "Unknown Boss";
      preview.push({ guildId, bossName, killLogId: row.id, drops: drops.length });

      const g = perGuild.get(guildId) ?? { kills: 0, items: 0 };
      g.kills += 1;
      g.items += drops.length;
      perGuild.set(guildId, g);

      if (COMMIT) {
        try {
          await addDropsToStorage(guildId, row.actorId, bossName, drops);
          await prisma.auditLog.create({
            data: {
              actorId: row.actorId,
              guildId,
              action: MARKER_ACTION,
              target: "AuditLog",
              targetId: row.id,
              detail: { bossName, itemCount: drops.length },
            },
          });
          itemsCreated += drops.length;
        } catch (error) {
          console.error(`[Backfill] Failed to vault kill ${row.id} (guild ${guildId}, boss ${bossName}):`, error);
        }
      } else {
        itemsCreated += drops.length;
      }
    }

    if (rows.length < PAGE_SIZE) break;
  }

  console.log(`\n[Backfill] Scanned ${scanned} kill-audit rows.`);
  console.log(`[Backfill] Skipped (no structured drops): ${skippedNoDrops}`);
  console.log(`[Backfill] Already processed (marker present): ${alreadyProcessed}`);
  console.log(`[Backfill] Eligible kills ${COMMIT ? "vaulted" : "that WOULD be vaulted"}: ${eligible}`);
  console.log(`[Backfill] Storage items ${COMMIT ? "created" : "that WOULD be created"}: ${itemsCreated}`);
  console.log(`\n[Backfill] Per-guild breakdown:`);
  for (const [guildId, stats] of perGuild) {
    console.log(`  guild ${guildId}: ${stats.kills} kills, ${stats.items} items`);
  }

  if (!COMMIT && eligible > 0) {
    console.log(`\n[Backfill] Sample of what would be processed (first 20):`);
    for (const p of preview.slice(0, 20)) {
      console.log(`  [${p.guildId}] "${p.bossName}" — ${p.drops} item(s) — kill log ${p.killLogId}`);
    }
    console.log(`\n[Backfill] This was a DRY RUN. Re-run with --commit to actually write.`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("[Backfill] Fatal error:", error);
    process.exit(1);
  });
