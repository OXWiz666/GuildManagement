import { prisma } from "@guild/db";
import {
  AUDIT_ACTIONS,
  EQUIPMENT_SLOT_LABELS,
  LOW_CONFIDENCE_THRESHOLD,
  type EquipmentSlot,
} from "@guild/shared";
import { writeAuditLog } from "./audit.service";
import { getGuildMemberByUser } from "./guild.service";
import { broadcastToGuild } from "../lib/socket";
import { cache as redisCache } from "../lib/redis";
import { cacheKeys, ttl as cacheTtl } from "../lib/cache-keys";
import { publicUrl, uploadObject, signUrl } from "../lib/supabaseStorage";
import { ForbiddenError, BadRequestError } from "../utils/errors";

// ─── Icon storage layout (READ-ONLY catalog source) ──────────────────
// Maps the existing PUBLIC Supabase icon buckets to equipment slots.
// Path shapes (verified against storage):
//   weapon buckets        →  Rarity/Name.ext
//   Gadgets               →  Rarity/Name.ext
//   *Armor                →  Slot/Rarity/Name.ext
//   Accessories           →  Slot/Rarity/Name.ext
//   Cloak                 →  Type/Rarity/Name.ext

const WEAPON_BUCKETS: Record<string, string> = {
  WeapGS: "Greatsword",
  WeapSnS: "Sword & Shield",
  WeapBow: "Bow",
  WeapStaff: "Staff",
  WeapDualDagger: "Dual Dagger",
  WeapCrossBow: "Crossbow",
  WeapGauntlet: "Gauntlet",
  WeapBattleStaff: "Battle Staff",
  WeapBattleShield: "Battle Shield",
};
const ARMOR_BUCKETS: Record<string, string> = {
  ClothArmor: "Cloth",
  LeatherArmor: "Leather",
  PlateArmor: "Plate",
};
const ARMOR_FOLDER_SLOT: Record<string, EquipmentSlot> = {
  Helm: "helm",
  UpperArmor: "upperArmor",
  LowerArmor: "lowerArmor",
  Gloves: "gloves",
  Boots: "boots",
};
const ACCESSORY_FOLDER_SLOT: Record<string, EquipmentSlot> = {
  Belt: "belt",
  Bracelet: "bracelet",
  Earrings: "earrings",
  Necklace: "necklace",
  Ring: "ring",
};

const ALL_ICON_BUCKETS = [
  ...Object.keys(WEAPON_BUCKETS),
  "Gadgets",
  ...Object.keys(ARMOR_BUCKETS),
  "Accessories",
  "Cloak",
];

const SCREENSHOT_BUCKET = "EquipmentScreenshots";
const SCREENSHOT_TTL = 7200;
const CATALOG_CACHE_TTL = 1800; // 30 min — icon set rarely changes

export interface CatalogItem {
  slotType: EquipmentSlot;
  itemName: string;
  rarity: string | null;
  variant: string | null; // weapon type / armor class / cloak type
  bucket: string;
  path: string;
}

function stripExt(name: string): string {
  return name.replace(/\.(png|jpe?g|webp)$/i, "");
}

/** Classify a single storage object into a catalog item, or null if not equipment. */
function classify(bucket: string, path: string): CatalogItem | null {
  const parts = path.split("/").filter(Boolean);
  const leaf = parts[parts.length - 1];
  if (!leaf) return null;
  const itemName = stripExt(leaf);

  if (WEAPON_BUCKETS[bucket]) {
    if (parts.length < 2) return null;
    return { slotType: "weapon", itemName, rarity: parts[0] ?? null, variant: WEAPON_BUCKETS[bucket]!, bucket, path };
  }
  if (bucket === "Gadgets") {
    if (parts.length < 2) return null;
    return { slotType: "gadget", itemName, rarity: parts[0] ?? null, variant: null, bucket, path };
  }
  if (ARMOR_BUCKETS[bucket]) {
    if (parts.length < 3) return null;
    const slot = ARMOR_FOLDER_SLOT[parts[0]!];
    if (!slot) return null;
    return { slotType: slot, itemName, rarity: parts[1] ?? null, variant: ARMOR_BUCKETS[bucket]!, bucket, path };
  }
  if (bucket === "Accessories") {
    if (parts.length < 3) return null;
    const slot = ACCESSORY_FOLDER_SLOT[parts[0]!];
    if (!slot) return null;
    return { slotType: slot, itemName, rarity: parts[1] ?? null, variant: null, bucket, path };
  }
  if (bucket === "Cloak") {
    if (parts.length < 3) return null;
    return { slotType: "cloak", itemName, rarity: parts[1] ?? null, variant: parts[0] ?? null, bucket, path };
  }
  return null;
}

