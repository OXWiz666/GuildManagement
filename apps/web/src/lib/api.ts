import type { ApiResponse, PaymentMethodEntry, GuildEmblemConfig } from "@guild/shared";

export type { GuildEmblemConfig };

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
const JSON_CONTENT_TYPE = "application/json";

// In-memory access token storage (never localStorage for security)
let accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

interface FetchOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  skipAuth?: boolean;
}

function hasJsonBody(response: Response): boolean {
  return response.headers.get("content-type")?.includes(JSON_CONTENT_TYPE) ?? false;
}

function createFallbackResponse<T>(response: Response, message: string): ApiResponse<T> {
  return {
    success: false,
    error: {
      code: response.ok ? "INVALID_RESPONSE" : `HTTP_${response.status}`,
      message,
    },
  };
}

async function parseApiResponse<T>(response: Response): Promise<ApiResponse<T>> {
  if (response.status === 204) {
    return { success: response.ok } as ApiResponse<T>;
  }

  if (!hasJsonBody(response)) {
    return createFallbackResponse(
      response,
      response.ok ? "The server returned an empty response." : response.statusText || "Request failed.",
    );
  }

  try {
    return (await response.json()) as ApiResponse<T>;
  } catch {
    return createFallbackResponse(response, "The server returned malformed JSON.");
  }
}

/**
 * API client with automatic token refresh on 401.
 * Access token is stored in memory, refresh token in httpOnly cookie.
 */
async function apiFetch<T = unknown>(
  endpoint: string,
  options: FetchOptions = {},
): Promise<ApiResponse<T>> {
  const { body, skipAuth, ...fetchOptions } = options;

  const headers: Record<string, string> = {
    Accept: JSON_CONTENT_TYPE,
    ...(fetchOptions.headers as Record<string, string>),
  };

  if (body !== undefined) {
    headers["Content-Type"] = JSON_CONTENT_TYPE;
  }

  if (!skipAuth && accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }

  const url = `${API_BASE}${endpoint}`;

  let response = await fetch(url, {
    ...fetchOptions,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: "include", // Include cookies for refresh token
  });

  // If 401, try refreshing the token once
  if (response.status === 401 && !skipAuth) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      headers["Authorization"] = `Bearer ${accessToken}`;
      response = await fetch(url, {
        ...fetchOptions,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        credentials: "include",
      });
    }
  }

  return parseApiResponse<T>(response);
}

/**
 * Attempt to refresh the access token using the httpOnly cookie.
 * Returns true if successful. Exported so the Hono RPC client (lib/rpc.ts) can
 * reuse the same one-shot refresh during the migration.
 *
 * The refresh token rotates server-side on every call (old one is revoked,
 * a new one issued) and reuse of an already-revoked token nukes the entire
 * token family, forcing a re-login. Several requests can 401 around the same
 * moment (e.g. a boss action plus the tab refetches it triggers), and without
 * de-duping they'd all POST /auth/refresh with the same cookie — the first
 * would win, and every other one would look like replay and trip that
 * family-wide revocation. All concurrent callers share one in-flight promise
 * so only a single refresh request ever goes out at a time.
 */
let refreshPromise: Promise<boolean> | null = null;

export function refreshAccessToken(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = doRefreshAccessToken().finally(() => {
    refreshPromise = null;
  });

  return refreshPromise;
}

async function doRefreshAccessToken(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
    });

    if (!response.ok) {
      accessToken = null;
      return false;
    }

    const data = (await response.json()) as ApiResponse<{
      accessToken: string;
    }>;

    if (data.success && data.data?.accessToken) {
      accessToken = data.data.accessToken;
      return true;
    }

    return false;
  } catch {
    accessToken = null;
    return false;
  }
}

// ─── API Methods ────────────────────────────────

export const api = {
  get<T = unknown>(endpoint: string, options?: FetchOptions) {
    return apiFetch<T>(endpoint, { ...options, method: "GET" });
  },

  post<T = unknown>(endpoint: string, body?: unknown, options?: FetchOptions) {
    return apiFetch<T>(endpoint, { ...options, method: "POST", body });
  },

  put<T = unknown>(endpoint: string, body?: unknown, options?: FetchOptions) {
    return apiFetch<T>(endpoint, { ...options, method: "PUT", body });
  },

  patch<T = unknown>(
    endpoint: string,
    body?: unknown,
    options?: FetchOptions,
  ) {
    return apiFetch<T>(endpoint, { ...options, method: "PATCH", body });
  },

  delete<T = unknown>(endpoint: string, options?: FetchOptions) {
    return apiFetch<T>(endpoint, { ...options, method: "DELETE" });
  },
};

// ─── Auth-specific API calls ────────────────────

export const authApi = {
  async login(email: string, password: string) {
    const result = await api.post<{
      user: { id: string; email: string; username: string; displayName: string; avatarUrl: string | null; createdAt: string };
      accessToken: string;
    }>("/auth/login", { email, password }, { skipAuth: true });

    if (result.success && result.data?.accessToken) {
      setAccessToken(result.data.accessToken);
    }

    return result;
  },

  async register(
    email: string,
    password: string,
    confirmPassword: string,
    displayName: string,
  ) {
    const result = await api.post<{
      user: { id: string; email: string; username: string; displayName: string; avatarUrl: string | null; createdAt: string };
      accessToken: string;
    }>(
      "/auth/register",
      { email, password, confirmPassword, displayName },
      { skipAuth: true },
    );

    if (result.success && result.data?.accessToken) {
      setAccessToken(result.data.accessToken);
    }

    return result;
  },

  async logout() {
    const result = await api.post("/auth/logout");
    setAccessToken(null);
    return result;
  },

  async logoutAll() {
    const result = await api.post("/auth/logout-all");
    setAccessToken(null);
    return result;
  },

  async checkUsernameAvailable(username: string) {
    return api.get<{ available: boolean; reason?: string }>(
      `/auth/username-available?username=${encodeURIComponent(username)}`,
      { skipAuth: true },
    );
  },

  async checkEmailRegistered(email: string) {
    return api.get<{ registered: boolean }>(
      `/auth/email-registered?email=${encodeURIComponent(email)}`,
      { skipAuth: true },
    );
  },

  async resolveIdentifier(identifier: string) {
    return api.post<{ email: string | null }>(
      "/auth/resolve-identifier",
      { identifier },
      { skipAuth: true },
    );
  },

  async getMe() {
    return api.get<{
      user: {
        id: string;
        email: string;
        username: string;
        displayName: string;
        avatarUrl: string | null;
        bannerUrl: string | null;
        createdAt: string;
        paymentMethods?: PaymentMethodEntry[];
        guilds: Array<{
          guildId: string;
          guildName: string;
          guildSlug: string;
          guildAvatarUrl: string | null;
          factionId: string | null;
          factionName: string | null;
          role: string;
          rankName: string;
          joinedAt: string;
        }>;
      };
    }>("/auth/me");
  },

  async updateMe(data: {
    displayName?: string;
    email?: string;
    password?: string;
  }) {
    return api.put<{ user: any }>("/auth/me", data);
  },

  // Update Combat Power only (from the screenshot scanner). Syncs profile + all
  // guild memberships server-side.
  async updateCp(cp: number) {
    return api.put<{ cp: number | null }>("/auth/me/cp", { cp });
  },

  // Character-profile fields (IGN / Combat Power / Class / Weapon) — dual-written
  // to the user profile and every guild membership server-side.
  async updateCharacterProfile(data: {
    ign?: string | null;
    cp?: number | null;
    class?: string | null;
    weapon?: string | null;
  }) {
    return api.put<{ user: any }>("/auth/me/character", data);
  },

  // Avatar/banner upload — send a base64 data URL, server uploads it to
  // Supabase Storage and returns the new public URL on the user record.
  async uploadAvatar(dataUrl: string) {
    return api.put<{ user: any }>("/auth/me/avatar", { dataUrl });
  },
  async uploadBanner(dataUrl: string) {
    return api.put<{ user: any }>("/auth/me/banner", { dataUrl });
  },

  async addPaymentMethod(data: { method: string; label?: string; qrDataUrl: string }) {
    return api.post<{ method: PaymentMethodEntry }>("/auth/me/payment-methods", data);
  },

  async removePaymentMethod(methodId: string) {
    return api.delete(`/auth/me/payment-methods/${methodId}`);
  },

  async getSessions() {
    return api.get<{
      sessions: Array<{
        id: string;
        deviceInfo: string | null;
        ipAddress: string | null;
        lastActive: string;
        createdAt: string;
        isCurrent: boolean;
      }>;
    }>("/auth/sessions");
  },

  async revokeSession(sessionId: string) {
    return api.delete(`/auth/sessions/${sessionId}`);
  },

  async forgotPassword(email: string) {
    return api.post("/auth/forgot-password", { email }, { skipAuth: true });
  },

  async resetPassword(
    token: string,
    password: string,
    confirmPassword: string,
  ) {
    return api.post(
      "/auth/reset-password",
      { token, password, confirmPassword },
      { skipAuth: true },
    );
  },

  async supabaseSync(token: string) {
    const result = await api.post<{
      user: { id: string; email: string; username: string; displayName: string; avatarUrl: string | null; createdAt: string };
      accessToken: string;
    }>("/auth/supabase-sync", { token }, { skipAuth: true });

    if (result.success && result.data?.accessToken) {
      setAccessToken(result.data.accessToken);
    }

    return result;
  },

  async refreshToken() {
    const success = await refreshAccessToken();
    return success;
  },
};

// ─── Discord account linking ────────────────────
// The bot never authenticates anyone itself: the site mints a short-lived
// one-time code for the current session, the member echoes it in Discord with
// `!link <code>`, and the bot binds their Discord id to this account.

