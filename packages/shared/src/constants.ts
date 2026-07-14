// ─── Application Constants ──────────────────────

import { CUSTOMIZABLE_ROLES, type CustomizableRoleType } from "./types/roles";

// Token expiration (also defined in env, these are fallbacks)
export const TOKEN_EXPIRY = {
  ACCESS: "15m",
  REFRESH: "7d",
  PASSWORD_RESET: "1h",
} as const;

// Audit action names
export const AUDIT_ACTIONS = {
  // Auth
  USER_REGISTERED: "USER_REGISTERED",
  USER_LOGIN: "USER_LOGIN",
  USER_LOGOUT: "USER_LOGOUT",
  USER_LOGOUT_ALL: "USER_LOGOUT_ALL",
  TOKEN_REFRESHED: "TOKEN_REFRESHED",
  TOKEN_REPLAY_DETECTED: "TOKEN_REPLAY_DETECTED",
  PASSWORD_RESET_REQUESTED: "PASSWORD_RESET_REQUESTED",
  PASSWORD_RESET_COMPLETED: "PASSWORD_RESET_COMPLETED",
  PASSWORD_CHANGED: "PASSWORD_CHANGED",
  SESSION_REVOKED: "SESSION_REVOKED",

  // Guild Management
  GUILD_CREATED: "GUILD_CREATED",
  FACTION_CREATED: "FACTION_CREATED",
  GUILD_UPDATED: "GUILD_UPDATED",
  GUILD_SETTINGS_UPDATED: "GUILD_SETTINGS_UPDATED",
  MEMBER_ADDED: "MEMBER_ADDED",
  MEMBER_REMOVED: "MEMBER_REMOVED",
  MEMBER_PROMOTED: "MEMBER_PROMOTED",
  MEMBER_DEMOTED: "MEMBER_DEMOTED",
  MEMBER_ROLE_CUSTOMIZED: "MEMBER_ROLE_CUSTOMIZED",
  CUSTOM_ROLE_CREATED: "CUSTOM_ROLE_CREATED",
  CUSTOM_ROLE_UPDATED: "CUSTOM_ROLE_UPDATED",
  CUSTOM_ROLE_DELETED: "CUSTOM_ROLE_DELETED",

  // Economy
  BOSS_KILL_RECORDED: "BOSS_KILL_RECORDED",
  DISTRIBUTION_EXECUTED: "DISTRIBUTION_EXECUTED",
  PAYOUT_REQUESTED: "PAYOUT_REQUESTED",
  PAYOUT_CONFIRMED: "PAYOUT_CONFIRMED",
  CONFIG_CHANGED: "CONFIG_CHANGED",

  // Guild Market — Item Requests (also emitted by requests.service.ts)
  ITEM_REQUEST_SUBMITTED: "ITEM_REQUEST_SUBMITTED",
  ITEM_REQUEST_APPROVED: "ITEM_REQUEST_APPROVED",
  ITEM_REQUEST_DECLINED: "ITEM_REQUEST_DECLINED",
  ITEM_REQUEST_FULFILLED: "ITEM_REQUEST_FULFILLED",

  // Guild Market — Legendary Priority
  LEGENDARY_PRIORITY_SUBMITTED: "LEGENDARY_PRIORITY_SUBMITTED",
  LEGENDARY_PRIORITY_APPROVED: "LEGENDARY_PRIORITY_APPROVED",
  LEGENDARY_PRIORITY_REJECTED: "LEGENDARY_PRIORITY_REJECTED",
  LEGENDARY_PRIORITY_COMPLETED: "LEGENDARY_PRIORITY_COMPLETED",

  // Guild Market — Distribution & priority
  ITEM_DISTRIBUTED: "ITEM_DISTRIBUTED",
  DISTRIBUTION_LIMIT_OVERRIDDEN: "DISTRIBUTION_LIMIT_OVERRIDDEN",
  PRIORITY_SEQUENCE_CHANGED: "PRIORITY_SEQUENCE_CHANGED",
  DISTRIBUTION_RULE_UPDATED: "DISTRIBUTION_RULE_UPDATED",

  // Leader's Panel — Register Activity (point rules)
  ACTIVITY_POINT_RULES_UPDATED: "ACTIVITY_POINT_RULES_UPDATED",

  // Guild Market — Wishlist & mounts
  WISHLIST_ITEM_DISTRIBUTED: "WISHLIST_ITEM_DISTRIBUTED",
  WISHLIST_LOG_REQUESTED: "WISHLIST_LOG_REQUESTED",
  MOUNT_CATALOG_UPDATED: "MOUNT_CATALOG_UPDATED",
  MOUNT_DISTRIBUTED: "MOUNT_DISTRIBUTED",

  // Member Equipment — Item Screenshot Update
  MEMBER_EQUIPMENT_UPDATED: "MEMBER_EQUIPMENT_UPDATED",
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

// Ledger reference types
export const LEDGER_REFERENCE_TYPES = {
  BOSS_KILL: "BOSS_KILL",
  SALE: "SALE",
  PAYOUT: "PAYOUT",
  TAX: "TAX",
  DISTRIBUTION: "DISTRIBUTION",
  MANUAL_ADJUSTMENT: "MANUAL_ADJUSTMENT",
  ATTENDANCE_REWARD: "ATTENDANCE_REWARD",
} as const;

// Share distribution models
export const SHARE_MODELS = {
  EQUAL: "EQUAL",
  RANK_WEIGHTED: "RANK_WEIGHTED",
  DKP: "DKP",
} as const;

// API response envelope
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta?: {
    page?: number;
    pageSize?: number;
    total?: number;
  };
}

