import type { ApiResponse } from "@guild/shared";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

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
    "Content-Type": "application/json",
    ...(fetchOptions.headers as Record<string, string>),
  };

  if (!skipAuth && accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }

  const url = `${API_BASE}${endpoint}`;

  let response = await fetch(url, {
    ...fetchOptions,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    credentials: "include", // Include cookies for refresh token
  });

  // If 401, try refreshing the token once
  if (response.status === 401 && !skipAuth && accessToken) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      headers["Authorization"] = `Bearer ${accessToken}`;
      response = await fetch(url, {
        ...fetchOptions,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        credentials: "include",
      });
    }
  }

  const data = (await response.json()) as ApiResponse<T>;
  return data;
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
  status: "UPCOMING" | "SPAWNED" | "KILLED";
  killedAt: string | null;
  creatorId: string;
  createdAt: string;
  attendanceSessions?: AttendanceSessionData[];
  lootDrop?: string | null;
  screenshotUrl?: string | null;
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
    }>(`/dashboard/attendance/stats/${guildId}`);
  },

  async getBossSchedules(guildId: string) {
    return api.get<{ schedules: BossScheduleData[] }>(
      `/dashboard/boss-schedule/${guildId}`,
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
    }>(`/dashboard/stats/${guildId}`);
  },
};