export const discordApi = {
  async getLinkStatus() {
    return api.get<{
      linked: boolean;
      discordUsername: string | null;
      linkedAt: string | null;
    }>("/discord/link-status");
  },

  async createLinkCode() {
    return api.post<{ code: string; expiresAt: string }>("/discord/link-code", {});
  },

  async unlink() {
    return api.delete<{ unlinked: boolean }>("/discord/link");
  },

  // ─── Guild-level config (Guild Settings → Discord Integration) ───

  async getGuildIntegration(guildId: string) {
    return api.get<{
      server: {
        discordGuildId: string;
        timezone: string;
        linkedAt: string;
        linkedByName: string | null;
      } | null;
      channels: Array<{ purpose: string; channelId: string }>;
      aliases: Array<{ id: string; alias: string; bossName: string }>;
      canManage: boolean;
    }>(`/discord/guilds/${guildId}/integration`);
  },

  async addBossAlias(guildId: string, alias: string, bossName: string) {
    return api.post<{ id: string; alias: string; bossName: string }>(
      `/discord/guilds/${guildId}/aliases`,
      { alias, bossName },
    );
  },

  async removeBossAlias(guildId: string, aliasId: string) {
    return api.delete<{ removed: boolean }>(`/discord/guilds/${guildId}/aliases/${aliasId}`);
  },

  async unbindGuild(guildId: string) {
    return api.delete<{ unbound: boolean }>(`/discord/guilds/${guildId}/binding`);
  },
};

// ─── Guild-specific API calls ───────────────────

export interface GuildMemberData {
  id: string;
  userId: string;
  role: string;
  rankName: string;
  ign: string | null;
  cp: number | null;
  class: string | null;
  weapon: string | null;
  memberCode: string | null;
  joinedAt: string;
  isActive: boolean;
  customRole: CustomRoleData | null;
  user: {
    id: string;
    displayName: string;
    email: string;
    avatarUrl: string | null;
    bannerUrl: string | null;
  };
}

export interface CustomRoleData {
  id: string;
  guildId?: string;
  name: string;
  color: string;
  band: string;
  sortOrder?: number;
}

export interface JoinRequestGearItem {
  slotType: string;
  itemName: string;
  iconPath: string;
  iconBucket: string;
  rarity?: string | null;
  confidence: number;
}

export interface JoinRequestData {
  id: string;
  guildId: string;
  userId: string;
  ign: string;
  cp: number;
  class: string;
  weapon: string;
  status: string;
  gearItems?: JoinRequestGearItem[] | null;
  createdAt: string;
  guildName?: string;
  guildAvatarUrl?: string | null;
  user?: {
    id: string;
    displayName: string;
    email: string;
    avatarUrl: string | null;
  };
}

export interface ActivityPointRuleData {
  key: string;
  label: string;
  basePoints: number;
  multipliers: Record<string, number>;
  color?: string;
}

export interface ActivityPointRulesData {
  activities: ActivityPointRuleData[];
}

export interface GuildProfileData {
  id: string;
  name: string;
  slug: string;
  nameChangeCount: number;
  nameChangeLimit: number | null;
  remainingNameChanges: number | null;
  canRename: boolean;
  isSubscribed: boolean;
  subscriptionStatus: string | null;
  planName: string | null;
  emblem: GuildEmblemConfig | null;
}

export interface GuildSettingsData {
  id: string;
  guildId: string;
  serverName: string | null;
  timezone: string;
  region: string | null;
  language: string;
  settingsTemplateName: string | null;
  taxRatePercent: number;
  attendancePoints: number;
  bossKillPoints: number;
  rankMultipliers: Record<string, number>;
  activeShareModel: string;
  currencyCode: string;
  currencySymbol: string;
  secondaryCurrencyCode: string | null;
  secondaryCurrencySymbol: string | null;
  pointsResetCycle: string;
  roleDisplayNames?: Partial<Record<string, string>>;
  activityPointRules?: unknown;
  characterClasses?: string[];
  createdAt: string;
  updatedAt: string;
}

export type UpdateGuildSettingsPayload = Partial<{
  serverName: string | null;
  timezone: string;
  region: string | null;
  language: string;
  settingsTemplateName: string | null;
  taxRatePercent: number;
  attendancePoints: number;
  bossKillPoints: number;
  rankMultipliers: Record<string, number>;
  activeShareModel: string;
  currencyCode: string;
  currencySymbol: string;
  secondaryCurrencyCode: string | null;
  secondaryCurrencySymbol: string | null;
  pointsResetCycle: string;
  roleDisplayNames: Partial<Record<string, string>>;
}>;

export const guildApi = {
  async getMembers(guildId: string) {
    return api.get<{ members: GuildMemberData[] }>(
      `/guilds/${guildId}/members`,
    );
  },

  async updateMemberRole(guildId: string, memberId: string, input: { role?: string; customRoleId?: string | null }) {
    return api.patch<{ member: GuildMemberData }>(
      `/guilds/${guildId}/members/${memberId}/role`,
      input,
    );
  },

  // ─── Custom roles (guild-defined ranks, inherit a band's permissions) ─────
  async listCustomRoles(guildId: string) {
    return api.get<{ roles: CustomRoleData[] }>(
      `/guilds/${guildId}/custom-roles`,
    );
  },

  async createCustomRole(guildId: string, payload: { name: string; color?: string; band: string }) {
    return api.post<{ role: CustomRoleData }>(
      `/guilds/${guildId}/custom-roles`,
      payload,
    );
  },

  async updateCustomRole(
    guildId: string,
    roleId: string,
    payload: Partial<{ name: string; color: string; sortOrder: number }>,
  ) {
    return api.patch<{ role: CustomRoleData }>(
      `/guilds/${guildId}/custom-roles/${roleId}`,
      payload,
    );
  },

  async deleteCustomRole(guildId: string, roleId: string) {
    return api.delete<{ success: boolean }>(
      `/guilds/${guildId}/custom-roles/${roleId}`,
    );
  },

  async verifyInviteCode(code: string) {
    return api.get<{ guild: { id: string; name: string; slug: string; description: string | null; avatarUrl: string | null } }>(
      `/guilds/invite/${code}`,
    );
  },

  // Self-serve org creation from the onboarding screen. The current user
  // becomes the leader of whatever they create.
  async createGuild(guildName: string) {
    return api.post<{ guildId: string; guildSlug: string; factionId: string | null }>(
      `/onboarding/create-org`,
      { accountType: "GUILD_LEADER", guildName },
    );
  },

  async createFaction(factionName: string, guildName: string) {
    return api.post<{ guildId: string; guildSlug: string; factionId: string | null }>(
      `/onboarding/create-org`,
      { accountType: "FACTION_LEADER", factionName, guildName },
    );
  },

  async applyToGuild(payload: {
    inviteCode: string;
    ign: string;
    cp: number;
    class: string;
    weapon: string;
    gear?: ConfirmEquipmentItem[];
  }) {
    return api.post<{ id: string; guildId: string; guildName: string; status: string }>(
      `/guilds/join`,
      payload,
    );
  },

  async getUserPendingRequest() {
    return api.get<{ request: JoinRequestData | null }>(
      `/guilds/join-requests/pending`,
    );
  },

  async cancelRequest(requestId: string) {
    return api.delete<{ success: boolean }>(
      `/guilds/join-requests/${requestId}`,
    );
  },

  async getGuildApplications(guildId: string) {
    return api.get<{ applications: JoinRequestData[] }>(
      `/guilds/${guildId}/applications`,
    );
  },

  async reviewApplication(guildId: string, requestId: string, action: "ACCEPT" | "DECLINE") {
    return api.patch<{ success: boolean; status: string; memberCode?: string; member?: GuildMemberData }>(
      `/guilds/${guildId}/applications/${requestId}`,
      { action },
    );
  },

  async generateInviteCode(guildId: string) {
    return api.post<{ inviteCode: string }>(
      `/guilds/${guildId}/invite-code`,
    );
  },

  async getInviteCode(guildId: string) {
    return api.get<{ inviteCode: string | null }>(
      `/guilds/${guildId}/invite-code`,
    );
  },

  async getSettings(guildId: string) {
    return api.get<GuildSettingsData>(`/guilds/${guildId}/settings`);
  },

  async updateSettings(guildId: string, payload: UpdateGuildSettingsPayload) {
    return api.patch<GuildSettingsData>(`/guilds/${guildId}/settings`, payload);
  },

  async getProfile(guildId: string) {
    return api.get<GuildProfileData>(`/guilds/${guildId}/profile`);
  },

  async updateProfile(guildId: string, payload: { name: string }) {
    return api.patch<{ profile: GuildProfileData }>(`/guilds/${guildId}/profile`, payload);
  },

  async updateEmblem(guildId: string, emblem: GuildEmblemConfig | null) {
    return api.patch<{ profile: GuildProfileData }>(`/guilds/${guildId}/emblem`, { emblem });
  },

  async getActivityRules(guildId: string) {
    return api.get<{ rules: ActivityPointRulesData }>(`/guilds/${guildId}/activity-rules`);
  },

  async updateActivityRules(guildId: string, rules: ActivityPointRulesData) {
    return api.patch<{ rules: ActivityPointRulesData }>(`/guilds/${guildId}/activity-rules`, rules);
  },

  async getAuditLogs(guildId: string, filter?: string, page = 1, limit = 30, memberId?: string) {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (filter) params.set("filter", filter);
    if (memberId) params.set("memberId", memberId);
    return api.get<{
      logs: AuditLogEntry[];
      total: number;
      page: number;
      limit: number;
      totalPages: number;
    }>(`/guilds/${guildId}/audit-logs?${params.toString()}`);
  },

  async leaveGuild(guildId: string) {
    return api.delete<{ success: boolean; guildId: string }>(`/guilds/${guildId}/members/me`);
  },
};

// ─── Dashboard-specific API calls (Attendance & Boss Timers) ────

export interface AttendanceSessionData {
  id: string;
  guildId: string;
  code: string;
  type: "GUILD" | "FACTION";
  title: string;
  isActive: boolean;
  createdAt: string;
  expiresAt: string;
  bossScheduleId?: string | null;
  records?: AttendanceRecordData[];
}

export interface AttendanceRecordData {
  id: string;
  sessionId: string;
  userId: string;
  ign?: string | null;
  status: "PENDING" | "CONFIRMED";
  joinedAt: string;
  user?: {
    id: string;
    displayName: string;
    email: string;
    avatarUrl: string | null;
  };
}

// A guild member who has not yet checked in to the active session.
export interface AttendanceRosterMember {
  userId: string;
  ign: string | null;
  user: {
    id: string;
    displayName: string;
    email: string;
    avatarUrl: string | null;
  };
}