// Pagination defaults
export const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,
} as const;

// ─── Guild Market ───────────────────────────────

// Item request types (members request these resources)
export const MARKET_REQUEST_TYPES = ["LOGS", "MATERIALS", "TEMPORAL_PIECES"] as const;
export type MarketRequestType = (typeof MARKET_REQUEST_TYPES)[number];

export const MARKET_REQUEST_TYPE_LABELS: Record<MarketRequestType, string> = {
  LOGS: "Logs",
  MATERIALS: "Materials",
  TEMPORAL_PIECES: "Temporal Pieces",
};

// Map a request type to the matching limit key on a tier's rule
export const REQUEST_TYPE_LIMIT_KEY: Record<MarketRequestType, "logs" | "materials" | "temporalPieces"> = {
  LOGS: "logs",
  MATERIALS: "materials",
  TEMPORAL_PIECES: "temporalPieces",
};

// Legendary priority categories
export const LEGENDARY_CATEGORIES = [
  "WEAPON",
  "LEGEND_ACCESSORIES",
  "LEGEND_CLOAK",
  "ABILITY_REROLL",
  "ABILITY_PASSIVE",
] as const;
export type LegendaryCategory = (typeof LEGENDARY_CATEGORIES)[number];

export const LEGENDARY_CATEGORY_LABELS: Record<LegendaryCategory, string> = {
  WEAPON: "Weapon",
  LEGEND_ACCESSORIES: "Legend Accessories",
  LEGEND_CLOAK: "Legend Cloak",
  ABILITY_REROLL: "Ability Reroll",
  ABILITY_PASSIVE: "Ability Passive",
};

// ─── Guild Storage (vault of high-value drops) ──────────────────────
export const STORAGE_CATEGORIES = [
  "LEGEND_WEAPON",
  "LEGEND_ARMOR",
  "LEGEND_ACCESSORY",
  "MOUNT",
  "OTHER",
] as const;
export type StorageCategory = (typeof STORAGE_CATEGORIES)[number];

export const STORAGE_CATEGORY_LABELS: Record<StorageCategory, string> = {
  LEGEND_WEAPON: "Legend Weapon",
  LEGEND_ARMOR: "Legend Armor",
  LEGEND_ACCESSORY: "Legend Accessory",
  MOUNT: "Mount",
  OTHER: "Other",
};

// Item lifecycle inside the vault
export const STORAGE_STATUSES = ["IN_STORAGE", "LISTED_MARKET", "DISTRIBUTED"] as const;
export type StorageStatus = (typeof STORAGE_STATUSES)[number];

// How an item left the vault
export const STORAGE_DISPOSITIONS = ["MARKET", "GUILD_SALE", "GUILD_AUCTION"] as const;
export type StorageDisposition = (typeof STORAGE_DISPOSITIONS)[number];

export const STORAGE_DISPOSITION_LABELS: Record<StorageDisposition, string> = {
  MARKET: "Listed in Market",
  GUILD_SALE: "Guild Sale",
  GUILD_AUCTION: "Guild Auction",
};

// Notable bosses whose drops commonly enter storage (Clemantis → Legend Weapon)
export const STORAGE_SOURCE_BOSSES = ["Clemantis"] as const;

// Distribution rank tiers
export const DISTRIBUTION_TIERS = ["CORE", "ELITE", "UPPER", "LOWER"] as const;
export type DistributionTier = (typeof DISTRIBUTION_TIERS)[number];

