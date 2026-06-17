"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";
import { authApi, setAccessToken } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/components/ui/Toast";
import { AuthStagger } from "@/components/auth/AuthAnim";

export default function AuthCallbackPage() {
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { refreshUser, isSessionReady } = useAuth();
  const { addToast } = useToast();
  const syncAttemptedRef = useRef(false);

  useEffect(() => {
    async function handleSession() {
      if (syncAttemptedRef.current) return;
      syncAttemptedRef.current = true;

      try {
        const supabase = createClient();
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();

        if (sessionError) {
          setError(sessionError.message);
          return;
        }

        if (!session) {
          setError("No session found. Please try logging in again.");
          return;
        }

        // Send Supabase JWT to backend for syncing
        const result = await authApi.supabaseSync(session.access_token);

        if (result.success && result.data?.user) {
          if (typeof window !== "undefined") {
            localStorage.setItem("auth_profile", JSON.stringify(result.data.user));
          }
          await refreshUser();
          addToast("success", "Welcome to ForgeKeep!");
          router.push("/dashboard");
        } else {
          setError(result.error?.message || "Failed to sync account with backend.");
        }
      } catch (err) {
        console.error("Auth callback error:", err);
        setError("An unexpected error occurred during redirect verification.");
      }
    }

    handleSession();
  }, [router, refreshUser, addToast]);

  return (
    <div className="min-h-screen bg-[#050608] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-[#0D0D14] border border-white/[0.08] rounded-2xl p-8 relative overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.85)] card-obsidian">
        {/* Top edge gold highlight */}
        <div
          className="absolute inset-x-0 top-0 h-px"
          style={{
            background: "linear-gradient(90deg, transparent, rgba(245, 184, 65, 0.35), transparent)",
          }}
        />

        <AuthStagger baseDelay={100} stagger={60}>
          {error ? (
            <div className="text-center py-4 space-y-6">
              <div className="h-16 w-16 mx-auto rounded-full bg-[#3A1A1E] border border-[#D94A4A]/40 flex items-center justify-center text-[#D94A4A]">
                <svg className="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
              </div>

              <div className="space-y-2">
                <h1 className="text-xl font-extrabold text-white tracking-tight">Authentication Error</h1>
                <p className="text-sm text-red-200/70 max-w-xs mx-auto leading-relaxed">{error}</p>
              </div>

              <div className="pt-2">
                <Link
                  href="/login"
                  className="inline-flex items-center gap-1.5 px-6 py-2.5 rounded-xl border border-white/[0.08] hover:border-[#F5B841]/30 bg-[#11141A] hover:bg-[#0B0D10] text-xs font-bold uppercase tracking-wider text-white transition-all duration-300"
                >
                  Back to Sign In
                </Link>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 space-y-6">
              {/* Spinner */}
              <div className="relative h-16 w-16 mx-auto flex items-center justify-center">
                <span className="absolute h-16 w-16 border-2 border-white/5 border-t-[#F5B841] rounded-full animate-spin" />
                <span className="text-[#F5B841] font-bold text-lg">✦</span>
              </div>

              <div className="space-y-2">
                <h1 className="text-xl font-extrabold text-white tracking-tight">Authenticating</h1>
                <p className="text-sm text-[#8B8F98]">Establishing secure handshake with ForgeKeep operations...</p>
              </div>
            </div>
          )}
        </AuthStagger>
      </div>
    </div>
  );
}
