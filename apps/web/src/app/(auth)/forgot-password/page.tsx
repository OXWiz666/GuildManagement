"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { authApi } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { AuthStagger, MagneticPress } from "@/components/auth/AuthAnim";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSent, setIsSent] = useState(false);
  const { addToast } = useToast();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    try {
      await authApi.forgotPassword(email);
      setIsSent(true);
      addToast("info", "Check your email for reset instructions");
    } catch {
      addToast("error", "Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  if (isSent) {
    return (
      <div className="text-center animate-fade-in">
        {/* Success ring with orbit */}
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
          Email sent
        </div>
        <h1 className="text-[24px] font-semibold text-white tracking-tight mb-3">
          Check your inbox
        </h1>
        <p className="text-sm text-white/50 leading-relaxed mb-7 max-w-sm mx-auto">
          If an account exists for{" "}
          <span className="text-white font-medium">{email}</span>, we&apos;ve
          sent password reset instructions. The link expires in 1 hour.
        </p>

        <MagneticPress strength={4} className="inline-block">
          <Link
            href="/login"
            className="group inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm text-white/70 hover:text-white border border-white/[0.08] hover:border-white/25 bg-white/[0.02] hover:bg-white/[0.05] transition-all duration-300"
          >
            <svg
              className="h-3.5 w-3.5 transition-transform duration-300 group-hover:-translate-x-0.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            Back to sign in
          </Link>
        </MagneticPress>
      </div>
    );
  }

  return (
    <div className="w-full relative">
      <AuthStagger baseDelay={260} stagger={90}>
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[10px] text-white/40 uppercase tracking-[0.24em]">
              Recovery
            </span>
            <span className="h-px flex-1 bg-gradient-to-r from-white/15 to-transparent" />
          </div>
          <h1 className="text-[28px] leading-tight font-semibold text-white tracking-tight">
            Reset password
            <span className="text-white/40">.</span>
          </h1>
          <p className="text-sm text-white/50 mt-2 leading-relaxed">
            We&apos;ll email you a secure reset link.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
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

          <MagneticPress strength={5} className="block mt-3">
            <Button type="submit" fullWidth isLoading={isLoading} size="lg">
              <span className="inline-flex items-center gap-2">
                Send reset link
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
