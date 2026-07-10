"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import Link from "next/link";
import SceneBackground from "@/components/common/SceneBackground";
import AuthCard from "@/components/auth/AuthCard";
import { MagneticPress } from "@/components/auth/AuthAnim";
import Logo, { LogoMark, LogoTagline, TAGLINE } from "@/components/common/Logo";

// ═══════════════════════════════════════════════════════════
// AUTH BACKDROP — same cinematic lighting as the landing hero:
// a top forge-glow wash, drifting glow orbs, aurora tint,
// hairline rune grid, edge vignette, and grain. Sits at z-0
// above the opaque page fill, below the header/form content.
// ═══════════════════════════════════════════════════════════
function AuthBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      {/* Top forge-glow + floor shadow */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 100% 60% at 50% -10%, rgba(212,168,83,0.12) 0%, transparent 58%), radial-gradient(ellipse 90% 50% at 50% 112%, rgba(8,8,14,0.8) 0%, transparent 72%)",
        }}
      />

      {/* Drifting glow orbs (gold + steel-blue depth) */}
      <div
        className="absolute -left-[10%] top-[6%] h-[540px] w-[540px] rounded-full"
        style={{ background: "radial-gradient(circle, rgba(212,168,83,0.10) 0%, transparent 65%)", filter: "blur(64px)", animation: "drift-slow 26s linear infinite" }}
      />
      <div
        className="absolute -right-[8%] bottom-[4%] h-[480px] w-[480px] rounded-full"
        style={{ background: "radial-gradient(circle, oklch(0.45 0.05 232 / 0.14) 0%, transparent 65%)", filter: "blur(72px)", animation: "drift-slow 34s linear infinite reverse" }}
      />

      {/* Aurora tint */}
      <div className="aurora-mesh-soft" style={{ opacity: 0.9 }} />

      {/* Hairline rune grid */}
      <div className="absolute inset-0 bg-grid bg-grid-fade" style={{ opacity: 0.8 }} />

      {/* Edge vignette */}
      <div className="absolute inset-0" style={{ boxShadow: "inset 0 0 220px 70px rgba(5,6,8,0.9)" }} />

      {/* Noise grain */}
      <div className="noise-overlay" />
    </div>
  );
}