export interface AttendanceBossSummary {
  bossName: string;
  bossImageUrl: string;
  location: string;
  spawnTime: string;
  status?: "UPCOMING" | "SPAWNED" | "KILLED";
  killedAt?: string | null;
}

export interface PendingAttendanceData {
  activeSession: AttendanceSessionData | null;
  bossSchedule: AttendanceBossSummary | null;
  pendingRecords: AttendanceRecordData[];
  confirmedRecords: AttendanceRecordData[];
  notCheckedInMembers: AttendanceRosterMember[];
}

// Summary row for the "Past Attendance" browser (list of closed/expired
// sessions an officer can reopen or inspect).
export interface AttendanceSessionSummary {
  id: string;
  title: string;
  type: "GUILD" | "FACTION";
  isActive: boolean;
  expiresAt: string;
  createdAt: string;
  bossScheduleId: string | null;
  bossSchedule: AttendanceBossSummary | null;
  confirmedCount: number;
  pendingCount: number;
}

export interface BossData {
  id: string;
  name: string;
  level: number;
  type: "LONG_CYCLE" | "FIXED_SCHEDULE";
  cooldownHours: number | null;
  location: string;
  fixedSpawns: Array<{ day: number; hour: number; minute: number }> | null;
}

export interface BossScheduleData {
  id: string;
  guildId: string | null;
  bossName: string;
  bossImageUrl: string | null;
  spawnTime: string;
  location: string;
  guildTurn: string | null;
  guildTurnGuildId?: string | null;
  guildTurnGuildName?: string | null;
  status: "UPCOMING" | "SPAWNED" | "KILLED";
  killedAt: string | null;
  creatorId: string;
  creatorName?: string;
  createdAt: string;
  attendanceSessions?: AttendanceSessionData[];
  lootDrop?: string | null;
  screenshotUrl?: string | null;
}

export interface FactionGuildData {
  id: string;
  name: string;
  slug: string;
  avatarUrl: string | null;
}

export interface BossCommitmentMember {
  id: string;
  ign: string | null;
  role: string;
  rankName: string | null;
}

export interface BossCommitmentData {
  count: number;
  committed: boolean;
  members: BossCommitmentMember[];
}

export interface BossRotationItem {
  id: string;
  bossName: string;
  bossImageUrl: string | null;
  level: number;
  type: "LONG_CYCLE" | "FIXED_SCHEDULE" | string;
  cooldownHours: number | null;
  location: string;
  currentIndex: number;
  queue: FactionGuildData[];
  currentGuild: FactionGuildData | null;
  nextGuild: FactionGuildData | null;
  // False for a cycle boss that has never been taken — it has no real spawn
  // time yet (spawnTime is null, status is "NOT_STARTED"). Always true for
  // FIXED_SCHEDULE bosses, which spawn on a real clock regardless of history.
  everTaken: boolean;
  spawnTime: string | null;
  status: "UPCOMING" | "SPAWNED" | "KILLED" | "NOT_STARTED";
  activeSchedule: BossScheduleData | null;
  latestKilled: BossScheduleData | null;
}

export interface BossRotationResponse {
  serverTime: string;
  canManage: boolean;
  viewerRole: string;
  factionId: string | null;
  guilds: FactionGuildData[];
  rotations: BossRotationItem[];
}

export interface BossMasterListEntry {
  bossName: string;
  level: number;
  type: "LONG_CYCLE" | "FIXED_SCHEDULE" | string;
  location: string;
  cooldownHours: number | null;
  /** True once a faction leader has explicitly saved this boss's participant list. */
  configured: boolean;
  participantGuildIds: string[];
}

export interface BossMasterListResponse {
  canManage: boolean;
  viewerRole: string;
  guilds: FactionGuildData[];
  bosses: BossMasterListEntry[];
}

export interface LowBossRotationBoss {
  bossName: string;
  level: number;
  type: string;
  location: string;
  cooldownHours: number | null;
}

export interface LowBossRotationResponse {
  canManage: boolean;
  viewerRole: string;
  mode: "WEEKLY" | "MONTHLY" | "DAILY";
  /** Boss names flagged to follow the day rotation. */
  lowBossNames: string[];
  /** weekday index ("0"=Sun .. "6"=Sat) → guildId */
  weekly: Record<string, string>;
  /** "YYYY-MM-DD" → guildId */
  days: Record<string, string>;
  guilds: FactionGuildData[];
  bosses: LowBossRotationBoss[];
}

export interface LowBossRotationUpdate {
  mode?: "WEEKLY" | "MONTHLY" | "DAILY";
  lowBossNames?: string[];
  weekly?: Record<string, string>;
  /** date → guildId, or date → null to clear that day */
  daysPatch?: Record<string, string | null>;
}

export interface BossDropDisplay {
  itemName: string;
  type: string | null;
  category: string | null;
  rarity: string | null;
  iconUrl: string;
  quantity: number;
}

/** Payload sent when recording the items a boss dropped on a kill. */
export interface BossDropInput {
  bucket: string;
  path: string;
  quantity?: number;
  // Overrides the catalog item name for this recorded drop (e.g. to note a
  // specific roll/variant). Falls back to the catalog name server-side when
  // absent or blank.
  customName?: string;
}

/** A distinct item a boss is known to drop (for the sold-items loot picker). */
export interface MarketBossDrop {
  itemName: string;
  type: string | null;
  category: string | null;
  rarity: string | null;
  iconUrl: string;
}

export interface BossKilledHistoryEntry {
  id: string;
  action: string;
  bossName: string;
  bossImageUrl: string;
  killedAt: string;
  recordedAt: string;
  recordedBy: {
    id: string;
    displayName: string;
    avatarUrl: string | null;
  };
  takenGuildName: string | null;
  nextGuildName: string | null;
  nextSpawnTime: string | null;
  bossScheduleId: string | null;
  drops: BossDropDisplay[];
}

export interface BossKilledHistoryDay {
  date: string;
  total: number;
  kills: BossKilledHistoryEntry[];
}

export interface BossKilledHistoryResponse {
  month: string;
  total: number;
  days: BossKilledHistoryDay[];
}

// Members-tab profile card stat block — CP growth + the same attendance
// metrics shown on the member's own Boss Attendance page, for any teammate.
export interface MemberStatsCard {
  cp: number | null;
  cpGrowth: number | null;
  cpGrowthWindowDays: number;
  presenceRate: number;
  currentStreak: number;
  participationCount: number;
  totalPoints: number;
}

