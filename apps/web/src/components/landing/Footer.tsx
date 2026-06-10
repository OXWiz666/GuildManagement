"use client";

import Link from "next/link";

export default function Footer() {
  return (
    <footer className="border-t border-white/[0.06] pt-16 pb-10 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-10 mb-12">
          {/* Brand */}
          <div className="md:col-span-5 space-y-5">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-lg border border-white/10 bg-white/[0.04] flex items-center justify-center">
                <svg className="h-4 w-4 text-white" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                </svg>
              </div>
              <span className="text-base font-semibold text-white tracking-tight">ForgeKeep</span>
            </div>
            <p className="text-sm text-white/45 leading-relaxed max-w-sm">
              The professional guild management platform for serious gaming organizations.
              Built for leaders who demand accountability.
            </p>
            <div className="flex items-center gap-3 pt-2">
              {[
                { label: "Discord", icon: (
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M20.317 4.37a19.79 19.79 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03z" />
                  </svg>
                )},
                { label: "GitHub", icon: (
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.4 3-.405 1.02.005 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
                  </svg>
                )},
                { label: "X", icon: (
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                  </svg>
                )},
              ].map((s) => (
                <a
                  key={s.label}
                  href="#"
                  className="h-8 w-8 rounded-full border border-white/[0.08] hover:border-white/20 bg-white/[0.02] hover:bg-white/[0.05] text-white/55 hover:text-white flex items-center justify-center transition-all"
                  aria-label={s.label}
                >
                  {s.icon}
                </a>
              ))}
            </div>
          </div>

          {/* Product */}
          <div className="md:col-span-2 space-y-4">
            <p className="text-[10px] font-medium text-white/50 uppercase tracking-[0.22em]">Product</p>
            <div className="space-y-2.5">
              {[
                { label: "Features", href: "#features" },
                { label: "Preview", href: "#preview" },
                { label: "Process", href: "#how-it-works" },
                { label: "Pricing", href: "#pricing" },
              ].map((l) => (
                <a key={l.label} href={l.href} className="block text-sm text-white/55 hover:text-white transition-colors">
                  {l.label}
                </a>
              ))}
            </div>
          </div>

          {/* Account */}
          <div className="md:col-span-2 space-y-4">
            <p className="text-[10px] font-medium text-white/50 uppercase tracking-[0.22em]">Account</p>
            <div className="space-y-2.5">
              <Link href="/login" className="block text-sm text-white/55 hover:text-white transition-colors">Sign in</Link>
              <Link href="/register" className="block text-sm text-white/55 hover:text-white transition-colors">Register</Link>
              <Link href="/dashboard" className="block text-sm text-white/55 hover:text-white transition-colors">Dashboard</Link>
            </div>
          </div>

          {/* Legal */}
          <div className="md:col-span-3 space-y-4">
            <p className="text-[10px] font-medium text-white/50 uppercase tracking-[0.22em]">Legal</p>
            <div className="space-y-2.5">
              <a href="#" className="block text-sm text-white/55 hover:text-white transition-colors">Privacy policy</a>
              <a href="#" className="block text-sm text-white/55 hover:text-white transition-colors">Terms of service</a>
              <a href="#" className="block text-sm text-white/55 hover:text-white transition-colors">Security</a>
            </div>
          </div>
        </div>

        {/* Wordmark divider */}
        <div className="relative my-10">
          <div className="hr-shine" />
          <div
            aria-hidden
            className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center select-none pointer-events-none"
          >
            <span
              className="text-[clamp(64px,16vw,220px)] font-semibold tracking-[-0.04em] leading-none"
              style={{
                background:
                  "linear-gradient(180deg, oklch(1 0 0 / 0.05) 0%, transparent 70%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              FORGEKEEP
            </span>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4">
          <p className="text-xs text-white/35">
            © {new Date().getFullYear()} ForgeKeep. Crafted for high-performance factions.
          </p>
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs text-white/35">All systems operational</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