const PANEL_FEATURES = [
  {
    title: "Live boss timers",
    desc: "Countdown spawns and rotation queues the whole roster watches in real time.",
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
    ),
  },
  {
    title: "Verified attendance",
    desc: "Random check-in codes turn raid turnout into fair, tamper-proof guild points.",
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M9 12l2 2 4-4" />
        <circle cx="12" cy="12" r="9" />
      </svg>
    ),
  },
  {
    title: "Audited treasury",
    desc: "Every loot sale and payout split lands in an append-only ledger you can prove.",
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M3 10h18M7 15h4" />
      </svg>
    ),
  },
];

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace(user?.platformRole ? "/admin" : "/dashboard");
    }
  }, [isAuthenticated, isLoading, user, router]);

  if (isLoading) {
    return (
      <div className="min-h-[100dvh] bg-[#08080a] flex flex-col items-center justify-center gap-6 animate-fade-in relative overflow-hidden">
        <SceneBackground intensity="subtle" />
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{ background: "radial-gradient(circle 350px at 50% 50%, rgba(245,158,11,0.08) 0%, transparent 100%)", filter: "blur(60px)" }}
        />
        <div className="relative flex flex-col items-center gap-6 z-10">
          <div className="relative h-24 w-24 flex items-center justify-center">
            <div className="absolute -inset-3.5 rounded-full border border-amber-500/5 premium-loader-spin-slow" />
            <div className="absolute -inset-3.5 rounded-full premium-loader-spin-reverse pointer-events-none">
              <span className="absolute h-1.5 w-1.5 rounded-full bg-amber-400 shadow-[0_0_12px_3px_rgba(245,158,11,0.7)] top-0 left-1/2 -translate-x-1/2 -translate-y-1/2" />
            </div>
            <div className="absolute inset-0 rounded-2xl border border-white/[0.04] bg-white/[0.01] backdrop-blur-sm" />
            <svg className="absolute inset-0 h-full w-full premium-loader-spin" viewBox="0 0 100 100">
              <defs>
                <linearGradient id="spinner-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#f59e0b" stopOpacity="1" />
                  <stop offset="60%" stopColor="#f59e0b" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
                </linearGradient>
              </defs>
              <circle cx="50" cy="50" r="42" stroke="url(#spinner-grad)" strokeWidth="2.5" strokeLinecap="round" fill="none" strokeDasharray="180 100" />
            </svg>
            <LogoMark className="h-8 w-8 premium-loader-pulse relative z-10" animated={false} />
          </div>
          <div className="flex flex-col items-center gap-2 text-center">
            <h2 className="text-[17px] font-extrabold uppercase tracking-[0.16em] leading-none text-gold-gradient-light">
              ForgeKeep
            </h2>
            <p className="text-[10px] text-amber-500/50 font-bold tracking-[0.35em] uppercase premium-loader-pulse">
              Entering the keep
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (isAuthenticated) return null;

  return (
    <div className="relative isolate flex min-h-[100dvh] w-full flex-col overflow-hidden bg-[#050608] selection:bg-white/15 selection:text-white">
      <AuthBackdrop />

      {/* ── TOP BAR ─────────────────────────────────────────── */}
      <header
        className="relative z-20 flex items-center justify-between px-6 py-6 md:px-10"
        style={{ animation: "fade-in 0.8s ease both" }}
      >
        <Link href="/" className="group inline-flex" style={{ animation: "slide-in-left 0.7s cubic-bezier(0.16,1,0.3,1) both" }}>
          <Logo size={36} descriptor="Guild Command" />
        </Link>

        <MagneticPress strength={6}>
          <Link
            href="/"
            className="group inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.02] px-3.5 py-1.5 text-xs text-white/60 transition-all duration-300 hover:border-white/25 hover:bg-white/[0.05] hover:text-white"
            style={{ animation: "slide-in-right 0.7s cubic-bezier(0.16,1,0.3,1) both", animationDelay: "120ms" }}
          >
            <svg className="h-3 w-3 transition-transform duration-300 group-hover:-translate-x-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            Back to home
          </Link>
        </MagneticPress>
      </header>

      {/* ── MAIN ─────────────────────────────────────────────── */}
      <main className="relative z-10 flex flex-1 items-center justify-center px-4 py-6 sm:px-6 md:py-10">
        <div className="grid w-full max-w-6xl items-center gap-10 lg:grid-cols-2 lg:gap-20">

          {/* ── Left cinematic keep panel — desktop only ──────── */}
          <div
            className="relative hidden flex-col gap-10 lg:flex"
            style={{ animation: "slide-in-left 0.9s cubic-bezier(0.16,1,0.3,1) both", animationDelay: "120ms" }}
          >
            {/* Portal staging */}
            <div aria-hidden className="pointer-events-none absolute -left-16 -top-24 -z-10 h-[520px] w-[520px]">
              <div
                className="forge-portal absolute inset-0 rounded-full"
                style={{ background: "radial-gradient(circle, rgba(245,197,66,0.1) 0%, rgba(212,168,83,0.04) 36%, transparent 66%)", filter: "blur(26px)" }}
              />
              <svg viewBox="0 0 200 200" className="rune-orbit absolute inset-0 h-full w-full text-[#d4a853] opacity-[0.06]">
                <circle cx="100" cy="100" r="94" fill="none" stroke="currentColor" strokeWidth="0.3" strokeDasharray="34 10 6 10" />
                <polygon points="100,20 168,140 32,140" fill="none" stroke="currentColor" strokeWidth="0.3" />
              </svg>
            </div>

            <LogoTagline size={48} />

            <h2 className="font-fantasy text-[42px] font-semibold leading-[1.05] tracking-[-0.03em] text-white">
              Command your guild
              <br />
              from one <span className="text-gold-sheen">keep.</span>
            </h2>

            <div className="flex flex-col gap-5">
              {PANEL_FEATURES.map((f) => (
                <div key={f.title} className="group flex items-start gap-3.5">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-[#d4a853]/20 bg-white/[0.02] text-[#f5c542] transition-all duration-300 group-hover:border-[#d4a853]/45 group-hover:bg-[#d4a853]/5">
                    {f.icon}
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-white">{f.title}</p>
                    <p className="mt-0.5 max-w-xs text-xs leading-relaxed text-[#8B8F98]">{f.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Live proof strip */}
            <div className="flex items-center gap-5 pt-1 text-[11px]">
              <span className="inline-flex items-center gap-2 text-white/55">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" style={{ animation: "live-breathe 2.4s ease-in-out infinite" }} />
                <strong className="font-mono font-bold text-white">20+</strong> guilds operating
              </span>
              <span className="h-3 w-px bg-white/10" />
              <span className="text-white/55">
                <strong className="font-mono font-bold text-white">150+</strong> adventurers coordinated
              </span>
            </div>
          </div>

          {/* ── Right form column ─────────────────────────────── */}
          <div className="relative mx-auto w-full max-w-[440px] lg:mx-0">
            {/* Mobile brand line */}
            <div className="mb-6 flex items-center justify-center gap-2.5 lg:hidden">
              <span className="h-px w-6 bg-gradient-to-r from-transparent to-[#d4a853]/50" />
              <span className="text-[10px] font-medium tracking-[0.04em] text-[var(--forge-gold)]/75">{TAGLINE}</span>
              <span className="h-px w-6 bg-gradient-to-l from-transparent to-[#d4a853]/50" />
            </div>

            {/* Halo */}
            <div
              aria-hidden
              className="pointer-events-none absolute -inset-10 rounded-[2.4rem]"
              style={{ background: "radial-gradient(circle 320px at 50% 30%, rgba(245,184,65,0.05) 0%, transparent 100%)", filter: "blur(32px)", animation: "pulse-soft 6s ease-in-out infinite" }}
            />

            <AuthCard>{children}</AuthCard>

            {/* Trust strip */}
            <div
              className="mt-6 flex items-center justify-center gap-5 text-[10px] uppercase tracking-[0.18em] text-white/35"
              style={{ animation: "slide-up 0.8s cubic-bezier(0.16,1,0.3,1) both", animationDelay: "560ms" }}
            >
              <span className="inline-flex items-center gap-1.5 transition-colors hover:text-white/60">
                <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" />
                  <path d="M7 11V7a5 5 0 0110 0v4" />
                </svg>
                Encrypted
              </span>
              <span className="h-3 w-px bg-white/10" />
              <span className="transition-colors hover:text-white/60">SOC 2 Ready</span>
              <span className="h-3 w-px bg-white/10" />
              <span className="inline-flex items-center gap-1.5 transition-colors hover:text-white/60">
                <span className="h-1 w-1 rounded-full bg-emerald-400/80" style={{ animation: "pulse-soft 2.4s ease-in-out infinite" }} />
                99.9% Uptime
              </span>
            </div>
          </div>

        </div>
      </main>

      {/* ── FOOTER ─────────────────────────────────────────── */}
      <footer
        className="relative z-10 flex items-center justify-between px-6 py-6 text-[10px] tracking-wide text-white/30 md:px-10"
        style={{ animation: "fade-in 1s ease both", animationDelay: "700ms" }}
      >
        <span>© 2026 ForgeKeep</span>
        <div className="flex items-center gap-4">
          <Link href="/" className="transition-colors hover:text-white/60">Privacy</Link>
          <Link href="/" className="transition-colors hover:text-white/60">Terms</Link>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1 w-1 rounded-full bg-emerald-400/80" style={{ animation: "pulse-soft 2.4s ease-in-out infinite" }} />
            All systems operational
          </span>
        </div>
      </footer>
    </div>
  );
}