export const DISTRIBUTION_TIER_LABELS: Record<DistributionTier, string> = {
  CORE: "Core",
  ELITE: "Elite",
  UPPER: "Upper Rank",
  LOWER: "Lower Rank",
};

// Status sets (stored as strings; UI relabels per spec)
export const LEGENDARY_STATUSES = ["PENDING", "APPROVED", "REJECTED", "COMPLETED"] as const;
export type LegendaryStatus = (typeof LEGENDARY_STATUSES)[number];

// Item request statuses reuse the Prisma enum; spec labels them differently
export const REQUEST_STATUS_LABELS: Record<string, string> = {
  PENDING: "Pending",
  APPROVED: "Approved",
  DECLINED: "Rejected",
  FULFILLED: "Distributed",
};

// Gear-slot definitions — ordered keys that drive the distribution forms and `items` JSON.
// CORE members get a more detailed form (higher-priority contributors).
export const CORE_SLOTS = [
  "weapon",
  "secondWeapon",
  "headpiece",
  "upperArmor",
  "lowerArmor",
  "gloves",
  "boots",
  "necklace",
  "earrings",
  "ring",
  "bracelet",
  "belt",
  "cloak",
  "skillbook",
  "abilityBook",
  "abilityBook60",
  "mount",
  "itemLog",
  "upgradeScrolls",
  "temporalPiece",
  "materials",
] as const;
export type CoreSlot = (typeof CORE_SLOTS)[number];

export const NON_CORE_SLOTS = [
  "weapon",
  "logs",
  "temporalPieces",
  "materials",
  "helmet",
  "upperArmor",
  "lowerArmor",
  "gloves",
  "shoes",
  "cloak",
  "necklace",
  "belt",
  "ring",
  "earrings",
  "bracelet",
  "saddle",
] as const;
export type NonCoreSlot = (typeof NON_CORE_SLOTS)[number];

// Human-readable labels for slot keys (shared by both forms)
export const SLOT_LABELS: Record<string, string> = {
  weapon: "Weapon",
  secondWeapon: "2nd Weapon",
  headpiece: "Headpiece",
  helmet: "Helmet",
  upperArmor: "Upper Armor",
  lowerArmor: "Lower Armor",
  gloves: "Gloves",
  boots: "Boots",
  shoes: "Shoes",
  necklace: "Necklace",
  earrings: "Earrings",
  ring: "Ring",
  bracelet: "Bracelet",
  belt: "Belt",
  cloak: "Cloak",
  skillbook: "Skillbook",
  abilityBook: "Ability Book",
  abilityBook60: "Ability Book 60%",
  mount: "Mount",
  saddle: "Saddle",
  itemLog: "Item Log",
  logs: "Logs",
  upgradeScrolls: "Upgrade Scrolls",
  temporalPiece: "Temporal Piece",
  temporalPieces: "Temporal Pieces",
  materials: "Materials",
};

// ─── Member Wishlist taxonomy ───────────────────────────────────────
// Members build a per-piece wishlist: weapons/armor/accessories carry a rarity,
// while logs/temporal/materials carry a numeric quantity (capped by the tier limits below).

export type WishlistRarity = "LEGEND" | "EPIC" | "MYTHIC";

export type ArmorType = "CLOTH" | "LEATHER" | "PLATE";

export type WishlistCategory =
  | "WEAPON"
  | "ARMOR"
  | "ACCESSORY"
  | "LOGS"
  | "TEMPORAL"
  | "MATERIALS"
  | "MOUNT";

export type WishlistStatus = "PENDING" | "DISTRIBUTED";

export interface WishlistItem {
  category: WishlistCategory;
  key: string; // weapon/armor/accessory/material key; "logs" / "temporalPieces"; mount id for MOUNT
  rarity?: WishlistRarity; // required for WEAPON/ARMOR/ACCESSORY
  armorType?: ArmorType; // ARMOR only — the piece's material (Cloth/Leather/Plate)
  quantity?: number; // required for LOGS/TEMPORAL/MATERIALS
  label?: string; // MOUNT only — snapshot of the mount name for display
  // Distribution status — auto-flipped to DISTRIBUTED when a matching item is handed out.
  status?: WishlistStatus;
  fulfilledAt?: string; // ISO timestamp when distributed
  fulfilledById?: string; // actor (officer) who distributed
}

export const WISHLIST_STATUS_LABELS: Record<WishlistStatus, string> = {
  PENDING: "Pending",
  DISTRIBUTED: "Distributed",
};

