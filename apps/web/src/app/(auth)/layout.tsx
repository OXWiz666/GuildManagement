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
      <div className="min-h-screen bg-[#08080a] flex flex-col items-center justify-center gap-6 animate-fade-in relative overflow-hidden">
        <SceneBackground intensity="subtle" />
        {/* Ambient background glows */}
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(circle 350px at 50% 50%, rgba(245,158,11,0.08) 0%, transparent 100%)",
            filter: "blur(60px)",
          }}
        />

        {/* Premium Spinner and Brand Slot */}
        <div className="relative flex flex-col items-center gap-6 z-10">
          
          {/* Glowing Spinner Container */}
          <div className="relative h-24 w-24 flex items-center justify-center">
            
            {/* Outer Slow Ambient Orbit */}
            <div className="absolute -inset-3.5 rounded-full border border-amber-500/5 premium-loader-spin-slow" />
            
            {/* Outer Orbiting Dot (butter smooth) */}
            <div className="absolute -inset-3.5 rounded-full premium-loader-spin-reverse pointer-events-none">
              <span className="absolute h-1.5 w-1.5 rounded-full bg-amber-400 shadow-[0_0_12px_3px_rgba(245,158,11,0.7)] top-0 left-1/2 -translate-x-1/2 -translate-y-1/2" />
            </div>

            {/* Inner Ring Glass Shield */}
            <div className="absolute inset-0 rounded-2xl border border-white/[0.04] bg-white/[0.01] backdrop-blur-sm" />
            
            {/* Elegant Spinning Arc (GPU-accelerated SVG) */}
            <svg className="absolute inset-0 h-full w-full premium-loader-spin" viewBox="0 0 100 100">
              <defs>
                <linearGradient id="spinner-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#f59e0b" stopOpacity="1" />
                  <stop offset="60%" stopColor="#f59e0b" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
                </linearGradient>
              </defs>
              <circle
                cx="50"
                cy="50"
                r="42"
                stroke="url(#spinner-grad)"
                strokeWidth="2.5"
                strokeLinecap="round"
                fill="none"
                strokeDasharray="180 100"
              />
            </svg>

            {/* Center Brand Icon (Breathing Shield) */}
            <svg
              className="h-7 w-7 text-amber-400 premium-loader-pulse relative z-10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              <path d="M8 9h8" />
              <path d="M10 9v4l-2 2h8l-2-2V9" />
            </svg>
          </div>

          {/* Typing/Shimmering Branding */}
          <div className="flex flex-col items-center gap-2 text-center">
            <h2
              className="text-[17px] font-extrabold uppercase tracking-[0.16em] leading-none"
              style={{
                background: "linear-gradient(90deg, #fff, #f6e3a9, #f59e0b)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              ForgeKeep
            </h2>
            <div className="relative">
              <p className="text-[10px] text-amber-500/50 font-bold tracking-[0.35em] uppercase premium-loader-pulse">
                Entering Session
              </p>
              {/* Gold dots loading indicator */}
              <span className="absolute -right-6 bottom-0.5 flex gap-1 items-center">
                <span className="h-1 w-1 rounded-full bg-amber-400/80 animate-ping animate-duration-1000" style={{ animationDelay: '0ms' }} />
                <span className="h-1 w-1 rounded-full bg-amber-400/80 animate-ping animate-duration-1000" style={{ animationDelay: '300ms' }} />
                <span className="h-1 w-1 rounded-full bg-amber-400/80 animate-ping animate-duration-1000" style={{ animationDelay: '600ms' }} />
              </span>
            </div>
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
              <span className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 h-1 w-1 rounded-full bg-amber-400 shadow-[0_0_6px_2px_rgba(245,158,11,0.5)]" />
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
            <span className="text-[9px] text-amber-500/60 tracking-[0.22em] uppercase mt-0.5 transition-colors duration-300 group-hover:text-amber-400/80">
              Enter Guild Dashboard
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
