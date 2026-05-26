"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/components/ui/Toast";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { AuthStagger, MagneticPress } from "@/components/auth/AuthAnim";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const { login } = useAuth();
  const { addToast } = useToast();
  const router = useRouter();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const result = await login(email, password);
      if (result.success) {
        addToast("success", "Welcome back!");
        router.push("/dashboard");
      } else {
        setError(result.error || "Login failed");
      }
    } catch {
      setError("An unexpected error occurred");
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
            <span className="text-[10px] text-white/40 uppercase tracking-[0.24em]">
              Sign in
            </span>
            <span className="h-px flex-1 bg-gradient-to-r from-white/15 to-transparent" />
          </div>
          <h1 className="text-[28px] leading-tight font-semibold text-white tracking-tight">
            Welcome back
            <span className="text-white/40">.</span>
          </h1>
          <p className="text-sm text-white/50 mt-2 leading-relaxed">
            Continue managing your guild operations.
          </p>
        </div>

        {/* Error */}
        <div className={error ? "block mb-5" : "hidden"}>
          {error && (
            <div className="px-4 py-3 rounded-lg bg-red-500/[0.08] border border-red-500/20 text-xs text-red-300 flex items-start gap-2.5 animate-slide-down">
              <svg
                className="h-3.5 w-3.5 text-red-400 flex-shrink-0 mt-px"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span className="leading-relaxed">{error}</span>
            </div>
          )}
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="auth-field">
            <Input
              label="Email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              icon={
                <svg
                  className="h-4 w-4 text-white/40"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                >
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                  <path d="M22 6l-10 7L2 6" />
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
                className="group text-xs text-white/50 hover:text-white transition-colors inline-flex items-center gap-1"
              >
                Forgot password?
                <svg
                  className="h-3 w-3 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300"
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

          <MagneticPress strength={5} className="block mt-3">
            <Button
              type="submit"
              fullWidth
              isLoading={isLoading}
              size="lg"
              className="group"
            >
              <span className="inline-flex items-center gap-2">
                Sign in
                <svg
                  className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-0.5"
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
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/[0.08] to-white/[0.06]" />
          <span className="text-[10px] text-white/30 uppercase tracking-[0.22em]">
            or
          </span>
          <div className="h-px flex-1 bg-gradient-to-l from-transparent via-white/[0.08] to-white/[0.06]" />
        </div>

        {/* SSO buttons */}
        <div className="grid grid-cols-2 gap-3">
          <MagneticPress strength={4}>
            <button
              type="button"
              className="group relative w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-white/[0.08] hover:border-white/20 bg-white/[0.02] hover:bg-white/[0.05] text-xs text-white/70 hover:text-white transition-all duration-300 overflow-hidden"
            >
              <span
                aria-hidden
                className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-out"
                style={{
                  background:
                    "linear-gradient(90deg, transparent, oklch(1 0 0 / 0.06), transparent)",
                }}
              />
              <svg
                className="h-4 w-4 relative"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M21.35 11.1H12v3.83h5.59c-.59 2.84-3.04 4.46-5.59 4.46-3.36 0-6.07-2.72-6.07-6.08 0-3.36 2.71-6.08 6.07-6.08 1.5 0 2.86.55 3.92 1.45l2.86-2.86C16.99 4.13 14.66 3 12 3 7.03 3 3 7.03 3 12s4.03 9 9 9c5.2 0 8.71-3.7 8.71-8.91 0-.4-.05-.74-.13-1.09z" />
              </svg>
              <span className="relative">Google</span>
            </button>
          </MagneticPress>
          <MagneticPress strength={4}>
            <button
              type="button"
              className="group relative w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-white/[0.08] hover:border-white/20 bg-white/[0.02] hover:bg-white/[0.05] text-xs text-white/70 hover:text-white transition-all duration-300 overflow-hidden"
            >
              <span
                aria-hidden
                className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-out"
                style={{
                  background:
                    "linear-gradient(90deg, transparent, oklch(1 0 0 / 0.06), transparent)",
                }}
              />
              <svg
                className="h-4 w-4 relative"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M20.317 4.37a19.79 19.79 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03z" />
              </svg>
              <span className="relative">Discord</span>
            </button>
          </MagneticPress>
        </div>

        {/* Footer link */}
        <div className="mt-8 text-center">
          <p className="text-xs text-white/40">
            Don&apos;t have an account?{" "}
            <Link
              href="/register"
              className="group text-white hover:text-white/80 font-medium transition-colors inline-flex items-center gap-1"
            >
              Create one
              <svg
                className="h-3 w-3 transition-transform duration-300 group-hover:translate-x-0.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
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