export const WISHLIST_CATEGORY_LABELS: Record<WishlistCategory, string> = {
  WEAPON: "Weapon",
  ARMOR: "Armor",
  ACCESSORY: "Accessory",
  LOGS: "Logs",
  TEMPORAL: "Temporal",
  MATERIALS: "Materials",
  MOUNT: "Mount",
};

// Common Philippine payment gateways — presets for the member's payment QR list.
export const PAYMENT_METHOD_PRESETS: string[] = [
  "GCash",
  "Maya (PayMaya)",
  "GoTyme",
  "Union Bank",
  "BPI",
  "Other",
];

// Known mount saddles — quick-add presets for the leader's mount catalog
// (GuildMount rows are still created per-guild; this just saves typing).
export const MOUNT_PRESETS: string[] = [
  "Rabeth Saddle",
  "Undemic Saddle",
  "Glasis Saddle",
  "Delphon Saddle",
  "Vulcanus Saddle",
  "Labartonis Saddle",
  "Rhodi Saddle",
  "Lamphon Saddle",
  "Petrolov Saddle",
  "Dracas Saddle",
  "Liberty Saddle",
  "Somnium Saddle",
  "Baphon Saddle",
];

export const WEAPON_TYPES: Record<string, string> = {
  greatSword: "Great Sword",
  staff: "Staff",
  battleStaff: "Battle Staff",
  bow: "Bow",
  swordShield: "Sword & Shield",
  crossbowBattleshield: "Crossbow & Battleshield",
};

export const ARMOR_PIECES: Record<string, string> = {
  helmet: "Helmet",
  upperArmor: "Upper Armor",
  lowerArmor: "Lower Armor",
  gloves: "Gloves",
  shoes: "Shoes",
  cloak: "Cloak",
};

export const ACCESSORY_PIECES: Record<string, string> = {
  necklace: "Necklace",
  belt: "Belt",
  ring: "Ring",
  earrings: "Earrings",
  bracelet: "Bracelet",
  saddle: "Saddle",
};

export const MATERIAL_TYPES: Record<string, string> = {
  legendEpicEnhancementStone: "Legend/Epic Accessory Enhancement Stone",
  lifeCore: "Life Core",
  radiantLifeCore: "Radiant Life Core",
  expertUpgradeScroll: "Expert Upgrade Scroll",
  maestroUpgradeScroll: "Maestro Upgrade Scroll",
  advancedUpgradeScroll: "Advanced Upgrade Scroll",
};

export const WEAPON_RARITIES: WishlistRarity[] = ["LEGEND", "EPIC"];
export const GEAR_RARITIES: WishlistRarity[] = ["LEGEND", "EPIC", "MYTHIC"]; // armor + accessories

export const WISHLIST_RARITY_LABELS: Record<WishlistRarity, string> = {
  LEGEND: "Legend",
  EPIC: "Epic",
  MYTHIC: "Mythic",
};

// Armor material — a 2nd dimension on top of rarity, since a piece drops in one of three types.
export const ARMOR_TYPES: ArmorType[] = ["CLOTH", "LEATHER", "PLATE"];

export const ARMOR_TYPE_LABELS: Record<ArmorType, string> = {
  CLOTH: "Cloth",
  LEATHER: "Leather",
  PLATE: "Plate",
};

// Human-readable label for any wishlist item key (weapon/armor/accessory/material/resource).
export const WISHLIST_LABELS: Record<string, string> = {
  ...WEAPON_TYPES,
  ...ARMOR_PIECES,
  ...ACCESSORY_PIECES,
  ...MATERIAL_TYPES,
  logs: "Logs",
  temporalPieces: "Temporal Pieces",
};

// Default market rules — seeded from the product spec when a guild has none configured.
export const DEFAULT_MARKET_RULES = {
  cpTiers: { eliteMinCp: 9000, upperMinCp: 6000 },
  limits: {
    CORE: { logs: 8, temporalPieces: 3, materials: 5 },
    ELITE: { logs: 7, temporalPieces: 7, materials: 5 },
    UPPER: { logs: 5, temporalPieces: 4, materials: 5 },
    LOWER: { logs: 5, temporalPieces: 3, materials: 5 },
  },
  weights: {
    rank: 0.15,
    dkp: 0.3,
    cp: 0.2,
    attendance: 0.15,
    bossParticipation: 0.1,
    previousReceived: -0.05,
    recency: 0.05,
  },
} as const;

export type MarketRules = {
  cpTiers: { eliteMinCp: number; upperMinCp: number };
  limits: Record<DistributionTier, { logs: number; temporalPieces: number; materials: number }>;
  weights: {
    rank: number;
    dkp: number;
    cp: number;
    attendance: number;
    bossParticipation: number;
    previousReceived: number;
    recency: number;
  };
};

