import type { ApiResponse } from "@guild/shared";

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
 * Returns true if successful.
 */
async function refreshAccessToken(): Promise<boolean> {
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
      user: { id: string; email: string; displayName: string; avatarUrl: string | null; createdAt: string };
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
      user: { id: string; email: string; displayName: string; avatarUrl: string | null; createdAt: string };
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

  async getMe() {
    return api.get<{
      user: {
        id: string;
        email: string;
        displayName: string;
        avatarUrl: string | null;
        createdAt: string;
        guilds: Array<{
          guildId: string;
          guildName: string;
          guildSlug: string;
          guildAvatarUrl: string | null;
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
    avatarUrl?: string | null;
    password?: string;
    ign?: string | null;
    cp?: number | null;
    class?: string | null;
    weapon?: string | null;
  }) {
    return api.put<{ user: any }>("/auth/me", data);
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
      user: { id: string; email: string; displayName: string; avatarUrl: string | null; createdAt: string };
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
  user: {
    id: string;
    displayName: string;
    email: string;
    avatarUrl: string | null;
  };
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

export const guildApi = {
  async getMembers(guildId: string) {
    return api.get<{ members: GuildMemberData[] }>(
      `/guilds/${guildId}/members`,
    );
  },

  async updateMemberRole(guildId: string, memberId: string, role: string) {
    return api.patch<{ member: GuildMemberData }>(
      `/guilds/${guildId}/members/${memberId}/role`,
      { role },
    );
  },

  async verifyInviteCode(code: string) {
    return api.get<{ guild: { id: string; name: string; slug: string; description: string | null; avatarUrl: string | null } }>(
      `/guilds/invite/${code}`,
    );
  },

  async applyToGuild(payload: { inviteCode: string; ign: string; cp: number; class: string; weapon: string }) {
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
    return api.patch<{ success: boolean; status: string; memberCode?: string }>(
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
    return api.get<any>(`/guilds/${guildId}/settings`);
  },

  async updateSettings(guildId: string, payload: any) {
    return api.patch<any>(`/guilds/${guildId}/settings`, payload);
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
  status: "PENDING" | "CONFIRMED";
  joinedAt: string;
  user?: {
    id: string;
    displayName: string;
    email: string;
    avatarUrl: string | null;
  };
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
  spawnTime: string;
  status: "UPCOMING" | "SPAWNED" | "KILLED";
  activeSchedule: BossScheduleData | null;
  latestKilled: BossScheduleData | null;
}

export interface BossRotationResponse {
  serverTime: string;
  canManage: boolean;
  viewerRole: string;
  guilds: FactionGuildData[];
  rotations: BossRotationItem[];
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
  nextGuildName: string | null;
  nextSpawnTime: string | null;
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

  async getPendingAttendance(guildId: string) {
    return api.get<{ activeSession: AttendanceSessionData | null; pendingRecords: AttendanceRecordData[] }>(
      `/dashboard/attendance/pending/${guildId}`,
    );
  },

  async confirmAttendance(recordId: string, guildId: string) {
    return api.patch<{ success: boolean; record: AttendanceRecordData; points: number }>(
      `/dashboard/attendance/confirm/${recordId}`,
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

  async getBossSchedules(guildId: string) {
    return api.get<{ schedules: BossScheduleData[] }>(
      `/dashboard/boss-schedule/${guildId}`,
    );
  },

  async getBossRotation(guildId: string) {
    return api.get<BossRotationResponse>(
      `/dashboard/boss-rotation/${guildId}`,
    );
  },

  async getBossKilledHistory(guildId: string, month?: string) {
    const params = month ? `?${new URLSearchParams({ month }).toString()}` : "";
    return api.get<BossKilledHistoryResponse>(
      `/dashboard/boss-rotation/${guildId}/killed-history${params}`,
    );
  },

  async updateBossRotationQueue(guildId: string, bossName: string, queueGuildIds: string[]) {
    return api.post<BossRotationResponse>(
      `/dashboard/boss-rotation/${guildId}/${encodeURIComponent(bossName)}/queue`,
      { queueGuildIds },
    );
  },

  async markBossRotationKilled(guildId: string, scheduleId: string, killedAt: string, takenGuildId: string, signal?: AbortSignal) {
    return api.post<{
      schedule: BossScheduleData | null;
      nextSchedule: BossScheduleData | null;
      rotationId: string;
    }>(
      `/dashboard/boss-rotation/${guildId}/${scheduleId}/killed`,
      { killedAt, takenGuildId },
      signal ? { signal } : undefined,
    );
  },

  async markBossRotationKilledByName(guildId: string, bossName: string, killedAt: string, takenGuildId: string, signal?: AbortSignal) {
    return api.post<{
      schedule: BossScheduleData | null;
      nextSchedule: BossScheduleData | null;
      rotationId: string;
    }>(
      `/dashboard/boss-rotation/${guildId}/boss/${encodeURIComponent(bossName)}/killed`,
      { killedAt, takenGuildId },
      signal ? { signal } : undefined,
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

export interface FactionGuildSearchResult {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  avatarUrl: string | null;
  memberCount: number;
  leaderName: string | null;
  isOwnGuild: boolean;
}

export interface FactionGuildInviteResult {
  success: boolean;
  guildId: string;
  guildName: string;
  notifiedLeaders: number;
}

export const factionApi = {
  async getMembers() {
    return api.get<{ members: FactionMemberData[] }>(`/faction/members`);
  },

  async searchGuilds(query: string) {
    return api.get<{ guilds: FactionGuildSearchResult[] }>(
      `/faction/guilds/search?q=${encodeURIComponent(query)}`,
    );
  },

  async inviteGuild(guildId: string) {
    return api.post<FactionGuildInviteResult>(`/faction/guilds/invite`, { guildId });
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
