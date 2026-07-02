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

  function getPasswordStrength(pwd: string): {
    score: number;
    label: string;
    color: string;
  } {
    let score = 0;
    if (pwd.length >= 8) score++;
    if (/[a-z]/.test(pwd)) score++;
    if (/[A-Z]/.test(pwd)) score++;
    if (/[0-9]/.test(pwd)) score++;
    if (/[^a-zA-Z0-9]/.test(pwd)) score++;

    const levels = [
      { label: "Very weak", color: "bg-[#D94A4A]" },
      { label: "Weak", color: "bg-[#E27C3E]" },
      { label: "Fair", color: "bg-[#F5B841]" },
      { label: "Strong", color: "bg-[#10D99A]" },
      { label: "Excellent", color: "bg-[#0AD985]" },
    ];
    const level = levels[Math.max(0, score - 1)] || levels[0]!;
    return { score, ...level };
  }

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

  const strength = getPasswordStrength(password);

  if (isSuccess) {
    return (
      <div className="text-center animate-fade-in">
        <div className="relative mx-auto mb-6 h-16 w-16">
          <div
            className="absolute -inset-2 rounded-full border border-[#10D99A]/15"
            style={{ animation: "spin-slow 8s linear infinite" }}
          >
            <span className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 h-1.5 w-1.5 rounded-full bg-[#10D99A] shadow-[0_0_8px_2px_rgba(16,217,154,0.6)]" />
          </div>
          <div className="absolute inset-0 rounded-full border border-[#10D99A]/30 bg-[#10D99A]/10 flex items-center justify-center">
            <svg
              className="h-6 w-6 text-[#10D99A]"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
        </div>

        <div className="text-[10px] text-[#10D99A] font-bold uppercase tracking-[0.24em] mb-3">
          Password updated
        </div>
        <h2 className="text-[22px] font-extrabold text-white tracking-tight mb-3">
          You&apos;re all set
        </h2>
        <p className="text-sm text-[#8B8F98] leading-relaxed mb-7 max-w-sm mx-auto">
          Your password has been updated. You can now sign in with your new
          credentials.
        </p>
        <MagneticPress strength={5} className="inline-block">
          <Link href="/login">
            <Button variant="auth" size="lg" className="group">
              <span className="inline-flex items-center gap-2">
                Sign in
                <svg
                  className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-0.5 text-[#F5B841]"
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
            <span className="text-[10px] text-[#F5B841] font-bold uppercase tracking-[0.24em]">
              Recovery
            </span>
            <span className="h-px flex-1 bg-gradient-to-r from-[#F5B841]/25 to-transparent" />
          </div>
          <h1 className="text-[28px] leading-tight font-extrabold text-white tracking-tight">
            New password
            <span className="text-[#F5B841]">.</span>
          </h1>
          <p className="text-sm text-[#8B8F98] mt-2 leading-relaxed">
            Choose a strong password for your account.
          </p>
        </div>

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
                <span className="font-semibold text-red-100">An unexpected error occurred</span>
                <span className="text-red-300/80 leading-relaxed">{error}</span>
              </div>
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Input
              label="New password"
              type="password"
              placeholder="Min. 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              variant="auth"
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
            {password.length > 0 && (
              <div className="mt-3 space-y-1.5 animate-slide-down">
                <div className="flex gap-1.5">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div
                      key={i}
                      className={`h-1 flex-1 rounded-full transition-all duration-500 ${
                        i <= strength.score ? strength.color : "bg-white/[0.04]"
                      }`}
                      style={{
                        transitionDelay: `${i * 40}ms`,
                      }}
                    />
                  ))}
                </div>
                <p className="text-[10px] tracking-wider flex items-center justify-between">
                  <span className="text-[#8B8F98] uppercase font-bold text-[9px] tracking-[0.12em] flex items-center gap-1.5">
                    <span className={`h-1.5 w-1.5 rounded-full ${strength.color}`} />
                    {strength.label}
                  </span>
                  <span className="font-mono text-[#8B8F98]">
                    {strength.score}/5
                  </span>
                </p>
              </div>
            )}
          </div>

          <Input
            label="Confirm password"
            type="password"
            placeholder="Type password again"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            variant="auth"
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

          <MagneticPress strength={5} className="block mt-4">
            <Button type="submit" fullWidth isLoading={isLoading} size="lg" variant="auth" className="group">
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
                Reset password
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

        <div className="mt-7 pt-5 border-t border-white/[0.04] text-center">
          <Link
            href="/login"
            className="group inline-flex items-center gap-2 text-xs text-[#8B8F98] hover:text-[#F5B841] transition-colors font-semibold"
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
        <div className="flex flex-col items-center justify-center py-12 gap-4">
          <div className="relative h-12 w-12 flex items-center justify-center">
            <div className="absolute -inset-1 rounded-full border border-[#F5B841]/5 premium-loader-spin-slow" />
            <div className="absolute inset-0 rounded-xl border border-white/[0.04] bg-white/[0.01] backdrop-blur-sm" />
            <svg className="absolute inset-0 h-full w-full premium-loader-spin" viewBox="0 0 100 100">
              <circle
                cx="50"
                cy="50"
                r="42"
                stroke="#F5B841"
                strokeWidth="3.5"
                strokeLinecap="round"
                fill="none"
                strokeDasharray="160 120"
              />
            </svg>
          </div>
          <p className="text-[9px] text-[#F5B841]/60 tracking-[0.3em] uppercase font-bold animate-pulse-soft">
            Initiating Session
          </p>
        </div>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}
