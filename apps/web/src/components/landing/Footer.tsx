"use client";

import Link from "next/link";

export default function Footer() {
  return (
    <footer className="border-t border-white/[0.06] pt-20 pb-10 relative bg-[#050608] overflow-hidden">
      <div className="absolute inset-0 bg-grid opacity-[0.03] bg-grid-fade pointer-events-none" />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-10 mb-16">
          {/* Brand */}
          <div className="md:col-span-5 space-y-5">
            <Link href="/" className="flex items-center gap-2.5 shrink-0 group">
              <div className="relative h-8 w-8 rounded-lg border border-white/10 bg-white/[0.03] flex items-center justify-center transition-all group-hover:border-[#d4a853]/40 group-hover:bg-[#d4a853]/5">
                {/* Spinning outer accent dot */}
                <div className="absolute -inset-0.5 rounded-lg border border-transparent group-hover:border-t-[#d4a853]/30 animate-spin-slow pointer-events-none" />
                <svg className="h-4 w-4 text-[#f5c542] transition-transform duration-500 group-hover:rotate-12" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                </svg>
              </div>
              <div className="flex flex-col leading-none">
                <span className="text-sm font-semibold text-white tracking-tight group-hover:text-[#f5c542] transition-colors">
                  ForgeKeep
                </span>
                <span className="text-[8px] text-[#d4a853]/60 tracking-[0.2em] uppercase mt-0.5 font-mono">
                  Guild Management
                </span>
              </div>
            </Link>
            
            <p className="text-xs text-[#8B8F98] leading-relaxed max-w-sm">
              The professional guild management platform for competitive MMORPG guilds.
              Built for guild leaders who want absolute operations control.
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
                  className="h-8 w-8 rounded-lg border border-white/[0.08] hover:border-[#d4a853]/30 bg-white/[0.02] hover:bg-[#d4a853]/5 text-white/55 hover:text-[#f5c542] flex items-center justify-center transition-all duration-300"
                  aria-label={s.label}
                >
                  {s.icon}
                </a>
              ))}
            </div>
          </div>

          {/* Product */}
          <div className="md:col-span-2 space-y-4">
            <p className="text-[10px] font-bold text-[#d4a853] uppercase tracking-[0.2em] font-mono">Product</p>
            <div className="space-y-2.5">
              {[
                { label: "Features Matrix", href: "#features" },
                { label: "Interactive Preview", href: "#preview" },
                { label: "Process Flow", href: "#how-it-works" },
                { label: "Citadel Pricing", href: "#pricing" },
              ].map((l) => (
                <a key={l.label} href={l.href} className="block text-xs text-white/55 hover:text-white transition-colors duration-200">
                  {l.label}
                </a>
              ))}
            </div>
          </div>

          {/* Account */}
          <div className="md:col-span-2 space-y-4">
            <p className="text-[10px] font-bold text-[#d4a853] uppercase tracking-[0.2em] font-mono">Account</p>
            <div className="space-y-2.5">
              <Link href="/login" className="block text-xs text-white/55 hover:text-white transition-colors duration-200">Sign In</Link>
              <Link href="/register" className="block text-xs text-white/55 hover:text-white transition-colors duration-200">Register</Link>
              <Link href="/dashboard" className="block text-xs text-white/55 hover:text-white transition-colors duration-200">Guild Command</Link>
            </div>
          </div>

          {/* Legal */}
          <div className="md:col-span-3 space-y-4">
            <p className="text-[10px] font-bold text-[#d4a853] uppercase tracking-[0.2em] font-mono">Legal</p>
            <div className="space-y-2.5">
              <a href="#" className="block text-xs text-white/55 hover:text-white transition-colors duration-200">Privacy Policy</a>
              <a href="#" className="block text-xs text-white/55 hover:text-white transition-colors duration-200">Terms of Service</a>
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
              className="text-[clamp(64px,16vw,220px)] font-black tracking-[-0.04em] leading-none font-fantasy select-none pointer-events-none"
              style={{
                background:
                  "linear-gradient(180deg, rgba(212, 168, 83, 0.08) 0%, transparent 75%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              FORGEKEEP
            </span>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-6 border-t border-white/[0.04]">
          <p className="text-xs text-white/35 font-mono">
            © {new Date().getFullYear()} FORGEKEEP · ALL RIGHTS RESERVED
          </p>
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[10px] font-mono text-white/35 uppercase tracking-wider">All systems operational</span>
          </div>
        </div>
      </div>
    </footer>
  );
}

