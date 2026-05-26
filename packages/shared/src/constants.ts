// ─── Application Constants ──────────────────────

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
  GUILD_UPDATED: "GUILD_UPDATED",
  GUILD_SETTINGS_UPDATED: "GUILD_SETTINGS_UPDATED",
  MEMBER_ADDED: "MEMBER_ADDED",
  MEMBER_REMOVED: "MEMBER_REMOVED",
  MEMBER_PROMOTED: "MEMBER_PROMOTED",
  MEMBER_DEMOTED: "MEMBER_DEMOTED",

  // Economy
  BOSS_KILL_RECORDED: "BOSS_KILL_RECORDED",
  DISTRIBUTION_EXECUTED: "DISTRIBUTION_EXECUTED",
  PAYOUT_REQUESTED: "PAYOUT_REQUESTED",
  PAYOUT_CONFIRMED: "PAYOUT_CONFIRMED",
  CONFIG_CHANGED: "CONFIG_CHANGED",
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
