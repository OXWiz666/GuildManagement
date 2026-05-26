"use client";

import { useState, type FormEvent, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { authApi } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { AuthStagger, MagneticPress } from "@/components/auth/AuthAnim";

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState("");
  const { addToast } = useToast();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords don't match");
      return;
    }

    if (!token) {
      setError("Invalid or missing reset token");
      return;
    }

    setIsLoading(true);

    try {
      const result = await authApi.resetPassword(
        token,
        password,
        confirmPassword,
      );

      if (result.success) {
        setIsSuccess(true);
        addToast("success", "Password reset successfully!");
      } else {
        setError(result.error?.message || "Reset failed");
      }
    } catch {
      setError("An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  }

  if (isSuccess) {
    return (
      <div className="text-center animate-fade-in">
        <div className="relative mx-auto mb-6 h-16 w-16">
          <div
            className="absolute -inset-2 rounded-full border border-emerald-500/15"
            style={{ animation: "spin-slow 8s linear infinite" }}
          >
            <span className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_2px_rgba(52,211,153,0.5)]" />
          </div>
          <div className="absolute inset-0 rounded-full border border-emerald-500/30 bg-emerald-500/10 flex items-center justify-center">
            <svg
              className="h-6 w-6 text-emerald-400"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
        </div>

        <div className="text-[10px] text-white/40 uppercase tracking-[0.24em] mb-3">
          Password updated
        </div>
        <h2 className="text-[22px] font-semibold text-white tracking-tight mb-3">
          You&apos;re all set
        </h2>
        <p className="text-sm text-white/50 leading-relaxed mb-7 max-w-sm mx-auto">
          Your password has been updated. You can now sign in with your new
          credentials.
        </p>
        <MagneticPress strength={5} className="inline-block">
          <Link href="/login">
            <Button variant="primary" size="lg">
              <span className="inline-flex items-center gap-2">
                Sign in
                <svg
                  className="h-3.5 w-3.5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                >
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </span>
            </Button>
          </Link>
        </MagneticPress>
      </div>
    );
  }

  return (
    <div className="w-full relative">
      <AuthStagger baseDelay={260} stagger={85}>
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[10px] text-white/40 uppercase tracking-[0.24em]">
              Recovery · Step 2
            </span>
            <span className="h-px flex-1 bg-gradient-to-r from-white/15 to-transparent" />
          </div>
          <h1 className="text-[28px] leading-tight font-semibold text-white tracking-tight">
            New password
            <span className="text-white/40">.</span>
          </h1>
          <p className="text-sm text-white/50 mt-2 leading-relaxed">
            Choose a strong password for your account.
          </p>
        </div>

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

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="New password"
            type="password"
            placeholder="Min. 8 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="new-password"
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

          <Input
            label="Confirm password"
            type="password"
            placeholder="Type password again"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            autoComplete="new-password"
            icon={
              <svg
                className="h-4 w-4 text-white/40"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
              >
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            }
          />

          <MagneticPress strength={5} className="block mt-3">
            <Button type="submit" fullWidth isLoading={isLoading} size="lg">
              <span className="inline-flex items-center gap-2">
                Reset password
                <svg
                  className="h-3.5 w-3.5"
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

        <div className="mt-7 pt-5 border-t border-white/[0.06] text-center">
          <Link
            href="/login"
            className="group inline-flex items-center gap-2 text-xs text-white/50 hover:text-white transition-colors"
          >
            <svg
              className="h-3 w-3 transition-transform duration-300 group-hover:-translate-x-0.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            Back to sign in
          </Link>
        </div>
      </AuthStagger>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <div className="relative h-12 w-12">
            <div className="absolute inset-0 rounded-2xl border border-white/10" />
            <div
              className="absolute inset-0 rounded-2xl border-t border-white/60 animate-spin"
              style={{ animationDuration: "1.4s" }}
            />
          </div>
          <p className="text-[10px] text-white/40 tracking-[0.3em] uppercase font-medium animate-pulse">
            Loading
          </p>
        </div>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}