// Members-tab Statistics view — the same card shape, for every active member.
export interface MemberStatsBoardRow extends MemberStatsCard {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface MemberStatsBoardResponse {
  members: MemberStatsBoardRow[];
}

// Members-tab Statistics header cards — guild-wide current-vs-previous-30d KPIs.
export interface GuildStatsSummary {
  windowDays: number;
  attendanceRate: { current: number; previous: number };
  activityPoints: { current: number; previous: number };
  raidParticipation: { current: number; previous: number };
}

export interface NotificationData {
  id: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  metadata: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
}

// ─── Guild Activities (dynamic types, sourced from Register Activity) ─────────
export type ActivityType = string;
export type ActivityStatus = "UPCOMING" | "COMPLETED" | "CANCELLED";
export type ActivityResult = "WIN" | "LOSS" | "DRAW";
export type ActivityRepeatInterval = "WEEKLY" | "BIWEEKLY" | "MONTHLY";

export interface ActivityAttendee {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  status: "PENDING" | "CONFIRMED";
}

export interface GuildActivityData {
  id: string;
  type: ActivityType;
  title: string;
  location: string | null;
  opponent: string | null;
  notes: string | null;
  scheduledAt: string;
  status: ActivityStatus;
  result: ActivityResult | null;
  scoreFor: number | null;
  scoreAgainst: number | null;
  repeatInterval: ActivityRepeatInterval | null;
  creatorId: string;
  creatorName: string;
  createdAt: string;
  attendeeCount: number;
  confirmedCount: number;
  myStatus: "NONE" | "PENDING" | "CONFIRMED";
  attendees: ActivityAttendee[];
}

export interface GuildActivitiesResponse {
  canManage: boolean;
  viewerRole: string;
  activities: GuildActivityData[];
}

export interface ActivityInput {
  type?: ActivityType;
  title?: string;
  location?: string | null;
  opponent?: string | null;
  notes?: string | null;
  scheduledAt?: string;
  status?: ActivityStatus;
  result?: ActivityResult | null;
  scoreFor?: number | null;
  scoreAgainst?: number | null;
  repeatInterval?: ActivityRepeatInterval | null;
}

export const activityApi = {
  list(guildId: string) {
    return api.get<GuildActivitiesResponse>(`/activities/${guildId}`);
  },
  create(guildId: string, payload: ActivityInput) {
    return api.post<GuildActivitiesResponse>(`/activities/${guildId}`, payload);
  },
  update(guildId: string, activityId: string, payload: ActivityInput) {
    return api.patch<GuildActivitiesResponse>(`/activities/${guildId}/${activityId}`, payload);
  },
  remove(guildId: string, activityId: string) {
    return api.delete<GuildActivitiesResponse>(`/activities/${guildId}/${activityId}`);
  },
  checkIn(guildId: string, activityId: string, attending: boolean) {
    return api.post<GuildActivitiesResponse>(`/activities/${guildId}/${activityId}/check-in`, { attending });
  },
  confirmAttendee(guildId: string, activityId: string, userId: string, confirmed: boolean) {
    return api.post<GuildActivitiesResponse>(
      `/activities/${guildId}/${activityId}/attendees/${userId}/confirm`,
      { confirmed },
    );
  },
};

export const dashboardApi = {
  async startAttendanceSession(payload: {
    guildId: string;
    title?: string;
    type: "GUILD" | "FACTION";
    minutes: number;
    bossScheduleId?: string;
  }) {
    return api.post<{ session: AttendanceSessionData }>(
      `/dashboard/attendance/session`,
      payload,
    );
  },

  async submitAttendanceCode(code: string) {
    return api.post<{ success: boolean; sessionTitle: string; guildName: string; record: AttendanceRecordData }>(
      `/dashboard/attendance/check-in`,
      { code },
    );
  },

  async checkInToBoss(guildId: string, bossScheduleId: string) {
    return api.post<{ success: boolean; sessionTitle: string; guildName: string; bossScheduleId: string; record: AttendanceRecordData }>(
      `/dashboard/attendance/check-in/boss/${bossScheduleId}`,
      { guildId },
    );
  },

  async getPendingAttendance(guildId: string) {
    return api.get<PendingAttendanceData>(
      `/dashboard/attendance/pending/${guildId}`,
    );
  },

  async confirmAttendance(recordId: string, guildId: string) {
    return api.patch<{ success: boolean; record: AttendanceRecordData; points: number }>(
      `/dashboard/attendance/confirm/${recordId}`,
      { guildId },
    );
  },

  // ─── Past attendance (Officer / Guild Leader) ───────────────
  async confirmAttendances(guildId: string, recordIds: string[]) {
    return api.post<{ success: boolean; count: number; skipped: number; points: number }>(
      `/dashboard/attendance/confirm/batch`,
      { guildId, recordIds },
    );
  },

  async listAttendanceSessions(guildId: string, fresh = false) {
    return api.get<AttendanceSessionSummary[]>(
      `/dashboard/attendance/sessions/${guildId}${fresh ? "?fresh=1" : ""}`,
    );
  },

  async getAttendanceSessionDetail(guildId: string, sessionId: string) {
    return api.get<PendingAttendanceData>(
      `/dashboard/attendance/session/${guildId}/${sessionId}`,
    );
  },

  async reopenAttendanceSession(guildId: string, sessionId: string, minutes: number) {
    return api.post<{ session: AttendanceSessionData }>(
      `/dashboard/attendance/session/${guildId}/${sessionId}/reopen`,
      { minutes },
    );
  },

  async markMemberPresent(guildId: string, sessionId: string, userId: string) {
    return api.post<{ success: boolean; record: AttendanceRecordData; points: number }>(
      `/dashboard/attendance/mark-present`,
      { guildId, sessionId, userId },
    );
  },

  async markMembersPresent(guildId: string, sessionId: string, userIds: string[]) {
    return api.post<{ success: boolean; count: number; skipped: number; points: number }>(
      `/dashboard/attendance/mark-present/batch`,
      { guildId, sessionId, userIds },
    );
  },

  async revokeAttendance(recordId: string, guildId: string) {
    return api.post<{ success: boolean }>(
      `/dashboard/attendance/revoke/${recordId}`,
      { guildId },
    );
  },

  async revokeAttendances(guildId: string, recordIds: string[]) {
    return api.post<{ success: boolean; count: number; reversed: number }>(
      `/dashboard/attendance/revoke/batch`,
      { guildId, recordIds },
    );
  },

  async markAttendancePending(recordId: string, guildId: string) {
    return api.patch<{ success: boolean; record: AttendanceRecordData; reversed: boolean }>(
      `/dashboard/attendance/pending/${recordId}`,
      { guildId },
    );
  },

  async getAttendanceStats(guildId: string) {
    return api.get<{
      presenceRate: number;
      currentStreak: number;
      participationCount: number;
      totalPoints: number;
      missedAlerts: Array<{
        sessionId: string;
        title: string;
        createdAt: string;
        expiresAt: string;
      }>;
      history: Array<{
        sessionId: string;
        title: string;
        type: "GUILD" | "FACTION";
        createdAt: string;
        expiresAt: string;
        status: "CONFIRMED" | "PENDING" | "MISSED" | "UNCHECKED";
        joinedAt: string | null;
      }>;
    }>(`/dashboard/attendance/stats/${guildId}`);
  },

  async getMemberStatsCard(guildId: string, userId: string) {
    return api.get<MemberStatsCard>(`/dashboard/members/${guildId}/${userId}/stats-card`);
  },

  async getMemberStatsBoard(guildId: string) {
    return api.get<MemberStatsBoardResponse>(`/dashboard/members/${guildId}/stats-board`);
  },

  async getGuildStatsSummary(guildId: string) {
    return api.get<GuildStatsSummary>(`/dashboard/members/${guildId}/stats-summary`);
  },

  async getBossSchedules(guildId: string, fresh = false) {
    return api.get<{ schedules: BossScheduleData[] }>(
      `/dashboard/boss-schedule/${guildId}${fresh ? "?fresh=1" : ""}`,
    );
  },

  async getBossCommitments(guildId: string, scheduleId: string) {
    return api.get<BossCommitmentData>(
      `/dashboard/boss-schedule/${guildId}/${scheduleId}/commitments`,
    );
  },

  /** One request for many boss cards' commitment data, instead of one per card. */
  async getBossCommitmentsBatch(guildId: string, scheduleIds: string[]) {
    return api.post<Record<string, BossCommitmentData>>(
      `/dashboard/boss-schedule/${guildId}/commitments/batch`,
      { scheduleIds },
    );
  },

  async setBossCommitment(guildId: string, scheduleId: string, committing: boolean) {
    return api.post<{ committed: boolean; count: number }>(
      `/dashboard/boss-schedule/${guildId}/${scheduleId}/commitments`,
      { committing },
    );
  },

  async getBossRotation(guildId: string) {
    return api.get<BossRotationResponse>(
      `/dashboard/boss-rotation/${guildId}`,
    );
  },

  async getBossDrops(guildId: string, bossName: string) {
    return api.get<{ bossName: string; drops: MarketBossDrop[] }>(
      `/dashboard/boss-rotation/${guildId}/boss-drops?bossName=${encodeURIComponent(bossName)}`,
    );
  },

  async getBossKilledHistory(guildId: string, month?: string) {
    const params = month ? `?${new URLSearchParams({ month }).toString()}` : "";
    return api.get<BossKilledHistoryResponse>(
      `/dashboard/boss-rotation/${guildId}/killed-history${params}`,
    );
  },

  async editBossKillHistoryEntry(guildId: string, auditLogId: string, killedAt: string) {
    return api.patch<{
      bossName: string;
      previousKilledAt: string | null;
      killedAt: string;
      nextSpawnTime: string;
      schedule: BossScheduleData | null;
    }>(
      `/dashboard/boss-rotation/${guildId}/history/${auditLogId}`,
      { killedAt },
    );
  },

  async updateBossRotationQueue(guildId: string, bossName: string, queueGuildIds: string[]) {
    return api.post<BossRotationResponse>(
      `/dashboard/boss-rotation/${guildId}/${encodeURIComponent(bossName)}/queue`,
      { queueGuildIds },
    );
  },

  async getBossMasterList(guildId: string) {
    return api.get<BossMasterListResponse>(
      `/dashboard/boss-rotation/${guildId}/master-list`,
    );
  },

  async updateBossMasterList(
    guildId: string,
    entries: Array<{ bossName: string; participantGuildIds: string[] }>,
  ) {
    return api.put<BossMasterListResponse>(
      `/dashboard/boss-rotation/${guildId}/master-list`,
      { entries },
    );
  },

  async getLowBossRotation(guildId: string) {
    return api.get<LowBossRotationResponse>(
      `/dashboard/boss-rotation/${guildId}/low-rotation`,
    );
  },

  async updateLowBossRotation(guildId: string, payload: LowBossRotationUpdate) {
    return api.put<LowBossRotationResponse>(
      `/dashboard/boss-rotation/${guildId}/low-rotation`,
      payload,
    );
  },

  async markBossRotationKilled(guildId: string, scheduleId: string, killedAt: string, takenGuildId: string, signal?: AbortSignal, drops?: BossDropInput[]) {
    return api.post<{
      schedule: BossScheduleData | null;
      nextSchedule: BossScheduleData | null;
      // null for an unaffiliated guild — there's no faction-wide BossRotation
      // row for a solo guild's kill.
      rotationId: string | null;
    }>(
      `/dashboard/boss-rotation/${guildId}/${scheduleId}/killed`,
      { killedAt, takenGuildId, drops },
      signal ? { signal } : undefined,
    );
  },

  async markBossRotationKilledByName(guildId: string, bossName: string, killedAt: string, takenGuildId: string, signal?: AbortSignal, drops?: BossDropInput[]) {
    return api.post<{
      schedule: BossScheduleData | null;
      nextSchedule: BossScheduleData | null;
      rotationId: string | null;
    }>(
      `/dashboard/boss-rotation/${guildId}/boss/${encodeURIComponent(bossName)}/killed`,
      { killedAt, takenGuildId, drops },
      signal ? { signal } : undefined,
    );
  },

  async resetBossTimers(guildId: string) {
    return api.post<BossRotationResponse>(
      `/dashboard/boss-rotation/${guildId}/reset`,
      {},
    );
  },

  async maintenanceResetBossTimers(guildId: string, maintenanceEndTime: string) {
    return api.post<BossRotationResponse>(
      `/dashboard/boss-rotation/${guildId}/maintenance-reset`,
      { maintenanceEndTime },
    );
  },

  async getBosses() {
    return api.get<{ bosses: BossData[] }>(
      `/dashboard/bosses`,
    );
  },

  async addBossSchedule(
    guildId: string,
    payload: {
      bossName: string;
      bossImageUrl?: string;
      spawnTime: string;
      location: string;
      guildTurn?: string;
      guildTurnGuildId?: string | null;
      isFaction?: boolean;
    },
  ) {
    return api.post<{ schedule: BossScheduleData }>(
      `/dashboard/boss-schedule/${guildId}`,
      payload,
    );
  },

  async logBossKill(
    guildId: string,
    scheduleId: string,
    killedAt: string,
    lootDrop?: string,
    screenshotUrl?: string,
  ) {
    return api.patch<{ schedule: BossScheduleData }>(
      `/dashboard/boss-schedule/${guildId}/kill/${scheduleId}`,
      { killedAt, lootDrop, screenshotUrl },
    );
  },

  async updateBossSchedule(
    guildId: string,
    scheduleId: string,
    payload: {
      bossName?: string;
      bossImageUrl?: string;
      spawnTime?: string;
      location?: string;
      guildTurn?: string;
      guildTurnGuildId?: string | null;
      isFaction?: boolean;
    },
  ) {
    return api.patch<{ schedule: BossScheduleData }>(
      `/dashboard/boss-schedule/${guildId}/${scheduleId}`,
      payload,
    );
  },

  async deleteBossSchedule(guildId: string, scheduleId: string) {
    return api.delete<{ success: boolean }>(
      `/dashboard/boss-schedule/${guildId}/${scheduleId}`,
    );
  },

  async updateAttendanceSession(
    guildId: string,
    sessionId: string,
    payload: {
      title?: string;
      expiresAt?: string;
      isActive?: boolean;
    },
  ) {
    return api.patch<{ session: AttendanceSessionData }>(
      `/dashboard/attendance/session/${guildId}/${sessionId}`,
      payload,
    );
  },

  async deleteAttendanceSession(guildId: string, sessionId: string) {
    return api.delete<{ success: boolean }>(
      `/dashboard/attendance/session/${guildId}/${sessionId}`,
    );
  },

  async getDashboardStats(guildId: string) {
    return api.get<{
      balance: {
        raw: number;
        value: string;
        sub: string;
        currencySymbol: string;
      };
      guildPoints: {
        raw: number;
        value: string;
        sub: string;
      };
      members: {
        raw: number;
        value: string;
        sub: string;
        online: number;
      };
      bossToday: {
        raw: number;
        value: string;
        sub: string;
        total: number;
      };
      recentActivity: Array<{
        type: "CREDIT" | "DEBIT" | "POINTS" | "INFO" | "CONFIG";
        action: string;
        detail: string;
        time: string;
      }>;
      performanceHistory: Array<{
        dayName: string;
        amount: number;
      }>;
      factionClaims: Array<{
        guildName: string;
        claimsCount: number;
        percentage: number;
      }>;
    }>(`/dashboard/stats/${guildId}`);
  },

  async addLootSale(
    guildId: string,
    payload: {
      itemName: string;
      category: string;
      bossScheduleId?: string | null;
      saleValue: number;
      currency: string;
    },
  ) {
    return api.post<any>(`/dashboard/loot-sale/${guildId}`, payload);
  },

  async addLootSaleBatch(
    guildId: string,
    payload: {
      category: string;
      bossScheduleId?: string | null;
      currency: string;
      soldDate?: string;
      items: Array<{ itemName: string; saleValue: number }>;
    },
  ) {
    return api.post<{ count: number }>(`/dashboard/loot-sale/${guildId}/batch`, payload);
  },

  async getBossAttendees(guildId: string, bossScheduleId: string) {
    return api.get<{ attendees: Array<{ userId: string; name: string }> }>(
      `/dashboard/loot-sale/${guildId}/attendees/${bossScheduleId}`,
    );
  },

  async getLootSales(guildId: string) {
    return api.get<any>(`/dashboard/loot-sale/${guildId}`);
  },

  async getAccountingDashboard(guildId: string, page = 1, limit = 25) {
    return api.get<any>(`/dashboard/accounting/${guildId}?page=${page}&limit=${limit}`);
  },

  async addTreasuryAdjustment(
    guildId: string,
    payload: {
      accountId: string;
      accountType: "MEMBER" | "GUILD_FUND" | "TAX";
      entryType: "CREDIT" | "DEBIT";
      amount: number;
      currency: string;
      description: string;
    },
  ) {
    return api.post<any>(`/dashboard/accounting/adjustment/${guildId}`, payload);
  },
};

// ─── Member Equipment (Item Screenshot Update) ──────────────────

export interface EquipmentCatalogItem {
  slotType: string;
  itemName: string;
  rarity: string | null;
  variant: string | null;
  bucket: string;
  path: string;
  iconUrl: string;
}

export interface EquipmentCatalogSlot {
  slotType: string;
  label: string;
  items: EquipmentCatalogItem[];
}

export interface MemberEquipmentData {
  id: string;
  slotType: string;
  itemName: string;
  iconUrl: string; // storage path
  iconBucket: string;
  rarity: string | null;
  confidence: number;
  needsReview: boolean;
  sourceScreenshotUrl: string | null;
  iconSignedUrl: string | null;
  screenshotSignedUrl: string | null;
  updatedAt: string;
}

export interface ConfirmEquipmentItem {
  slotType: string;
  itemName: string;
  iconPath: string;
  iconBucket: string;
  rarity?: string;
  confidence: number;
}

export interface DropCatalogItem {
  type: string; // Weapon | Armor | Accessory | Cloak | Gadget | Skill Book | Ability | Mount
  category: string | null;
  rarity: string | null;
  itemName: string;
  bucket: string;
  path: string;
  iconUrl: string;
}

export const equipmentApi = {
  async getCatalog() {
    return api.get<{ slots: EquipmentCatalogSlot[] }>(`/equipment/catalog`);
  },
  async getDropsCatalog() {
    return api.get<{ items: DropCatalogItem[] }>(`/equipment/drops-catalog`);
  },
  async getMine(guildId: string) {
    return api.get<{ equipment: MemberEquipmentData[] }>(`/equipment/${guildId}/mine`);
  },
  async uploadScreenshot(guildId: string, dataUrl: string) {
    return api.post<{ path: string | null; signedUrl: string | null; stored: boolean }>(
      `/equipment/${guildId}/screenshot`,
      { dataUrl },
    );
  },
  async confirm(
    guildId: string,
    payload: { items: ConfirmEquipmentItem[]; sourceScreenshotPath?: string },
  ) {
    return api.post<{ equipment: MemberEquipmentData[] }>(`/equipment/${guildId}/confirm`, payload);
  },
};

export const notificationApi = {
  async getNotifications(limit = 20) {
    return api.get<{ notifications: NotificationData[]; unreadCount: number }>(
      `/notifications?limit=${limit}`,
    );
  },

  async markRead(notificationId: string) {
    return api.patch<{ notification: NotificationData }>(
      `/notifications/${notificationId}/read`,
    );
  },

  async markAllRead() {
    return api.patch<{ success: boolean }>(`/notifications/read-all`);
  },
};

export interface FactionAnnouncementData {
  id: string;
  title: string;
  body: string;
  priority: string;
  status: string;
  creatorId: string;
  createdAt: string;
  updatedAt: string;
}

export interface FactionEventData {
  id: string;
  title: string;
  description: string | null;
  startsAt: string;
  endsAt: string | null;
  location: string | null;
  status: string;
  creatorId: string;
  createdAt: string;
  updatedAt: string;
}

export type FactionMemberData = GuildMemberData & {
  guild?: {
    id: string;
    name: string;
    slug: string;
    avatarUrl: string | null;
  };
};

export interface FactionOverviewGuild {
  id: string;
  name: string;
  slug: string;
  avatarUrl: string | null;
  emblem: GuildEmblemConfig | null;
  memberCount: number;
  leaderName: string | null;
  isOwnGuild: boolean;
}

export type FactionStatusValue = "ACTIVE" | "INACTIVE" | "SUSPENDED" | "ARCHIVED";

export interface FactionOverviewData {
  faction: {
    id: string;
    name: string;
    slug: string;
    nameChangeCount: number;
    nameChangeLimit: number | null;
    remainingNameChanges: number | null;
    canRename: boolean;
    isSubscribed: boolean;
    subscriptionStatus: string | null;
    planName: string | null;
    description: string | null;
    avatarUrl: string | null;
    bannerUrl: string | null;
    code: string | null;
    server: string | null;
    region: string | null;
    game: string | null;
    status: FactionStatusValue;
    createdAt: string;
  } | null;
  guilds: FactionOverviewGuild[];
  totalGuilds: number;
  totalMembers: number;
  canManage: boolean;
}

export interface FactionGuildMembershipData {
  id: string;
  factionId: string;
  guildId: string;
  guildName: string | null;
  guildAvatarUrl: string | null;
  status: "PENDING" | "ACTIVE" | "SUSPENDED" | "REMOVED" | "LEFT_FACTION";
  joinedAt: string;
  contributionRequirement: string | null;
  assignedFactionRole: string | null;
  approvedByUserId: string | null;
  notes: string | null;
  updatedAt: string;
}

export type FactionCapabilityRole = "OFFICER" | "TREASURER" | "INVENTORY_MANAGER";

export interface FactionRoleAssignmentData {
  id: string;
  factionId: string;
  guildMemberId: string;
  role: FactionCapabilityRole;
  grantedByUserId: string;
  createdAt: string;
  member: {
    id: string;
    ign: string | null;
    role: string;
    userId: string;
    displayName: string | null;
    avatarUrl: string | null;
    guildId: string;
    guildName: string | null;
  } | null;
}

export interface FactionAuditLogEntry {
  id: string;
  factionId: string;
  actorId: string;
  actor: { id: string; displayName: string; avatarUrl: string | null };
  actorRole: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  previousValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
  reason: string | null;
  createdAt: string;
}

export interface FactionAuditLogPage {
  logs: FactionAuditLogEntry[];
  total: number;
  page: number;
  pageSize: number;
}

export interface FactionAccountingGuildBreakdown {
  guildId: string;
  guildName: string;
  guildAvatarUrl: string | null;
  currencyCode: string;
  currencySymbol: string;
  fundBalance: number;
  taxBalance: number;
  totalExpenses: number;
  secondary: {
    currencyCode: string;
    currencySymbol: string;
    fundBalance: number;
    taxBalance: number;
    totalExpenses: number;
  } | null;
}

export interface FactionAccountingTotal {
  currencyCode: string;
  currencySymbol: string;
  fundBalance: number;
  taxBalance: number;
  totalExpenses: number;
  guildCount: number;
}

export interface FactionAccountingTransaction {
  id: string;
  guildId: string;
  guildName: string;
  accountType: "MEMBER" | "GUILD_FUND" | "TAX";
  currency: string;
  amount: number;
  entryType: "CREDIT" | "DEBIT";
  referenceType: string;
  description: string | null;
  createdAt: string;
}

export interface FactionAccountingData {
  guilds: FactionAccountingGuildBreakdown[];
  totals: FactionAccountingTotal[];
  transactions: FactionAccountingTransaction[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export interface FactionJoinRequestData {
  id: string;
  factionId: string;
  guildId: string;
  guildName: string | null;
  guildAvatarUrl: string | null;
  invitedByUserId: string | null;
  direction: "CODE_REDEEMED" | "DIRECT_INVITE";
  status: "PENDING" | "APPROVED" | "REJECTED";
  createdAt: string;
}

export const factionApi = {
  async getOverview() {
    return api.get<FactionOverviewData>(`/faction/overview`);
  },

  async getMembers() {
    return api.get<{ members: FactionMemberData[] }>(`/faction/members`);
  },

  async createFromGuild(guildId: string, factionName: string) {
    return api.post<{ factionId: string; factionSlug: string; guildId: string }>(
      `/faction/create-from-guild`,
      { guildId, factionName },
    );
  },

  // ─── Multi-Guild (faction join requests) ─────────

  async getInviteCode() {
    return api.get<{ inviteCode: string }>(`/faction/invite-code`);
  },

  async regenerateInviteCode() {
    return api.post<{ inviteCode: string }>(`/faction/invite-code/regenerate`, {});
  },

  async redeemInviteCode(code: string) {
    return api.post<{ requestId: string; factionName: string }>(`/faction/join-requests/redeem`, { code });
  },

  async getPendingJoinRequests() {
    return api.get<{ requests: FactionJoinRequestData[] }>(`/faction/join-requests`);
  },

  async getPendingJoinRequestsForGuild(guildId: string) {
    return api.get<{ requests: FactionJoinRequestData[] }>(`/guilds/${guildId}/join-requests/faction`);
  },

  async approveJoinRequest(requestId: string) {
    return api.post<{ success: boolean; factionId: string; guildId: string }>(
      `/faction/join-requests/${requestId}/approve`,
      {},
    );
  },

  async rejectJoinRequest(requestId: string) {
    return api.post<{ success: boolean }>(`/faction/join-requests/${requestId}/reject`, {});
  },

  async removeGuildFromFaction(guildId: string) {
    return api.post<{ success: boolean }>(`/faction/guilds/${guildId}/remove`, {});
  },

  async getAnnouncements() {
    return api.get<{ announcements: FactionAnnouncementData[] }>(`/faction/announcements`);
  },

  async createAnnouncement(payload: { title: string; body: string; priority?: string; status?: string }) {
    return api.post<{ announcement: FactionAnnouncementData }>(`/faction/announcements`, payload);
  },

  async updateAnnouncement(id: string, payload: Partial<{ title: string; body: string; priority: string; status: string }>) {
    return api.patch<{ announcement: FactionAnnouncementData }>(`/faction/announcements/${id}`, payload);
  },

  async deleteAnnouncement(id: string) {
    return api.delete<{ success: boolean }>(`/faction/announcements/${id}`);
  },

  async getEvents() {
    return api.get<{ events: FactionEventData[] }>(`/faction/events`);
  },

  async createEvent(payload: { title: string; description?: string; startsAt: string; endsAt?: string | null; location?: string; status?: string }) {
    return api.post<{ event: FactionEventData }>(`/faction/events`, payload);
  },

  async updateEvent(id: string, payload: Partial<{ title: string; description: string; startsAt: string; endsAt: string | null; location: string; status: string }>) {
    return api.patch<{ event: FactionEventData }>(`/faction/events/${id}`, payload);
  },

  async deleteEvent(id: string) {
    return api.delete<{ success: boolean }>(`/faction/events/${id}`);
  },

  // ─── Phase 1: Foundation ──────────────────────────

  async updateProfile(payload: Partial<{ name: string; description: string; avatarUrl: string; bannerUrl: string; code: string; server: string; region: string; game: string }>) {
    return api.patch<{ faction: unknown }>(`/faction/profile`, payload);
  },

  async updateStatus(factionId: string, status: FactionStatusValue, reason?: string) {
    return api.post<{ faction: unknown }>(`/faction/status`, { factionId, status, reason });
  },

  async getGuildMemberships() {
    return api.get<{ memberships: FactionGuildMembershipData[] }>(`/faction/guild-memberships`);
  },

  async updateGuildMembership(guildId: string, payload: Partial<{ contributionRequirement: string | null; assignedFactionRole: string | null; notes: string | null }>) {
    return api.patch<{ membership: FactionGuildMembershipData }>(`/faction/guild-memberships/${guildId}`, payload);
  },

  async getRoleAssignments() {
    return api.get<{ assignments: FactionRoleAssignmentData[] }>(`/faction/roles`);
  },

  async getAccounting(page = 1, limit = 25) {
    return api.get<FactionAccountingData>(`/faction/accounting?page=${page}&limit=${limit}`);
  },

  async assignRole(guildMemberId: string, role: FactionCapabilityRole) {
    return api.post<{ assignment: FactionRoleAssignmentData }>(`/faction/roles`, { guildMemberId, role });
  },

  async revokeRole(assignmentId: string) {
    return api.delete<{ success: boolean }>(`/faction/roles/${assignmentId}`);
  },

  async getAuditLogs(params: { from?: string; to?: string; action?: string; entityType?: string; page?: number; pageSize?: number } = {}) {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== "") query.set(key, String(value));
    }
    const qs = query.toString();
    return api.get<FactionAuditLogPage>(`/faction/audit-logs${qs ? `?${qs}` : ""}`);
  },
};

// ─── Faction Inventory (Phase 2) ────────────────────

export interface FactionInventoryItemData {
  id: string;
  factionId: string;
  itemName: string;
  itemIcon: string | null;
  category: string;
  rarity: string | null;
  description: string | null;
  currentQuantity: number;
  reservedQuantity: number;
  availableQuantity: number;
  distributedQuantity: number;
  unitValueCents: number | null;
  storageLocation: string | null;
  batchNumber: string | null;
  expirationDate: string | null;
  minStockThreshold: number | null;
  status: string;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
}

export interface FactionInventoryTransactionData {
  id: string;
  itemId: string;
  itemName: string;
  itemIcon: string | null;
  category: string;
  sourceGuildId: string | null;
  destinationGuildId: string | null;
  quantity: number;
  previousQuantity: number;
  newQuantity: number;
  transactionType: string;
  reason: string | null;
  requestedByUserId: string;
  approvedByUserId: string | null;
  approvalStatus: string;
  createdAt: string;
  approvedAt: string | null;
}

export interface FactionInventoryTransactionPage {
  transactions: FactionInventoryTransactionData[];
  total: number;
  page: number;
  pageSize: number;
}

export interface FactionInventoryRequestData {
  id: string;
  factionId: string;
  itemId: string;
  itemName: string;
  itemIcon: string | null;
  requestingGuildId: string;
  requestingGuildName: string;
  requestedByUserId: string;
  quantity: number;
  purpose: string | null;
  priority: "NORMAL" | "IMPORTANT" | "URGENT" | "CRITICAL";
  requiredDate: string | null;
  evidenceUrl: string | null;
  status: "SUBMITTED" | "UNDER_REVIEW" | "APPROVED" | "REJECTED" | "DISTRIBUTED" | "CANCELLED";
  reviewerId: string | null;
  approvalNotes: string | null;
  createdAt: string;
  updatedAt: string;
}

export const factionInventoryApi = {
  async getItems() {
    return api.get<{ items: FactionInventoryItemData[] }>(`/faction/inventory/items`);
  },

  async createItem(payload: {
    itemName: string;
    itemIcon?: string;
    category: string;
    rarity?: string;
    description?: string;
    unitValueCents?: number;
    storageLocation?: string;
    batchNumber?: string;
    expirationDate?: string;
    minStockThreshold?: number;
  }) {
    return api.post<{ item: FactionInventoryItemData }>(`/faction/inventory/items`, payload);
  },

  async updateItem(itemId: string, payload: Partial<Omit<FactionInventoryItemData, "id" | "factionId" | "createdByUserId" | "createdAt" | "updatedAt" | "currentQuantity" | "reservedQuantity" | "distributedQuantity" | "availableQuantity">>) {
    return api.patch<{ item: FactionInventoryItemData }>(`/faction/inventory/items/${itemId}`, payload);
  },

  async recordAddition(itemId: string, quantity: number, reason?: string) {
    return api.post<{ itemId: string; previousQuantity: number; newQuantity: number }>(
      `/faction/inventory/items/${itemId}/addition`,
      { quantity, reason },
    );
  },

  async recordContribution(itemId: string, quantity: number, sourceGuildId: string, reason?: string) {
    return api.post<{ itemId: string; previousQuantity: number; newQuantity: number }>(
      `/faction/inventory/items/${itemId}/contribution`,
      { quantity, reason, sourceGuildId },
    );
  },

  async adjustQuantity(itemId: string, delta: number, reason: string) {
    return api.post<{ itemId: string; previousQuantity: number; newQuantity: number }>(
      `/faction/inventory/items/${itemId}/adjust`,
      { delta, reason },
    );
  },

  async getTransactions(params: { itemId?: string; transactionType?: string; from?: string; to?: string; page?: number; pageSize?: number } = {}) {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== "") query.set(key, String(value));
    }
    const qs = query.toString();
    return api.get<FactionInventoryTransactionPage>(`/faction/inventory/transactions${qs ? `?${qs}` : ""}`);
  },

  async getRequests(params: { mine?: boolean; guildId?: string } = {}) {
    const query = new URLSearchParams();
    if (params.mine) query.set("mine", "true");
    if (params.guildId) query.set("guildId", params.guildId);
    const qs = query.toString();
    return api.get<{ requests: FactionInventoryRequestData[] }>(`/faction/inventory/requests${qs ? `?${qs}` : ""}`);
  },

  async submitRequest(payload: {
    guildId: string;
    itemId: string;
    quantity: number;
    purpose?: string;
    priority?: "NORMAL" | "IMPORTANT" | "URGENT" | "CRITICAL";
    requiredDate?: string;
    evidenceUrl?: string;
  }) {
    return api.post<{ request: FactionInventoryRequestData }>(`/faction/inventory/requests`, payload);
  },

  async reviewRequest(id: string, action: "APPROVE" | "REJECT", approvalNotes?: string) {
    return api.post<{ request: FactionInventoryRequestData }>(`/faction/inventory/requests/${id}/review`, { action, approvalNotes });
  },

  async distributeRequest(id: string) {
    return api.post<{ request: FactionInventoryRequestData }>(`/faction/inventory/requests/${id}/distribute`, {});
  },

  async cancelRequest(id: string) {
    return api.post<{ request: FactionInventoryRequestData }>(`/faction/inventory/requests/${id}/cancel`, {});
  },
};

