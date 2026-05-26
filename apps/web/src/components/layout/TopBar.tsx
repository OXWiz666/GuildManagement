"use client";

import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { useTheme } from "@/lib/theme-context";
import Avatar from "../ui/Avatar";

interface TopBarProps {
  onMenuToggle: () => void;
}

export default function TopBar({ onMenuToggle }: TopBarProps) {
  const { user, logout } = useAuth();
  const { resolvedTheme, setTheme } = useTheme();
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        userMenuRef.current &&
        !userMenuRef.current.contains(e.target as Node)
      ) {
        setIsUserMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Track main-area scroll for shadow elevation
  useEffect(() => {
    const main = document.querySelector("main");
    if (!main) return;
    const onScroll = () => setScrolled(main.scrollTop > 4);
    onScroll();
    main.addEventListener("scroll", onScroll, { passive: true });
    return () => main.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-40 h-16 flex items-center px-6 lg:px-8 gap-4 transition-all duration-300 ${
        scrolled
          ? "bg-[#08080a]/85 backdrop-blur-xl border-b border-white/[0.08] shadow-[0_8px_24px_-12px_rgba(0,0,0,0.6)]"
          : "bg-[#08080a]/60 backdrop-blur-lg border-b border-white/[0.04]"
      }`}
    >
      {/* Animated bottom hairline */}
      <span
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-px pointer-events-none"
        style={{
          background:
            "linear-gradient(90deg, transparent, oklch(1 0 0 / 0.10), transparent)",
        }}
      />
      {/* Mobile menu button */}
      <button
        onClick={onMenuToggle}
        className="lg:hidden relative text-white/55 hover:text-white transition-colors p-2 rounded-md hover:bg-white/[0.05] cursor-pointer"
        aria-label="Open menu"
      >
        <svg
          className="h-[22px] w-[22px]"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        >
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>


      {/* Spacer */}
      <div className="flex-1" />

      {/* Theme toggle */}
      <button
        onClick={() =>
          setTheme(resolvedTheme === "dark" ? "light" : "dark")
        }
        className="p-2 rounded-md text-white/55 hover:text-white hover:bg-white/[0.05] transition-colors cursor-pointer"
        aria-label={`Switch to ${resolvedTheme === "dark" ? "light" : "dark"} mode`}
      >
        {resolvedTheme === "dark" ? (
          <svg
            className="h-[18px] w-[18px]"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="5" />
            <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
          </svg>
        ) : (
          <svg
            className="h-[18px] w-[18px]"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
          </svg>
        )}
      </button>

      {/* Notification bell placeholder */}
      <button
        className="p-2 rounded-md text-white/55 hover:text-white hover:bg-white/[0.05] transition-colors cursor-pointer relative"
        aria-label="Notifications"
      >
        <svg
          className="h-[18px] w-[18px]"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" />
        </svg>
        <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_1px_rgba(52,211,153,0.5)]">
          <span className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-60" />
        </span>
      </button>

      {/* User Menu */}
      {user && (
        <div className="relative" ref={userMenuRef}>
          <button
            onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
            className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-white/[0.05] transition-all duration-200 cursor-pointer ml-1 border border-transparent hover:border-white/[0.06]"
            aria-expanded={isUserMenuOpen}
            aria-haspopup="menu"
          >
            <Avatar name={user.displayName} size="sm" showStatus isOnline />
            <span className="text-[13px] font-medium text-white/85 hidden md:block">
              {user.displayName}
            </span>
            <svg
              className={`h-3.5 w-3.5 text-white/40 transition-transform duration-300 ${isUserMenuOpen ? "rotate-180" : ""}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>

          {isUserMenuOpen && (
            <div
              role="menu"
              className="absolute top-full right-0 mt-2 w-56 glass-strong rounded-xl border border-white/[0.08] shadow-[0_30px_60px_-20px_rgba(0,0,0,0.7)] py-1.5 animate-scale-in z-50"
            >
              <div className="px-3.5 py-2.5 border-b border-white/[0.06]">
                <p className="text-[12px] font-medium text-white">
                  {user.displayName}
                </p>
                <p className="text-[10px] text-white/40 truncate mt-0.5">
                  {user.email}
                </p>
              </div>

              <a
                href="/dashboard/settings"
                role="menuitem"
                className="flex items-center gap-2.5 px-3.5 py-2 text-[12px] text-white/60 hover:text-white hover:bg-white/[0.05] transition-colors cursor-pointer mt-1"
                onClick={() => setIsUserMenuOpen(false)}
              >
                <svg
                  className="h-3.5 w-3.5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
                </svg>
                Settings
              </a>

              <button
                role="menuitem"
                onClick={async () => {
                  setIsUserMenuOpen(false);
                  await logout();
                  window.location.href = "/login";
                }}
                className="w-full flex items-center gap-2.5 px-3.5 py-2 text-[12px] text-red-400/80 hover:text-red-400 hover:bg-red-500/[0.05] transition-colors cursor-pointer"
              >
                <svg
                  className="h-3.5 w-3.5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
                </svg>
                Sign Out
              </button>
            </div>
          )}
        </div>
      )}
    </header>
  );
}
