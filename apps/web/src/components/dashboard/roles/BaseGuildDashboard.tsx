"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { dashboardApi, type BossScheduleData } from "@/lib/api";
import { useSocket } from "@/components/providers/socket-provider";
import { useToast } from "@/components/ui/Toast";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import DashboardDecor from "@/components/dashboard/DashboardDecor";
import { useQuery, queryClient } from "@/lib/query";
import {
  Reveal,
  StaggerReveal,
  TiltCard,
  Magnetic,
  Sparkline,
  LiveDot,
  SectionHeader,
  useCountUp,
  useReveal,
} from "@/components/dashboard/DashboardHelpers";

interface BaseGuildDashboardProps {
  role: string;
  isOfficer?: boolean;
  isGuildLeader?: boolean;
  isAdmin?: boolean;
}

export default function BaseGuildDashboard({
  role,
  isOfficer = false,
  isGuildLeader = false,
  isAdmin = false,
}: BaseGuildDashboardProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const { socket } = useSocket();

  const activeGuild = user?.guilds?.[0];

  // ─── Ticker State ────────────────
  const [currentTime, setCurrentTime] = useState(Date.now());
  const [showKillModal, setShowKillModal] = useState<BossScheduleData | null>(null);
  const [killTimeInput, setKillTimeInput] = useState("");
  const [isLoggingKill, setIsLoggingKill] = useState(false);

  // Real-time ticker
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // ─── Queries (SWR Cache + Local Storage Persistence) ───

  // 1. Boss Schedules Query
  const {
    data: bossSchedulesRaw,
    isLoading: isLoadingBosses,
  } = useQuery<BossScheduleData[]>(
    activeGuild ? `boss_schedules:${activeGuild.guildId}` : "boss_schedules_empty",
    async () => {
      if (!activeGuild) return [];
      const result = await dashboardApi.getBossSchedules(activeGuild.guildId);
      return result.success && result.data?.schedules ? result.data.schedules : [];
    },
    { persist: true, staleTime: 15000, enabled: !!activeGuild }
  );

  const bossSchedules = (bossSchedulesRaw || [])
    .filter((s) => s.status !== "KILLED")
    .sort(
      (a, b) =>
        new Date(a.spawnTime).getTime() - new Date(b.spawnTime).getTime(),
    )
    .slice(0, 3);

  // 2. Dashboard Stats Query
  const {
    data: stats,
    isLoading: isLoadingStats,
  } = useQuery<{
    balance: { raw: number; value: string; sub: string; currencySymbol: string };
    guildPoints: { raw: number; value: string; sub: string };
    members: { raw: number; value: string; sub: string; online: number };
    bossToday: { raw: number; value: string; sub: string; total: number };
    recentActivity: Array<{
      type: "CREDIT" | "DEBIT" | "POINTS" | "INFO" | "CONFIG";
      action: string;
      detail: string;
      time: string;
    }>;
  } | null>(
    activeGuild ? `dashboard_stats:${activeGuild.guildId}` : "dashboard_stats_empty",
    async () => {
      if (!activeGuild) return null;
      const result = await dashboardApi.getDashboardStats(activeGuild.guildId);
      return result.success && result.data ? result.data : null;
    },
    { persist: true, staleTime: 30000, enabled: !!activeGuild }
  );

  // Real-time Socket.IO listeners for instant dashboard invalidation
  useEffect(() => {
    if (!socket || !activeGuild) return;

    const handleRealTimeRefresh = () => {
      console.log("[Socket Real-time]: Invalidating dashboard query cache...");
      queryClient.invalidateQueries(`boss_schedules:${activeGuild.guildId}`);
      queryClient.invalidateQueries(`dashboard_stats:${activeGuild.guildId}`);
    };

    socket.on("boss_rotation_updated", handleRealTimeRefresh);
    socket.on("boss_schedule_deleted", handleRealTimeRefresh);

    return () => {
      socket.off("boss_rotation_updated", handleRealTimeRefresh);
      socket.off("boss_schedule_deleted", handleRealTimeRefresh);
    };
  }, [socket, activeGuild]);

  // Log boss kill
  async function handleLogKill(e: React.FormEvent) {
    e.preventDefault();
    if (!activeGuild || !showKillModal || !killTimeInput) return;

    setIsLoggingKill(true);
    try {
      const formattedTime = new Date(
        `${new Date().toISOString().split("T")[0]}T${killTimeInput}:00`,
      );
      const result = await dashboardApi.logBossKill(
        activeGuild.guildId,
        showKillModal.id,
        formattedTime.toISOString(),
      );
      if (result.success) {
        addToast("success", `Recorded death for ${showKillModal.bossName}`);
        setShowKillModal(null);
        setKillTimeInput("");
        queryClient.invalidateQueries(`boss_schedules:${activeGuild.guildId}`);
        queryClient.invalidateQueries(`dashboard_stats:${activeGuild.guildId}`);
      }
    } catch (err: any) {
      addToast("error", err?.message || "Failed to log boss kill");
    } finally {
      setIsLoggingKill(false);
    }
  }

  // Countdown formatter
  function getTickingCountdown(spawnTimeStr: string) {
    const target = new Date(spawnTimeStr).getTime();
    const diff = target - currentTime;
    if (diff <= 0) return { expired: true, text: "LIVE", warning: false };

    const hrs = Math.floor(diff / (3600 * 1000));
    const mins = Math.floor((diff % (3600 * 1000)) / (60 * 1000));
    const secs = Math.floor((diff % (60 * 1000)) / 1000);
    const text = `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
    const warning = diff <= 5 * 60 * 1000;

    return { expired: false, text, warning };
  }

  if (!user || !activeGuild) return null;

  // Get next boss for the dedicated widget
  const nextBoss = bossSchedules[0] || null;
  const nextBossCountdown = nextBoss ? getTickingCountdown(nextBoss.spawnTime) : null;
  const canManageBossRotations =
    activeGuild.role === "GUILD_LEADER" ||
    activeGuild.role === "FACTION_LEADER" ||
    activeGuild.role === "ADMIN";

  return (
    <div className="relative max-w-7xl mx-auto w-full">
      <DashboardDecor />

      <div className="relative z-10 space-y-7 text-white/85">
        {/* Welcome Header */}
        <Reveal>
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-6 border-b border-[var(--metal-border)]">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-[10px] text-[var(--forge-gold-dim)] uppercase tracking-[0.24em] font-medium">
                  Overview · {role.replace("_", " ")}
                </span>
                <span className="h-px w-12 bg-gradient-to-r from-[var(--forge-gold)]/25 to-transparent" />
              </div>
              <h1 className="text-[28px] sm:text-[32px] leading-tight font-semibold text-white tracking-tight">
                Welcome back, {user.displayName}
                <span className="text-[var(--forge-gold-dim)]">.</span>
              </h1>
              <p className="text-sm text-white/50 mt-2">
                {new Date().toLocaleDateString("en-US", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                })}
              </p>
            </div>
            <div className="flex items-center gap-2.5">
              <div className="text-right">
                <p className="text-[10px] text-[var(--forge-gold-dim)] uppercase tracking-[0.22em]">
                  Active guild
                </p>
                <p className="text-[13px] text-white font-medium">
                  {activeGuild.guildName}
                </p>
              </div>
              <Badge role={activeGuild.role} size="md" />
            </div>
          </div>
        </Reveal>

        {/* Stats Grid */}
        {isLoadingStats || !stats ? (
          <StaggerReveal
            baseDelay={80}
            stagger={90}
            className="grid grid-cols-2 lg:grid-cols-4 gap-4"
          >
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </StaggerReveal>
        ) : (
          <StaggerReveal
            baseDelay={80}
            stagger={90}
            className="grid grid-cols-2 lg:grid-cols-4 gap-4"
          >
            <StatCard
              label="Balance"
              value={stats.balance.raw}
              prefix={stats.balance.currencySymbol}
              decimals={2}
              sub={stats.balance.sub}
              tone="positive"
              icon={<WalletIcon />}
              data={[
                stats.balance.raw * 0.8,
                stats.balance.raw * 0.9,
                stats.balance.raw * 0.85,
                stats.balance.raw * 0.95,
                stats.balance.raw,
              ]}
            />
            <StatCard
              label="Guild Points"
              value={stats.guildPoints.raw}
              sub={stats.guildPoints.sub}
              tone="warning"
              icon={<StarIcon />}
              data={[
                stats.guildPoints.raw * 0.8,
                stats.guildPoints.raw * 0.85,
                stats.guildPoints.raw * 0.9,
                stats.guildPoints.raw * 0.95,
                stats.guildPoints.raw,
              ]}
            />
            <StatCard
              label="Members"
              value={stats.members.raw}
              sub={`${stats.members.online} online now`}
              tone="neutral"
              icon={<UsersIcon />}
              data={[
                stats.members.raw > 4 ? stats.members.raw - 4 : 0,
                stats.members.raw > 2 ? stats.members.raw - 2 : 0,
                stats.members.raw > 3 ? stats.members.raw - 3 : 0,
                stats.members.raw > 1 ? stats.members.raw - 1 : 0,
                stats.members.raw,
              ]}
            />
            <StatCard
              label="Boss Today"
              value={stats.bossToday.raw}
              sub={stats.bossToday.sub}
              tone="warning"
              icon={<SkullIcon />}
              data={[
                stats.bossToday.raw > 2 ? stats.bossToday.raw - 2 : 0,
                stats.bossToday.raw > 1 ? stats.bossToday.raw - 1 : 0,
                stats.bossToday.raw,
                stats.bossToday.raw,
                stats.bossToday.raw,
              ]}
            />
          </StaggerReveal>
        )}

        {/* Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {/* Left Column */}
          <div className="lg:col-span-2 space-y-6">
            {/* Boss Spawns */}
            <Reveal>
              <section className="relative card-obsidian rounded-2xl p-6">
                <SectionHeader
                  eyebrow="Upcoming bosses"
                  title="Next spawns"
                  meta={`${bossSchedules.length} active`}
                />

                {isLoadingBosses ? (
                  <div className="space-y-3">
                    {[1, 2].map((i) => (
                      <Skeleton key={i} className="h-20 rounded-xl" />
                    ))}
                  </div>
                ) : bossSchedules.length === 0 ? (
                  <div className="py-10 text-center">
                    <div className="inline-flex h-12 w-12 rounded-full border border-[var(--metal-border)] bg-[var(--forge-glow)] items-center justify-center mb-3">
                      <svg
                        className="h-5 w-5 text-[var(--forge-gold-dim)]"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                      >
                        <circle cx="12" cy="12" r="10" />
                        <path d="M12 6v6l4 2" />
                      </svg>
                    </div>
                    <p className="text-[13px] text-white/50">
                      No upcoming spawns
                    </p>
                    <p className="text-[11px] text-white/30 mt-1">
                      You&apos;re all caught up
                    </p>
                  </div>
                ) : (
                  <StaggerReveal
                    baseDelay={60}
                    stagger={90}
                    className="space-y-3"
                  >
                    {bossSchedules.map((boss) => (
                      <BossRow
                        key={boss.id}
                        boss={boss}
                        tick={getTickingCountdown(boss.spawnTime)}
                        canLogKill={canManageBossRotations}
                        onLogKill={() => {
                          setShowKillModal(boss);
                          setKillTimeInput(
                            new Date()
                              .toLocaleTimeString("en-US", { hour12: false })
                              .substring(0, 5),
                          );
                        }}
                      />
                    ))}
                  </StaggerReveal>
                )}
              </section>
            </Reveal>

            {/* Your Guilds */}
            <Reveal>
              <section className="relative card-obsidian rounded-2xl p-6">
                <SectionHeader
                  eyebrow="Affiliations"
                  title="Your guilds"
                  meta={`${user.guilds.length} active`}
                />
                <StaggerReveal
                  baseDelay={60}
                  stagger={80}
                  className="space-y-3"
                >
                  {user.guilds.map((guild) => (
                    <div
                      key={guild.guildId}
                      className="group relative flex items-center justify-between px-5 py-4 rounded-xl bg-[var(--obsidian-deep)]/50 border border-white/[0.05] hover:bg-[var(--forge-glow)] hover:border-[var(--metal-border)] transition-all duration-300 cursor-pointer overflow-hidden"
                    >
                      <span
                        aria-hidden
                        className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-out pointer-events-none"
                        style={{
                          background:
                            "linear-gradient(90deg, transparent, rgba(212,168,83,0.04), transparent)",
                        }}
                      />
                      <div className="flex items-center gap-3.5 min-w-0 relative">
                        <div className="h-11 w-11 rounded-lg bg-[var(--forge-glow)] border border-[var(--metal-border)] flex items-center justify-center font-semibold text-[var(--forge-gold)] text-sm transition-transform duration-300 group-hover:scale-[1.04]">
                          {guild.guildName[0]}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2.5">
                            <h3 className="font-semibold text-white text-[14px] truncate">
                              {guild.guildName}
                            </h3>
                            <Badge role={guild.role} />
                          </div>
                          <p className="text-[11px] text-white/40 mt-1">
                            {guild.rankName} · Joined{" "}
                            {new Date(guild.joinedAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>

                      <svg
                        className="h-4 w-4 text-white/30 shrink-0 relative transition-transform duration-300 group-hover:translate-x-0.5 group-hover:text-[var(--forge-gold)]"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                      >
                        <path d="M9 18l6-6-6-6" />
                      </svg>
                    </div>
                  ))}
                </StaggerReveal>
              </section>
            </Reveal>
          </div>

          {/* Right Column */}
          <div className="space-y-6">
            {/* Next Boss Spawn Widget */}
            {nextBoss && nextBossCountdown && (
              <Reveal from="right">
                <section
                  className={`relative card-obsidian rounded-2xl p-5 transition-all duration-500 ${
                    nextBossCountdown.warning || nextBossCountdown.expired
                      ? "border-[var(--forge-gold)]/25"
                      : ""
                  }`}
                  style={
                    nextBossCountdown.warning || nextBossCountdown.expired
                      ? { animation: "glow-pulse 3s ease-in-out infinite" }
                      : undefined
                  }
                >
                  <div className="flex items-center gap-2 mb-4">
                    <span className="text-[10px] text-[var(--forge-gold-dim)] uppercase tracking-[0.22em] font-medium">
                      Next boss spawn
                    </span>
                    <span className="h-px flex-1 bg-gradient-to-r from-[var(--forge-gold)]/20 to-transparent" />
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="h-14 w-14 rounded-xl bg-[var(--obsidian-deep)] border border-[var(--metal-border)] flex items-center justify-center overflow-hidden shrink-0 shadow-[0_0_12px_rgba(212,168,83,0.08)]">
                      {nextBoss.bossImageUrl ? (
                        <img
                          src={nextBoss.bossImageUrl}
                          alt={nextBoss.bossName}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <svg className="h-7 w-7 text-[var(--forge-gold-dim)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <path d="M12 2L2 7l10 5 10-5-10-5z" />
                          <path d="M2 17l10 5 10-5" />
                          <path d="M2 12l10 5 10-5" />
                        </svg>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="text-[14px] font-semibold text-white truncate">
                        {nextBoss.bossName}
                      </p>
                      <p className="text-[11px] text-white/40 truncate mt-0.5">
                        {nextBoss.location}
                      </p>
                      {nextBoss.guildTurn && (
                        <p className="text-[10px] text-[var(--forge-gold-dim)] mt-1">
                          Turn: {nextBoss.guildTurn}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Countdown */}
                  <div className="mt-4 pt-4 border-t border-white/[0.06]">
                    <p
                      className={`text-center text-[28px] font-mono font-bold tracking-tight tabular-nums ${
                        nextBossCountdown.expired
                          ? "text-red-400"
                          : nextBossCountdown.warning
                            ? "text-[var(--forge-gold-bright)]"
                            : "text-[var(--forge-gold)]"
                      }`}
                    >
                      {nextBossCountdown.text}
                    </p>
                    <p className="text-center text-[10px] text-white/30 uppercase tracking-[0.2em] mt-1">
                      {nextBossCountdown.expired ? "Boss is live" : "Until spawn"}
                    </p>
                  </div>

                  {/* Status badge */}
                  <div className="mt-3 flex justify-center">
                    <BossStatusBadge
                      expired={nextBossCountdown.expired}
                      warning={nextBossCountdown.warning}
                      status={nextBoss.status}
                    />
                  </div>
                </section>
              </Reveal>
            )}

            {/* Activity Feed */}
            <Reveal from="right">
              <section className="relative card-obsidian rounded-2xl p-6">
                <SectionHeader
                  eyebrow="Recent"
                  title="Activity"
                  meta={
                    <span className="inline-flex items-center gap-1.5">
                      <LiveDot tone="emerald" size={5} />
                      Live
                    </span>
                  }
                />
                {isLoadingStats || !stats ? (
                  <StaggerReveal
                    baseDelay={120}
                    stagger={75}
                    className="space-y-1"
                  >
                    <ActivityItemSkeleton />
                    <ActivityItemSkeleton />
                    <ActivityItemSkeleton />
                    <ActivityItemSkeleton />
                    <ActivityItemSkeleton />
                  </StaggerReveal>
                ) : (
                  <StaggerReveal
                    baseDelay={120}
                    stagger={75}
                    className="space-y-1"
                  >
                    {stats.recentActivity.map((activity, index) => {
                      let icon = <InfoIcon />;
                      if (activity.type === "CREDIT") icon = <CreditIcon />;
                      else if (activity.type === "DEBIT") icon = <DebitIcon />;
                      else if (activity.type === "POINTS") icon = <PointsIcon />;
                      else if (activity.type === "CONFIG") icon = <ConfigIcon />;

                      return (
                        <ActivityItem
                          key={index}
                          icon={icon}
                          action={activity.action}
                          detail={activity.detail}
                          time={activity.time}
                          type={activity.type}
                        />
                      );
                    })}
                  </StaggerReveal>
                )}

                <div className="mt-5 pt-4 border-t border-white/[0.06] text-center">
                  <button className="group inline-flex items-center gap-1.5 text-[11px] text-[var(--forge-gold-dim)] hover:text-[var(--forge-gold)] transition-colors uppercase tracking-[0.18em] font-medium cursor-pointer">
                    View all
                    <svg
                      className="h-3 w-3 transition-transform duration-300 group-hover:translate-x-0.5"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M5 12h14M12 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>
              </section>
            </Reveal>
          </div>
        </div>
      </div>

      {/* LOG BOSS KILL MODAL */}
      {showKillModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-md animate-fade-in"
            onClick={() => !isLoggingKill && setShowKillModal(null)}
          />
          <div
            className="relative glass-strong border border-[var(--metal-border)] rounded-2xl p-6 max-w-sm w-full shadow-[0_40px_90px_-25px_rgba(0,0,0,0.8)] z-50 animate-scale-in"
            style={{ animationDuration: "320ms" }}
          >
            <span
              aria-hidden
              className="absolute inset-x-6 top-0 h-px"
              style={{
                background:
                  "linear-gradient(90deg, transparent, rgba(212,168,83,0.30), transparent)",
              }}
            />
            <div className="flex items-center gap-3 mb-4">
              <div className="relative h-10 w-10 rounded-xl bg-red-500/[0.10] border border-red-500/20 flex items-center justify-center">
                <svg
                  className="h-4 w-4 text-red-400"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                <span className="absolute -inset-0.5 rounded-xl border border-red-500/15 animate-ping" />
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-[0.22em] text-red-400/80">
                  Record death
                </div>
                <h3 className="text-[15px] font-semibold text-white">
                  Log boss kill
                </h3>
              </div>
            </div>
            <p className="text-[12px] text-white/50 mb-5 leading-relaxed">
              Record the time of death for{" "}
              <span className="text-white font-medium">
                {showKillModal.bossName}
              </span>
              .
            </p>

            <form onSubmit={handleLogKill} className="space-y-4">
              <div>
                <label className="block text-[10px] font-medium text-white/50 uppercase tracking-[0.18em] mb-2">
                  Time of death
                </label>
                <input
                  type="time"
                  value={killTimeInput}
                  onChange={(e) => setKillTimeInput(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 rounded-lg bg-white/[0.03] border border-white/[0.08] text-[13px] text-white focus:outline-none focus:border-[var(--forge-gold)]/40 font-mono text-center tracking-[0.18em]"
                />
              </div>

              <div className="flex gap-2 justify-end pt-2 border-t border-white/[0.06]">
                <Button
                  variant="ghost"
                  size="sm"
                  type="button"
                  onClick={() => setShowKillModal(null)}
                >
                  Cancel
                </Button>
                <Magnetic strength={4}>
                  <Button
                    variant="danger"
                    size="sm"
                    type="submit"
                    isLoading={isLoggingKill}
                  >
                    Record death
                  </Button>
                </Magnetic>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── MMORPG Boss Status Badge ───
function BossStatusBadge({
  expired,
  warning,
  status,
}: {
  expired: boolean;
  warning: boolean;
  status: string;
}) {
  if (expired) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-[0.15em] bg-red-500/10 text-red-400 border border-red-500/20">
        <span className="h-1.5 w-1.5 rounded-full bg-red-400 animate-pulse" />
        Live Now
      </span>
    );
  }
  if (warning) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-[0.15em] bg-[var(--forge-gold)]/10 text-[var(--forge-gold-bright)] border border-[var(--forge-gold)]/20">
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--forge-gold-bright)] animate-pulse" />
        Spawning Soon
      </span>
    );
  }
  if (status === "CONTESTED") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-[0.15em] bg-purple-500/10 text-purple-400 border border-purple-500/20">
        <span className="h-1.5 w-1.5 rounded-full bg-purple-400" />
        Contested
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-[0.15em] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
      Available
    </span>
  );
}

// ─── Stat Card Component (Enhanced) ───
function StatCard({
  label,
  value,
  sub,
  tone,
  data,
  icon,
  prefix = "",
  decimals = 0,
}: {
  label: string;
  value: number;
  sub: string;
  tone: "neutral" | "positive" | "warning" | "negative";
  data: number[];
  icon: React.ReactNode;
  prefix?: string;
  decimals?: number;
}) {
  const { ref, visible } = useReveal(0.2);
  const animated = useCountUp(value, visible);

  const display =
    decimals > 0
      ? animated.toLocaleString(undefined, {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        })
      : Math.round(animated).toLocaleString();

  const iconBgMap = {
    neutral: "bg-white/[0.05] border-white/[0.08] text-white/50",
    positive: "bg-emerald-500/[0.08] border-emerald-500/20 text-emerald-400",
    warning: "bg-[var(--forge-gold)]/[0.08] border-[var(--forge-gold)]/20 text-[var(--forge-gold)]",
    negative: "bg-red-500/[0.08] border-red-500/20 text-red-400",
  };

  return (
    <div ref={ref}>
      <TiltCard intensity={4}>
        <div className="relative card-obsidian rounded-2xl p-5 hover:border-[var(--metal-border)] transition-all duration-500 overflow-hidden group">
          {/* Hover gold glow */}
          <div
            className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
            style={{
              background: "radial-gradient(ellipse 80% 60% at 50% 0%, rgba(212,168,83,0.06), transparent 70%)",
            }}
          />

          <div className="relative">
            {/* Icon + Label Row */}
            <div className="flex items-center gap-2.5 mb-3">
              <div className={`h-8 w-8 rounded-lg border flex items-center justify-center shrink-0 ${iconBgMap[tone]}`}>
                {icon}
              </div>
              <p className="text-[10px] font-medium text-white/50 uppercase tracking-[0.22em]">
                {label}
              </p>
            </div>

            {/* Value */}
            <h3 className="text-[26px] lg:text-[28px] font-semibold tracking-tight text-white font-mono leading-none">
              {prefix}
              {display}
            </h3>
            <p className="text-[11px] text-white/40 mt-1.5">{sub}</p>

            {/* Sparkline */}
            <div className="mt-4">
              <Sparkline data={data} tone={tone} height={28} />
            </div>
          </div>
        </div>
      </TiltCard>
    </div>
  );
}

// ─── Boss Row Component ───
function BossRow({
  boss,
  tick,
  canLogKill,
  onLogKill,
}: {
  boss: BossScheduleData;
  tick: { expired: boolean; text: string; warning: boolean };
  canLogKill: boolean;
  onLogKill: () => void;
}) {
  const borderTone = tick.expired
    ? "border-red-500/20 bg-red-500/[0.04]"
    : tick.warning
      ? "border-[var(--forge-gold)]/20 bg-[var(--forge-gold)]/[0.03]"
      : "border-white/[0.05] bg-[var(--obsidian-deep)]/50 hover:bg-[var(--forge-glow)]";

  const dotTone: "emerald" | "amber" | "red" | "neutral" = tick.expired
    ? "red"
    : tick.warning
      ? "amber"
      : "neutral";

  const valueColor = tick.expired
    ? "text-red-300"
    : tick.warning
      ? "text-[var(--forge-gold-bright)]"
      : "text-white/85";

  return (
    <div
      className={`group relative px-5 py-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 transition-all duration-300 overflow-hidden ${borderTone}`}
    >
      {(tick.warning || tick.expired) && (
        <span
          aria-hidden
          className="absolute -inset-px rounded-xl pointer-events-none opacity-50"
          style={{
            background: tick.expired
              ? "radial-gradient(ellipse 40% 100% at 0% 50%, oklch(0.62 0.18 22 / 0.15), transparent 70%)"
              : "radial-gradient(ellipse 40% 100% at 0% 50%, rgba(212,168,83,0.12), transparent 70%)",
            animation: "pulse-soft 2.4s ease-in-out infinite",
          }}
        />
      )}

      <div className="min-w-0 flex items-center gap-3.5 relative">
        <LiveDot tone={dotTone} size={8} className="shrink-0" />
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <p className="text-[14px] font-semibold text-white truncate">
              {boss.bossName}
            </p>
            {boss.guildId === null && (
              <span className="px-2 py-0.5 rounded text-[9px] text-[var(--forge-gold)] font-medium bg-[var(--forge-glow)] border border-[var(--metal-border)] shrink-0 uppercase tracking-[0.18em]">
                Faction
              </span>
            )}
            {/* Status Badge */}
            <BossStatusBadge expired={tick.expired} warning={tick.warning} status={boss.status} />
          </div>
          <p className="text-[11px] text-white/40 truncate mt-1">
            {boss.location}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3.5 justify-between sm:justify-end shrink-0 relative">
        <div className="text-right">
          <p
            className={`text-[15px] font-mono font-semibold tracking-tight tabular-nums ${valueColor}`}
          >
            {tick.text}
          </p>
          {boss.guildTurn && (
            <p className="text-[10px] text-white/40 mt-1 truncate max-w-[110px]">
              Turn: {boss.guildTurn}
            </p>
          )}
        </div>

        {canLogKill && (tick.expired || tick.warning) && (
          <Magnetic strength={4}>
            <Button
              variant="ghost"
              size="sm"
              onClick={onLogKill}
              className="text-red-400/80 hover:text-red-300 border border-red-500/[0.15] hover:border-red-500/30 hover:bg-red-500/[0.04]"
            >
              Log kill
            </Button>
          </Magnetic>
        )}
      </div>
    </div>
  );
}

// ─── Skeletons ───
function StatCardSkeleton() {
  return (
    <TiltCard intensity={4}>
      <div className="relative card-obsidian rounded-2xl p-5 overflow-hidden">
        <div className="flex items-center gap-2.5 mb-3">
          <div className="h-8 w-8 rounded-lg bg-white/[0.04] animate-pulse" />
          <div className="h-3 w-16 bg-white/10 rounded animate-pulse" />
        </div>
        <div className="h-7 w-28 bg-white/10 rounded animate-pulse" />
        <div className="h-3 w-20 bg-white/5 rounded mt-3 animate-pulse" />
        <div className="mt-4 h-[28px] bg-white/[0.02] rounded animate-pulse" />
      </div>
    </TiltCard>
  );
}

function ActivityItemSkeleton() {
  return (
    <div className="flex items-start gap-3.5">
      <div className="mt-0.5 shrink-0 h-8 w-8 rounded-lg bg-white/[0.04] animate-pulse" />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="h-3.5 w-24 bg-white/10 rounded animate-pulse" />
          <div className="h-3 w-10 bg-white/10 rounded animate-pulse" />
        </div>
        <div className="h-3 w-32 bg-white/5 rounded animate-pulse" />
      </div>
    </div>
  );
}

// ─── Activity Item (Color-coded) ───
function ActivityItem({
  icon,
  action,
  detail,
  time,
  type,
}: {
  icon: React.ReactNode;
  action: string;
  detail: string;
  time: string;
  type: "CREDIT" | "DEBIT" | "POINTS" | "INFO" | "CONFIG";
}) {
  const typeStyles: Record<string, { bg: string; indicator: string }> = {
    CREDIT: { bg: "bg-emerald-500/[0.06] border-emerald-500/15 text-emerald-400", indicator: "bg-emerald-400" },
    DEBIT: { bg: "bg-rose-500/[0.06] border-rose-500/15 text-rose-400", indicator: "bg-rose-400" },
    POINTS: { bg: "bg-[var(--forge-gold)]/[0.06] border-[var(--forge-gold)]/15 text-[var(--forge-gold)]", indicator: "bg-[var(--forge-gold)]" },
    INFO: { bg: "bg-blue-500/[0.06] border-blue-500/15 text-blue-400", indicator: "bg-blue-400" },
    CONFIG: { bg: "bg-purple-500/[0.06] border-purple-500/15 text-purple-400", indicator: "bg-purple-400" },
  };

  const style = typeStyles[type] || typeStyles.INFO!;

  return (
    <div className="flex items-start gap-3.5 py-3 border-b border-white/[0.04] last:border-0 hover:bg-white/[0.01] px-2 rounded-xl transition-all duration-200 relative">
      {/* Colored left edge indicator */}
      <span className={`absolute left-0 top-3 bottom-3 w-[2px] rounded-full ${style.indicator} opacity-40`} />

      <div className={`mt-0.5 shrink-0 h-8 w-8 rounded-lg border flex items-center justify-center ${style.bg}`}>
        {icon}
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-[13px] font-semibold text-white truncate">{action}</h4>
          <span className="text-[10px] text-white/40 shrink-0 font-mono">{time}</span>
        </div>
        <p className="text-[11px] text-white/50 leading-relaxed break-words">{detail}</p>
      </div>
    </div>
  );
}

// ─── Stat Card Icons ───
function WalletIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12V7H5a2 2 0 010-4h14v4" />
      <path d="M3 5v14a2 2 0 002 2h16v-5" />
      <path d="M18 12a2 2 0 100 4 2 2 0 000-4z" />
    </svg>
  );
}

function StarIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
    </svg>
  );
}

function SkullIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M8 14s1.5 2 4 2 4-2 4-2" />
      <line x1="9" y1="9" x2="9.01" y2="9" />
      <line x1="15" y1="9" x2="15.01" y2="9" />
    </svg>
  );
}

// ─── Activity Icons ───
function CreditIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
      <polyline points="17 6 23 6 23 12" />
    </svg>
  );
}

function DebitIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="1" x2="12" y2="23" />
      <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
    </svg>
  );
}

function PointsIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
      <circle cx="8.5" cy="7" r="4" />
      <line x1="20" y1="8" x2="20" y2="14" />
      <line x1="23" y1="11" x2="17" y2="11" />
    </svg>
  );
}

function ConfigIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  );
}