// ─── Activity Point Rules (Leader's Panel — Register Activity) ──────
// Leader-customizable catalog of activities (Boss, PVP, Guild Boss, ...).
// Each has a base point value and a per-rank multiplier keyed by the same
// 4 customizable rank bands as role display names (see CUSTOMIZABLE_ROLES /
// resolveRoleDisplayName) — so the multiplier columns always line up with
// whatever a guild has renamed OFFICER/CORE_MEMBER/ELITE_MEMBER/MEMBER to.
export type ActivityPointRule = {
  key: string;
  label: string;
  basePoints: number;
  multipliers: Record<CustomizableRoleType, number>;
};

export type ActivityPointRules = {
  activities: ActivityPointRule[];
};

const DEFAULT_MULTIPLIERS: Record<CustomizableRoleType, number> = CUSTOMIZABLE_ROLES.reduce(
  (acc, role) => {
    acc[role] = 1;
    return acc;
  },
  {} as Record<CustomizableRoleType, number>,
);

export const DEFAULT_ACTIVITY_POINT_RULES: ActivityPointRules = {
  activities: [
    { key: "BOSS", label: "Boss", basePoints: 3, multipliers: { ...DEFAULT_MULTIPLIERS } },
    { key: "PVP", label: "PVP", basePoints: 5, multipliers: { ...DEFAULT_MULTIPLIERS } },
    { key: "GUILD_BOSS", label: "Guild Boss", basePoints: 10, multipliers: { ...DEFAULT_MULTIPLIERS } },
    { key: "GUILD_WAR", label: "Guild War", basePoints: 10, multipliers: { ...DEFAULT_MULTIPLIERS } },
    { key: "PK_WAR", label: "PK War", basePoints: 10, multipliers: { ...DEFAULT_MULTIPLIERS } },
    { key: "PVE_RALLY_GARBANA", label: "PVE Rally / Garbana", basePoints: 0, multipliers: { ...DEFAULT_MULTIPLIERS } },
    { key: "PVE_CONTENTS", label: "PVE Contents", basePoints: 0, multipliers: { ...DEFAULT_MULTIPLIERS } },
    { key: "WORLD_BOSS", label: "World Boss", basePoints: 0, multipliers: { ...DEFAULT_MULTIPLIERS } },
  ],
};

// ─── Member Equipment (Item Screenshot Update) ──────────────────────
// The 14 character equipment slots an in-game screenshot is scanned for.
// Order is the catalog/scan order; UI layout is driven by EQUIPMENT_GRID below.
export const EQUIPMENT_SLOTS = [
  "weapon",
  "gadget",
  "helm",
  "upperArmor",
  "lowerArmor",
  "gloves",
  "boots",
  "cloak",
  "necklace",
  "earrings",
  "bracelet",
  "ring",
  "belt",
  "insignia",
] as const;
export type EquipmentSlot = (typeof EQUIPMENT_SLOTS)[number];

export const EQUIPMENT_SLOT_LABELS: Record<EquipmentSlot, string> = {
  weapon: "Weapon",
  gadget: "Gadget",
  helm: "Helm",
  upperArmor: "Upper Armor",
  lowerArmor: "Lower Armor",
  gloves: "Gloves",
  boots: "Boots",
  cloak: "Cloak",
  necklace: "Necklace",
  earrings: "Earrings",
  bracelet: "Bracelet",
  ring: "Ring",
  belt: "Belt",
  insignia: "Insignia",
};

// Game-like layout: two equipment columns flanking the character.
// `col` is "left" | "right"; `row` is the vertical order within the column.
export const EQUIPMENT_GRID: Record<EquipmentSlot, { col: "left" | "right"; row: number }> = {
  weapon: { col: "left", row: 0 },
  helm: { col: "left", row: 1 },
  upperArmor: { col: "left", row: 2 },
  lowerArmor: { col: "left", row: 3 },
  gloves: { col: "left", row: 4 },
  boots: { col: "left", row: 5 },
  insignia: { col: "left", row: 6 },
  gadget: { col: "right", row: 0 },
  cloak: { col: "right", row: 1 },
  necklace: { col: "right", row: 2 },
  earrings: { col: "right", row: 3 },
  bracelet: { col: "right", row: 4 },
  ring: { col: "right", row: 5 },
  belt: { col: "right", row: 6 },
};

// Detections at or below this combined confidence are flagged "Needs Review".
export const LOW_CONFIDENCE_THRESHOLD = 0.6;