export interface AuditLogEntry {
  id: string;
  action: string;
  target: string | null;
  targetId: string | null;
  detail: Record<string, unknown> | null;
  createdAt: string;
  actor: {
    id: string;
    displayName: string;
    avatarUrl: string | null;
  };
}

// ─── Guild Market (Distribution) ────────────────

export interface MarketMemberRef {
  id: string;
  ign: string | null;
  role: string;
  rankName: string;
  user?: { id: string; displayName: string; email?: string; avatarUrl: string | null };
}

export interface ItemRequestData {
  id: string;
  guildId: string;
  memberId: string;
  type: "ITEM" | "WITHDRAWAL";
  status: "PENDING" | "APPROVED" | "DECLINED" | "FULFILLED";
  itemName: string | null;
  quantity: number | null;
  itemCategory: string | null;
  note: string | null;
  reviewNote: string | null;
  reviewedById: string | null;
  reviewedAt: string | null;
  fulfilledAt: string | null;
  createdAt: string;
  member?: MarketMemberRef;
}

export interface LegendaryRequestData {
  id: string;
  guildId: string;
  memberId: string;
  category: string;
  itemKey: string | null;
  currentGear: string | null;
  reason: string | null;
  prioritySeq: number | null;
  status: "PENDING" | "APPROVED" | "REJECTED" | "COMPLETED";
  officerNote: string | null;
  reviewedById: string | null;
  reviewedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  member?: MarketMemberRef;
}

