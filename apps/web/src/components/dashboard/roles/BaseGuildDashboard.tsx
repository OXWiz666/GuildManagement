"use client";

import React, { useState, useEffect, useMemo, useRef, memo } from "react";
import Image from "next/image";
import { useAuth } from "@/lib/auth-context";
import {
  dashboardApi,
  factionApi,
  type BossScheduleData,
  type BossRotationResponse,
  type BossRotationItem,
  type FactionGuildData,
} from "@/lib/api";
import { getRealtimeBossTimer, hasMinimumRole, type GuildRoleType } from "@guild/shared";
import { useSocket } from "@/components/providers/socket-provider";
import { useToast } from "@/components/ui/Toast";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import DashboardDecor from "@/components/dashboard/DashboardDecor";
import { useQuery, queryClient } from "@/lib/query";
import BossCommitButton from "@/app/(dashboard)/dashboard/boss-rotation/components/BossCommitButton";
import BossDropsPicker, { type SelectedDrop, rarityStyle } from "@/app/(dashboard)/dashboard/boss-rotation/components/BossDropsPicker";
import WishlistPriorityCarousel from "@/components/dashboard/WishlistPriorityCarousel";
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

// Local-time value for <input type="datetime-local">.
function toDateTimeInputValue(date: Date) {
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 16);
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

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
  const { user, refreshUser } = useAuth();
  const { addToast } = useToast();
  const { socket } = useSocket();

  const activeGuild = user?.guilds?.[0];

  // ─── "Taken" shortcut modal state (mirrors Boss Rotation's confirm-taken flow) ───
  const [takenTarget, setTakenTarget] = useState<BossScheduleData | null>(null);
  const [takenGuildId, setTakenGuildId] = useState("");
  const [takenTime, setTakenTime] = useState("");
  const [isConfirmingTaken, setIsConfirmingTaken] = useState(false);
  const [takenDrops, setTakenDrops] = useState<SelectedDrop[]>([]);
  const [showTakenDropsPicker, setShowTakenDropsPicker] = useState(false);
  const [showFactionCreateModal, setShowFactionCreateModal] = useState(false);
  const [factionName, setFactionName] = useState("");
  const [isCreatingFaction, setIsCreatingFaction] = useState(false);

  // ─── Upcoming list auto-scroll ───
  const upcomingScrollRef = useRef<HTMLDivElement>(null);
  const [upcomingPaused, setUpcomingPaused] = useState(false);

  // The 1s countdown ticker used to live here, re-rendering this entire
  // dashboard (Welcome header, Your Guilds, Upcoming list, etc.) every
  // second for the sake of two small ticking widgets. Both now own their
  // tick internally — see BossRow and NextBossSpawnCard below.

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

  // Rotation data (shared cache key with the Boss Rotation page) — powers the
  // taking-guild picker in the "Taken" shortcut modal.
  const { data: rotationData } = useQuery<BossRotationResponse | null>(
    activeGuild ? `boss_rotation_v2:${activeGuild.guildId}` : "boss_rotation_empty",
    async () => {
      if (!activeGuild) return null;
      const result = await dashboardApi.getBossRotation(activeGuild.guildId);
      return result.success && result.data ? result.data : null;
    },
    { persist: true, staleTime: 15000, enabled: !!activeGuild },
  );

  const rotationByBoss = useMemo(() => {
    const map = new Map<string, BossRotationItem>();
    for (const rot of rotationData?.rotations || []) {
      map.set(rot.bossName.toLowerCase(), rot);
    }
    return map;
  }, [rotationData]);

  // All live (non-killed) spawns, earliest first.
  const sortedSchedules = useMemo(
    () =>
      (bossSchedulesRaw || [])
        .filter((s) => s.status !== "KILLED")
        .sort(
          (a, b) =>
            new Date(a.spawnTime).getTime() - new Date(b.spawnTime).getTime(),
        ),
    [bossSchedulesRaw],
  );

  // Upcoming list — a scrollable shortcut list (more than the old 3).
  const upcomingList = useMemo(() => sortedSchedules.slice(0, 12), [sortedSchedules]);

  // The carousel is scoped to the CURRENT guild's own bosses. A schedule row
  // with a non-null `guildId` is a guild-specific spawn instance and always
  // belongs to that guild outright — checked FIRST, since the rotation's
  // `currentGuild` is a cross-guild "whose turn in the shared queue" pointer
  // and must never override a schedule's own owning guild. Only for
  // faction-wide rows (guildId === null) do we fall back to the assigned turn,
  // then the rotation's current holder, to decide if the spawn is ours.
  const myGuildSchedules = useMemo(() => {
    const gid = activeGuild?.guildId;
    if (!gid) return [];
    return sortedSchedules.filter((s) => {
      if (s.guildId) return s.guildId === gid;
      const rot = rotationByBoss.get(s.bossName.toLowerCase());
      const ownerId = s.guildTurnGuildId || rot?.currentGuild?.id || null;
      return ownerId === gid;
    });
  }, [sortedSchedules, rotationByBoss, activeGuild?.guildId]);

  // Carousel slides — the next upcoming spawn per boss for OUR guild, soonest
  // first. A boss can have more than one live schedule row (e.g. an overlapping
  // re-log or a stale duplicate), which previously surfaced the same boss twice
  // in the carousel. Dedup by boss name, keeping the earliest spawn — since
  // `myGuildSchedules` is already sorted soonest-first, the first row wins.
  const dateSlides = useMemo(() => {
    const seen = new Set<string>();
    const deduped: typeof myGuildSchedules = [];
    for (const s of myGuildSchedules) {
      const key = s.bossName.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(s);
    }
    return deduped.slice(0, 7);
  }, [myGuildSchedules]);

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
      queryClient.invalidateQueries(`boss_rotation_v2:${activeGuild.guildId}`);
      queryClient.invalidateQueries(`dashboard_stats:${activeGuild.guildId}`);
    };

    socket.on("boss_rotation_updated", handleRealTimeRefresh);
    socket.on("boss_schedule_deleted", handleRealTimeRefresh);

    return () => {
      socket.off("boss_rotation_updated", handleRealTimeRefresh);
      socket.off("boss_schedule_deleted", handleRealTimeRefresh);
    };
  }, [socket, activeGuild]);

  // Guilds eligible to take a given boss (rotation queue first, then all faction
  // guilds as a fallback so the picker is never empty).
  function guildOptionsFor(bossName: string): FactionGuildData[] {
    const rot = rotationByBoss.get(bossName.toLowerCase());
    if (rot && rot.queue.length > 0) return rot.queue;
    return rotationData?.guilds || [];
  }

  // Open the "Taken" shortcut modal, pre-selecting the boss's turn guild + now.
  function openTakenModal(boss: BossScheduleData) {
    const rot = rotationByBoss.get(boss.bossName.toLowerCase());
    const defaultGuildId =
      boss.guildTurnGuildId ||
      rot?.currentGuild?.id ||
      guildOptionsFor(boss.bossName)[0]?.id ||
      "";
    setTakenTarget(boss);
    setTakenGuildId(defaultGuildId);
    setTakenTime(toDateTimeInputValue(new Date()));
    setTakenDrops([]);
  }

  // Mark a boss taken by a guild (advances the rotation), from the overview.
  // Same call as the Boss Rotation page's confirm-taken flow, including drops.
  async function confirmTaken(e: React.FormEvent) {
    e.preventDefault();
    if (!activeGuild || !takenTarget || !takenGuildId || !takenTime || isConfirmingTaken) return;

    setIsConfirmingTaken(true);
    try {
      const killedAt = new Date(takenTime).toISOString();
      const dropsPayload = takenDrops.map((d) => ({
        bucket: d.item.bucket,
        path: d.item.path,
        quantity: d.quantity,
      }));
      const result = await dashboardApi.markBossRotationKilled(
        activeGuild.guildId,
        takenTarget.id,
        killedAt,
        takenGuildId,
        undefined,
        dropsPayload,
      );
      if (result.success) {
        const guildName =
          guildOptionsFor(takenTarget.bossName).find((g) => g.id === takenGuildId)?.name ||
          "selected guild";
        addToast("success", `${takenTarget.bossName} taken by ${guildName}.`);
        setTakenTarget(null);
        setTakenDrops([]);
        queryClient.invalidateQueries(`boss_schedules:${activeGuild.guildId}`);
        queryClient.invalidateQueries(`boss_rotation_v2:${activeGuild.guildId}`);
        queryClient.invalidateQueries(`dashboard_stats:${activeGuild.guildId}`);
      } else {
        addToast("error", result.error?.message || "Failed to mark boss taken");
      }
    } catch (err: unknown) {
      addToast("error", errorMessage(err, "Failed to mark boss taken"));
    } finally {
      setIsConfirmingTaken(false);
    }
  }

  async function createFactionForActiveGuild(e: React.FormEvent) {
    e.preventDefault();
    if (!activeGuild || isCreatingFaction) return;
    const trimmed = factionName.trim();
    if (trimmed.length < 2) {
      addToast("error", "Faction name must be at least 2 characters.");
      return;
    }

    setIsCreatingFaction(true);
    try {
      const result = await factionApi.createFromGuild(activeGuild.guildId, trimmed);
      if (result.success) {
        addToast("success", `${trimmed} faction created.`);
        setShowFactionCreateModal(false);
        setFactionName("");
        await refreshUser();
        queryClient.invalidateQueries("faction_");
        queryClient.invalidateQueries(`boss_schedules:${activeGuild.guildId}`);
        queryClient.invalidateQueries(`dashboard_stats:${activeGuild.guildId}`);
        queryClient.invalidateQueries(`boss_rotation_v2:${activeGuild.guildId}`);
      } else {
        addToast("error", result.error?.message || "Failed to create faction");
      }
    } catch (err: unknown) {
      addToast("error", errorMessage(err, "Failed to create faction"));
    } finally {
      setIsCreatingFaction(false);
    }
  }

  // Gentle auto-scroll of the Upcoming list, reversing at each end; pauses on hover.
  useEffect(() => {
    const el = upcomingScrollRef.current;
    if (!el || upcomingPaused) return;
    let dir = 1;
    const id = setInterval(() => {
      const max = el.scrollHeight - el.clientHeight;
      if (max <= 1) return;
      if (el.scrollTop >= max - 0.5) dir = -1;
      else if (el.scrollTop <= 0.5) dir = 1;
      el.scrollTop += dir * 0.5;
    }, 30);
    return () => clearInterval(id);
  }, [upcomingPaused, upcomingList.length]);

  if (!user || !activeGuild) return null;

  const canManageBossRotations =
    activeGuild.role === "GUILD_LEADER" ||
    activeGuild.role === "FACTION_LEADER" ||
    activeGuild.role === "ADMIN";
  const canCreateFaction =
    !activeGuild.factionId &&
    hasMinimumRole(activeGuild.role as GuildRoleType, "GUILD_LEADER");

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
                  meta={`${upcomingList.length} active`}
                />

                {isLoadingBosses ? (
                  <div className="space-y-3">
                    {[1, 2].map((i) => (
                      <Skeleton key={i} className="h-20 rounded-xl" />
                    ))}
                  </div>
                ) : upcomingList.length === 0 ? (
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
                  <div
                    className="relative"
                    onMouseEnter={() => setUpcomingPaused(true)}
                    onMouseLeave={() => setUpcomingPaused(false)}
                  >
                    {/* Fade masks so the auto-scroll reads as a continuous ticker */}
                    <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-6 z-10 bg-gradient-to-b from-[var(--obsidian-elevated)] to-transparent" />
                    <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-6 z-10 bg-gradient-to-t from-[var(--obsidian-elevated)] to-transparent" />
                    <div
                      ref={upcomingScrollRef}
                      className="max-h-[320px] overflow-y-auto pr-1 custom-scrollbar scroll-smooth"
                    >
                      <StaggerReveal
                        baseDelay={60}
                        stagger={90}
                        className="space-y-3 py-1"
                      >
                        {upcomingList.map((boss) => (
                          <BossRow
                            key={boss.id}
                            boss={boss}
                            canLogKill={canManageBossRotations}
                            onTaken={() => openTakenModal(boss)}
                          />
                        ))}
                      </StaggerReveal>
                    </div>
                  </div>
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
                {canCreateFaction && (
                  <div className="mb-4 flex flex-col gap-3 rounded-xl border border-[var(--forge-gold)]/20 bg-[var(--forge-gold)]/[0.04] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-[12px] font-semibold text-white">No faction yet</p>
                      <p className="mt-0.5 text-[11px] leading-relaxed text-white/45">
                        Create a faction from {activeGuild.guildName} and keep running as a solo guild until you invite others.
                      </p>
                    </div>
                    <Button
                      variant="accent"
                      size="sm"
                      className="shrink-0"
                      onClick={() => {
                        setFactionName(activeGuild.guildName);
                        setShowFactionCreateModal(true);
                      }}
                    >
                      Create Faction
                    </Button>
                  </div>
                )}
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
            {/* Next Boss Spawn — auto-cycling carousel (one boss per date).
                Owns its own tick/slide/drag state entirely internally so it's
                the only thing re-rendering every second, not this whole page. */}
            <NextBossSpawnCard
              guildId={activeGuild.guildId}
              dateSlides={dateSlides}
              canManageBossRotations={canManageBossRotations}
              onTaken={openTakenModal}
            />

            {/* Logs priority sequence — member wishlist ranking carousel */}
            <WishlistPriorityCarousel guildId={activeGuild.guildId} />

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

      {showFactionCreateModal && activeGuild && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-md animate-fade-in"
            onClick={() => !isCreatingFaction && setShowFactionCreateModal(false)}
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
            <div className="mb-5">
              <div className="text-[10px] uppercase tracking-[0.22em] text-[var(--forge-gold-bright)]">
                Create faction
              </div>
              <h3 className="mt-1 text-[17px] font-semibold text-white">
                Promote {activeGuild.guildName}
              </h3>
              <p className="mt-2 text-[12px] leading-relaxed text-white/50">
                Your guild will become the first guild in this faction. You can invite more guilds later from the faction tab.
              </p>
            </div>

            <form onSubmit={createFactionForActiveGuild} className="space-y-4">
              <div>
                <label className="block text-[10px] font-medium text-white/50 uppercase tracking-[0.18em] mb-2">
                  Faction name
                </label>
                <input
                  value={factionName}
                  onChange={(e) => setFactionName(e.target.value)}
                  disabled={isCreatingFaction}
                  minLength={2}
                  maxLength={60}
                  required
                  className="w-full px-3.5 py-2.5 rounded-lg bg-white/[0.03] border border-white/[0.08] text-[13px] text-white placeholder:text-white/20 focus:outline-none focus:border-[var(--forge-gold)]/40 disabled:opacity-50"
                  placeholder="Faction name"
                />
              </div>

              <div className="flex gap-2 justify-end pt-2 border-t border-white/[0.06]">
                <Button
                  variant="ghost"
                  size="sm"
                  type="button"
                  onClick={() => setShowFactionCreateModal(false)}
                  disabled={isCreatingFaction}
                >
                  Cancel
                </Button>
                <Button
                  variant="accent"
                  size="sm"
                  type="submit"
                  isLoading={isCreatingFaction}
                  disabled={factionName.trim().length < 2}
                >
                  Create Faction
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TAKEN MODAL — mark a boss taken by a guild + advance the rotation */}
      {takenTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-md animate-fade-in"
            onClick={() => !isConfirmingTaken && setTakenTarget(null)}
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
              <div className="relative h-10 w-10 rounded-xl bg-emerald-500/[0.10] border border-emerald-500/20 flex items-center justify-center">
                <svg
                  className="h-4 w-4 text-emerald-400"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                >
                  <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
                  <path d="M22 4L12 14.01l-3-3" />
                </svg>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-[0.22em] text-emerald-400/80">
                  Confirm taken
                </div>
                <h3 className="text-[15px] font-semibold text-white">
                  {takenTarget.bossName}
                </h3>
              </div>
            </div>
            <p className="text-[12px] text-white/50 mb-5 leading-relaxed">
              Mark <span className="text-white font-medium">{takenTarget.bossName}</span> taken and advance
              the rotation to the next guild.
            </p>

            <form onSubmit={confirmTaken} className="space-y-4">
              <div>
                <label className="block text-[10px] font-medium text-white/50 uppercase tracking-[0.18em] mb-2">
                  Taking guild
                </label>
                <select
                  value={takenGuildId}
                  onChange={(e) => setTakenGuildId(e.target.value)}
                  required
                  disabled={isConfirmingTaken}
                  className="w-full px-3.5 py-2.5 rounded-lg bg-white/[0.03] border border-white/[0.08] text-[13px] text-white focus:outline-none focus:border-[var(--forge-gold)]/40 disabled:opacity-50 cursor-pointer"
                >
                  <option className="bg-[#0c0d12]" value="">Select taking guild</option>
                  {guildOptionsFor(takenTarget.bossName).map((guild) => (
                    <option className="bg-[#0c0d12]" key={guild.id} value={guild.id}>
                      {guild.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-medium text-white/50 uppercase tracking-[0.18em] mb-2">
                  Taken time
                </label>
                <input
                  type="datetime-local"
                  value={takenTime}
                  onChange={(e) => setTakenTime(e.target.value)}
                  required
                  disabled={isConfirmingTaken}
                  className="w-full px-3.5 py-2.5 rounded-lg bg-white/[0.03] border border-white/[0.08] text-[13px] text-white focus:outline-none focus:border-[var(--forge-gold)]/40 [color-scheme:dark]"
                />
              </div>

              {/* Boss drops */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="block text-[10px] font-medium text-white/50 uppercase tracking-[0.18em]">
                    Boss drops <span className="text-white/30 normal-case tracking-normal">(optional)</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowTakenDropsPicker(true)}
                    disabled={isConfirmingTaken}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--forge-gold)]/30 bg-[var(--forge-glow)] px-2.5 py-1 text-[11px] font-bold text-[var(--forge-gold-bright)] hover:border-[var(--forge-gold)]/50 transition-colors cursor-pointer disabled:opacity-40"
                  >
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                    {takenDrops.length > 0 ? "Edit drops" : "Add drops"}
                  </button>
                </div>
                {takenDrops.length === 0 ? (
                  <button
                    type="button"
                    onClick={() => setShowTakenDropsPicker(true)}
                    disabled={isConfirmingTaken}
                    className="w-full rounded-lg border border-dashed border-white/[0.1] bg-white/[0.01] px-3 py-3 text-[11px] text-white/35 hover:text-white/60 hover:border-white/20 transition-colors cursor-pointer disabled:opacity-40"
                  >
                    No drops recorded — click to add the items this boss dropped.
                  </button>
                ) : (
                  <div className="flex flex-wrap gap-1.5 rounded-lg border border-white/[0.06] bg-white/[0.02] p-2">
                    {takenDrops.map(({ item, quantity }) => {
                      const rs = rarityStyle(item.rarity);
                      return (
                        <span key={`${item.bucket}::${item.path}`} className={`inline-flex items-center gap-1.5 rounded-md border ${rs.border} ${rs.bg} pl-1 pr-1.5 py-0.5`}>
                          <img src={item.iconUrl} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-4 w-4 rounded object-cover" />
                          <span className="text-[10px] font-semibold text-white/85 max-w-[110px] truncate">{item.itemName}</span>
                          {quantity > 1 && <span className="text-[9px] font-mono text-white/50">×{quantity}</span>}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="flex gap-2 justify-end pt-2 border-t border-white/[0.06]">
                <Button
                  variant="ghost"
                  size="sm"
                  type="button"
                  onClick={() => setTakenTarget(null)}
                  disabled={isConfirmingTaken}
                >
                  Cancel
                </Button>
                <Magnetic strength={4}>
                  <Button
                    variant="accent"
                    size="sm"
                    type="submit"
                    isLoading={isConfirmingTaken}
                    disabled={!takenGuildId || !takenTime}
                  >
                    Confirm taken
                  </Button>
                </Magnetic>
              </div>
            </form>
          </div>
        </div>
      )}

      {takenTarget && showTakenDropsPicker && (
        <BossDropsPicker
          bossName={takenTarget.bossName}
          initial={takenDrops}
          onCancel={() => setShowTakenDropsPicker(false)}
          onApply={(selected) => {
            setTakenDrops(selected);
            setShowTakenDropsPicker(false);
          }}
        />
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

// ─── Next Boss Spawn Card ───
// Owns the countdown tick + carousel/drag state entirely on its own. This
// used to live in BaseGuildDashboard itself, whose 1s ticker re-rendered the
// whole dashboard (Welcome header, Your Guilds, Upcoming list, etc.) just to
// update this one card's countdown text.
const NextBossSpawnCard = memo(function NextBossSpawnCard({
  guildId,
  dateSlides,
  canManageBossRotations,
  onTaken,
}: {
  guildId: string;
  dateSlides: BossScheduleData[];
  canManageBossRotations: boolean;
  onTaken: (boss: BossScheduleData) => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const [slideIndex, setSlideIndex] = useState(0);
  const slideDirRef = useRef<1 | -1>(1);
  const [carouselPaused, setCarouselPaused] = useState(false);
  // Card-swipe drag state (pointer/touch).
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const isDraggingRef = useRef(false);
  const dragStartXRef = useRef(0);
  const trackWrapRef = useRef<HTMLDivElement>(null);

  // Auto-advance the carousel with a back-and-forth (ping-pong) motion.
  useEffect(() => {
    if (carouselPaused || dateSlides.length <= 1) return;
    const id = setInterval(() => {
      setSlideIndex((prev) => {
        let dir = slideDirRef.current;
        let next = prev + dir;
        if (next > dateSlides.length - 1) {
          next = dateSlides.length - 2;
          dir = -1;
        } else if (next < 0) {
          next = 1;
          dir = 1;
        }
        slideDirRef.current = dir;
        return next;
      });
    }, 4200);
    return () => clearInterval(id);
  }, [carouselPaused, dateSlides.length]);

  function goToSlide(target: number, dir: 1 | -1) {
    if (dateSlides.length === 0) return;
    const clamped = Math.max(0, Math.min(dateSlides.length - 1, target));
    slideDirRef.current = dir;
    setSlideIndex(clamped);
  }

  // ─── Card-swipe pointer handlers ───
  function onCarouselPointerDown(e: React.PointerEvent) {
    if (dateSlides.length <= 1) return;
    isDraggingRef.current = true;
    setIsDragging(true);
    setCarouselPaused(true);
    dragStartXRef.current = e.clientX;
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }
  function onCarouselPointerMove(e: React.PointerEvent) {
    if (!isDraggingRef.current) return;
    setDragOffset(e.clientX - dragStartXRef.current);
  }
  function onCarouselPointerUp() {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    setIsDragging(false);
    const width = trackWrapRef.current?.clientWidth || 1;
    const threshold = Math.min(80, width * 0.22);
    const off = dragOffset;
    setDragOffset(0);
    const clampedSlideIndex = Math.min(slideIndex, Math.max(0, dateSlides.length - 1));
    if (off <= -threshold) goToSlide(clampedSlideIndex + 1, 1);
    else if (off >= threshold) goToSlide(clampedSlideIndex - 1, -1);
    setCarouselPaused(false);
  }

  // Real-time respawn timer for a specific boss. An overdue spawn rolls
  // forward to the boss's next real respawn instead of freezing on "LIVE".
  function tickFor(boss: BossScheduleData) {
    const t = getRealtimeBossTimer(boss.bossName, boss.spawnTime, now, { status: boss.status });
    return { expired: t.live, live: t.live, warning: t.warning, text: t.text, liveText: t.liveElapsedText };
  }

  const clampedSlideIndex = Math.min(slideIndex, Math.max(0, dateSlides.length - 1));
  const nextBoss = dateSlides[clampedSlideIndex] || dateSlides[0] || null;
  if (!nextBoss) return null;
  const nextBossCountdown = tickFor(nextBoss);

  return (
    <Reveal from="right">
      <section
        className={`relative card-obsidian rounded-2xl p-5 overflow-hidden transition-all duration-500 ${
          nextBossCountdown.warning || nextBossCountdown.expired
            ? "border-[var(--forge-gold)]/25"
            : ""
        }`}
        style={
          nextBossCountdown.warning || nextBossCountdown.expired
            ? { animation: "glow-pulse 3s ease-in-out infinite" }
            : undefined
        }
        onMouseEnter={() => setCarouselPaused(true)}
        onMouseLeave={() => setCarouselPaused(false)}
      >
        <div className="flex items-center gap-2 mb-3">
          <span className="text-[10px] text-[var(--forge-gold-dim)] uppercase tracking-[0.22em] font-medium">
            Next boss spawn
          </span>
          <span className="text-[9px] text-white/25 uppercase tracking-[0.14em]">· your guild</span>
          <span className="h-px flex-1 bg-gradient-to-r from-[var(--forge-gold)]/20 to-transparent" />
          {dateSlides.length > 1 && (
            <span className="text-[10px] font-mono text-white/35 tabular-nums">
              {clampedSlideIndex + 1}/{dateSlides.length}
            </span>
          )}
        </div>

        {/* Swipeable card track — each slide translates in/out like a card swipe */}
        <div
          ref={trackWrapRef}
          className="overflow-hidden touch-pan-y select-none"
          style={{ cursor: dateSlides.length > 1 ? (isDragging ? "grabbing" : "grab") : "default" }}
          onPointerDown={onCarouselPointerDown}
          onPointerMove={onCarouselPointerMove}
          onPointerUp={onCarouselPointerUp}
          onPointerCancel={onCarouselPointerUp}
        >
          <div
            className="flex items-stretch"
            style={{
              transform: `translateX(calc(${-clampedSlideIndex * 100}% + ${dragOffset}px))`,
              transition: isDragging ? "none" : "transform 0.55s cubic-bezier(0.22, 1, 0.36, 1)",
            }}
          >
            {dateSlides.map((slide) => {
              const cd = tickFor(slide);
              return (
                <div key={slide.id} className="w-full shrink-0 min-h-[196px]">
                  {/* Date badge */}
                  <div className="mb-3">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--forge-glow)] border border-[var(--metal-border)] text-[10px] font-semibold text-[var(--forge-gold-bright)] uppercase tracking-[0.14em]">
                      <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                        <line x1="16" y1="2" x2="16" y2="6" />
                        <line x1="8" y1="2" x2="8" y2="6" />
                        <line x1="3" y1="10" x2="21" y2="10" />
                      </svg>
                      {new Date(slide.spawnTime).toLocaleDateString("en-US", {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="relative h-16 w-16 rounded-xl bg-[var(--obsidian-deep)] border border-[var(--metal-border)] flex items-center justify-center overflow-hidden shrink-0 shadow-[0_0_12px_rgba(212,168,83,0.08)]">
                      {slide.bossImageUrl ? (
                        <Image
                          src={slide.bossImageUrl}
                          alt={slide.bossName}
                          fill
                          sizes="64px"
                          draggable={false}
                          className="object-cover pointer-events-none"
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
                      <p className="text-[15px] font-semibold text-white truncate">
                        {slide.bossName}
                      </p>
                      <p className="text-[11px] text-white/40 truncate mt-0.5">
                        {slide.location}
                      </p>
                      {(slide.guildTurnGuildName || slide.guildTurn) && (
                        <p className="text-[10px] text-[var(--forge-gold-dim)] mt-1 truncate">
                          Turn: {slide.guildTurnGuildName || slide.guildTurn}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Countdown */}
                  <div className="mt-4 pt-4 border-t border-white/[0.06]">
                    <p
                      className={`text-center text-[28px] font-mono font-bold tracking-tight tabular-nums ${
                        cd.live
                          ? "text-red-400"
                          : cd.warning
                            ? "text-[var(--forge-gold-bright)]"
                            : "text-[var(--forge-gold)]"
                      }`}
                    >
                      {cd.live ? cd.liveText : cd.text}
                    </p>
                    <p className="text-center text-[10px] text-white/30 uppercase tracking-[0.2em] mt-1">
                      {cd.live ? "Live · up time" : "Until spawn"}
                    </p>
                  </div>

                  {/* Status badge */}
                  <div className="mt-3 flex justify-center">
                    <BossStatusBadge
                      expired={cd.live}
                      warning={cd.warning}
                      status={slide.status}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Taken — mark the boss taken by a guild straight from the widget */}
        <div className="mt-4 pt-4 border-t border-white/[0.06]">
          <div
            className={canManageBossRotations ? "grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-2" : "flex justify-center"}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <BossCommitButton
              guildId={guildId}
              scheduleId={nextBoss.id}
              bossName={nextBoss.bossName}
              variant="inline"
            />
            {canManageBossRotations && (
              <Magnetic strength={4}>
                <Button
                  variant="accent"
                  size="sm"
                  className="w-full"
                  onClick={() => onTaken(nextBoss)}
                >
                  <span className="inline-flex items-center gap-1.5">
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
                      <path d="M22 4L12 14.01l-3-3" />
                    </svg>
                    Taken
                  </span>
                </Button>
              </Magnetic>
            )}
          </div>
        </div>

        {/* Carousel controls */}
        {dateSlides.length > 1 && (
          <div className="mt-4 flex items-center justify-between">
            <button
              type="button"
              aria-label="Previous spawn"
              onClick={() => goToSlide(clampedSlideIndex - 1, -1)}
              className="h-7 w-7 inline-flex items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.03] text-white/55 hover:text-[var(--forge-gold)] hover:border-[var(--forge-gold)]/25 transition-colors cursor-pointer disabled:opacity-30"
              disabled={clampedSlideIndex <= 0}
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6" /></svg>
            </button>

            <div className="flex items-center gap-1.5">
              {dateSlides.map((slide, i) => (
                <button
                  key={slide.id}
                  type="button"
                  aria-label={`Go to spawn ${i + 1}`}
                  onClick={() => goToSlide(i, i > clampedSlideIndex ? 1 : -1)}
                  className={`h-1.5 rounded-full transition-all duration-300 cursor-pointer ${
                    i === clampedSlideIndex
                      ? "w-5 bg-[var(--forge-gold)]"
                      : "w-1.5 bg-white/20 hover:bg-white/40"
                  }`}
                />
              ))}
            </div>

            <button
              type="button"
              aria-label="Next spawn"
              onClick={() => goToSlide(clampedSlideIndex + 1, 1)}
              className="h-7 w-7 inline-flex items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.03] text-white/55 hover:text-[var(--forge-gold)] hover:border-[var(--forge-gold)]/25 transition-colors cursor-pointer disabled:opacity-30"
              disabled={clampedSlideIndex >= dateSlides.length - 1}
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6" /></svg>
            </button>
          </div>
        )}
      </section>
    </Reveal>
  );
});

// ─── Boss Row Component ───
const BossRow = memo(function BossRow({
  boss,
  canLogKill,
  onTaken,
}: {
  boss: BossScheduleData;
  canLogKill: boolean;
  onTaken: () => void;
}) {
  // Ticks on its own so opening a modal, typing a search, or any other
  // unrelated state change up in BaseGuildDashboard doesn't force every row
  // in the Upcoming list to re-render along with it.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const t = getRealtimeBossTimer(boss.bossName, boss.spawnTime, now, { status: boss.status });
  const tick = { expired: t.live, live: t.live, warning: t.warning, text: t.text, liveText: t.liveElapsedText };

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
            {tick.live ? tick.liveText : tick.text}
          </p>
          <p className="text-[10px] text-white/40 mt-1 truncate max-w-[130px]">
            {tick.live ? "Live · up time" : boss.guildTurn ? `Turn: ${boss.guildTurn}` : "Until spawn"}
          </p>
        </div>

        {canLogKill && (
          <Magnetic strength={4}>
            <Button
              variant="ghost"
              size="sm"
              onClick={onTaken}
              className="text-emerald-400/90 hover:text-emerald-300 border border-emerald-500/[0.18] hover:border-emerald-500/35 hover:bg-emerald-500/[0.06]"
            >
              <span className="inline-flex items-center gap-1.5">
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
                  <path d="M22 4L12 14.01l-3-3" />
                </svg>
                Taken
              </span>
            </Button>
          </Magnetic>
        )}
      </div>
    </div>
  );
});

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
