"use client";

import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { useTheme } from "@/lib/theme-context";
import Avatar from "../ui/Avatar";
import { dashboardApi, type BossScheduleData } from "@/lib/api";
import { useSocket } from "@/components/providers/socket-provider";

interface TopBarProps {
  onMenuToggle: () => void;
}

export default function TopBar({ onMenuToggle }: TopBarProps) {
  const { user, logout } = useAuth();
  const { socket } = useSocket();
  const { resolvedTheme, setTheme } = useTheme();
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Dynamic Header State
  const [nextBoss, setNextBoss] = useState<BossScheduleData | null>(null);
  const [currentTime, setCurrentTime] = useState<Date>(new Date());

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

  // Clock ticks every second
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const activeGuild = user?.guilds?.[0];

  // Fetch next upcoming boss schedule
  useEffect(() => {
    const guildId = activeGuild?.guildId;
    if (!guildId) return;
    async function loadNextBoss() {
      try {
        const result = await dashboardApi.getBossSchedules(guildId as string);
        if (result.success && result.data?.schedules) {
          const upcoming = result.data.schedules
            .filter((s) => s.status !== "KILLED")
            .sort((a, b) => new Date(a.spawnTime).getTime() - new Date(b.spawnTime).getTime());
          if (upcoming.length > 0) {
            setNextBoss(upcoming[0]);
          } else {
            setNextBoss(null);
          }
        }
      } catch (e) {
        // fail silently
      }
    }
    loadNextBoss();

    // Listen to real-time events to refresh the next boss widget instantly (0 polling)
    if (socket) {
      const handleUpdate = () => {
        console.log("[TopBar Socket]: Boss rotation changed. Refreshing next boss...");
        loadNextBoss();
      };

      socket.on("boss_rotation_updated", handleUpdate);
      socket.on("boss_schedule_deleted", handleUpdate);

      return () => {
        socket.off("boss_rotation_updated", handleUpdate);
        socket.off("boss_schedule_deleted", handleUpdate);
      };
    }
  }, [activeGuild, socket]);

  // Format Clock Values
  const formattedDate = currentTime.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });

  const formattedTime = currentTime.toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });

  // Calculate Timezone Offset String (e.g. UTC +2)
  const offsetMinutes = -currentTime.getTimezoneOffset();
  const offsetHours = Math.floor(Math.abs(offsetMinutes) / 60);
  const offsetSign = offsetMinutes >= 0 ? "+" : "-";
  const timezoneStr = `UTC ${offsetSign}${offsetHours}`;

  // Countdown Helper
  function getTickingCountdown(spawnTimeStr: string) {
    const target = new Date(spawnTimeStr).getTime();
    const diff = target - currentTime.getTime();
    if (diff <= 0) return { expired: true, text: "LIVE", warning: false };

    const hrs = Math.floor(diff / (3600 * 1000));
    const mins = Math.floor((diff % (3600 * 1000)) / (60 * 1000));
    const secs = Math.floor((diff % (60 * 1000)) / 1000);

    const hrsStr = hrs > 0 ? `${hrs}h ` : "";
    const minsStr = `${String(mins).padStart(2, "0")}m `;
    const secsStr = `${String(secs).padStart(2, "0")}s`;

    return {
      expired: false,
      text: `${hrsStr}${minsStr}${secsStr}`,
      warning: diff <= 60 * 60 * 1000 // less than 1 hour remains
    };
  }

  // Get active countdown if next boss exists
  const countdown = nextBoss ? getTickingCountdown(nextBoss.spawnTime) : null;

  return (
    <header
      className={`sticky top-0 z-40 h-20 flex items-center px-6 lg:px-8 gap-4 transition-all duration-300 ${
        scrolled
          ? "bg-[var(--obsidian-deep)]/90 backdrop-blur-xl border-b border-[var(--metal-border)] shadow-[0_8px_24px_-12px_rgba(0,0,0,0.6)]"
          : "bg-[var(--obsidian-deep)]/60 backdrop-blur-lg border-b border-white/[0.04]"
      }`}
    >
      {/* Animated bottom hairline — gold forge shimmer */}
      <span
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-px pointer-events-none"
        style={{
          background:
            "linear-gradient(90deg, transparent, rgba(212,168,83,0.18), transparent)",
        }}
      />
      
      {/* Mobile menu button */}
      <button
        onClick={onMenuToggle}
        className="lg:hidden relative text-white/55 hover:text-[var(--forge-gold)] transition-colors p-2 rounded-md hover:bg-[var(--forge-glow)] cursor-pointer"
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

      {/* Alliance Context (Left Area) */}
      <div className="hidden sm:flex flex-col text-left">
        <span className="text-[10px] text-[var(--forge-gold)] font-bold uppercase tracking-[0.2em] font-fantasy">
           MegaCorp Alliance
        </span>
        <span className="text-[12px] text-white/50 font-medium tracking-wide">
           Guild of {activeGuild ? activeGuild.guildName : "Valhalla"}
        </span>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* COMMAND CENTER WIDGETS (Middle-Right area) */}
      <div className="hidden md:flex items-center gap-5">
        {/* Next Boss Spawn Widget */}
        {nextBoss && countdown && (
          <div
            className={`flex items-center gap-3 px-4 py-2 rounded-xl border transition-all duration-300 bg-[var(--obsidian-surface)] ${
              countdown.warning
                ? "border-[var(--forge-gold)]/30 shadow-[0_0_18px_rgba(212,168,83,0.10)]"
                : "border-[var(--metal-border)]"
            }`}
            style={countdown.warning ? { animation: "glow-pulse 3s ease-in-out infinite" } : undefined}
          >
            <div className="h-9 w-9 rounded-lg bg-[var(--obsidian-deep)] border border-[var(--metal-border)] flex items-center justify-center overflow-hidden shrink-0">
              {nextBoss.bossImageUrl ? (
                <img
                  src={nextBoss.bossImageUrl}
                  alt={nextBoss.bossName}
                  className="h-full w-full object-cover"
                />
              ) : (
                <svg className="h-5 w-5 text-[var(--forge-gold-dim)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M12 2L2 7l10 5 10-5-10-5z" />
                  <path d="M2 17l10 5 10-5" />
                  <path d="M2 12l10 5 10-5" />
                </svg>
              )}
            </div>
            <div className="text-left select-none">
              <span className="block text-[8px] text-[var(--forge-gold-dim)] uppercase tracking-[0.25em] font-bold">
                Next Boss Spawn
              </span>
              <span className="block text-xs font-semibold text-white/95 leading-tight">
                {nextBoss.bossName}
              </span>
              <span
                className={`block text-[11px] font-mono leading-none mt-0.5 ${
                  countdown.warning
                    ? "text-[var(--forge-gold-bright)] font-bold"
                    : "text-emerald-400/90 font-medium"
                }`}
              >
                {countdown.text}
              </span>
            </div>
          </div>
        )}

        {/* Current Date & Time Widget */}
        <div className="flex items-center gap-3 px-4 py-2 rounded-xl border border-[var(--metal-border)] bg-[var(--obsidian-surface)]">
          <div className="h-9 w-9 rounded-lg bg-[var(--obsidian-deep)] border border-[var(--metal-border)] flex items-center justify-center shrink-0">
            <svg className="h-4 w-4 text-[var(--forge-gold)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </div>
          <div className="text-left select-none">
            <span className="block text-[8px] text-[var(--forge-gold-dim)] uppercase tracking-[0.25em] font-bold">
              Server Time
            </span>
            <span className="block text-xs font-semibold text-white/90 leading-tight">
              {formattedDate} {formattedTime.substring(0, 5)}
            </span>
            <span className="block text-[9px] text-zinc-500 font-mono leading-none mt-0.5">
              {timezoneStr}
            </span>
          </div>
        </div>
      </div>

      {/* Global Actions (Far-Right) */}
      <div className="flex items-center gap-2">
        {/* Notification bell */}
        <button
          className="p-2 rounded-md text-white/55 hover:text-[var(--forge-gold)] hover:bg-[var(--forge-glow)] transition-colors cursor-pointer relative"
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
          <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-[var(--forge-gold)] shadow-[0_0_6px_1px_rgba(212,168,83,0.5)]">
            <span className="absolute inset-0 rounded-full bg-[var(--forge-gold)] animate-ping opacity-60" />
          </span>
        </button>

        {/* User Menu */}
        {user && (
          <div className="relative" ref={userMenuRef}>
            <button
              onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
              className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-[var(--forge-glow)] transition-all duration-200 cursor-pointer ml-1 border border-transparent hover:border-[var(--metal-border)]"
              aria-expanded={isUserMenuOpen}
              aria-haspopup="menu"
            >
              <Avatar src={user.avatarUrl} name={user.displayName} size="sm" showStatus isOnline />
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
                className="absolute top-full right-0 mt-2 w-56 glass-strong rounded-xl border border-[var(--metal-border)] shadow-[0_30px_60px_-20px_rgba(0,0,0,0.7)] py-1.5 animate-scale-in z-50"
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
                  className="flex items-center gap-2.5 px-3.5 py-2 text-[12px] text-white/60 hover:text-[var(--forge-gold)] hover:bg-[var(--forge-glow)] transition-colors cursor-pointer mt-1"
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
      </div>
    </header>
  );
}