/**
 * Read the icon catalog directly from `storage.objects` (same DB), restricted to
 * PUBLIC buckets so every returned icon has a working public URL. Cached.
 */
async function getRawCatalog(): Promise<CatalogItem[]> {
  return redisCache.getOrSet(cacheKeys.equipCatalog(), CATALOG_CACHE_TTL, async () => {
    const rows = await prisma.$queryRawUnsafe<Array<{ bucket_id: string; name: string }>>(
      `select o.bucket_id, o.name
         from storage.objects o
         join storage.buckets b on b.id = o.bucket_id
        where b.public = true
          and o.bucket_id = any($1::text[])
          and o.name ~* '\\.(png|jpe?g|webp)$'`,
      ALL_ICON_BUCKETS,
    );
    return rows
      .map((r) => classify(r.bucket_id, r.name))
      .filter((c): c is CatalogItem => c !== null);
  });
}

export interface CatalogSlot {
  slotType: EquipmentSlot;
  label: string;
  items: Array<CatalogItem & { iconUrl: string }>;
}

/** Slot-grouped catalog with public icon URLs. */
export async function getCatalog(): Promise<{ slots: CatalogSlot[] }> {
  const raw = await getRawCatalog();
  const bySlot = new Map<EquipmentSlot, CatalogSlot["items"]>();
  for (const it of raw) {
    const arr = bySlot.get(it.slotType) ?? [];
    arr.push({ ...it, iconUrl: publicUrl(it.bucket, it.path) });
    bySlot.set(it.slotType, arr);
  }
  const slots = (Object.keys(EQUIPMENT_SLOT_LABELS) as EquipmentSlot[]).map((slotType) => ({
    slotType,
    label: EQUIPMENT_SLOT_LABELS[slotType],
    items: (bySlot.get(slotType) ?? []).sort((a, b) => a.itemName.localeCompare(b.itemName)),
  }));
  return { slots };
}

// ─── Boss drops catalog (equipment icons + consumables) ──────────────
// The Taken-boss "drops" picker needs more than wearable gear: it also covers
// Skill Books, Ability runes and Mounts, which live in the public `Consumable`
// bucket with a different path shape → `Consumable/<Category>/<Rarity>/<Name>`.

const CONSUMABLE_BUCKET = "Consumable";

// Top-level drop "type" shown as the picker's category filter.
const EQUIP_SLOT_DROP_TYPE: Record<string, string> = {
  weapon: "Weapon",
  helm: "Armor",
  upperArmor: "Armor",
  lowerArmor: "Armor",
  gloves: "Armor",
  boots: "Armor",
  earrings: "Accessory",
  necklace: "Accessory",
  bracelet: "Accessory",
  ring: "Accessory",
  belt: "Accessory",
  insignia: "Accessory",
  cloak: "Cloak",
  gadget: "Gadget",
};

export interface DropCatalogItem {
  type: string; // Weapon | Armor | Accessory | Cloak | Gadget | Skill Book | Ability | Mount
  slotType: string | null; // equipment slot (weapon, helm, boots, necklace…) or null for consumables
  category: string | null; // variant: weapon type, armor class, cloak type, skillbook weapon…
  rarity: string | null;
  itemName: string;
  bucket: string;
  path: string;
  iconUrl: string;
}

