"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import type { PaymentMethodEntry } from "@guild/shared";
import { authApi, setAccessToken } from "./api";
import { createClient } from "@/utils/supabase/client";
import { friendlyAuthError } from "./auth-errors";

interface User {
  id: string;
  email: string;
  username: string;
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
  factionId: string | null;
  factionName: string | null;
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
    username: string,
  ) => Promise<{ success: boolean; error?: string; errorTitle?: string; requiresVerification?: boolean }>;
  verifyRegistrationCode: (
    email: string,
    code: string,
  ) => Promise<{ success: boolean; error?: string; errorTitle?: string; platformRole?: string | null }>;
  resendVerificationCode: (email: string) => Promise<{ success: boolean; error?: string; errorTitle?: string }>;
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
          // Fallback to local database login if Supabase auth fails (e.g. for seed accounts).
          // authApi.login() resolves with { success: false, error } rather than throwing,
          // so the try/catch here only ever catches a genuine network failure — a normal
          // wrong-password/unverified-email response falls through the `if` below.
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
            // Local login has its own account (e.g. no Supabase entry at all for a
            // legacy/seed user) — its rejection reason is the real one; Supabase's
            // error above was just "no such Supabase account" noise.
            if (localResult.error?.message) {
              const friendly = friendlyAuthError(localResult.error.message);
              return { success: false, error: friendly.message, errorTitle: friendly.title };
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
      username: string,
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
              // Chosen username, read back on first sync (see supabase-sync
              // route) — Supabase itself has no concept of a username.
              username,
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
          // Supabase's known quirk: re-signing-up an email that's still
          // *unconfirmed* (e.g. the user retried after not seeing the first
          // email) resends the confirmation link but silently keeps the
          // ORIGINAL password, not this one. The user then confirms, believes
          // this password is active, and gets "Invalid login credentials"
          // forever after. Stash it so /auth/callback can reconcile it once
          // confirmation hands us a real, self-authenticated session.
          if (typeof window !== "undefined") {
            try {
              sessionStorage.setItem("pending_confirm_pw", JSON.stringify({ email, password }));
            } catch {
              // sessionStorage unavailable (e.g. private browsing) — non-fatal
            }
          }
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

  // Confirms the 6-digit code emailed at signUp (Supabase's `{{ .Token }}`
  // OTP, not the magic link) and finishes onboarding in-app — no email tab
  // switch, no /auth/callback round trip.
  const verifyRegistrationCode = useCallback(
    async (
      email: string,
      code: string,
    ): Promise<{ success: boolean; error?: string; errorTitle?: string; platformRole?: string | null }> => {
      try {
        const supabase = createClient();
        const { data, error } = await supabase.auth.verifyOtp({
          email,
          token: code,
          type: "signup",
        });

        if (error || !data.session) {
          const friendly = friendlyAuthError(
            error?.message,
            "That code is invalid or has expired. Please request a new one.",
          );
          return { success: false, error: friendly.message, errorTitle: friendly.title };
        }

        // Same repeat-signup password reconciliation the magic-link callback
        // does (see /auth/callback) — a retried, still-unconfirmed
        // registration keeps the original password unless we push through
        // the one most recently typed.
        if (typeof window !== "undefined") {
          try {
            const raw = sessionStorage.getItem("pending_confirm_pw");
            if (raw) {
              sessionStorage.removeItem("pending_confirm_pw");
              const pending = JSON.parse(raw) as { email?: string; password?: string };
              if (
                pending.email &&
                pending.password &&
                data.session.user.email?.toLowerCase() === pending.email.toLowerCase()
              ) {
                await supabase.auth.updateUser({ password: pending.password });
              }
            }
          } catch {
            // Best-effort only — recoverable via "Forgot password".
          }
        }

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
          "We couldn't finish creating your account. Please try again.",
        );
        return { success: false, error: friendly.message, errorTitle: friendly.title };
      } catch (err) {
        console.error("Code verification failed:", err);
        const friendly = friendlyAuthError(
          err instanceof Error ? err.message : undefined,
          "Couldn't reach the server. Check your connection and try again.",
        );
        return { success: false, error: friendly.message, errorTitle: friendly.title };
      }
    },
    [refreshUser],
  );

  const resendVerificationCode = useCallback(
    async (email: string): Promise<{ success: boolean; error?: string; errorTitle?: string }> => {
      try {
        const supabase = createClient();
        const { error } = await supabase.auth.resend({ type: "signup", email });
        if (error) {
          const friendly = friendlyAuthError(error.message);
          return { success: false, error: friendly.message, errorTitle: friendly.title };
        }
        return { success: true };
      } catch (err) {
        const friendly = friendlyAuthError(
          err instanceof Error ? err.message : undefined,
          "Couldn't reach the server. Check your connection and try again.",
        );
        return { success: false, error: friendly.message, errorTitle: friendly.title };
      }
    },
    [],
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
        verifyRegistrationCode,
        resendVerificationCode,
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
