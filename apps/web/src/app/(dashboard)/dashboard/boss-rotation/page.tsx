"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  dashboardApi,
  guildApi,
  type AuditLogEntry,
  type BossKilledHistoryResponse,
  type BossRotationItem,
  type BossRotationResponse,
  type BossScheduleData,
  type FactionGuildData,
} from "@/lib/api";
import { useSocket } from "@/components/providers/socket-provider";
import { useToast } from "@/components/ui/Toast";
import Button from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import DashboardDecor from "@/components/dashboard/DashboardDecor";
import { ModuleHeader } from "@/components/dashboard/DashboardHelpers";
import { useQuery, queryClient } from "@/lib/query";
import { getGuildColor } from "./utils/helpers";
import { PREDEFINED_BOSSES, getBossImageUrl, getNextBossSpawnTime } from "@guild/shared";

type RotationTab = "LIVE" | "UPCOMING" | "ACTIVITY" | "HISTORY";

type AuditLogPage = {
  logs: AuditLogEntry[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

const CONFIRM_TAKEN_TIMEOUT_MS = 30000;

function toDateTimeInputValue(date: Date) {
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 16);
}

function getCountdown(spawnTime: string, nowMs: number) {
  const diff = new Date(spawnTime).getTime() - nowMs;
  if (diff <= 0) return { text: "LIVE", warning: true, expired: true };
  const hrs = Math.floor(diff / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  const secs = Math.floor((diff % 60000) / 1000);
  return {
    text: `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`,
    warning: diff <= 60 * 60 * 1000,
    expired: false,
  };
}

export default function BossRotationPage() {
  const { user } = useAuth();
  const { socket } = useSocket();
  const { addToast } = useToast();
  const activeGuild = user?.guilds?.[0];

  const [activeTab, setActiveTab] = useState<RotationTab>("LIVE");
  const [activityPage, setActivityPage] = useState(1);
  const [historyMonth, setHistoryMonth] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTakingGuildId, setSelectedTakingGuildId] = useState("ALL");
  const [now, setNow] = useState<number | null>(null);
  const [killTarget, setKillTarget] = useState<BossRotationItem | null>(null);
  const [killTime, setKillTime] = useState("");
  const [selectedTakenGuildId, setSelectedTakenGuildId] = useState("");
  const [isKilling, setIsKilling] = useState(false);
  const isKillingRef = useRef(false);
  const rotationQueryKey = activeGuild ? `boss_rotation_v2:${activeGuild.guildId}` : "boss_rotation_empty";

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const {
    data: rotationData,
    isLoading,
    refetch: refetchRotation,
  } = useQuery<BossRotationResponse>(
    rotationQueryKey,
    async () => {
      if (!activeGuild) {
        return { serverTime: new Date().toISOString(), canManage: false, viewerRole: "MEMBER", guilds: [], rotations: [] };
      }
      const result = await dashboardApi.getBossRotation(activeGuild.guildId);
      return result.success && result.data
        ? result.data
        : { serverTime: new Date().toISOString(), canManage: false, viewerRole: "MEMBER", guilds: [], rotations: [] };
    },
    { persist: true, staleTime: 10000, enabled: !!activeGuild },
  );

  const { data: schedulesRaw } = useQuery<BossScheduleData[]>(
    activeGuild ? `boss_schedules:${activeGuild.guildId}` : "boss_schedules_empty",
    async () => {
      if (!activeGuild) return [];
      const result = await dashboardApi.getBossSchedules(activeGuild.guildId);
      return result.success && result.data?.schedules ? result.data.schedules : [];
    },
    { persist: true, staleTime: 15000, enabled: !!activeGuild },
  );

  const {
    data: auditLogsRaw,
    isLoading: isLoadingLogs,
    refetch: refetchAuditLogs,
  } = useQuery<AuditLogPage>(
    activeGuild ? `boss_rotation_audit:${activeGuild.guildId}:p${activityPage}` : "boss_rotation_audit_empty",
    async () => {
      if (!activeGuild) return { logs: [], total: 0, page: 1, limit: 10, totalPages: 1 };
      const result = await guildApi.getAuditLogs(activeGuild.guildId, "boss-rotation", activityPage, 10);
      return result.success && result.data
        ? result.data
        : { logs: [], total: 0, page: activityPage, limit: 10, totalPages: 1 };
    },
    { persist: true, staleTime: 30000, enabled: !!activeGuild },
  );

  const {
    data: killedHistoryRaw,
    isLoading: isLoadingHistory,
    refetch: refetchKilledHistory,
  } = useQuery<BossKilledHistoryResponse>(
    activeGuild ? `boss_killed_history:${activeGuild.guildId}:${historyMonth || "current"}` : "boss_killed_history_empty",
    async () => {
      if (!activeGuild) return { month: "", total: 0, days: [] };
      const result = await dashboardApi.getBossKilledHistory(activeGuild.guildId, historyMonth || undefined);
      return result.success && result.data ? result.data : { month: historyMonth, total: 0, days: [] };
    },
    { persist: true, staleTime: 30000, enabled: !!activeGuild },
  );

  useEffect(() => {
    if (activeTab === "ACTIVITY") {
      refetchAuditLogs();
    }
    if (activeTab === "HISTORY") {
      refetchKilledHistory();
    }
  }, [activeTab, refetchAuditLogs, refetchKilledHistory]);

  useEffect(() => {
    if (!socket || !activeGuild) return;
    const handleRotationUpdate = () => {
      queryClient.invalidateQueries(`boss_rotation_v2:${activeGuild.guildId}`);
      queryClient.invalidateQueries(`boss_schedules:${activeGuild.guildId}`);
      queryClient.invalidateQueries(`boss_rotation_audit:${activeGuild.guildId}`);
      queryClient.invalidateQueries(`boss_killed_history:${activeGuild.guildId}`);
    };
    socket.on("boss_rotation_updated", handleRotationUpdate);
    socket.on("boss_schedule_deleted", handleRotationUpdate);
    return () => {
      socket.off("boss_rotation_updated", handleRotationUpdate);
      socket.off("boss_schedule_deleted", handleRotationUpdate);
    };
  }, [socket, activeGuild]);

  const serverNow = now ?? new Date(rotationData?.serverTime || 0).getTime();
  const canManage = rotationData?.canManage || false;
  const schedules = useMemo(() => schedulesRaw || [], [schedulesRaw]);
  const auditLogPage = auditLogsRaw || { logs: [], total: 0, page: activityPage, limit: 10, totalPages: 1 };
  const auditLogs = auditLogPage.logs;
  const killedHistory = killedHistoryRaw || { month: historyMonth, total: 0, days: [] };

  const fallbackGuilds = useMemo<FactionGuildData[]>(() => {
    const guildMap = new Map<string, FactionGuildData>();
    for (const guild of rotationData?.guilds || []) {
      guildMap.set(guild.id, guild);
    }
    if (activeGuild) {
      guildMap.set(activeGuild.guildId, {
        id: activeGuild.guildId,
        name: activeGuild.guildName,
        slug: activeGuild.guildSlug,
        avatarUrl: activeGuild.guildAvatarUrl,
      });
    }
    for (const schedule of schedules) {
      if (schedule.guildTurnGuildId && schedule.guildTurnGuildName && !guildMap.has(schedule.guildTurnGuildId)) {
        guildMap.set(schedule.guildTurnGuildId, {
          id: schedule.guildTurnGuildId,
          name: schedule.guildTurnGuildName,
          slug: schedule.guildTurnGuildName.toLowerCase().replace(/\s+/g, "-"),
          avatarUrl: null,
        });
      }
    }
    return Array.from(guildMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [activeGuild, rotationData?.guilds, schedules]);

  const fallbackRotations = useMemo<BossRotationItem[]>(() => {
    if ((rotationData?.rotations?.length || 0) > 0 || schedules.length === 0) return [];
    const guildMap = new Map(fallbackGuilds.map((guild) => [guild.id, guild]));
    const queue = fallbackGuilds;

    return PREDEFINED_BOSSES.map((boss) => {
      const bossSchedules = schedules.filter((schedule) => schedule.bossName.toLowerCase() === boss.name.toLowerCase());
      const activeSchedule = bossSchedules
        .filter((schedule) => schedule.status !== "KILLED")
        .sort((a, b) => new Date(a.spawnTime).getTime() - new Date(b.spawnTime).getTime())[0] || null;
      const latestKilled = bossSchedules
        .filter((schedule) => schedule.status === "KILLED")
        .sort((a, b) => new Date(b.killedAt || b.spawnTime).getTime() - new Date(a.killedAt || a.spawnTime).getTime())[0] || null;

      const currentGuild =
        (activeSchedule?.guildTurnGuildId ? guildMap.get(activeSchedule.guildTurnGuildId) : null) ||
        queue[0] ||
        null;
      const currentIndex = currentGuild ? Math.max(0, queue.findIndex((guild) => guild.id === currentGuild.id)) : 0;
      const nextGuild = queue.length ? queue[(currentIndex + 1) % queue.length] || currentGuild : null;

      return {
        id: `fallback:${boss.name}`,
        bossName: boss.name,
        bossImageUrl: activeSchedule?.bossImageUrl || getBossImageUrl(boss.name),
        level: boss.level,
        type: boss.type,
        cooldownHours: boss.cooldownHours || null,
        location: activeSchedule?.location || boss.location,
        currentIndex,
        queue,
        currentGuild,
        nextGuild,
        spawnTime: activeSchedule?.spawnTime ||
          (boss.type === "FIXED_SCHEDULE"
            ? getNextBossSpawnTime(boss.name, latestKilled?.killedAt ? new Date(latestKilled.killedAt) : new Date()).toISOString()
            : (latestKilled?.spawnTime || new Date().toISOString())),
        status: activeSchedule?.status || latestKilled?.status || "UPCOMING",
        activeSchedule,
        latestKilled,
      };
    });
  }, [fallbackGuilds, rotationData?.rotations?.length, schedules]);

  const rotations = useMemo(
    () => (rotationData?.rotations?.length ? rotationData.rotations : fallbackRotations),
    [fallbackRotations, rotationData],
  );

  const takingGuilds = useMemo(() => {
    const guildMap = new Map<string, FactionGuildData>();
    for (const guild of fallbackGuilds) {
      guildMap.set(guild.id, guild);
    }
    for (const rotation of rotations) {
      for (const guild of rotation.queue) {
        guildMap.set(guild.id, guild);
      }
      if (rotation.currentGuild) guildMap.set(rotation.currentGuild.id, rotation.currentGuild);
      if (rotation.nextGuild) guildMap.set(rotation.nextGuild.id, rotation.nextGuild);
    }
    return Array.from(guildMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [fallbackGuilds, rotations]);

  const filteredRotations = useMemo(() => {
    const needle = searchQuery.trim().toLowerCase();
    return rotations.filter((rotation) => {
      const matchesSearch = !needle ||
        rotation.bossName.toLowerCase().includes(needle) ||
        rotation.location.toLowerCase().includes(needle) ||
        rotation.currentGuild?.name.toLowerCase().includes(needle) ||
        rotation.nextGuild?.name.toLowerCase().includes(needle) ||
        rotation.queue.some((guild) => guild.name.toLowerCase().includes(needle));

      const takingGuildId = rotation.currentGuild?.id || rotation.activeSchedule?.guildTurnGuildId || "";
      const matchesGuild =
        selectedTakingGuildId === "ALL" ||
        (selectedTakingGuildId === "UNASSIGNED" && !takingGuildId) ||
        takingGuildId === selectedTakingGuildId;

      return matchesSearch && matchesGuild;
    });
  }, [rotations, searchQuery, selectedTakingGuildId]);

  const upcomingSchedules = schedules
    .filter((schedule) => schedule.status !== "KILLED")
    .sort((a, b) => new Date(a.spawnTime).getTime() - new Date(b.spawnTime).getTime())
    .slice(0, 24);

  const modalGuildQueue = useMemo(() => {
    if (!killTarget) return [];
    const guildMap = new Map<string, FactionGuildData>();
    for (const guild of killTarget.queue) {
      guildMap.set(guild.id, guild);
    }
    for (const guild of takingGuilds) {
      if (!guildMap.has(guild.id)) {
        guildMap.set(guild.id, guild);
      }
    }
    return Array.from(guildMap.values());
  }, [killTarget, takingGuilds]);

  const selectedTakenGuild = modalGuildQueue.find((guild) => guild.id === selectedTakenGuildId) || null;
  const previewNextGuild = selectedTakenGuild && modalGuildQueue.length > 0
    ? modalGuildQueue[(modalGuildQueue.findIndex((guild) => guild.id === selectedTakenGuild.id) + 1) % modalGuildQueue.length] || null
    : null;
  const canConfirmTaken = Boolean(killTarget && killTime && selectedTakenGuild && !isKilling);

  function openKillModal(rotation: BossRotationItem) {
    isKillingRef.current = false;
    setIsKilling(false);
    const defaultGuildId =
      rotation.activeSchedule?.guildTurnGuildId ||
      rotation.currentGuild?.id ||
      rotation.queue[0]?.id ||
      takingGuilds[0]?.id ||
      "";
    setKillTarget(rotation);
    setKillTime(toDateTimeInputValue(new Date()));
    setSelectedTakenGuildId(defaultGuildId);
  }

  async function confirmKill() {
    if (isKillingRef.current || !activeGuild || !killTarget || !killTime || !selectedTakenGuild) return;
    isKillingRef.current = true;
    setIsKilling(true);
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), CONFIRM_TAKEN_TIMEOUT_MS);
    try {
      const killedAt = new Date(killTime).toISOString();
      const result = killTarget.activeSchedule
        ? await dashboardApi.markBossRotationKilled(
            activeGuild.guildId,
            killTarget.activeSchedule.id,
            killedAt,
            selectedTakenGuild.id,
            controller.signal,
          )
        : await dashboardApi.markBossRotationKilledByName(
            activeGuild.guildId,
            killTarget.bossName,
            killedAt,
            selectedTakenGuild.id,
            controller.signal,
          );
      window.clearTimeout(timeoutId);
      if (result.success) {
        addToast("success", `${killTarget.bossName} taken by ${selectedTakenGuild?.name || "selected guild"}. Next spawn has been calculated.`);
        setKillTarget(null);
        setSelectedTakenGuildId("");
        queryClient.invalidateQueries(`boss_rotation_v2:${activeGuild.guildId}`);
        queryClient.invalidateQueries(`boss_schedules:${activeGuild.guildId}`);
        queryClient.invalidateQueries(`boss_rotation_audit:${activeGuild.guildId}`);
        queryClient.invalidateQueries(`boss_killed_history:${activeGuild.guildId}`);
        void refetchRotation();
      } else {
        addToast("error", result.error?.message || "Failed to mark boss taken");
      }
    } catch (error) {
      window.clearTimeout(timeoutId);
      if (error instanceof DOMException && error.name === "AbortError") {
        addToast("error", "Confirm taken timed out. Refreshing boss rotation status.");
        if (activeGuild) {
          queryClient.invalidateQueries(`boss_rotation_v2:${activeGuild.guildId}`);
          queryClient.invalidateQueries(`boss_schedules:${activeGuild.guildId}`);
          void refetchRotation();
        }
      } else {
        addToast("error", "Failed to mark boss taken");
      }
    } finally {
      window.clearTimeout(timeoutId);
      isKillingRef.current = false;
      setIsKilling(false);
    }
  }

  if (!user || !activeGuild) {
    return (
      <div className="flex items-center justify-center h-64 animate-fade-in">
        <p className="text-white/40">No active guild selected</p>
      </div>
    );
  }

  const tabs: Array<{ id: RotationTab; label: string; count?: number; hidden?: boolean }> = [
    { id: "LIVE", label: "Boss Rotation", count: filteredRotations.length },
    { id: "UPCOMING", label: "Upcoming", count: upcomingSchedules.length },
    { id: "ACTIVITY", label: "Activity", count: auditLogPage.total },
    { id: "HISTORY", label: "Killed History", count: killedHistory.total },
  ];

  return (
    <div className="relative max-w-full xl:max-w-[1600px] mx-auto w-full px-2 md:px-4 lg:px-6">
      <DashboardDecor />
      <div className="relative z-10 space-y-6 text-white/85">
        <ModuleHeader
          eyebrow="Faction Operations"
          title="Faction Boss Rotation"
          description="Server-owned rotation queues, realtime timers, and guild leader notifications."
          right={
            <Button variant="ghost" size="sm" onClick={refetchRotation} isLoading={isLoading}>
              Refresh
            </Button>
          }
        />

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="inline-flex flex-wrap items-center bg-[var(--obsidian-elevated)]/40 backdrop-blur-md border border-[var(--metal-border)] rounded-xl p-1 gap-1">
            {tabs.filter((tab) => !tab.hidden).map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`relative px-4 py-2 text-[13px] font-semibold rounded-lg transition-all cursor-pointer focus-ring ${
                  activeTab === tab.id
                    ? "bg-[var(--forge-glow)] border border-[var(--forge-gold)]/25 text-[var(--forge-gold-bright)] shadow-[0_0_12px_rgba(212,168,83,0.1)]"
                    : "text-white/45 hover:text-white/75 border border-transparent hover:bg-white/[0.03]"
                }`}
              >
                {tab.label}
                {typeof tab.count === "number" && (
                  <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded-full ${
                    activeTab === tab.id
                      ? "bg-[var(--forge-gold)]/15 text-[var(--forge-gold)]"
                      : "bg-white/5 text-white/45"
                  }`}>
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-[minmax(180px,240px)_minmax(220px,320px)] gap-2 w-full lg:w-auto">
            <label className="relative block">
              <span className="sr-only">Filter taking guild</span>
              <select
                value={selectedTakingGuildId}
                onChange={(event) => setSelectedTakingGuildId(event.target.value)}
                className="w-full h-[42px] px-3.5 rounded-xl bg-[var(--obsidian-elevated)]/50 border border-[var(--metal-border)] text-[13px] text-white/90 focus:outline-none focus:border-[var(--forge-gold)]/35 transition-colors cursor-pointer"
              >
                <option className="bg-[#0c0d12]" value="ALL">All taking guilds</option>
                <option className="bg-[#0c0d12]" value="UNASSIGNED">Unassigned</option>
                {takingGuilds.map((guild) => (
                  <option className="bg-[#0c0d12]" key={guild.id} value={guild.id}>
                    {guild.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="relative block">
              <span className="sr-only">Search rotations</span>
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <path d="M21 21l-4.35-4.35" />
              </svg>
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search boss or guild..."
                className="w-full h-[42px] pl-10 pr-4 rounded-xl bg-[var(--obsidian-elevated)]/50 border border-[var(--metal-border)] text-sm text-white/90 placeholder:text-white/35 focus:outline-none focus:border-[var(--forge-gold)]/35 transition-colors"
              />
            </label>
          </div>
        </div>

        {activeTab === "LIVE" && (
          isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((item) => <Skeleton key={item} className="h-72 rounded-xl" />)}
            </div>
          ) : filteredRotations.length === 0 ? (
            <EmptyState title="No rotations found" body="Try a different boss or guild search." />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              {filteredRotations.map((rotation) => (
                <RotationCard
                  key={rotation.id}
                  rotation={rotation}
                  serverNow={serverNow}
                  canManage={canManage}
                  onKilled={() => openKillModal(rotation)}
                />
              ))}
            </div>
          )
        )}

        {activeTab === "UPCOMING" && (
          <div>
            {upcomingSchedules.length === 0 ? (
              <EmptyState title="No upcoming schedules" body="Killed bosses will automatically create their next spawn here." />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                {upcomingSchedules.map((schedule) => (
                  <UpcomingCard key={schedule.id} schedule={schedule} serverNow={serverNow} />
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "ACTIVITY" && (
          isLoadingLogs ? (
            <div className="space-y-2">
              {[1, 2, 3].map((item) => <Skeleton key={item} className="h-16 rounded-xl" />)}
            </div>
          ) : auditLogs.length === 0 ? (
            <EmptyState title="No rotation activity" body="Kill confirmations and queue edits will appear here." />
          ) : (
            <div className="space-y-3">
              <div className="space-y-2">
                {auditLogs.map((log) => (
                  <div key={log.id} className="rounded-xl border border-white/[0.06] bg-white/[0.025] px-4 py-3 flex flex-col md:flex-row md:items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white">{log.action.replaceAll("_", " ")}</p>
                      <p className="text-xs text-white/45 mt-1 truncate">
                        {typeof log.detail?.bossName === "string" ? log.detail.bossName : log.target || "Boss Rotation"}
                      </p>
                      <p className="text-[11px] text-white/35 mt-2">
                        Recorded by <span className="text-white/65 font-semibold">{log.actor.displayName}</span>
                      </p>
                    </div>
                    <span className="text-[11px] text-white/35 shrink-0 font-mono">
                      {new Date(log.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                ))}
              </div>
              <PaginationControls
                page={auditLogPage.page}
                totalPages={Math.max(1, auditLogPage.totalPages)}
                total={auditLogPage.total}
                onPrevious={() => setActivityPage((page) => Math.max(1, page - 1))}
                onNext={() => setActivityPage((page) => Math.min(Math.max(1, auditLogPage.totalPages), page + 1))}
              />
            </div>
          )
        )}

        {activeTab === "HISTORY" && (
          <div className="space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-white/[0.025] px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-white">Boss Killed History</p>
                <p className="text-xs text-white/45 mt-1">Daily kill record by month, including the user who recorded each kill.</p>
              </div>
              <label className="w-full md:w-[180px]">
                <span className="sr-only">History month</span>
                <input
                  type="month"
                  value={historyMonth || killedHistory.month}
                  onChange={(event) => setHistoryMonth(event.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg bg-white/[0.03] border border-white/[0.08] text-[13px] text-white focus:outline-none focus:border-[var(--forge-gold)]/40"
                />
              </label>
            </div>

            {isLoadingHistory ? (
              <div className="space-y-2">
                {[1, 2, 3].map((item) => <Skeleton key={item} className="h-24 rounded-xl" />)}
              </div>
            ) : killedHistory.days.length === 0 ? (
              <EmptyState title="No kills recorded for this month" body="Confirmed boss kills will be grouped here by day." />
            ) : (
              <div className="space-y-3">
                {killedHistory.days.map((day) => (
                  <section key={day.date} className="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
                    <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] bg-white/[0.025] px-4 py-3">
                      <h3 className="text-sm font-semibold text-white">
                        {new Date(`${day.date}T00:00:00`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                      </h3>
                      <span className="text-[11px] px-2 py-1 rounded-md border border-emerald-400/20 bg-emerald-400/10 text-emerald-300 font-semibold">
                        {day.total} killed
                      </span>
                    </div>
                    <div className="divide-y divide-white/[0.05]">
                      {day.kills.map((kill) => (
                        <div key={kill.id} className="px-4 py-3 grid grid-cols-1 lg:grid-cols-[1fr_160px_180px_180px] gap-2 lg:gap-4 items-center">
                          <div className="min-w-0 flex items-center gap-3">
                            <BossAvatar src={kill.bossImageUrl} name={kill.bossName} />
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-white truncate">{kill.bossName}</p>
                              <p className="text-[11px] text-white/40 mt-1">
                                {kill.action.replaceAll("_", " ")}
                              </p>
                            </div>
                          </div>
                          <HistoryMeta label="Killed" value={new Date(kill.killedAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })} />
                          <HistoryMeta label="Recorded by" value={kill.recordedBy.displayName} />
                          <HistoryMeta label="Next guild" value={kill.nextGuildName || "Unassigned"} tone="amber" />
                        </div>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {killTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-md" onClick={() => !isKilling && setKillTarget(null)} />
          <div className="relative w-full max-w-md rounded-xl border border-[var(--metal-border)] bg-[var(--obsidian-elevated)] shadow-[0_40px_90px_-25px_rgba(0,0,0,0.8)] p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="relative p-0.5 rounded-xl border border-emerald-500/30 glow-gold-active">
                <BossAvatar src={killTarget.bossImageUrl || getBossImageUrl(killTarget.bossName)} name={killTarget.bossName} />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-[0.22em] text-emerald-300">Confirm taken</p>
                <h3 className="text-base font-semibold text-white">{killTarget.bossName}</h3>
              </div>
            </div>

            <div className="rounded-xl border border-[var(--metal-border)] bg-[var(--obsidian-elevated)]/60 p-3 space-y-2 mb-4">
              <ModalLine label="Taking guild" value={selectedTakenGuild?.name || "Select a guild"} tone="emerald" />
              <ModalLine label="Next guild" value={previewNextGuild?.name || "Unassigned"} tone="amber" />
              <ModalLine label="Next spawn source" value="Calculated from taken time" />
            </div>

            {!killTarget.activeSchedule && (
              <p className="mb-4 rounded-lg border border-[var(--forge-gold)]/20 bg-[var(--forge-glow)]/20 px-3 py-2 text-xs leading-5 text-[var(--forge-gold-dim)]">
                This boss has no active schedule yet. Confirming will import the latest killed time and calculate the next spawn.
              </p>
            )}

            <label className="block mb-4">
              <span className="block text-[10px] font-medium text-white/50 uppercase tracking-[0.18em] mb-2">
                Taking guild
              </span>
              <select
                value={selectedTakenGuildId}
                onChange={(event) => setSelectedTakenGuildId(event.target.value)}
                disabled={isKilling}
                className="w-full px-3.5 py-2.5 rounded-lg bg-[var(--obsidian-elevated)]/60 border border-[var(--metal-border)] text-[13px] text-white focus:outline-none focus:border-[var(--forge-gold)]/40 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                <option className="bg-[#0c0d12]" value="">Select taking guild</option>
                {modalGuildQueue.map((guild) => (
                  <option className="bg-[#0c0d12]" key={guild.id} value={guild.id}>
                    {guild.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block mb-5">
              <span className="block text-[10px] font-medium text-white/50 uppercase tracking-[0.18em] mb-2">
                Taken time
              </span>
              <input
                type="datetime-local"
                value={killTime}
                onChange={(event) => setKillTime(event.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg bg-[var(--obsidian-elevated)]/60 border border-[var(--metal-border)] text-[13px] text-white focus:outline-none focus:border-[var(--forge-gold)]/40"
              />
            </label>

            <div className="flex justify-end gap-2 border-t border-white/[0.06] pt-4">
              <Button variant="ghost" size="sm" onClick={() => setKillTarget(null)} disabled={isKilling}>
                Cancel
              </Button>
              <Button variant="accent" size="sm" onClick={confirmKill} isLoading={isKilling} disabled={!canConfirmTaken}>
                Confirm taken
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function RotationCard({
  rotation,
  serverNow,
  canManage,
  onKilled,
}: {
  rotation: BossRotationItem;
  serverNow: number;
  canManage: boolean;
  onKilled: () => void;
}) {
  const tick = getCountdown(rotation.spawnTime, serverNow);
  const currentColor = getGuildColor(rotation.currentGuild?.name || "");
  const nextColor = getGuildColor(rotation.nextGuild?.name || "");
  const canKill = canManage;
  const spawnLabel = new Date(rotation.spawnTime).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

  return (
    <article className={`relative min-h-[300px] rounded-2xl transition-all duration-300 bg-[var(--obsidian-elevated)]/40 border border-[var(--metal-border)] ${
      tick.expired 
        ? "hover:border-emerald-500/35 hover:shadow-[0_0_25px_rgba(16,185,129,0.08)]" 
        : tick.warning 
          ? "hover:border-[var(--forge-gold)]/40 hover:shadow-[0_0_25px_rgba(212,168,83,0.12)]" 
          : "hover:border-white/15 hover:shadow-[0_8px_30px_rgb(0,0,0,0.4)]"
    }`}>
      {/* Top indicator bar matching state */}
      <div className={`absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r ${
        tick.expired 
          ? "from-emerald-500/50 via-emerald-400 to-emerald-500/50" 
          : tick.warning 
            ? "from-[var(--forge-gold)]/50 via-[var(--forge-gold)] to-[var(--forge-gold)]/50" 
            : "from-white/5 via-white/15 to-white/5"
      }`} />

      <div className="p-4 space-y-3.5">
        {/* Boss info & badge */}
        <div className="flex items-start gap-3">
          <div className={`relative p-0.5 rounded-xl border transition-all duration-300 ${
            tick.expired 
              ? "border-emerald-500/30 glow-gold-active" 
              : tick.warning 
                ? "border-[var(--forge-gold)]/30 shadow-[0_0_12px_rgba(212,168,83,0.2)]" 
                : "border-white/10"
          }`}>
            <BossAvatar src={rotation.bossImageUrl || getBossImageUrl(rotation.bossName)} name={rotation.bossName} />
          </div>
          <div className="min-w-0 flex-1 pt-0.5">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-white truncate">{rotation.bossName}</h3>
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-[var(--forge-glow)] border border-[var(--forge-gold)]/25 text-[var(--forge-gold-bright)] font-fantasy shrink-0">
                Lvl {rotation.level}
              </span>
            </div>
            <div className="flex items-center gap-1 text-white/40 mt-1">
              <svg className="h-3 w-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2a8 8 0 00-8 8c0 5.25 8 12 8 12s8-6.75 8-12a8 8 0 00-8-8z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              <span className="text-[11px] truncate">{rotation.location}</span>
            </div>
          </div>
          <StatusDot expired={tick.expired} warning={tick.warning} />
        </div>

        {/* Timer Box */}
        <div className={`relative overflow-hidden rounded-xl border p-3 ${
          tick.expired 
            ? "border-emerald-500/25 bg-emerald-950/15 shadow-[inset_0_0_12px_rgba(16,185,129,0.08)]" 
            : tick.warning 
              ? "border-[var(--forge-gold)]/20 bg-[var(--forge-glow)]/40 shadow-[inset_0_0_12px_rgba(212,168,83,0.05)]" 
              : "border-white/[0.05] bg-white/[0.01]"
        }`}>
          {(tick.expired || tick.warning) && (
            <div className={`absolute inset-0 opacity-10 bg-gradient-to-r ${
              tick.expired ? "from-emerald-500 via-transparent to-emerald-500 animate-pulse-soft" : "from-[var(--forge-gold)] via-transparent to-[var(--forge-gold)] animate-pulse-soft"
            }`} />
          )}

          <div className="relative z-10 flex items-center justify-between">
            <span className="text-[9px] uppercase tracking-[0.2em] font-bold text-white/30">Rotation Timer</span>
            <span className={`text-[9px] font-bold uppercase tracking-[0.12em] inline-flex items-center gap-1 ${
              tick.expired ? "text-emerald-400" : tick.warning ? "text-[var(--forge-gold)]" : "text-white/45"
            }`}>
              {tick.expired ? (
                <>
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
                  Live
                </>
              ) : tick.warning ? (
                <>
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--forge-gold)]" />
                  Soon
                </>
              ) : (
                "Next Spawn"
              )}
            </span>
          </div>
          <p className={`relative z-10 mt-1.5 font-mono text-lg font-bold leading-none tracking-wider ${
            tick.expired ? "text-emerald-400 text-gold-gradient" : tick.warning ? "text-[var(--forge-gold-bright)] text-gold-gradient-light" : "text-white"
          }`}>
            {tick.text}
          </p>
          <div className="relative z-10 mt-2 flex items-center gap-1 text-[10px] text-white/35 border-t border-white/[0.04] pt-2">
            <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            <span>Est. Spawn: {spawnLabel}</span>
          </div>
        </div>

        {/* Current & Next progress */}
        <div className="relative flex items-center justify-between gap-2 rounded-xl border border-[var(--metal-border)] bg-[var(--obsidian-elevated)]/30 p-2">
          <div className="min-w-0 flex-1">
            <span className="block text-[8px] uppercase tracking-[0.16em] text-white/30 font-bold mb-1">Current Holder</span>
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: currentColor.dot }} />
              <p className={`text-[12px] font-bold truncate ${currentColor.text}`}>{rotation.currentGuild?.name || "Unassigned"}</p>
            </div>
          </div>
          <div className="shrink-0 flex items-center justify-center px-1">
            <svg className="h-4 w-4 text-white/20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </div>
          <div className="min-w-0 flex-1 text-right">
            <span className="block text-[8px] uppercase tracking-[0.16em] text-white/30 font-bold mb-1">Up Next</span>
            <div className="flex items-center gap-1.5 justify-end">
              <p className={`text-[12px] font-bold truncate ${nextColor.text}`}>{rotation.nextGuild?.name || "Unassigned"}</p>
              <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: nextColor.dot }} />
            </div>
          </div>
        </div>

        {/* Queue Flow */}
        <div className="rounded-xl border border-[var(--metal-border)] bg-[var(--obsidian-elevated)]/20 p-3 min-h-[66px]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[9px] uppercase tracking-[0.2em] font-bold text-white/30">Queue Flow</span>
            <span className="text-[9px] text-white/35 font-mono">{rotation.queue.length} Guilds</span>
          </div>
          {rotation.queue.length === 0 ? (
            <div className="flex items-center justify-center py-2">
              <p className="text-[10px] text-white/30 italic">No guilds in queue</p>
            </div>
          ) : (
            <div className="flex items-center flex-wrap gap-1">
              {rotation.queue.map((guild, index) => {
                const color = getGuildColor(guild.name);
                const isCurrent = rotation.currentGuild?.id === guild.id;
                
                return (
                  <div key={guild.id} className="flex items-center gap-1">
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[10px] font-semibold transition-all ${
                        isCurrent 
                          ? "border-[var(--forge-gold)]/45 bg-[var(--forge-glow)] text-[var(--forge-gold-bright)] shadow-[0_0_8px_rgba(212,168,83,0.15)]" 
                          : `${color.border} ${color.bg} ${color.text} hover:opacity-90`
                      }`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${isCurrent ? "animate-pulse" : ""}`} style={{ backgroundColor: isCurrent ? "var(--forge-gold)" : color.dot }} />
                      <span className="font-mono text-[9px] opacity-65">{index + 1}.</span>
                      <span className="truncate max-w-[80px]">{guild.name}</span>
                    </span>
                    {index < rotation.queue.length - 1 && (
                      <span className="text-white/15 text-[8px] font-bold shrink-0 mx-0.5">
                        •
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between gap-3 border-t border-white/[0.04] pt-3">
          <div className="flex items-center gap-1.5 text-[10px] text-white/45">
            <span className={`h-2 w-2 rounded-full ${
              rotation.activeSchedule
                ? "bg-emerald-400"
                : rotation.type === "FIXED_SCHEDULE"
                  ? "bg-emerald-400"
                  : "bg-amber-400"
            }`} />
            <span>{
              rotation.activeSchedule
                ? "Active schedule"
                : rotation.type === "FIXED_SCHEDULE"
                  ? "Fixed schedule"
                  : "Import needed"
            }</span>
          </div>
          {canManage && (
            <button
              type="button"
              onClick={onKilled}
              disabled={!canKill}
              aria-label={`Mark ${rotation.bossName} taken`}
              title={rotation.activeSchedule ? "Taken" : "Import killed time"}
              className="h-9 px-4 inline-flex items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-[11px] font-bold uppercase tracking-[0.15em] text-emerald-400 hover:bg-emerald-500/20 hover:border-emerald-500/50 hover:text-white disabled:opacity-35 disabled:cursor-not-allowed transition-all duration-300 cursor-pointer shadow-[0_0_12px_rgba(16,185,129,0.05)] hover:shadow-[0_0_16px_rgba(16,185,129,0.15)] focus-ring"
            >
              <svg className="h-3.5 w-3.5 mr-1.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
                <path d="M22 4L12 14.01l-3-3" />
              </svg>
              Taken
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

function UpcomingCard({ schedule, serverNow }: { schedule: BossScheduleData; serverNow: number }) {
  const tick = getCountdown(schedule.spawnTime, serverNow);
  const color = getGuildColor(schedule.guildTurnGuildName || schedule.guildTurn || "");
  const spawnLabel = new Date(schedule.spawnTime).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  const isLive = tick.expired || schedule.status === "SPAWNED";

  return (
    <article className={`relative min-h-[220px] rounded-2xl transition-all duration-300 bg-[var(--obsidian-elevated)]/40 border border-[var(--metal-border)] ${
      isLive 
        ? "hover:border-emerald-500/35 hover:shadow-[0_0_25px_rgba(16,185,129,0.08)]" 
        : tick.warning 
          ? "hover:border-[var(--forge-gold)]/40 hover:shadow-[0_0_25px_rgba(212,168,83,0.12)]" 
          : "hover:border-white/15 hover:shadow-[0_8px_30px_rgb(0,0,0,0.4)]"
    }`}>
      {/* Top indicator bar */}
      <div className={`absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r ${
        isLive 
          ? "from-emerald-500/50 via-emerald-400 to-emerald-500/50" 
          : tick.warning 
            ? "from-[var(--forge-gold)]/50 via-[var(--forge-gold)] to-[var(--forge-gold)]/50" 
            : "from-white/5 via-white/15 to-white/5"
      }`} />

      <div className="p-4 space-y-3.5">
        <div className="flex items-start gap-3">
          <div className={`relative p-0.5 rounded-xl border transition-all duration-300 ${
            isLive 
              ? "border-emerald-500/30 glow-gold-active" 
              : tick.warning 
                ? "border-[var(--forge-gold)]/30 shadow-[0_0_12px_rgba(212,168,83,0.2)]" 
                : "border-white/10"
          }`}>
            <BossAvatar src={schedule.bossImageUrl || getBossImageUrl(schedule.bossName)} name={schedule.bossName} />
          </div>
          <div className="min-w-0 flex-1 pt-0.5">
            <h3 className="text-sm font-bold text-white truncate">{schedule.bossName}</h3>
            <div className="flex items-center gap-1 text-white/40 mt-1">
              <svg className="h-3 w-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2a8 8 0 00-8 8c0 5.25 8 12 8 12s8-6.75 8-12a8 8 0 00-8-8z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              <span className="text-[11px] truncate">{schedule.location}</span>
            </div>
          </div>
          <StatusDot expired={isLive} warning={tick.warning} />
        </div>

        <div className={`relative overflow-hidden rounded-xl border p-3 ${
          isLive 
            ? "border-emerald-500/25 bg-emerald-950/15 shadow-[inset_0_0_12px_rgba(16,185,129,0.08)]" 
            : tick.warning 
              ? "border-[var(--forge-gold)]/20 bg-[var(--forge-glow)]/40 shadow-[inset_0_0_12px_rgba(212,168,83,0.05)]" 
              : "border-white/[0.05] bg-white/[0.01]"
        }`}>
          {(isLive || tick.warning) && (
            <div className={`absolute inset-0 opacity-10 bg-gradient-to-r ${
              isLive ? "from-emerald-500 via-transparent to-emerald-500 animate-pulse-soft" : "from-[var(--forge-gold)] via-transparent to-[var(--forge-gold)] animate-pulse-soft"
            }`} />
          )}

          <div className="relative z-10 flex items-center justify-between">
            <span className="text-[9px] uppercase tracking-[0.2em] font-bold text-white/30">Timer</span>
            <span className={`text-[9px] font-semibold uppercase tracking-[0.14em] ${isLive ? "text-emerald-300" : tick.warning ? "text-[var(--forge-gold)]" : "text-white/45"}`}>
              {schedule.status === "SPAWNED" ? "Live" : tick.warning ? "Soon" : "Upcoming"}
            </span>
          </div>
          <p className={`relative z-10 mt-1.5 font-mono text-lg font-bold leading-none ${isLive ? "text-emerald-300" : tick.warning ? "text-[var(--forge-gold-bright)] text-gold-gradient-light" : "text-white"}`}>
            {schedule.status === "SPAWNED" ? "LIVE" : tick.text}
          </p>
          <div className="relative z-10 mt-2 flex items-center gap-1 text-[10px] text-white/35 border-t border-white/[0.04] pt-2">
            <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            <span>Spawn: {spawnLabel}</span>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-white/[0.04] pt-3">
          <div className="min-w-0">
            <p className="text-[8px] uppercase tracking-[0.16em] text-white/30 font-bold mb-1">Taking Guild</p>
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: color.dot }} />
              <p className={`text-[12px] font-bold truncate ${color.text}`}>
                {schedule.guildTurnGuildName || schedule.guildTurn || "Unassigned"}
              </p>
            </div>
          </div>
          <span className={`h-6 px-2.5 inline-flex items-center justify-center rounded-lg border text-[10px] font-bold uppercase tracking-wider ${color.border} ${color.bg} ${color.text}`}>
            {schedule.status}
          </span>
        </div>
      </div>
    </article>
  );
}

function StatusDot({ expired, warning }: { expired: boolean; warning: boolean }) {
  return (
    <span
      className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${
        expired
          ? "bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.8)]"
          : warning
            ? "bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.75)]"
            : "bg-white/25"
      }`}
      aria-hidden="true"
    />
  );
}

function PaginationControls({
  page,
  totalPages,
  total,
  onPrevious,
  onNext,
}: {
  page: number;
  totalPages: number;
  total: number;
  onPrevious: () => void;
  onNext: () => void;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
      <p className="text-[11px] text-white/40">
        Showing page <span className="text-white/70 font-semibold">{page}</span> of{" "}
        <span className="text-white/70 font-semibold">{totalPages}</span> for {total} records
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onPrevious}
          disabled={page <= 1}
          aria-label="Previous activity page"
          className="h-9 w-9 inline-flex items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.03] text-white/60 hover:text-white hover:border-amber-500/25 disabled:opacity-35 disabled:cursor-not-allowed transition-colors focus-ring"
        >
          <ChevronLeftIcon />
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={page >= totalPages}
          aria-label="Next activity page"
          className="h-9 w-9 inline-flex items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.03] text-white/60 hover:text-white hover:border-amber-500/25 disabled:opacity-35 disabled:cursor-not-allowed transition-colors focus-ring"
        >
          <ChevronRightIcon />
        </button>
      </div>
    </div>
  );
}

function HistoryMeta({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "amber" }) {
  return (
    <div className="min-w-0">
      <p className="text-[9px] uppercase tracking-[0.16em] text-white/35">{label}</p>
      <p className={`text-[12px] font-semibold truncate mt-1 ${tone === "amber" ? "text-amber-300" : "text-white/75"}`}>{value}</p>
    </div>
  );
}

function BossAvatar({ src, name }: { src: string; name: string }) {
  return (
    <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg border border-white/[0.08] bg-zinc-950">
      <img
        src={src}
        alt={name}
        className="h-full w-full object-cover"
        loading="lazy"
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/35 to-transparent" />
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-72 rounded-xl bg-white/[0.015] border border-white/[0.05] p-8 text-center">
      <svg className="h-10 w-10 text-white/20 mb-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 8v4" />
        <path d="M12 16h.01" />
      </svg>
      <h3 className="text-sm font-semibold text-white/80">{title}</h3>
      <p className="text-xs text-white/45 mt-1 max-w-sm">{body}</p>
    </div>
  );
}

function ModalLine({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "amber" | "emerald" }) {
  const toneClass = tone === "amber"
    ? "text-amber-300"
    : tone === "emerald"
      ? "text-emerald-300"
      : "text-white/80";

  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[11px] text-white/40">{label}</span>
      <span className={`text-[12px] font-semibold text-right ${toneClass}`}>{value}</span>
    </div>
  );
}

function ChevronLeftIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}
