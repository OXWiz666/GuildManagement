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
} from "./types/auth";

// Role utilities
export {
  GUILD_ROLES,
  ROLE_DISPLAY_NAMES,
  ROLE_PERMISSIONS,
  RANK_DISPLAY_NAMES,
  hasMinimumRole,
  getAssignableRoles,
  getManageableRoles,
  canManageRole,
} from "./types/roles";
export type { GuildRoleType } from "./types/roles";

// Validators
export {
  emailSchema,
  passwordSchema,
  displayNameSchema,
  loginSchema,
  registerSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
  updateUserSchema,
  combatPowerSchema,
} from "./validators/auth";
export type {
  LoginInput,
  RegisterInput,
  ForgotPasswordInput,
  ResetPasswordInput,
  ChangePasswordInput,
  UpdateUserInput,
  CombatPowerInput,
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
  DISTRIBUTION_TIERS,
  DISTRIBUTION_TIER_LABELS,
  LEGENDARY_STATUSES,
  REQUEST_STATUS_LABELS,
  CORE_SLOTS,
  NON_CORE_SLOTS,
  SLOT_LABELS,
  DEFAULT_MARKET_RULES,
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
  DistributionTier,
  LegendaryStatus,
  CoreSlot,
  NonCoreSlot,
  MarketRules,
  EquipmentSlot,
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
  marketRulesSchema,
  wishlistSchema,
} from "./validators/market";
export type {
  CreateItemRequestInput,
  ReviewRequestInput,
  LegendaryPriorityInput,
  ReviewLegendaryInput,
  LegendarySequenceInput,
  PrioritySequenceInput,
  CreateDistributionInput,
  MarketRulesInput,
  WishlistInput,
} from "./validators/market";

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
} from "./types/bosses";
export type { PredefinedBoss, RealtimeBossTimer, BossCycleCategory } from "./types/bosses";