export interface StorageMemberRef {
  id: string;
  ign: string | null;
  role: string;
  rankName: string | null;
}

export interface StorageItemData {
  id: string;
  guildId: string;
  itemName: string;
  category: string;
  sourceBoss: string | null;
  rarity: string;
  imageUrl: string | null;
  quantity: number;
  note: string | null;
  status: "IN_STORAGE" | "LISTED_MARKET" | "DISTRIBUTED";
  disposition: "MARKET" | "GUILD_SALE" | "GUILD_AUCTION" | null;
  // Raw integer cents, serialized as a string (BigInt column) — divide by 100 to display.
  listingPrice: string | null;
  recipientMemberId: string | null;
  recipient?: StorageMemberRef | null;
  auctionItemId: string | null;
  addedById: string;
  resolvedById: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuctionBidData {
  id: string;
  auctionId: string;
  memberId: string;
  bidAmount: number;
  createdAt: string;
  member?: { ign: string | null; role: string; rankName: string | null };
}

export interface AuctionData {
  id: string;
  guildId: string;
  creatorId: string;
  itemName: string;
  description: string | null;
  imageUrl: string | null;
  category: string;
  startingBid: number;
  currentBid: number;
  winnerId: string | null;
  status: "ACTIVE" | "ENDED" | "CANCELLED";
  endsAt: string;
  createdAt: string;
  bids?: AuctionBidData[];
  myBid?: number | null;
  bidCount?: number;
}

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
  key: string;
  rarity?: WishlistRarity;
  armorType?: ArmorType;
  quantity?: number;
  label?: string;
  status?: WishlistStatus;
  fulfilledAt?: string;
  fulfilledById?: string;
}

