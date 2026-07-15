"use client";

import { useState, useRef, useEffect, useMemo, memo } from "react";
import Image from "next/image";
import { useAuth } from "@/lib/auth-context";
import { useTheme } from "@/lib/theme-context";
import Avatar from "../ui/Avatar";
import { dashboardApi, notificationApi, type BossScheduleData, type BossRotationItem, type BossRotationResponse, type NotificationData } from "@/lib/api";
import { useSocket } from "@/components/providers/socket-provider";
import { getRealtimeBossTimer } from "@guild/shared";
import { useQuery, queryClient } from "@/lib/query";

interface TopBarProps {
  onMenuToggle: () => void;
}

export default function TopBar({ onMenuToggle }: TopBarProps) {
  const { user, logout } = useAuth();
  const { socket } = useSocket();
  const { resolvedTheme, setTheme } = useTheme();
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const notificationMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        userMenuRef.current &&
        !userMenuRef.current.contains(e.target as Node)
      ) {
        setIsUserMenuOpen(false);
      }
      if (
        notificationMenuRef.current &&
        !notificationMenuRef.current.contains(e.target as Node)
      ) {
        setIsNotificationsOpen(false);
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

  const activeGuild = user?.guilds?.[0];

  const notificationsKey = user ? `notifications:${user.id}` : "notifications_empty";
  const { data: notificationsData } = useQuery<{ notifications: NotificationData[]; unreadCount: number }>(
    notificationsKey,
    async () => {
      if (!user) return { notifications: [], unreadCount: 0 };
      const result = await notificationApi.getNotifications(20);
      return result.success && result.data ? result.data : { notifications: [], unreadCount: 0 };
    },
    { staleTime: 20000, enabled: !!user },
  );
  const notifications = notificationsData?.notifications ?? [];
  const unreadCount = notificationsData?.unreadCount ?? 0;

  // Push real-time notifications straight into the cache (optimistic write) —
  // every consumer of `notificationsKey` re-renders instantly, no refetch.
  useEffect(() => {
    if (!socket || !user) return;

    const handleNotification = (payload: NotificationData) => {
      queryClient.setQueryData<{ notifications: NotificationData[]; unreadCount: number }>(
        notificationsKey,
        (old) => {
          const prevList = old?.notifications ?? [];
          return {
            notifications: [payload, ...prevList.filter((item) => item.id !== payload.id)].slice(0, 20),
            unreadCount: (old?.unreadCount ?? 0) + (payload.readAt ? 0 : 1),
          };
        },
      );
    };

    socket.on("notification_created", handleNotification);
    return () => {
      socket.off("notification_created", handleNotification);
    };
  }, [socket, user, notificationsKey]);

  async function markNotificationRead(notificationId: string) {
    const { rollback } = queryClient.setQueryData<{ notifications: NotificationData[]; unreadCount: number }>(
      notificationsKey,
      (old) => ({
        notifications: (old?.notifications ?? []).map((item) =>
          item.id === notificationId ? { ...item, readAt: item.readAt || new Date().toISOString() } : item,
        ),
        unreadCount: Math.max(0, (old?.unreadCount ?? 0) - 1),
      }),
    );

    const result = await notificationApi.markRead(notificationId);
    if (!result.success) rollback();
  }

  async function markAllNotificationsRead() {
    const { rollback } = queryClient.setQueryData<{ notifications: NotificationData[]; unreadCount: number }>(
      notificationsKey,
      (old) => ({
        notifications: (old?.notifications ?? []).map((item) => ({
          ...item,
          readAt: item.readAt || new Date().toISOString(),
        })),
        unreadCount: 0,
      }),
    );

    const result = await notificationApi.markAllRead();
    if (!result.success) rollback();
  }

  // Next-boss widget shares its cache keys with boss-rotation/page.tsx and
  // boss-schedule/page.tsx — whichever loads first warms the cache for both,
  // so this never duplicates a request the user's other tabs already made.
  const bossSchedulesKey = activeGuild ? `boss_schedules:${activeGuild.guildId}` : "boss_schedules_empty";
  const bossRotationKey = activeGuild ? `boss_rotation_v2:${activeGuild.guildId}` : "boss_rotation_empty";

  const { data: schedulesRaw } = useQuery<BossScheduleData[]>(
    bossSchedulesKey,
    async () => {
      if (!activeGuild) return [];
      const result = await dashboardApi.getBossSchedules(activeGuild.guildId);
      return result.success && result.data?.schedules ? result.data.schedules : [];
    },
    { persist: true, staleTime: 15000, enabled: !!activeGuild },
  );

  const { data: rotationData } = useQuery<BossRotationResponse>(
    bossRotationKey,
    async () => {
      if (!activeGuild) {
        return { serverTime: new Date().toISOString(), canManage: false, viewerRole: "MEMBER", factionId: null, guilds: [], rotations: [] };
      }
      const result = await dashboardApi.getBossRotation(activeGuild.guildId);
      return result.success && result.data
        ? result.data
        : { serverTime: new Date().toISOString(), canManage: false, viewerRole: "MEMBER", factionId: null, guilds: [], rotations: [] };
    },
    { persist: true, staleTime: 10000, enabled: !!activeGuild },
  );

  // Fetch next upcoming boss schedule
  const guildSchedules = useMemo(() => {
    const guildId = activeGuild?.guildId;
    if (!guildId || !schedulesRaw) return [];

    const rotByBoss = new Map<string, BossRotationItem>();
    for (const rot of rotationData?.rotations ?? []) {
      rotByBoss.set(rot.bossName.toLowerCase(), rot);
    }

    return schedulesRaw
      .filter((s) => s.status !== "KILLED")
      .filter((s) => {
        // A non-null `guildId` means this schedule row is a guild-specific
        // spawn instance and belongs to that guild outright — check this
        // FIRST, since the rotation's `currentGuild` is a cross-guild
        // "whose turn in the shared queue" pointer and must not override it.
        if (s.guildId) return s.guildId === guildId;
        const rot = rotByBoss.get(s.bossName.toLowerCase());
        const ownerId = s.guildTurnGuildId || rot?.currentGuild?.id || null;
        return ownerId === guildId;
      })
      .sort((a, b) => new Date(a.spawnTime).getTime() - new Date(b.spawnTime).getTime());
  }, [activeGuild, schedulesRaw, rotationData]);

  // Listen to real-time events to refresh the next boss widget instantly (0 polling)
  useEffect(() => {
    if (!socket || !activeGuild) return;
    const handleUpdate = () => {
      queryClient.invalidateQueries(bossSchedulesKey);
      queryClient.invalidateQueries(bossRotationKey);
    };

    socket.on("boss_rotation_updated", handleUpdate);
    socket.on("boss_schedule_deleted", handleUpdate);
    return () => {
      socket.off("boss_rotation_updated", handleUpdate);
      socket.off("boss_schedule_deleted", handleUpdate);
    };
  }, [activeGuild, socket, bossSchedulesKey, bossRotationKey]);

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

      {/* Faction Context (Left Area) */}
      <div className="hidden sm:flex flex-col text-left">
        <span className="text-[10px] text-[var(--forge-gold)] font-bold uppercase tracking-[0.2em] font-fantasy">
          {activeGuild?.factionName || "Unaffiliated"}
        </span>
        <span className="text-[12px] text-white/50 font-medium tracking-wide">
           Guild of {activeGuild ? activeGuild.guildName : "—"}
        </span>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* COMMAND CENTER WIDGETS (Middle-Right area) — self-ticking, see
          CommandCenterWidgets: keeps the per-second clock/countdown isolated
          instead of re-rendering the whole TopBar (present on every
          dashboard page) every second. */}
      <CommandCenterWidgets guildSchedules={guildSchedules} />

      {/* Global Actions (Far-Right) */}
      <div className="flex items-center gap-2">
        {/* Notification bell */}
        <div className="relative" ref={notificationMenuRef}>
          <button
            onClick={() => setIsNotificationsOpen((prev) => !prev)}
            className="p-2 rounded-md text-white/55 hover:text-[var(--forge-gold)] hover:bg-[var(--forge-glow)] transition-colors cursor-pointer relative focus-ring"
            aria-label="Notifications"
            aria-expanded={isNotificationsOpen}
            aria-haspopup="menu"
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
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-[var(--forge-gold)] text-black text-[9px] font-bold flex items-center justify-center shadow-[0_0_6px_1px_rgba(212,168,83,0.5)]">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>

          {isNotificationsOpen && (
            <div
              role="menu"
              className="absolute top-full right-0 mt-2 w-[300px] max-w-[calc(100vw-2rem)] glass-strong rounded-lg border border-[var(--metal-border)] shadow-[0_30px_60px_-20px_rgba(0,0,0,0.7)] animate-scale-in z-50 overflow-hidden"
            >
              <div className="flex items-center justify-between gap-3 px-3 py-2 border-b border-white/[0.06]">
                <div>
                  <p className="text-[11px] font-semibold text-white">Notifications</p>
                  <p className="text-[9px] text-white/40">{unreadCount} unread</p>
                </div>
                {unreadCount > 0 && (
                  <button
                    onClick={markAllNotificationsRead}
                    className="text-[9px] uppercase tracking-[0.14em] text-[var(--forge-gold-dim)] hover:text-[var(--forge-gold)] cursor-pointer"
                  >
                    Mark all read
                  </button>
                )}
              </div>

              <div className="max-h-[300px] overflow-y-auto p-1">
                {notifications.length === 0 ? (
                  <div className="px-4 py-6 text-center">
                    <p className="text-[11px] text-white/45">No notifications yet</p>
                  </div>
                ) : (
                  notifications.map((notification) => {
                    const unread = !notification.readAt;
                    return (
                      <button
                        key={notification.id}
                        role="menuitem"
                        onClick={() => unread && markNotificationRead(notification.id)}
                        className={`w-full text-left px-2.5 py-2 rounded-md border transition-colors cursor-pointer ${
                          unread
                            ? "bg-[var(--forge-glow)] border-[var(--forge-gold)]/18"
                            : "bg-transparent border-transparent hover:bg-white/[0.03]"
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          <span className={`mt-1 h-1.5 w-1.5 rounded-full shrink-0 ${unread ? "bg-[var(--forge-gold)]" : "bg-white/15"}`} />
                          <span className="min-w-0 flex-1">
                            <span className="block text-[11px] font-semibold text-white truncate">
                              {notification.title}
                            </span>
                            <span className="block text-[10px] text-white/50 leading-snug mt-0.5 line-clamp-2">
                              {notification.body}
                            </span>
                            <span className="block text-[9px] text-white/30 mt-1 font-mono">
                              {new Date(notification.createdAt).toLocaleString("en-US", {
                                month: "short",
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          </span>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>

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

// ─── Command Center Widgets (next-boss countdown + server clock) ───
// Owns its own 1s tick entirely internally. TopBar is mounted on every
// dashboard page, so ticking at the TopBar level re-rendered the whole
// header (notifications, user menu, etc.) every second for the sake of two
// small always-on widgets.
const CommandCenterWidgets = memo(function CommandCenterWidgets({
  guildSchedules,
}: {
  guildSchedules: BossScheduleData[];
}) {
  const [now, setNow] = useState<Date>(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formattedDate = now.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });

  const formattedTime = now.toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });

  const offsetMinutes = -now.getTimezoneOffset();
  const offsetHours = Math.floor(Math.abs(offsetMinutes) / 60);
  const offsetSign = offsetMinutes >= 0 ? "+" : "-";
  const timezoneStr = `UTC ${offsetSign}${offsetHours}`;

  // Pick the guild's truly-soonest boss every tick. An overdue spawn rolls
  // forward along its real respawn cycle (same shared helper the dashboard's
  // "Next boss spawn · your guild" carousel uses) instead of freezing on
  // "LIVE" forever, so the ordering can change as time passes.
  const nextBossInfo = useMemo(() => {
    if (guildSchedules.length === 0) return null;
    let best: { boss: BossScheduleData; timer: ReturnType<typeof getRealtimeBossTimer> } | null = null;
    for (const s of guildSchedules) {
      const timer = getRealtimeBossTimer(s.bossName, s.spawnTime, now.getTime(), { status: s.status });
      if (!best || timer.nextSpawn < best.timer.nextSpawn) best = { boss: s, timer };
    }
    return best;
  }, [guildSchedules, now]);

  const nextBoss = nextBossInfo?.boss ?? null;
  const countdown = nextBossInfo ? { text: nextBossInfo.timer.text, warning: nextBossInfo.timer.warning } : null;

  return (
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
          <div className="relative h-9 w-9 rounded-lg bg-[var(--obsidian-deep)] border border-[var(--metal-border)] flex items-center justify-center overflow-hidden shrink-0">
            {nextBoss.bossImageUrl ? (
              <Image
                src={nextBoss.bossImageUrl}
                alt={nextBoss.bossName}
                fill
                sizes="36px"
                className="object-cover"
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
  );
});
