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
} from "./validators/auth";
export type {
  LoginInput,
  RegisterInput,
  ForgotPasswordInput,
  ResetPasswordInput,
  ChangePasswordInput,
  UpdateUserInput,
} from "./validators/auth";

// Constants
export {
  TOKEN_EXPIRY,
  AUDIT_ACTIONS,
  LEDGER_REFERENCE_TYPES,
  SHARE_MODELS,
  PAGINATION,
} from "./constants";
export type { AuditAction, ApiResponse } from "./constants";

// Bosses
export { PREDEFINED_BOSSES, getNextBossSpawnTime, getBossImageUrl } from "./types/bosses";
export type { PredefinedBoss } from "./types/bosses";
