"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import type { LeaderOnboardingInput, PaymentMethodEntry } from "@guild/shared";
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
  platformRole?: string | null;
  paymentMethods?: PaymentMethodEntry[];
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
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string; errorTitle?: string; platformRole?: string | null }>;
  register: (
    email: string,
    password: string,
    confirmPassword: string,
    displayName: string,
    onboarding?: LeaderOnboardingInput,
  ) => Promise<{ success: boolean; error?: string; errorTitle?: string; requiresVerification?: boolean }>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<User | null>;
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

  const refreshUser = useCallback(async (): Promise<User | null> => {
    try {
      const result = await authApi.getMe();
      if (result.success && result.data?.user) {
        setUser(result.data.user);
        if (typeof window !== "undefined") {
          // Payment QR images are base64 and can be several MB each — keep them
          // out of the localStorage cache so they can't blow the quota (which
          // would throw here and, via the catch below, wipe the session).
          const { paymentMethods: _omit, ...cacheable } = result.data.user;
          localStorage.setItem("auth_profile", JSON.stringify(cacheable));
        }
        return result.data.user;
      } else {
        setUser(null);
        setAccessToken(null);
        if (typeof window !== "undefined") {
          localStorage.removeItem("auth_profile");
        }
        return null;
      }
    } catch {
      setUser(null);
      setAccessToken(null);
      if (typeof window !== "undefined") {
        localStorage.removeItem("auth_profile");
      }
      return null;
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
    ): Promise<{ success: boolean; error?: string; errorTitle?: string; platformRole?: string | null }> => {
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
              const fullUser = await refreshUser();
              setIsSessionReady(true);
              return { success: true, platformRole: fullUser?.platformRole ?? null };
            }
          } catch (localError) {
            console.error("Local login fallback failed:", localError);
          }

          // Surface the real, human-readable reason (wrong password, unverified email, etc.).
          // Map once here so the title always matches the message shown to the user.
          const friendly = friendlyAuthError(error.message);
          return { success: false, error: friendly.message, errorTitle: friendly.title };
        }

        if (data.session) {
          const syncResult = await authApi.supabaseSync(data.session.access_token);
          if (syncResult.success && syncResult.data?.user) {
            const basicUser = { ...syncResult.data.user, guilds: [] };
            setUser(basicUser);
            if (typeof window !== "undefined") {
              localStorage.setItem("auth_profile", JSON.stringify(basicUser));
            }
            const fullUser = await refreshUser();
            setIsSessionReady(true);
            return { success: true, platformRole: fullUser?.platformRole ?? null };
          }
          const friendly = friendlyAuthError(
            syncResult.error?.message,
            "We couldn't finish signing you in. Please try again.",
          );
          return { success: false, error: friendly.message, errorTitle: friendly.title };
        }

        return {
          success: false,
          error: "Your session could not be established. Please try again.",
          errorTitle: "Sign-in failed",
        };
      } catch (err) {
        console.error("Login failed:", err);
        const friendly = friendlyAuthError(
          err instanceof Error ? err.message : undefined,
          "Couldn't reach the server. Check your connection and try again.",
        );
        return { success: false, error: friendly.message, errorTitle: friendly.title };
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
      onboarding?: LeaderOnboardingInput,
    ): Promise<{ success: boolean; error?: string; errorTitle?: string; requiresVerification?: boolean }> => {
      if (password !== confirmPassword) {
        const friendly = friendlyAuthError("Passwords don't match");
        return { success: false, error: friendly.message, errorTitle: friendly.title };
      }

      try {
        const supabase = createClient();
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              display_name: displayName,
              // Leader onboarding intent — read back server-side on first sync
              // to self-serve create the guild/faction (see supabase-sync route).
              ...(onboarding && onboarding.accountType !== "MEMBER"
                ? {
                    account_type: onboarding.accountType,
                    guild_name: onboarding.guildName,
                    ...(onboarding.factionName ? { faction_name: onboarding.factionName } : {}),
                  }
                : {}),
            },
          },
        });

        if (error) {
          const friendly = friendlyAuthError(error.message);
          return { success: false, error: friendly.message, errorTitle: friendly.title };
        }

        // Supabase returns a look-alike success (a user object, no error) when the
        // email already belongs to a confirmed account — its `identities` array is
        // empty as an anti-enumeration measure, no email is sent, and the existing
        // password is left untouched. Without this check we'd tell the user
        // "verification sent" when nothing happened, and their next login with the
        // "new" password would fail as if their credentials were wrong.
        if (data.user && !data.session && data.user.identities?.length === 0) {
          const friendly = friendlyAuthError("An account with this email already exists");
          return { success: false, error: friendly.message, errorTitle: friendly.title };
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
          const friendly = friendlyAuthError(
            syncResult.error?.message,
            "We couldn't finish creating your account. Please try again.",
          );
          return { success: false, error: friendly.message, errorTitle: friendly.title };
        }

        return { success: true };
      } catch (err) {
        console.error("Registration failed:", err);
        const friendly = friendlyAuthError(
          err instanceof Error ? err.message : undefined,
          "Couldn't reach the server. Check your connection and try again.",
        );
        return {
          success: false,
          error: friendly.message,
          errorTitle: friendly.title,
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