// "SwordAndShield" → "Sword And Shield", "BareHands" → "Bare Hands"
function humanizeLeaf(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, "$1 $2").trim();
}

const WEAPON_VARIANT_SUFFIXES: Record<string, string[]> = {
  Greatsword: ["GS", "Greatsword"],
  "Sword & Shield": ["SnS", "SwordShield", "SwordAndShield", "Sword Shield"],
  Bow: ["Bow"],
  Staff: ["Staff"],
  "Dual Dagger": ["DD", "DualDagger", "Dual Dagger"],
  Crossbow: ["CB", "Xbow", "CrossBow", "Crossbow", "Cross Bow"],
  Gauntlet: ["Gauntlet"],
  "Battle Staff": ["BStaff", "BattleStaff", "Battle Staff"],
  "Battle Shield": ["BShield", "BattleShield", "Battle Shield"],
};

function compactName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function trimAlnumSuffix(value: string, suffixLength: number): string {
  let remaining = suffixLength;
  let cutIndex = value.length;

  for (let i = value.length - 1; i >= 0; i--) {
    if (!/[a-z0-9]/i.test(value[i]!)) continue;
    remaining--;
    if (remaining === 0) {
      cutIndex = i;
      break;
    }
  }

  return value.slice(0, cutIndex).replace(/[\s_-]+$/g, "").trim();
}

function stripWeaponVariantSuffix(itemName: string, variant: string): string {
  const compactItem = compactName(itemName);
  const suffixes = [...(WEAPON_VARIANT_SUFFIXES[variant] ?? []), variant]
    .map((suffix) => compactName(suffix))
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);

  for (const suffix of suffixes) {
    if (compactItem.length <= suffix.length || !compactItem.endsWith(suffix)) continue;
    const stripped = trimAlnumSuffix(itemName, suffix.length);
    if (stripped) return stripped;
  }

  return itemName;
}

function formatWeaponDropItemName(itemName: string, variant: string | null): string {
  if (!variant) return humanizeLeaf(itemName);
  const base = humanizeLeaf(stripWeaponVariantSuffix(itemName, variant));
  const normalizedBase = compactName(base);
  const normalizedVariant = compactName(variant);

  if (!base || normalizedBase === normalizedVariant || normalizedBase.endsWith(normalizedVariant)) {
    return humanizeLeaf(itemName);
  }

  return `${base} ${variant}`;
}

/** Classify a `Consumable` storage object into a drop item, or null. */
function classifyConsumable(path: string): Omit<DropCatalogItem, "iconUrl"> | null {
  const parts = path.split("/").filter(Boolean);
  if (parts.length < 3) return null;
  const category = parts[0]!; // Ability | Skillbook | Mount
  const rarity = parts[1] ?? null;
  const leaf = stripExt(parts[parts.length - 1]!);

  if (category === "Skillbook") {
    return {
      type: "Skill Book",
      slotType: null,
      category: humanizeLeaf(leaf),
      rarity,
      itemName: `${humanizeLeaf(leaf)} Skill Book`,
      bucket: CONSUMABLE_BUCKET,
      path,
    };
  }
  if (category === "Ability") {
    return { type: "Ability", slotType: null, category: null, rarity, itemName: "Ability Rune", bucket: CONSUMABLE_BUCKET, path };
  }
  if (category === "Mount") {
    return { type: "Mount", slotType: null, category: null, rarity, itemName: "Mount", bucket: CONSUMABLE_BUCKET, path };
  }
  return null;
}

async function getRawConsumables(): Promise<Array<Omit<DropCatalogItem, "iconUrl">>> {
  return redisCache.getOrSet(cacheKeys.equipDropsCatalog(), CATALOG_CACHE_TTL, async () => {
    const rows = await prisma.$queryRawUnsafe<Array<{ name: string }>>(
      `select o.name
         from storage.objects o
         join storage.buckets b on b.id = o.bucket_id
        where b.public = true
          and o.bucket_id = $1
          and o.name ~* '\\.(png|jpe?g|webp)$'`,
      CONSUMABLE_BUCKET,
    );
    return rows
      .map((r) => classifyConsumable(r.name))
      .filter((c): c is Omit<DropCatalogItem, "iconUrl"> => c !== null);
  });
}

