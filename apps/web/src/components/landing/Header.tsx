"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

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
  { label: "Preview", href: "#preview" },
  { label: "Process", href: "#how-it-works" },
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
            ? "max-w-3xl px-2 py-2 glass-strong rounded-full border border-white/[0.08] shadow-[0_10px_40px_-12px_rgba(0,0,0,0.5)]"
            : "max-w-6xl px-4 py-3"
        }`}
      >
        <div className="flex items-center justify-between gap-4">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 shrink-0 group pl-2">
            <div className="relative h-7 w-7 rounded-lg border border-white/10 bg-white/[0.04] flex items-center justify-center transition-colors group-hover:border-white/25 group-hover:bg-white/[0.07]">
              <svg className="h-3.5 w-3.5 text-white" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
              </svg>
            </div>
            <span className="text-[15px] font-semibold text-white tracking-tight">
              ForgeKeep
            </span>
          </Link>

          {/* Desktop links */}
          <div className="hidden md:flex items-center gap-1">
            {NAV_LINKS.map((l) => (
              <a
                key={l.label}
                href={l.href}
                className="px-3 py-1.5 text-[13px] text-white/55 hover:text-white transition-colors rounded-full hover:bg-white/[0.06]"
              >
                {l.label}
              </a>
            ))}
          </div>

          {/* Desktop CTAs */}
          <div className="hidden md:flex items-center gap-2 shrink-0">
            <Link
              href="/login"
              className="px-3 py-1.5 text-[13px] text-white/70 hover:text-white transition-colors"
            >
              Sign in
            </Link>
            <Link
              href="/register"
              className="group inline-flex items-center gap-1.5 px-4 py-1.5 text-[13px] font-medium rounded-full bg-white text-black hover:bg-white/90 transition-all duration-200"
            >
              Get started
              <svg
                className="h-3 w-3 transition-transform duration-200 group-hover:translate-x-0.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
              >
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </Link>
          </div>

          {/* Mobile burger */}
          <button
            className="md:hidden p-2 rounded-full text-white/60 hover:text-white hover:bg-white/[0.06] transition-colors"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle menu"
          >
            {mobileOpen ? (
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 12h18M3 6h18M3 18h18" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden mx-4 mt-2 glass-strong rounded-2xl border border-white/[0.08] p-3 animate-slide-down">
          <div className="space-y-0.5">
            {NAV_LINKS.map((l) => (
              <a
                key={l.label}
                href={l.href}
                className="block px-4 py-2.5 text-sm text-white/70 hover:text-white hover:bg-white/[0.05] rounded-xl transition-colors"
                onClick={() => setMobileOpen(false)}
              >
                {l.label}
              </a>
            ))}
          </div>
          <div className="mt-3 pt-3 border-t border-white/[0.06] flex flex-col gap-2">
            <Link
              href="/login"
              className="block text-center px-4 py-2.5 text-sm text-white/80 hover:text-white border border-white/[0.08] hover:border-white/15 rounded-xl transition-colors"
              onClick={() => setMobileOpen(false)}
            >
              Sign in
            </Link>
            <Link
              href="/register"
              className="block text-center px-4 py-2.5 text-sm font-medium text-black bg-white hover:bg-white/90 rounded-xl transition-colors"
              onClick={() => setMobileOpen(false)}
            >
              Get started
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}