export interface WishlistCaps {
  logs: number;
  temporalPieces: number;
  materials: number;
}

export interface WishlistSummary {
  total: number;
  distributed: number;
}

export interface PriorityQueueEntry {
  memberId: string;
  userId: string;
  ign: string;
  displayName: string;
  avatarUrl: string | null;
  role: string;
  rankName: string;
  tier: "CORE" | "ELITE" | "UPPER" | "LOWER";
  cp: number;
  dkp: number;
  attendance: number;
  bossParticipation: number;
  previousReceived: number;
  priorityScore: number;
  manualSeq: number | null;
  manualReason: string | null;
  wishlist: WishlistItem[];
  wishlistSummary: WishlistSummary;
  position: number;
}

export interface MountCatalogItem {
  id: string;
  name: string;
  iconUrl: string | null;
  maxSlots: number;
  isActive: boolean;
  distributed: number;
  remaining: number;
}

export interface WishlistMasterRow {
  memberId: string;
  userId: string;
  ign: string;
  role: string;
  tier: "CORE" | "ELITE" | "UPPER" | "LOWER";
  item: WishlistItem;
  label: string;
  status: WishlistStatus;
  fulfilledAt: string | null;
}

export interface ItemDistributionData {
  id: string;
  guildId: string;
  memberId: string;
  formType: "CORE" | "NON_CORE";
  rankTier: string | null;
  ignSnapshot: string | null;
  classSnapshot: string | null;
  cpSnapshot: number | null;
  pointsSnapshot: number | null;
  prioritySeq: number | null;
  items: Record<string, number | boolean | string>;
  note: string | null;
  distributedById: string;
  overridden: boolean;
  overrideReason: string | null;
  distributedAt: string;
  member?: { user?: { displayName: string; avatarUrl: string | null } };
}

export interface MarketCatalogItem {
  key: string;
  label: string;
}

export interface MarketRulesData {
  cpTiers: { coreMinCp?: number; eliteMinCp: number; upperMinCp: number };
  limits: Record<
    "CORE" | "ELITE" | "UPPER" | "LOWER",
    {
      logs: number;
      temporalPieces: number;
      materials: number;
      mountIds?: string[];
      materialKeys?: string[];
      logKeys?: string[];
    }
  >;
  weights: Record<string, number>;
  logCatalog?: MarketCatalogItem[];
  materialCatalog?: MarketCatalogItem[];
}

