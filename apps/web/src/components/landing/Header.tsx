"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Logo from "@/components/common/Logo";

function useScrolled(threshold = 24) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const h = () => setScrolled(window.scrollY > threshold);
    window.addEventListener("scroll", h, { passive: true });
    h();
    return () => window.removeEventListener("scroll", h);
  }, [threshold]);
  return scrolled;
}

const NAV_LINKS = [
  { label: "Features", href: "#features" },
  { label: "Live Preview", href: "#preview" },
  { label: "How It Works", href: "#how-it-works" },
  { label: "Pricing", href: "#pricing" },
];

export default function Header() {
  const scrolled = useScrolled();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <nav
      className={`fixed inset-x-0 z-50 transition-all duration-500 ease-out ${
        scrolled ? "top-3" : "top-5"
      }`}
    >
      <div
        className={`mx-auto transition-all duration-500 ease-out ${
          scrolled
            ? "max-w-3xl px-2 py-2 glass-obsidian rounded-full shadow-[0_12px_40px_-12px_rgba(0,0,0,0.8),0_0_15px_rgba(212,168,83,0.08)]"
            : "max-w-6xl px-4 py-3"
        }`}
      >
        <div className="flex items-center justify-between gap-4">
          {/* Logo */}
          <Link href="/" className="shrink-0 group pl-2">
            <Logo size={32} descriptor="Guild Command" />
          </Link>

          {/* Desktop links */}
          <div className="hidden md:flex items-center gap-1">
            {NAV_LINKS.map((l) => (
              <a
                key={l.label}
                href={l.href}
                className="px-3.5 py-1.5 text-[13px] text-white/60 hover:text-[#f5c542] transition-all duration-300 rounded-full hover:bg-white/[0.03] relative group/item"
              >
                {l.label}
                <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-0 h-px bg-[#d4a853] transition-all duration-300 group-hover/item:w-1/2 shadow-[0_0_8px_#f5c542]" />
              </a>
            ))}
          </div>

          {/* Desktop CTAs */}
          <div className="hidden md:flex items-center gap-3 shrink-0 pr-1">
            <Link
              href="/login"
              className="px-3 py-1.5 text-[13px] text-white/70 hover:text-white hover:shadow-[0_0_8px_rgba(255,255,255,0.1)] transition-all duration-300 font-medium"
            >
              Sign in
            </Link>
            <Link
              href="/register"
              className="group inline-flex items-center gap-1.5 px-4.5 py-1.5 text-[13px] font-semibold rounded-full bg-gradient-to-r from-[#d4a853] to-[#f5c542] text-[#08080c] shadow-[0_0_12px_rgba(212,168,83,0.2)] hover:shadow-[0_0_20px_rgba(212,168,83,0.4)] border border-amber-400/20 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
            >
              Start free trial
              <svg
                className="h-3 w-3 transition-transform duration-200 group-hover:translate-x-0.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
              >
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </Link>
          </div>

          {/* Mobile burger */}
          <button
            className="md:hidden p-2 rounded-full text-white/60 hover:text-[#f5c542] hover:bg-white/[0.04] transition-colors"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle menu"
          >
            {mobileOpen ? (
              <svg className="h-4.5 w-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="h-4.5 w-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 12h18M3 6h18M3 18h18" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden mx-4 mt-2 glass-obsidian rounded-2xl p-4 shadow-[0_15px_40px_rgba(0,0,0,0.9),0_0_20px_rgba(212,168,83,0.06)] animate-slide-down">
          <div className="space-y-1">
            {NAV_LINKS.map((l) => (
              <a
                key={l.label}
                href={l.href}
                className="block px-4 py-2.5 text-sm font-medium text-white/70 hover:text-[#f5c542] hover:bg-white/[0.03] rounded-xl transition-all"
                onClick={() => setMobileOpen(false)}
              >
                {l.label}
              </a>
            ))}
          </div>
          <div className="mt-4 pt-4 border-t border-white/[0.06] flex flex-col gap-2.5">
            <Link
              href="/login"
              className="block text-center px-4 py-2.5 text-sm font-medium text-white/85 hover:text-white border border-white/[0.08] hover:border-[#d4a853]/35 rounded-xl bg-white/[0.01] hover:bg-white/[0.03] transition-all"
              onClick={() => setMobileOpen(false)}
            >
              Sign in
            </Link>
            <Link
              href="/register"
              className="block text-center px-4 py-2.5 text-sm font-bold text-[#08080c] bg-gradient-to-r from-[#d4a853] to-[#f5c542] hover:shadow-[0_0_15px_rgba(212,168,83,0.3)] rounded-xl transition-all"
              onClick={() => setMobileOpen(false)}
            >
              Start free trial
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}