/** Flat, public-URL drops catalog: wearable gear + consumables (skill books, etc.). */
export async function getDropsCatalog(): Promise<{ items: DropCatalogItem[] }> {
  const [gear, consumables] = await Promise.all([getRawCatalog(), getRawConsumables()]);

  const gearItems: DropCatalogItem[] = gear.map((it) => ({
    type: EQUIP_SLOT_DROP_TYPE[it.slotType] ?? "Other",
    slotType: it.slotType,
    category: it.variant,
    rarity: it.rarity,
    itemName: it.slotType === "weapon" ? formatWeaponDropItemName(it.itemName, it.variant) : it.itemName,
    bucket: it.bucket,
    path: it.path,
    iconUrl: publicUrl(it.bucket, it.path),
  }));

  const consumableItems: DropCatalogItem[] = consumables.map((it) => ({
    ...it,
    iconUrl: publicUrl(it.bucket, it.path),
  }));

  const items = [...gearItems, ...consumableItems].sort(
    (a, b) => a.type.localeCompare(b.type) || a.itemName.localeCompare(b.itemName),
  );
  return { items };
}

/** Lookup map keyed by `${bucket}::${path}` for validating submitted drops. */
export async function getDropCatalogMap(): Promise<Map<string, DropCatalogItem>> {
  const { items } = await getDropsCatalog();
  return new Map(items.map((it) => [`${it.bucket}::${it.path}`, it]));
}

// ─── Membership helper ───────────────────────────────────────────────

async function requireActiveMember(guildId: string, userId: string) {
  const member = await getGuildMemberByUser(userId, guildId);
  if (!member || !member.isActive) {
    throw new ForbiddenError("You must be an active guild member");
  }
  return member;
}

// ─── Screenshot upload (best-effort persistence) ─────────────────────

const MIME_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
};

export async function uploadScreenshot(guildId: string, userId: string, dataUrl: string) {
  const member = await requireActiveMember(guildId, userId);

  const match = /^data:(image\/[a-zA-Z+]+);base64,(.+)$/.exec(dataUrl);
  if (!match) throw new BadRequestError("Invalid image data");
  const mime = match[1]!;
  const ext = MIME_EXT[mime];
  if (!ext) throw new BadRequestError("Unsupported image type");

  const buffer = Buffer.from(match[2]!, "base64");
  if (buffer.length === 0) throw new BadRequestError("Empty image");
  if (buffer.length > 10 * 1024 * 1024) throw new BadRequestError("Image exceeds 10MB");

  const path = `${member.id}/${Date.now()}.${ext}`;
  const uploaded = await uploadObject(SCREENSHOT_BUCKET, path, buffer, mime);
  if (!uploaded) {
    // Storage write not permitted — screenshot persistence is optional, so the
    // member can still confirm + save their gear without a stored source image.
    return { path: null, signedUrl: null, stored: false };
  }
  const signedUrl = await signUrl(SCREENSHOT_BUCKET, path, SCREENSHOT_TTL);
  return { path, signedUrl, stored: true };
}

// ─── Saved equipment ─────────────────────────────────────────────────

async function attachUrls(
  rows: Array<{ iconBucket: string; iconUrl: string; sourceScreenshotUrl: string | null }>,
) {
  // Icons are public; screenshots are private → sign on read (best-effort).
  const shotUrls = new Map<string, string | null>();
  await Promise.all(
    rows
      .map((r) => r.sourceScreenshotUrl)
      .filter((p): p is string => !!p && !shotUrls.has(p))
      .map(async (p) => {
        shotUrls.set(p, await signUrl(SCREENSHOT_BUCKET, p, SCREENSHOT_TTL));
      }),
  );
  return rows.map((r) => ({
    ...r,
    iconSignedUrl: publicUrl(r.iconBucket, r.iconUrl),
    screenshotSignedUrl: r.sourceScreenshotUrl ? shotUrls.get(r.sourceScreenshotUrl) ?? null : null,
  }));
}