interface Paginated {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

// ─── Platform / Super Admin (SaaS-level) ────────────────────────────

export type PlatformRole = "SUPER_ADMIN" | "ADMIN" | "SUPPORT" | "ANALYST";

export interface PlatformAdminProfile {
  role: PlatformRole;
  permissions: string[];
  lastLoginAt: string | null;
}

export interface OverviewSeriesPoint {
  date: string;
  value: number;
}

export interface PlatformOverview {
  cards: {
    totalUsers: number;
    activeUsersToday: number;
    onlineUsers: number;
    activeSessions: number;
    totalGuilds: number;
    activeGuilds: number;
    auditEventsToday: number;
    premiumGuilds: number | null;
    freeGuilds: number | null;
    activeSubscriptions: number | null;
    totalRevenue: number | null;
    monthlyRevenue: number | null;
    pendingPayments: number | null;
    failedPayments: number | null;
  };
  charts: {
    userGrowth: OverviewSeriesPoint[];
    guildGrowth: OverviewSeriesPoint[];
    loginActivity: OverviewSeriesPoint[];
  };
  generatedAt: string;
}

function qs(params?: Record<string, string | number | undefined>) {
  const s = new URLSearchParams();
  if (params) for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") s.set(k, String(v));
  const str = s.toString();
  return str ? `?${str}` : "";
}

export const adminApi = {
  async getMe() {
    return api.get<{ platformAdmin: PlatformAdminProfile }>(`/admin/me`);
  },
  async getOverview() {
    return api.get<PlatformOverview>(`/admin/overview`);
  },

  // ─ Users (Phase 2) ─
  async listUsers(params?: { search?: string; status?: string; page?: number }) {
    return api.get<any>(`/admin/users${qs(params)}`);
  },
  async getUser(id: string) {
    return api.get<any>(`/admin/users/${id}`);
  },
  async moderateUser(id: string, body: { action: string; days?: number; reason?: string }) {
    return api.post<any>(`/admin/users/${id}/moderate`, body);
  },
  async forceLogoutUser(id: string) {
    return api.post<{ sessionsCleared: number }>(`/admin/users/${id}/force-logout`, {});
  },
  async resetUserPassword(id: string) {
    return api.post<{ tempPassword: string }>(`/admin/users/${id}/reset-password`, {});
  },

  // ─ Guilds (Phase 3) ─
  async listGuilds(params?: { search?: string; status?: string; page?: number }) {
    return api.get<any>(`/admin/guilds${qs(params)}`);
  },
  async getGuild(id: string) {
    return api.get<any>(`/admin/guilds/${id}`);
  },
  async moderateGuild(id: string, body: { action: string; reason?: string }) {
    return api.post<any>(`/admin/guilds/${id}/moderate`, body);
  },
  async transferGuildOwnership(id: string, newMemberId: string) {
    return api.post<any>(`/admin/guilds/${id}/transfer-ownership`, { newMemberId });
  },

  // ─ Billing (Phase 4) ─
  async getBillingOverview() {
    return api.get<any>(`/admin/billing/overview`);
  },
  async listPlans() {
    return api.get<{ plans: any[] }>(`/admin/billing/plans`);
  },
  async createPlan(body: any) {
    return api.post<any>(`/admin/billing/plans`, body);
  },
  async updatePlan(id: string, body: any) {
    return api.patch<any>(`/admin/billing/plans/${id}`, body);
  },
  async deactivatePlan(id: string) {
    return api.delete<any>(`/admin/billing/plans/${id}`);
  },
  async listSubscriptions(params?: { status?: string; guildId?: string; page?: number }) {
    return api.get<any>(`/admin/billing/subscriptions${qs(params)}`);
  },
  async createSubscription(body: { guildId: string; planId: string; interval?: string; status?: string }) {
    return api.post<any>(`/admin/billing/subscriptions`, body);
  },
  async subscriptionAction(id: string, action: "cancel" | "pause" | "resume") {
    return api.post<any>(`/admin/billing/subscriptions/${id}/action`, { action });
  },
  async listPayments(params?: { status?: string; guildId?: string; page?: number }) {
    return api.get<any>(`/admin/billing/payments${qs(params)}`);
  },
  async recordPayment(body: { guildId: string; subscriptionId?: string; amount: number; currency?: string; status?: string }) {
    return api.post<any>(`/admin/billing/payments`, body);
  },
  async refundPayment(id: string) {
    return api.post<any>(`/admin/billing/payments/${id}/refund`, {});
  },
  async listCoupons() {
    return api.get<{ coupons: any[] }>(`/admin/billing/coupons`);
  },
  async createCoupon(body: any) {
    return api.post<any>(`/admin/billing/coupons`, body);
  },
  async deactivateCoupon(id: string) {
    return api.delete<any>(`/admin/billing/coupons/${id}`);
  },
};

export const marketApi = {
  // ─ Item requests ─
  async createItemRequest(
    guildId: string,
    payload: { itemType: string; itemName?: string; quantity: number; reason?: string },
  ) {
    return api.post<{ request: ItemRequestData }>(`/market/${guildId}/requests`, payload);
  },
  async getRequests(guildId: string, params?: { status?: string; type?: string; page?: number }) {
    const qs = new URLSearchParams();
    if (params?.status) qs.set("status", params.status);
    if (params?.type) qs.set("type", params.type);
    if (params?.page) qs.set("page", String(params.page));
    return api.get<{ requests: ItemRequestData[]; pagination: Paginated }>(
      `/market/${guildId}/requests?${qs.toString()}`,
    );
  },
  async getMyRequests(guildId: string, page = 1) {
    return api.get<{
      requests: ItemRequestData[];
      quota: { used: number; limit: number; remaining: number };
      pagination: Paginated;
    }>(`/market/${guildId}/requests/mine?page=${page}`);
  },
  async reviewRequest(
    guildId: string,
    requestId: string,
    action: "APPROVED" | "DECLINED" | "FULFILLED",
    reviewNote?: string,
  ) {
    return api.patch<{ request: ItemRequestData }>(
      `/market/${guildId}/requests/${requestId}/review`,
      { action, reviewNote },
    );
  },

  // ─ Legendary priority ─
  async createLegendary(
    guildId: string,
    payload: { category: string; itemKey?: string; currentGear?: string; reason?: string },
  ) {
    return api.post<{ request: LegendaryRequestData }>(`/market/${guildId}/legendary`, payload);
  },
  async getLegendary(guildId: string, params?: { status?: string; category?: string }) {
    const qs = new URLSearchParams();
    if (params?.status) qs.set("status", params.status);
    if (params?.category) qs.set("category", params.category);
    return api.get<{ requests: LegendaryRequestData[]; canManage: boolean }>(
      `/market/${guildId}/legendary?${qs.toString()}`,
    );
  },
  async reviewLegendary(
    guildId: string,
    id: string,
    action: "APPROVED" | "REJECTED" | "COMPLETED",
    officerNote?: string,
  ) {
    return api.patch<{ request: LegendaryRequestData }>(
      `/market/${guildId}/legendary/${id}/review`,
      { action, officerNote },
    );
  },
  async setLegendarySequence(guildId: string, id: string, prioritySeq: number) {
    return api.patch<{ request: LegendaryRequestData }>(
      `/market/${guildId}/legendary/${id}/sequence`,
      { prioritySeq },
    );
  },

  // ─ Priority & distribution ─
  async getPriorityQueue(guildId: string) {
    return api.get<{ queue: PriorityQueueEntry[] }>(`/market/${guildId}/priority`);
  },
  async overridePriority(guildId: string, memberId: string, prioritySeq: number | null, reason: string) {
    return api.patch<{ member: unknown }>(`/market/${guildId}/priority/${memberId}`, {
      prioritySeq,
      reason,
    });
  },
  async createDistribution(
    guildId: string,
    payload: {
      memberId: string;
      formType: "CORE" | "NON_CORE";
      items: Record<string, number | boolean | string>;
      note?: string;
      overrideReason?: string;
    },
  ) {
    return api.post<{ distribution: ItemDistributionData }>(
      `/market/${guildId}/distributions`,
      payload,
    );
  },
  async getDistributions(
    guildId: string,
    params?: { mine?: boolean; memberId?: string; tier?: string; from?: string; to?: string; page?: number },
  ) {
    const qs = new URLSearchParams();
    if (params?.mine) qs.set("mine", "true");
    if (params?.memberId) qs.set("memberId", params.memberId);
    if (params?.tier) qs.set("tier", params.tier);
    if (params?.from) qs.set("from", params.from);
    if (params?.to) qs.set("to", params.to);
    if (params?.page) qs.set("page", String(params.page));
    return api.get<{ distributions: ItemDistributionData[]; pagination: Paginated }>(
      `/market/${guildId}/distributions?${qs.toString()}`,
    );
  },

  // ─ Member wishlist ─
  async getMyWishlist(guildId: string) {
    return api.get<{ items: WishlistItem[]; tier: string; formType: "CORE" | "NON_CORE"; caps: WishlistCaps }>(
      `/market/${guildId}/wishlist/mine`,
    );
  },
  async setWishlist(guildId: string, items: WishlistItem[]) {
    return api.put<{ items: WishlistItem[]; tier: string; caps: WishlistCaps }>(
      `/market/${guildId}/wishlist`,
      { items },
    );
  },
  async getWishlistMaster(
    guildId: string,
    params?: { status?: WishlistStatus; category?: string; memberId?: string; search?: string },
  ) {
    const q = new URLSearchParams();
    if (params?.status) q.set("status", params.status);
    if (params?.category) q.set("category", params.category);
    if (params?.memberId) q.set("memberId", params.memberId);
    if (params?.search) q.set("search", params.search);
    return api.get<{ rows: WishlistMasterRow[] }>(
      `/market/${guildId}/wishlist/master?${q.toString()}`,
    );
  },
  async notifyRequest(
    guildId: string,
    payload: { itemLabel: string; itemRef?: string; memberIds?: string[]; message?: string },
  ) {
    return api.post<{ notified: number }>(`/market/${guildId}/notify-request`, payload);
  },

  // ─ Mounts ─
  async listMounts(guildId: string) {
    return api.get<{ mounts: MountCatalogItem[] }>(`/market/${guildId}/mounts`);
  },
  async upsertMount(
    guildId: string,
    payload: { id?: string; name: string; iconUrl?: string | null; maxSlots: number; isActive?: boolean },
  ) {
    if (payload.id) {
      return api.patch<{ mount: MountCatalogItem }>(`/market/${guildId}/mounts/${payload.id}`, payload);
    }
    return api.post<{ mount: MountCatalogItem }>(`/market/${guildId}/mounts`, payload);
  },
  async deleteMount(guildId: string, mountId: string) {
    return api.delete<{ deleted: boolean }>(`/market/${guildId}/mounts/${mountId}`);
  },
  async distributeMount(guildId: string, mountId: string, payload: { memberId: string; note?: string }) {
    return api.post<{ record: unknown }>(`/market/${guildId}/mounts/${mountId}/distribute`, payload);
  },

  // ─ Rules & audit ─
  async getRules(guildId: string) {
    return api.get<{ rules: MarketRulesData }>(`/market/${guildId}/rules`);
  },
  async updateRules(guildId: string, rules: MarketRulesData) {
    return api.patch<{ rules: MarketRulesData }>(`/market/${guildId}/rules`, rules);
  },
  async getAuditLogs(guildId: string, params?: { action?: string; page?: number }) {
    const qs = new URLSearchParams();
    if (params?.action) qs.set("action", params.action);
    if (params?.page) qs.set("page", String(params.page));
    return api.get<{ logs: AuditLogEntry[]; pagination: Paginated }>(
      `/market/${guildId}/audit?${qs.toString()}`,
    );
  },

  // ─ Guild Storage ─
  async getStorage(guildId: string) {
    return api.get<{ storage: StorageItemData[]; listed: StorageItemData[]; canManage: boolean }>(
      `/market/${guildId}/storage`,
    );
  },
  async registerStorageInMarket(guildId: string, id: string, price: number) {
    return api.post<{ item: StorageItemData }>(`/market/${guildId}/storage/${id}/register`, { price });
  },
  async recallStorageItem(guildId: string, id: string) {
    return api.post<{ item: StorageItemData }>(`/market/${guildId}/storage/${id}/recall`, {});
  },
  async markStorageItemSold(guildId: string, id: string, payload: { saleValue: number; soldAt?: string }) {
    return api.post<{ item: StorageItemData }>(`/market/${guildId}/storage/${id}/sold`, payload);
  },
  async distributeStorageItem(
    guildId: string,
    id: string,
    payload:
      | { mode: "GUILD_SALE"; memberId: string; note?: string }
      | { mode: "GUILD_AUCTION"; startingBid?: number; durationHours?: number; note?: string },
  ) {
    return api.post<{ item: StorageItemData; auction: AuctionData | null }>(
      `/market/${guildId}/storage/${id}/distribute`,
      payload,
    );
  },
  async removeStorageItem(guildId: string, id: string) {
    return api.delete<{ success: boolean }>(`/market/${guildId}/storage/${id}`);
  },

  // ─ Auctions (DKP bidding hall) ─
  async getAuctions(guildId: string) {
    return api.get<{ auctions: AuctionData[]; canManage: boolean; myBidPoints: number }>(
      `/market/${guildId}/auctions`,
    );
  },
  async getAuctionHistory(guildId: string, page = 1) {
    return api.get<{ items: AuctionData[]; pagination: Paginated }>(
      `/market/${guildId}/auctions/history?page=${page}`,
    );
  },
  async createAuction(
    guildId: string,
    payload: {
      itemName: string;
      description?: string;
      imageUrl?: string;
      category?: string;
      startingBid?: number;
      durationHours?: number;
    },
  ) {
    return api.post<{ auction: AuctionData }>(`/market/${guildId}/auctions`, payload);
  },
  async placeBid(guildId: string, id: string, bidAmount: number) {
    return api.post<{ success: boolean; bid: AuctionBidData; newBidPoints: number }>(
      `/market/${guildId}/auctions/${id}/bid`,
      { bidAmount },
    );
  },
  async endAuction(guildId: string, id: string) {
    return api.post<{ success: boolean; winner: { ign: string | null } | null }>(
      `/market/${guildId}/auctions/${id}/end`,
      {},
    );
  },
  async cancelAuction(guildId: string, id: string) {
    return api.post<{ success: boolean }>(`/market/${guildId}/auctions/${id}/cancel`, {});
  },
};
