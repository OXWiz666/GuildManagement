"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import Link from "next/link";
import SceneBackground from "@/components/common/SceneBackground";
import AuthDecor from "@/components/auth/AuthDecor";
import AuthCard from "@/components/auth/AuthCard";
import { MagneticPress } from "@/components/auth/AuthAnim";
import { ScrollProgress } from "@/components/landing/LandingHelpers";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace("/dashboard");
    }
  }, [isAuthenticated, isLoading, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#08080a] relative overflow-hidden">
        <SceneBackground intensity="subtle" />
        <div className="relative flex flex-col items-center gap-5 animate-fade-in">
          {/* Orbiting authenticate ring */}
          <div className="relative h-14 w-14">
            <div className="absolute inset-0 rounded-2xl border border-white/10" />
            <div
              className="absolute inset-0 rounded-2xl border-t border-r border-white/60 animate-spin"
              style={{ animationDuration: "1.4s" }}
            />
            <div
              className="absolute -inset-3 rounded-3xl border border-white/[0.04]"
              style={{ animation: "spin-slow 8s linear infinite" }}
            >
              <span className="absolute h-1 w-1 rounded-full bg-emerald-400/90 shadow-[0_0_8px_2px_rgba(52,211,153,0.45)] top-0 left-1/2 -translate-x-1/2" />
            </div>
            <svg
              className="absolute inset-0 m-auto h-5 w-5 text-white/80"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
          </div>
          <div className="text-[10px] text-white/40 tracking-[0.32em] uppercase font-medium">
            Authenticating
          </div>
        </div>
      </div>
    );
  }

  if (isAuthenticated) return null;

  return (
    <div className="min-h-screen w-full flex flex-col bg-[#08080a] relative overflow-hidden selection:bg-white/15 selection:text-white">
      <SceneBackground />
      <ScrollProgress />

      {/* ── TOP BAR — Brand + Back link ─────────────────────── */}
      <header
        className="relative z-20 flex items-center justify-between px-6 md:px-10 py-6"
        style={{
          animation: "fade-in 0.8s ease both",
        }}
      >
        <Link
          href="/"
          className="group flex items-center gap-2.5"
          style={{
            animation: "slide-in-left 0.7s cubic-bezier(0.16,1,0.3,1) both",
          }}
        >
          {/* Animated brand mark */}
          <div className="relative h-9 w-9">
            {/* Orbit ring */}
            <div
              className="absolute -inset-1 rounded-xl border border-white/[0.08] transition-opacity duration-500 group-hover:border-white/20"
              style={{ animation: "spin-slow 14s linear infinite" }}
            >
              <span className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 h-1 w-1 rounded-full bg-white/70" />
            </div>
            <div className="absolute inset-0 rounded-lg border border-white/10 bg-white/[0.03] backdrop-blur flex items-center justify-center transition-colors group-hover:border-white/30 group-hover:bg-white/[0.07]">
              <svg
                className="h-4 w-4 text-white transition-transform duration-500 group-hover:scale-110"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
              </svg>
            </div>
          </div>
          <div className="flex flex-col leading-none">
            <span className="text-sm font-semibold text-white tracking-tight">
              ForgeKeep
            </span>
            <span className="text-[9px] text-white/40 tracking-[0.22em] uppercase mt-0.5 transition-colors duration-300 group-hover:text-white/60">
              Command Center
            </span>
          </div>
        </Link>

        <MagneticPress strength={6}>
          <Link
            href="/"
            className="group inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs text-white/60 hover:text-white border border-white/[0.08] hover:border-white/25 bg-white/[0.02] hover:bg-white/[0.05] transition-all duration-300"
            style={{
              animation: "slide-in-right 0.7s cubic-bezier(0.16,1,0.3,1) both",
              animationDelay: "120ms",
            }}
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
            Back to home
          </Link>
        </MagneticPress>
      </header>

      {/* ── MAIN — Centered card with decor halo ─────────────────── */}
      <main className="relative z-10 flex-1 flex items-center justify-center px-4 py-8 md:py-12">
        {/* Decorative floating chips & orbiting ring */}
        <AuthDecor />

        <div className="w-full max-w-[440px] relative">
          {/* Halos */}
          <div
            className="absolute -inset-10 rounded-[2.2rem] pointer-events-none"
            style={{
              background:
                "radial-gradient(ellipse 80% 60% at 50% 0%, oklch(0.62 0.035 234 / 0.16) 0%, transparent 70%)",
              filter: "blur(28px)",
              animation: "pulse-soft 6s ease-in-out infinite",
            }}
          />
          <div
            className="absolute -inset-16 rounded-[2.6rem] pointer-events-none opacity-60"
            style={{
              background:
                "radial-gradient(ellipse 60% 50% at 50% 100%, oklch(0.56 0.028 74 / 0.10) 0%, transparent 70%)",
              filter: "blur(36px)",
            }}
          />

          {/* The card */}
          <AuthCard>{children}</AuthCard>

          {/* Trust strip below card */}
          <div
            className="mt-6 flex items-center justify-center gap-5 text-[10px] text-white/35 uppercase tracking-[0.18em]"
            style={{
              animation: "slide-up 0.8s cubic-bezier(0.16,1,0.3,1) both",
              animationDelay: "560ms",
            }}
          >
            <span className="inline-flex items-center gap-1.5 transition-colors hover:text-white/60">
              <svg
                className="h-3 w-3"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <rect x="3" y="11" width="18" height="11" rx="2" />
                <path d="M7 11V7a5 5 0 0110 0v4" />
              </svg>
              Encrypted
            </span>
            <span className="h-3 w-px bg-white/10" />
            <span className="transition-colors hover:text-white/60">
              SOC 2 Ready
            </span>
            <span className="h-3 w-px bg-white/10" />
            <span className="inline-flex items-center gap-1.5 transition-colors hover:text-white/60">
              <span
                className="h-1 w-1 rounded-full bg-emerald-400/80"
                style={{ animation: "pulse-soft 2.4s ease-in-out infinite" }}
              />
              99.9% Uptime
            </span>
          </div>
        </div>
      </main>

      {/* ── FOOTER — Minimal disclaimer ─────────────────────── */}
      <footer
        className="relative z-10 px-6 md:px-10 py-6 flex items-center justify-between text-[10px] text-white/30 tracking-wide"
        style={{
          animation: "fade-in 1s ease both",
          animationDelay: "700ms",
        }}
      >
        <span>© 2026 ForgeKeep</span>
        <div className="flex items-center gap-4">
          <Link href="/" className="hover:text-white/60 transition-colors">
            Privacy
          </Link>
          <Link href="/" className="hover:text-white/60 transition-colors">
            Terms
          </Link>
          <span className="inline-flex items-center gap-1.5">
            <span
              className="h-1 w-1 rounded-full bg-emerald-400/80"
              style={{ animation: "pulse-soft 2.4s ease-in-out infinite" }}
            />
            All systems operational
          </span>
        </div>
      </footer>
    </div>
  );
}
