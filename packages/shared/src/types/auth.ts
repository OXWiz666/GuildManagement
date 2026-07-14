// ─── Auth Types ─────────────────────────────────
// Shared between frontend and backend

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  confirmPassword: string;
  displayName: string;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ResetPasswordRequest {
  token: string;
  password: string;
  confirmPassword: string;
}

export interface RefreshRequest {
  refreshToken?: string; // Sent via cookie or body
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface JwtPayload {
  userId: string;
  email: string;
  iat?: number;
  exp?: number;
}

export interface AuthResponse {
  user: UserPublic;
  tokens: TokenPair;
}

export interface PaymentMethodEntry {
  id: string;
  method: string;
  label?: string | null;
  qrUrl: string;
  updatedAt: string;
}

export interface UserPublic {
  id: string;
  email: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  bannerUrl: string | null;
  createdAt: string;
  ign?: string | null;
  cp?: number | null;
  class?: string | null;
  weapon?: string | null;
  paymentMethods?: PaymentMethodEntry[];
}

export interface UserWithGuilds extends UserPublic {
  guilds: GuildMembership[];
  // Platform (SaaS-level) role, if the user is a platform admin. null otherwise.
  platformRole?: string | null;
}

export interface GuildMembership {
  guildId: string;
  guildName: string;
  guildSlug: string;
  guildAvatarUrl: string | null;
  factionId: string | null;
  factionName: string | null;
  role: string;
  rankName: string;
  joinedAt: string;
}

export interface SessionInfo {
  id: string;
  deviceInfo: string | null;
  ipAddress: string | null;
  lastActive: string;
  createdAt: string;
  isCurrent: boolean;
}
