"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/lib/auth-context";
import { dashboardApi, guildApi, type BossScheduleData, type BossData, type AuditLogEntry } from "@/lib/api";
import { useSocket } from "@/components/providers/socket-provider";
import { useToast } from "@/components/ui/Toast";
import Button from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import DashboardDecor from "@/components/dashboard/DashboardDecor";
import { ModuleHeader } from "@/components/dashboard/DashboardHelpers";
import { getBossImageUrl, getNextBossSpawnTime, PREDEFINED_BOSSES } from "@guild/shared";

// Subcomponents
import FiltersPanel from "./components/FiltersPanel";
import BossCardView from "./components/BossCardView";
import BossTimelineView from "./components/BossTimelineView";
import UpcomingSchedulesView from "./components/UpcomingSchedulesView";
import ActivityLogsView from "./components/ActivityLogsView";
import MaintenanceResetModal from "./components/MaintenanceResetModal";

// Helpers & Types
import { getGuildColor, getTickingCountdown, type RotationBoss } from "./utils/helpers";

import { useQuery, queryClient } from "@/lib/query";

export default function BossRotationPage() {
  const { user } = useAuth();
  const { socket } = useSocket();
  const { addToast } = useToast();

  const [currentTime, setCurrentTime] = useState(Date.now());

  // Tabs state: ROTATION (Boss cards), UPCOMING (Upcoming timeline), ACTIVITY (Activity logs)
  const [activeTab, setActiveTab] = useState<"ROTATION" | "UPCOMING" | "ACTIVITY">("ROTATION");

  // Filters State (only applies to ROTATION tab)
  const [selectedBossFilter, setSelectedBossFilter] = useState("ALL");
  const [selectedGuildFilter, setSelectedGuildFilter] = useState("ALL");
  const [availableOnly, setAvailableOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // View Switcher for Boss Rotation (Card vs Timeline)
  const [viewMode, setViewMode] = useState<"CARD" | "TIMELINE">("CARD");

  // Maintenance Reset Modal State
  const [isMaintenanceModalOpen, setIsMaintenanceModalOpen] = useState(false);
  const [isMaintenanceProcessing, setIsMaintenanceProcessing] = useState(false);

  // Sync clocks every second
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const activeGuild = user?.guilds?.[0];

  // ─── Persistent Queries ────────────────────────────────

  // 1. Boss Registry Query
  const {
    data: bossRegistryRaw,
    isLoading: isLoadingRegistry,
  } = useQuery<BossData[]>(
    "boss_registry",
    async () => {
      const result = await dashboardApi.getBosses();
      return result.success && result.data?.bosses ? result.data.bosses : [];
    },
    { persist: true, staleTime: 300000 }
  );
  const bossRegistry = bossRegistryRaw || [];

  // 2. Boss Schedules Query (shares cache key with main dashboard page!)
  const {
    data: schedulesRaw,
    isLoading: isLoadingSchedules,
  } = useQuery<BossScheduleData[]>(
    activeGuild ? `boss_schedules:${activeGuild.guildId}` : "boss_schedules_empty",
    async () => {
      if (!activeGuild) return [];
      const result = await dashboardApi.getBossSchedules(activeGuild.guildId);
      return result.success && result.data?.schedules ? result.data.schedules : [];
    },
    { persist: true, staleTime: 15000 }
  );
  const schedules = schedulesRaw || [];

  const isLoading = isLoadingRegistry || isLoadingSchedules;

  // 3. Boss Audit Logs Query
  const {
    data: auditLogsRaw,
    isLoading: isLoadingLogs,
    refetch: refetchAuditLogs,
  } = useQuery<AuditLogEntry[]>(
    activeGuild ? `boss_audit_logs:${activeGuild.guildId}` : "boss_audit_logs_empty",
    async () => {
      if (!activeGuild) return [];
      const result = await guildApi.getAuditLogs(activeGuild.guildId, "boss", 1, 50);
      return result.success && result.data?.logs ? result.data.logs : [];
    },
    { persist: true, staleTime: 30000 }
  );
  const auditLogs = auditLogsRaw || [];

  // Triggers log fetch when tab shifts
  useEffect(() => {
    if (activeTab === "ACTIVITY") {
      refetchAuditLogs();
    }
  }, [activeTab, refetchAuditLogs]);

  // Derived state: Reconstruct boss rotation list whenever schedules, registry or guild turn updates
  const [bosses, setBosses] = useState<RotationBoss[]>([]);
  useEffect(() => {
    if (!activeGuild || bossRegistry.length === 0) return;

    const knownGuildsSet = new Set<string>();
    knownGuildsSet.add(activeGuild.guildName.toUpperCase());
    // Seed default competitive guilds on the server for rotation queue variety
    knownGuildsSet.add("SAUSAGE");
    knownGuildsSet.add("BZDK");
    schedules.forEach((s) => {
      if (s.guildTurn) knownGuildsSet.add(s.guildTurn.toUpperCase());
    });
    const knownGuilds = Array.from(knownGuildsSet);

    const constructed: RotationBoss[] = bossRegistry.map((boss) => {
      const activeSched = schedules.find(
        (s) => s.bossName.toLowerCase() === boss.name.toLowerCase() && s.status !== "KILLED"
      );

      const latestKilled = schedules
        .filter((s) => s.bossName.toLowerCase() === boss.name.toLowerCase() && s.status === "KILLED")
        .sort((a, b) => new Date(b.spawnTime).getTime() - new Date(a.spawnTime).getTime())[0];

      let status: "AVAILABLE" | "CLAIMED" | "DEAD" | "LOCKED" = "AVAILABLE";
      let spawnTime = new Date().toISOString();
      let claimedBy = activeGuild.guildName;
      let activeScheduleId = null;

      if (activeSched) {
        spawnTime = activeSched.spawnTime;
        claimedBy = activeSched.guildTurn || (latestKilled?.guildTurn) || activeGuild.guildName;
        activeScheduleId = activeSched.id;
        
        if (activeSched.status === "SPAWNED") {
          status = "AVAILABLE";
        } else {
          status = "CLAIMED";
        }
      } else {
        if (latestKilled) {
          status = "DEAD";
          claimedBy = latestKilled.guildTurn || activeGuild.guildName;
          if (latestKilled.killedAt) {
            spawnTime = getNextBossSpawnTime(boss.name, new Date(latestKilled.killedAt)).toISOString();
          }
        } else {
          status = "AVAILABLE";
          spawnTime = new Date().toISOString();
        }
      }

      const upperClaimed = claimedBy.toUpperCase();
      const baseGuilds = knownGuilds.includes(upperClaimed)
        ? knownGuilds
        : [...knownGuilds, upperClaimed];
      
      const claimedIdx = baseGuilds.indexOf(upperClaimed);
      const rotationQueue = [
        ...baseGuilds.slice(claimedIdx),
        ...baseGuilds.slice(0, claimedIdx)
      ].slice(0, baseGuilds.length);

      return {
        id: boss.id,
        name: boss.name,
        level: boss.level,
        location: boss.location,
        status,
        imageUrl: getBossImageUrl(boss.name),
        spawnTime,
        claimedBy,
        rotationQueue,
        cooldownHours: boss.cooldownHours || 12,
        activeScheduleId,
      };
    });

    setBosses(constructed);
  }, [schedules, bossRegistry, activeGuild]);

  // Listen to Socket.IO real-time events for instant cache invalidation
  useEffect(() => {
    if (!socket || !activeGuild) return;

    const handleBossRotationUpdated = () => {
      console.log("[Socket Real-time]: Invalidating schedules and audit logs cache...");
      queryClient.invalidateQueries(`boss_schedules:${activeGuild.guildId}`);
      queryClient.invalidateQueries(`boss_audit_logs:${activeGuild.guildId}`);
    };

    socket.on("boss_rotation_updated", handleBossRotationUpdated);
    socket.on("boss_schedule_deleted", handleBossRotationUpdated);

    return () => {
      socket.off("boss_rotation_updated", handleBossRotationUpdated);
      socket.off("boss_schedule_deleted", handleBossRotationUpdated);
    };
  }, [socket, activeGuild]);

  // Handle Rotation Turn shift (saves to database if active schedule exists)
  const handleShiftTurn = async (bossId: string) => {
    const targetBoss = bosses.find((b) => b.id === bossId);
    if (!targetBoss) return;
    
    const nextOwner = targetBoss.rotationQueue[1] || targetBoss.rotationQueue[0];
    
    if (targetBoss.activeScheduleId && activeGuild) {
      try {
        const res = await dashboardApi.updateBossSchedule(activeGuild.guildId, targetBoss.activeScheduleId, {
          guildTurn: nextOwner,
        });
        if (res.success) {
          addToast("success", `Turn shifted! Next owner for ${targetBoss.name} is now ${nextOwner}.`);
          queryClient.invalidateQueries(`boss_schedules:${activeGuild.guildId}`);
        } else {
          addToast("error", "Failed to update rotation turn in database");
        }
      } catch (e) {
        addToast("error", "Error shifting rotation turn");
      }
    } else {
      addToast("success", `Turn shifted locally! Next owner for ${targetBoss.name} is now ${nextOwner}.`);
      setBosses((prev) =>
        prev.map((b) => {
          if (b.id === bossId) {
            const shiftedQueue = [...b.rotationQueue.slice(1), b.rotationQueue[0]];
            return {
              ...b,
              claimedBy: nextOwner,
              rotationQueue: shiftedQueue,
            };
          }
          return b;
        })
      );
    }
  };

  // ─── Maintenance Reset Handler ─────────────────────
  // Resets spawn times for all LONG_CYCLE bosses to the maintenance end time.
  // FIXED_SCHEDULE bosses are intentionally left untouched.
  const handleMaintenanceReset = useCallback(async (maintenanceEndTime: Date) => {
    if (!activeGuild) return;

    setIsMaintenanceProcessing(true);
    try {
      // Identify which bosses are LONG_CYCLE (cycle-based)
      const cycleBossNames = new Set(
        PREDEFINED_BOSSES
          .filter((b) => b.type === "LONG_CYCLE")
          .map((b) => b.name.toLowerCase())
      );

      // Find all active (non-KILLED) schedules for cycle bosses
      const cycleBossSchedules = schedules.filter(
        (s) =>
          s.status !== "KILLED" &&
          cycleBossNames.has(s.bossName.toLowerCase())
      );

      const spawnTimeISO = maintenanceEndTime.toISOString();
      let updatedCount = 0;
      let failedCount = 0;

      // Update each cycle boss schedule's spawn time to the maintenance end time
      for (const sched of cycleBossSchedules) {
        try {
          const res = await dashboardApi.updateBossSchedule(
            activeGuild.guildId,
            sched.id,
            { spawnTime: spawnTimeISO }
          );
          if (res.success) {
            updatedCount++;
          } else {
            failedCount++;
          }
        } catch {
          failedCount++;
        }
      }

      // Also update local boss state for DEAD cycle bosses that don't have active schedules
      // (their respawn countdown is derived locally from killedAt)
      setBosses((prev) =>
        prev.map((b) => {
          if (cycleBossNames.has(b.name.toLowerCase()) && b.status === "DEAD" && !b.activeScheduleId) {
            return { ...b, spawnTime: spawnTimeISO, status: "AVAILABLE" };
          }
          return b;
        })
      );

      // Invalidate cache to reload fresh data
      queryClient.invalidateQueries(`boss_schedules:${activeGuild.guildId}`);
      queryClient.invalidateQueries(`boss_audit_logs:${activeGuild.guildId}`);

      if (failedCount > 0) {
        addToast(
          "warning",
          `Maintenance reset partially done: ${updatedCount} updated, ${failedCount} failed.`
        );
      } else {
        const totalReset = updatedCount + (cycleBossSchedules.length === 0 ? bosses.filter(b => cycleBossNames.has(b.name.toLowerCase())).length : 0);
        addToast(
          "success",
          `Maintenance reset complete! ${updatedCount > 0 ? `${updatedCount} schedule(s) updated.` : "All cycle bosses set to spawn at maintenance end."}`
        );
      }

      setIsMaintenanceModalOpen(false);
    } catch (err) {
      addToast("error", "Failed to reset boss spawns for maintenance.");
    } finally {
      setIsMaintenanceProcessing(false);
    }
  }, [activeGuild, schedules, bosses, addToast]);

  if (!user || !activeGuild) {
    return (
      <div className="flex items-center justify-center h-64 animate-fade-in">
        <p className="text-white/40">No active guild selected</p>
      </div>
    );
  }

  // Filter Logic (applies only to the ROTATION tab)
  const filteredBosses = bosses.filter((boss) => {
    if (searchQuery.trim() && !boss.name.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false;
    }
    if (selectedBossFilter !== "ALL" && boss.name.toLowerCase() !== selectedBossFilter.toLowerCase()) {
      return false;
    }
    if (selectedGuildFilter !== "ALL" && boss.claimedBy.toUpperCase() !== selectedGuildFilter.toUpperCase()) {
      return false;
    }
    if (availableOnly && (boss.status === "DEAD" || boss.status === "LOCKED")) {
      return false;
    }
    return true;
  });

  return (
    <div className="relative max-w-full xl:max-w-[1600px] mx-auto w-full px-2 md:px-4 lg:px-6">
      <DashboardDecor />

      <div className="relative z-10 space-y-7 text-white/85">
        
        {/* Module Header */}
        <ModuleHeader
          eyebrow="Raid Strategy"
          title="Boss Rotation"
          description="Track claim sequences, dynamic queue hierarchy, and next guild turn statuses."
          right={
            <div className="flex items-center gap-2.5">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsMaintenanceModalOpen(true)}
                className="text-amber-400/70 hover:text-amber-400 hover:bg-amber-500/10 hover:border-amber-500/25 border border-transparent"
              >
                <svg className="h-3.5 w-3.5 mr-1.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
                </svg>
                Maintenance Reset
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (activeGuild) {
                    queryClient.invalidateQueries("boss_registry");
                    queryClient.invalidateQueries(`boss_schedules:${activeGuild.guildId}`);
                    queryClient.invalidateQueries(`boss_audit_logs:${activeGuild.guildId}`);
                  }
                }}
                isLoading={isLoading}
              >
                Refresh
              </Button>
            </div>
          }
        />

        {/* Tab system selector — pill style */}
        <div className="inline-flex items-center glass-subtle border border-white/[0.06] rounded-xl p-1 gap-1 animate-scale-in">
          {[
            { id: "ROTATION", label: "Boss Rotation", count: filteredBosses.length },
            { id: "UPCOMING", label: "Upcoming Schedule", count: schedules.filter(s => s.status !== "KILLED").length },
            { id: "ACTIVITY", label: "Activity Logs", count: null }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id as any);
              }}
              className={`relative px-4 py-2 text-[13px] font-semibold rounded-lg transition-all cursor-pointer ${
                activeTab === tab.id
                  ? "bg-amber-500/10 border border-amber-500/25 text-amber-400"
                  : "text-white/40 hover:text-white/70 border border-transparent hover:bg-white/[0.03]"
              }`}
            >
              <span className="flex items-center gap-2">
                {tab.label}
                {tab.count !== null && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                    activeTab === tab.id ? "bg-amber-500/20 text-amber-300" : "bg-white/5 text-white/40"
                  }`}>
                    {tab.count}
                  </span>
                )}
              </span>
            </button>
          ))}
        </div>

        {/* ─── TAB 1: BOSS ROTATION ────────────────────────────────────────── */}
        {activeTab === "ROTATION" && (
          <>
            {/* Filters panel */}
            <FiltersPanel
              selectedBossFilter={selectedBossFilter}
              setSelectedBossFilter={setSelectedBossFilter}
              selectedGuildFilter={selectedGuildFilter}
              setSelectedGuildFilter={setSelectedGuildFilter}
              availableOnly={availableOnly}
              setAvailableOnly={setAvailableOnly}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              viewMode={viewMode}
              setViewMode={setViewMode}
              bosses={bosses}
            />

            {/* LOADING STATE */}
            {isLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-5">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <Skeleton key={i} className="h-96 rounded-2xl animate-pulse" />
                ))}
              </div>
            ) : filteredBosses.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-80 rounded-2xl bg-white/[0.01] border border-white/[0.04] p-10 text-center animate-scale-in">
                <svg className="h-10 w-10 text-white/20 mb-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" />
                  <path d="M12 16V12" />
                  <path d="M12 8H12.01" />
                </svg>
                <h3 className="text-sm font-semibold text-white/80">No Rotation Bosses Found</h3>
                <p className="text-xs text-white/45 mt-1 max-w-sm">No active bosses match your filters. Try disabling Available Only or changing your search query.</p>
              </div>
            ) : viewMode === "CARD" ? (
              /* CARD GRID VIEW */
              <BossCardView
                filteredBosses={filteredBosses}
                currentTime={currentTime}
                selectedGuildFilter={selectedGuildFilter}
                setSelectedGuildFilter={setSelectedGuildFilter}
                handleShiftTurn={handleShiftTurn}
              />
            ) : (
              /* TIMELINE LIST VIEW */
              <BossTimelineView
                filteredBosses={filteredBosses}
                currentTime={currentTime}
                selectedGuildFilter={selectedGuildFilter}
                setSelectedGuildFilter={setSelectedGuildFilter}
                handleShiftTurn={handleShiftTurn}
              />
            )}

            {/* Global Status Legend Panel */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-white/[0.06] pt-5 text-white/50 text-xs select-none">
              <div className="flex flex-wrap items-center gap-5">
                <span className="font-semibold text-white/40 uppercase tracking-wider">Status Legend:</span>
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]" />
                  <span>🟢 Available (Alive)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-400 shadow-[0_0_6px_rgba(245,158,11,0.5)]" />
                  <span>🟡 Taken (Owned)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.5)]" />
                  <span>🔴 Dead (Respawning)</span>
                </div>
              </div>
              <div className="text-[10px] text-zinc-550 italic">
                All respawn times are calculated dynamically based on kill events.
              </div>
            </div>
          </>
        )}

        {/* ─── TAB 2: UPCOMING SCHEDULE ────────────────────────────────────── */}
        {activeTab === "UPCOMING" && (
          <UpcomingSchedulesView
            schedules={schedules}
            currentTime={currentTime}
          />
        )}

        {/* ─── TAB 3: ACTIVITY LOGS ────────────────────────────────────────── */}
        {activeTab === "ACTIVITY" && (
          <ActivityLogsView
            auditLogs={auditLogs}
            isLoadingLogs={isLoadingLogs}
          />
        )}

      </div>

      {/* Maintenance Reset Modal */}
      <MaintenanceResetModal
        isOpen={isMaintenanceModalOpen}
        onClose={() => setIsMaintenanceModalOpen(false)}
        onConfirm={handleMaintenanceReset}
        isProcessing={isMaintenanceProcessing}
      />
    </div>
  );
}