export async function getMyEquipment(guildId: string, userId: string) {
  // Per-user by definition ("mine") — always the caller's own gear.
  return redisCache.getOrSet(cacheKeys.equipMine(guildId, userId), cacheTtl.equipMine, async () => {
    const member = await requireActiveMember(guildId, userId);
    const rows = await prisma.memberEquipment.findMany({
      where: { memberId: member.id },
      orderBy: { slotType: "asc" },
    });
    const equipment = await attachUrls(rows);
    return { equipment };
  });
}

// ─── Confirm & save ──────────────────────────────────────────────────

export interface EquipmentItemInput {
  slotType: EquipmentSlot;
  itemName: string;
  iconPath: string;
  iconBucket: string;
  rarity?: string;
  confidence: number;
}

/**
 * Validate items against the live catalog and upsert one row per slot.
 * `strict` (default) throws on an unknown icon; non-strict silently skips it
 * (used by the join-approval path so a stale icon never blocks acceptance).
 * Returns the number of rows saved.
 */
export async function saveEquipmentRows(
  memberId: string,
  items: EquipmentItemInput[],
  sourceScreenshotPath?: string | null,
  strict = true,
): Promise<number> {
  const raw = await getRawCatalog();
  const valid = new Set(raw.map((c) => `${c.bucket}::${c.path}`));

  const accepted: EquipmentItemInput[] = [];
  for (const item of items) {
    if (valid.has(`${item.iconBucket}::${item.iconPath}`)) {
      accepted.push(item);
    } else if (strict) {
      throw new BadRequestError(
        `Icon for "${item.slotType}" is not in the icon catalog and cannot be saved.`,
      );
    }
  }
  if (accepted.length === 0) return 0;

  await prisma.$transaction(
    accepted.map((item) =>
      prisma.memberEquipment.upsert({
        where: { memberId_slotType: { memberId, slotType: item.slotType } },
        create: {
          memberId,
          slotType: item.slotType,
          itemName: item.itemName,
          iconUrl: item.iconPath,
          iconBucket: item.iconBucket,
          rarity: item.rarity ?? null,
          confidence: item.confidence,
          needsReview: item.confidence < LOW_CONFIDENCE_THRESHOLD,
          sourceScreenshotUrl: sourceScreenshotPath ?? null,
        },
        update: {
          itemName: item.itemName,
          iconUrl: item.iconPath,
          iconBucket: item.iconBucket,
          rarity: item.rarity ?? null,
          confidence: item.confidence,
          needsReview: item.confidence < LOW_CONFIDENCE_THRESHOLD,
          sourceScreenshotUrl: sourceScreenshotPath ?? null,
        },
      }),
    ),
  );
  return accepted.length;
}

export async function confirmEquipment(
  guildId: string,
  userId: string,
  items: EquipmentItemInput[],
  sourceScreenshotPath?: string,
) {
  const member = await requireActiveMember(guildId, userId);

  await saveEquipmentRows(member.id, items, sourceScreenshotPath, true);

  await writeAuditLog({
    actorId: userId,
    guildId,
    action: AUDIT_ACTIONS.MEMBER_EQUIPMENT_UPDATED,
    target: "MemberEquipment",
    targetId: member.id,
    detail: {
      ign: member.ign,
      slots: items.map((i) => ({ slot: i.slotType, item: i.itemName, confidence: i.confidence })),
    },
  });

  await redisCache.del(cacheKeys.equipMine(guildId, userId));
  void broadcastToGuild(guildId, "member_equipment_updated", { memberId: member.id });

  return getMyEquipment(guildId, userId);
}
