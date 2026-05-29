"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { authApi, setAccessToken } from "./api";

interface User {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  createdAt: string;
  guilds: Guild[];
  ign?: string | null;
  cp?: number | null;
  class?: string | null;
  weapon?: string | null;
}

interface Guild {
  guildId: string;
  guildName: string;
  guildSlug: string;
  guildAvatarUrl: string | null;
  role: string;
  rankName: string;
  joinedAt: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (
    email: string,
    password: string,
    confirmPassword: string,
    displayName: string,
  ) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const result = await authApi.getMe();
      if (result.success && result.data?.user) {
        setUser(result.data.user);
      } else {
        setUser(null);
        setAccessToken(null);
      }
    } catch {
      setUser(null);
      setAccessToken(null);
    }
  }, []);

  // Try to restore session on mount via refresh token cookie
  useEffect(() => {
    async function init() {
      const refreshed = await authApi.refreshToken();
      if (refreshed) {
        await refreshUser();
      }
      setIsLoading(false);
    }
    init();
  }, [refreshUser]);

  const login = useCallback(
    async (
      email: string,
      password: string,
    ): Promise<{ success: boolean; error?: string }> => {
      const result = await authApi.login(email, password);

      if (result.success && result.data?.user) {
        setUser({ ...result.data.user, guilds: [] });
        // Fetch full user with guilds
        await refreshUser();
        return { success: true };
      }

      return {
        success: false,
        error: result.error?.message || "Login failed",
      };
    },
    [refreshUser],
  );

  const register = useCallback(
    async (
      email: string,
      password: string,
      confirmPassword: string,
      displayName: string,
    ): Promise<{ success: boolean; error?: string }> => {
      const result = await authApi.register(
        email,
        password,
        confirmPassword,
        displayName,
      );

      if (result.success && result.data?.user) {
        setUser({ ...result.data.user, guilds: [] });
        return { success: true };
      }

      let errorMsg = result.error?.message || "Registration failed";
      if (result.error?.details && Array.isArray(result.error.details)) {
        errorMsg = result.error.details.map((d: any) => d.message).join(". ");
      }

      return {
        success: false,
        error: errorMsg,
      };
    },
    [],
  );

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch (err) {
      console.error("Auth API logout rejected, executing client-side fallback:", err);
    } finally {
      setAccessToken(null);
      setUser(null);
    }
  }, []);

  // 5 minutes inactive automatic logout
  useEffect(() => {
    if (!user) return;

    let timeoutId: NodeJS.Timeout;

    const resetTimer = () => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        console.log("Inactivity logout triggered (5 minutes inactive)");
        logout();
      }, 5 * 60 * 1000); // 5 minutes
    };

    // Events to track user activity
    const activityEvents = [
      "mousedown",
      "mousemove",
      "keypress",
      "scroll",
      "touchstart",
    ];

    // Start timer on mount
    resetTimer();

    // Register event listeners
    activityEvents.forEach((event) => {
      window.addEventListener(event, resetTimer);
    });

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      activityEvents.forEach((event) => {
        window.removeEventListener(event, resetTimer);
      });
    };
  }, [user, logout]);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        login,
        register,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
