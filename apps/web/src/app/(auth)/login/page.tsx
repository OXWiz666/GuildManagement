"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/components/ui/Toast";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { AuthStagger, MagneticPress } from "@/components/auth/AuthAnim";
import { createClient } from "@/utils/supabase/client";
import { friendlyAuthError } from "@/lib/auth-errors";
import { authApi } from "@/lib/api";

// Maps a failed login()'s errorTitle to the specific field it's about, so
// the message shows inline under that input (mirrors the Register page).
function fieldForErrorTitle(title: string): "identifier" | "password" | null {
  switch (title) {
    case "Incorrect email or password":
      // Ambiguous by design (Supabase doesn't say which one is wrong, to
      // avoid leaking which emails are registered) — stays a top banner
      // rather than falsely pointing at one specific field.
      return null;
    case "Invalid email":
      return "identifier";
    case "Email not verified":
      return "identifier";
    default:
      return null;
  }
}

export default function LoginPage() {
  // Username or email — resolved to a real email before hitting Supabase,
  // which (like the legacy local login) only understands email.
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [errorTitle, setErrorTitle] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const { login } = useAuth();
  const { addToast } = useToast();
  const router = useRouter();

  const handleDiscordLogin = async () => {
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "discord",
        options: {
          redirectTo: window.location.origin + "/auth/callback",
        },
      });
      if (error) {
        setError(error.message);
      }
    } catch {
      setError("Failed to initiate Discord login");
    }
  };

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setErrorTitle("");
    setFieldErrors({});
    setIsLoading(true);

    const trimmedIdentifier = identifier.trim();
    const errors: Record<string, string> = {};
    if (!trimmedIdentifier) errors.identifier = "Username or email is required";
    if (!password) errors.password = "Password is required";

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setIsLoading(false);
      return;
    }

    // Supabase (and the legacy local login) only understand an email, so a
    // username identifier must be resolved first. An identifier containing
    // "@" is passed straight through — no point in a lookup for that case.
    let resolvedEmail = trimmedIdentifier;
    if (!trimmedIdentifier.includes("@")) {
      try {
        const resolution = await authApi.resolveIdentifier(trimmedIdentifier);
        if (!resolution.success || !resolution.data?.email) {
          // Never reveal *why* — same generic message a wrong password gets,
          // so a username-guessing attacker learns nothing from the response.
          setError("The username/email or password you entered is incorrect. Please try again.");
          setErrorTitle("Incorrect username/email or password");
          setIsLoading(false);
          return;
        }
        resolvedEmail = resolution.data.email;
      } catch {
        setError("Couldn't reach the server. Check your connection and try again.");
        setErrorTitle("Connection problem");
        setIsLoading(false);
        return;
      }
    }

    try {
      const result = await login(resolvedEmail, password);
      if (result.success) {
        addToast("success", "Welcome back!");
        // Platform admins land on the Super Admin overview; everyone else on the guild dashboard.
        router.push(result.platformRole ? "/admin" : "/dashboard");
      } else {
        const title = result.errorTitle || "";
        const message = result.error || "Incorrect email or password. Please try again.";
        const field = fieldForErrorTitle(title);
        if (field) {
          setFieldErrors({ [field]: message });
        } else {
          setError(message);
          setErrorTitle(title);
        }
      }
    } catch (err) {
      const friendly = friendlyAuthError(err instanceof Error ? err.message : undefined);
      setError(friendly.message);
      setErrorTitle(friendly.title);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="w-full relative">
      <AuthStagger baseDelay={260} stagger={80}>
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[10px] text-[#F5B841] font-bold uppercase tracking-[0.24em]">
              Welcome back
            </span>
            <span className="h-px flex-1 bg-gradient-to-r from-[#F5B841]/25 to-transparent" />
          </div>
          <h1 className="text-[28px] leading-tight font-extrabold text-white tracking-tight">
            Back to the keep
            <span className="text-[#F5B841]">.</span>
          </h1>
          <p className="text-sm text-[#8B8F98] mt-2 leading-relaxed">
            Pick up your guild ops right where the roster left off.
          </p>
        </div>

        {/* Error */}
        <div className={error ? "block mb-5" : "hidden"}>
          {error && (
            <div className="px-4 py-3 rounded-xl bg-[#3A1A1E]/80 border border-[#D94A4A]/40 text-xs text-red-200 flex items-start gap-2.5 animate-slide-down">
              <svg
                className="h-4 w-4 text-[#D94A4A] flex-shrink-0 mt-0.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <div className="flex flex-col gap-0.5">
                <span className="font-semibold text-red-100">{errorTitle || "Sign-in failed"}</span>
                <span className="text-red-300/80 leading-relaxed">{error}</span>
              </div>
            </div>
          )}
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="auth-field">
            <Input
              label="Username or Email"
              type="text"
              placeholder="username or you@example.com"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              error={fieldErrors.identifier}
              variant="auth"
              required
              autoComplete="username"
              icon={
                <svg
                  className="h-4 w-4 text-white/40"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                >
                  <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              }
            />
          </div>

          <div className="auth-field">
            <Input
              label="Password"
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              error={fieldErrors.password}
              variant="auth"
              required
              autoComplete="current-password"
              icon={
                <svg
                  className="h-4 w-4 text-white/40"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                >
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0110 0v4" />
                </svg>
              }
            />
            <div className="flex items-center justify-end mt-2">
              <Link
                href="/forgot-password"
                className="group text-xs text-[#8B8F98] hover:text-[#F5B841] transition-colors inline-flex items-center gap-1 font-medium"
              >
                Forgot password?
                <svg
                  className="h-3 w-3 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300 text-[#F5B841]"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </Link>
            </div>
          </div>

          <MagneticPress strength={5} className="block mt-4">
            <Button
              type="submit"
              fullWidth
              isLoading={isLoading}
              size="lg"
              variant="auth"
              className="group"
            >
              <span className="inline-flex items-center justify-center w-full">
                {/* Shield icon */}
                <svg
                  className="h-4 w-4 mr-2 text-[#F5B841]/90 transition-transform duration-300 group-hover:scale-110"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
                Sign in
                {/* Right arrow icon */}
                <svg
                  className="h-3.5 w-3.5 ml-2 text-white/80 transition-transform duration-300 group-hover:translate-x-1"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                >
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </span>
            </Button>
          </MagneticPress>
        </form>

        {/* Divider */}
        <div className="my-7 flex items-center gap-4">
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/[0.04] to-white/[0.02]" />
          <span className="text-[10px] text-[#8B8F98] uppercase tracking-[0.22em] font-bold">
            or
          </span>
          <div className="h-px flex-1 bg-gradient-to-l from-transparent via-white/[0.04] to-white/[0.02]" />
        </div>

        {/* SSO buttons */}
        <div className="w-full">
          <MagneticPress strength={4}>
            <button
              type="button"
              onClick={handleDiscordLogin}
              className="group relative w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-[#1E232B] hover:border-[#F5B841]/30 bg-[#11141A] hover:bg-[#0B0D10] text-xs font-semibold text-[#8B8F98] hover:text-[#F4F4F5] transition-all duration-300 overflow-hidden cursor-pointer"
            >
              <span
                aria-hidden
                className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-out"
                style={{
                  background:
                    "linear-gradient(90deg, transparent, rgba(245, 184, 65, 0.04), transparent)",
                }}
              />
              <svg
                className="h-4 w-4 relative text-[#8B8F98] group-hover:text-[#F5B841] transition-colors"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M20.317 4.37a19.79 19.79 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03z" />
              </svg>
              <span className="relative">Continue with Discord</span>
            </button>
          </MagneticPress>
        </div>

        {/* Footer link */}
        <div className="mt-8 text-center">
          <p className="text-xs text-[#8B8F98]">
            Don&apos;t have an account?{" "}
            <Link
              href="/register"
              className="group text-white hover:text-[#F5B841] font-semibold transition-colors inline-flex items-center gap-1"
            >
              Create one
              <svg
                className="h-3 w-3 transition-transform duration-300 group-hover:translate-x-0.5 text-[#F5B841]"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
              >
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </Link>
          </p>
        </div>
      </AuthStagger>
    </div>
  );
}
