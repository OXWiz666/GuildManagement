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
import { createClient } from "@/utils/supabase/client";
import { friendlyAuthError } from "./auth-errors";

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
  isSessionReady: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (
    email: string,
    password: string,
    confirmPassword: string,
    displayName: string,
  ) => Promise<{ success: boolean; error?: string; requiresVerification?: boolean }>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const getCachedProfile = (): User | null => {
  if (typeof window !== "undefined") {
    try {
      const stored = localStorage.getItem("auth_profile");
      if (stored) {
        return JSON.parse(stored);
      }
    } catch {
      // quiet fail
    }
  }
  return null;
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(getCachedProfile());
  const [isLoading, setIsLoading] = useState(!getCachedProfile());
  const [isSessionReady, setIsSessionReady] = useState(false);

  const refreshUser = useCallback(async () => {
    try {
      const result = await authApi.getMe();
      if (result.success && result.data?.user) {
        setUser(result.data.user);
        if (typeof window !== "undefined") {
          localStorage.setItem("auth_profile", JSON.stringify(result.data.user));
        }
      } else {
        setUser(null);
        setAccessToken(null);
        if (typeof window !== "undefined") {
          localStorage.removeItem("auth_profile");
        }
      }
    } catch {
      setUser(null);
      setAccessToken(null);
      if (typeof window !== "undefined") {
        localStorage.removeItem("auth_profile");
      }
    }
  }, []);

  // Try to restore session on mount via refresh token cookie
  useEffect(() => {
    async function init() {
      const refreshed = await authApi.refreshToken();
      if (refreshed) {
        await refreshUser();
      } else {
        setUser(null);
        setAccessToken(null);
        if (typeof window !== "undefined") {
          localStorage.removeItem("auth_profile");
        }
      }
      setIsLoading(false);
      setIsSessionReady(true);
    }
    init();
  }, [refreshUser]);

  const login = useCallback(
    async (
      email: string,
      password: string,
    ): Promise<{ success: boolean; error?: string }> => {
      try {
        const supabase = createClient();
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) {
          // Fallback to local database login if Supabase auth fails (e.g. for seed accounts)
          try {
            const localResult = await authApi.login(email, password);
            if (localResult.success && localResult.data?.user) {
              const basicUser = { ...localResult.data.user, guilds: [] };
              setUser(basicUser);
              if (typeof window !== "undefined") {
                localStorage.setItem("auth_profile", JSON.stringify(basicUser));
              }
              await refreshUser();
              setIsSessionReady(true);
              return { success: true };
            }
          } catch (localError) {
            console.error("Local login fallback failed:", localError);
          }

          // Surface the real, human-readable reason (wrong password, unverified email, etc.)
          return {
            success: false,
            error: friendlyAuthError(error.message).message,
          };
        }

        if (data.session) {
          const syncResult = await authApi.supabaseSync(data.session.access_token);
          if (syncResult.success && syncResult.data?.user) {
            const basicUser = { ...syncResult.data.user, guilds: [] };
            setUser(basicUser);
            if (typeof window !== "undefined") {
              localStorage.setItem("auth_profile", JSON.stringify(basicUser));
            }
            await refreshUser();
            setIsSessionReady(true);
            return { success: true };
          }
          return {
            success: false,
            error: friendlyAuthError(syncResult.error?.message, "We couldn't finish signing you in. Please try again.").message,
          };
        }

        return {
          success: false,
          error: "Your session could not be established. Please try again.",
        };
      } catch (err) {
        console.error("Login failed:", err);
        return {
          success: false,
          error: friendlyAuthError(
            err instanceof Error ? err.message : undefined,
            "Couldn't reach the server. Check your connection and try again.",
          ).message,
        };
      }
    },
    [refreshUser],
  );

  const register = useCallback(
    async (
      email: string,
      password: string,
      confirmPassword: string,
      displayName: string,
    ): Promise<{ success: boolean; error?: string; requiresVerification?: boolean }> => {
      if (password !== confirmPassword) {
        return { success: false, error: "The passwords you entered don't match." };
      }

      try {
        const supabase = createClient();
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              display_name: displayName,
            },
          },
        });

        if (error) {
          return {
            success: false,
            error: friendlyAuthError(error.message).message,
          };
        }

        if (data.user && !data.session) {
          return {
            success: true,
            requiresVerification: true,
          };
        }

        if (data.session) {
          const syncResult = await authApi.supabaseSync(data.session.access_token);
          if (syncResult.success && syncResult.data?.user) {
            const basicUser = { ...syncResult.data.user, guilds: [] };
            setUser(basicUser);
            if (typeof window !== "undefined") {
              localStorage.setItem("auth_profile", JSON.stringify(basicUser));
            }
            await refreshUser();
            setIsSessionReady(true);
            return { success: true };
          }
          return {
            success: false,
            error: friendlyAuthError(syncResult.error?.message, "We couldn't finish creating your account. Please try again.").message,
          };
        }

        return { success: true };
      } catch (err) {
        console.error("Registration failed:", err);
        return {
          success: false,
          error: friendlyAuthError(
            err instanceof Error ? err.message : undefined,
            "Couldn't reach the server. Check your connection and try again.",
          ).message,
        };
      }
    },
    [refreshUser],
  );

  const logout = useCallback(async () => {
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
    } catch (err) {
      console.error("Supabase signout failed:", err);
    }

    try {
      await authApi.logout();
    } catch (err) {
      console.error("Auth API logout rejected, executing client-side fallback:", err);
    } finally {
      setAccessToken(null);
      setUser(null);
      setIsSessionReady(false);
      if (typeof window !== "undefined") {
        localStorage.removeItem("auth_profile");
      }
    }
  }, []);

  // 30 minutes inactive automatic logout
  useEffect(() => {
    if (!user) return;

    let timeoutId: NodeJS.Timeout;

    const resetTimer = () => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        console.log("Inactivity logout triggered (30 minutes inactive)");
        logout();
      }, 30 * 60 * 1000); // 30 minutes
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
        isSessionReady,
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
