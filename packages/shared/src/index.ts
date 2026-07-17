// Types
export type {
  LoginRequest,
  RegisterRequest,
  ForgotPasswordRequest,
  ResetPasswordRequest,
  RefreshRequest,
  TokenPair,
  JwtPayload,
  AuthResponse,
  UserPublic,
  UserWithGuilds,
  GuildMembership,
  SessionInfo,
  PaymentMethodEntry,
} from "./types/auth";

// Role utilities
export {
  GUILD_ROLES,
  ROLE_DISPLAY_NAMES,
  ROLE_PERMISSIONS,
  RANK_DISPLAY_NAMES,
  CUSTOMIZABLE_ROLES,
  hasMinimumRole,
  getAssignableRoles,
  getManageableRoles,
  canManageRole,
  resolveRoleDisplayName,
} from "./types/roles";
export type { GuildRoleType, CustomizableRoleType } from "./types/roles";

// Platform (SaaS-level) roles
export {
  PLATFORM_ROLES,
  PLATFORM_ROLE_DISPLAY_NAMES,
  hasMinimumPlatformRole,
} from "./types/platform";
export type { PlatformRoleType } from "./types/platform";

// Validators
export {
  emailSchema,
  passwordSchema,
  displayNameSchema,
  usernameSchema,
  loginIdentifierSchema,
  resolveIdentifierSchema,
  loginSchema,
  registerSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
  updateUserSchema,
  updateCharacterProfileSchema,
  combatPowerSchema,
  uploadProfileImageSchema,
  addPaymentMethodSchema,
  ACCOUNT_TYPES,
  orgNameSchema,
  leaderOnboardingSchema,
  slugify,
} from "./validators/auth";
export type {
  LoginInput,
  ResolveIdentifierInput,
  RegisterInput,
  ForgotPasswordInput,
  ResetPasswordInput,
  ChangePasswordInput,
  UpdateUserInput,
  UpdateCharacterProfileInput,
  CombatPowerInput,
  UploadProfileImageInput,
  AddPaymentMethodInput,
  AccountType,
  LeaderOnboardingInput,
} from "./validators/auth";

// Constants
export {
  TOKEN_EXPIRY,
  AUDIT_ACTIONS,
  LEDGER_REFERENCE_TYPES,
  SHARE_MODELS,
  PAGINATION,
  MARKET_REQUEST_TYPES,
  MARKET_REQUEST_TYPE_LABELS,
  REQUEST_TYPE_LIMIT_KEY,
  LEGENDARY_CATEGORIES,
  LEGENDARY_CATEGORY_LABELS,
  STORAGE_CATEGORIES,
  STORAGE_CATEGORY_LABELS,
  STORAGE_STATUSES,
  STORAGE_DISPOSITIONS,
  STORAGE_DISPOSITION_LABELS,
  STORAGE_SOURCE_BOSSES,
  DISTRIBUTION_TIERS,
  DISTRIBUTION_TIER_LABELS,
  LEGENDARY_STATUSES,
  REQUEST_STATUS_LABELS,
  CORE_SLOTS,
  NON_CORE_SLOTS,
  SLOT_LABELS,
  WEAPON_TYPES,
  ARMOR_PIECES,
  ACCESSORY_PIECES,
  MATERIAL_TYPES,
  WEAPON_RARITIES,
  GEAR_RARITIES,
  WISHLIST_RARITY_LABELS,
  ARMOR_TYPES,
  ARMOR_TYPE_LABELS,
  WISHLIST_LABELS,
  WISHLIST_STATUS_LABELS,
  WISHLIST_CATEGORY_LABELS,
  MOUNT_PRESETS,
  PAYMENT_METHOD_PRESETS,
  DEFAULT_MARKET_RULES,
  DEFAULT_ACTIVITY_POINT_RULES,
  EQUIPMENT_SLOTS,
  EQUIPMENT_SLOT_LABELS,
  EQUIPMENT_GRID,
  LOW_CONFIDENCE_THRESHOLD,
} from "./constants";
export type {
  AuditAction,
  ApiResponse,
  MarketRequestType,
  LegendaryCategory,
  StorageCategory,
  StorageStatus,
  StorageDisposition,
  DistributionTier,
  LegendaryStatus,
  CoreSlot,
  NonCoreSlot,
  MarketRules,
  ActivityPointRule,
  ActivityPointRules,
  EquipmentSlot,
  WishlistRarity,
  ArmorType,
  WishlistItem,
  WishlistCategory,
  WishlistStatus,
} from "./constants";

// Market validators
export {
  createItemRequestSchema,
  reviewRequestSchema,
  legendaryPrioritySchema,
  reviewLegendarySchema,
  legendarySequenceSchema,
  prioritySequenceSchema,
  createDistributionSchema,
  registerStorageInMarketSchema,
  markStorageSoldSchema,
  distributeStorageSchema,
  createAuctionSchema,
  placeBidSchema,
  marketRulesSchema,
  wishlistItemSchema,
  wishlistSchema,
  mountCatalogSchema,
  distributeMountSchema,
  notifyRequestSchema,
} from "./validators/market";

// Activity point rules validators (Leader's Panel — Register Activity)
export { activityPointRuleSchema, activityPointRulesSchema } from "./validators/activityPoints";
export type { ActivityPointRuleInput, ActivityPointRulesInput } from "./validators/activityPoints";
export type {
  CreateItemRequestInput,
  ReviewRequestInput,
  LegendaryPriorityInput,
  ReviewLegendaryInput,
  LegendarySequenceInput,
  PrioritySequenceInput,
  CreateDistributionInput,
  RegisterStorageInMarketInput,
  MarkStorageSoldInput,
  DistributeStorageInput,
  CreateAuctionInput,
  PlaceBidInput,
  MarketRulesInput,
  WishlistItemInput,
  WishlistInput,
  MountCatalogInput,
  DistributeMountInput,
  NotifyRequestInput,
} from "./validators/market";

// Platform / Super Admin validators (Phases 2–4)
export {
  userModerationSchema,
  guildModerationSchema,
  transferOwnershipSchema,
  planSchema,
  planUpdateSchema,
  subscriptionCreateSchema,
  subscriptionActionSchema,
  paymentSchema,
  couponSchema,
} from "./validators/platform";
export type {
  UserModerationInput,
  GuildModerationInput,
  TransferOwnershipInput,
  PlanInput,
  PlanUpdateInput,
  SubscriptionCreateInput,
  SubscriptionActionInput,
  PaymentInput,
  CouponInput,
} from "./validators/platform";

// Equipment validators (Item Screenshot Update)
export {
  uploadScreenshotSchema,
  confirmEquipmentSchema,
  equipmentItemSchema,
  gearItemsSchema,
} from "./validators/equipment";
export type {
  UploadScreenshotInput,
  ConfirmEquipmentInput,
  EquipmentItemInput,
} from "./validators/equipment";

// Bosses
export {
  PREDEFINED_BOSSES,
  getNextBossSpawnTime,
  getBossImageUrl,
  getRealtimeBossTimer,
  getBossCycleCategory,
  getDailyRotationIndex,
  SHORT_CYCLE_MAX_HOURS,
} from "./types/bosses";
export type { PredefinedBoss, RealtimeBossTimer, BossCycleCategory } from "./types/bosses";
