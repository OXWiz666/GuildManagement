"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import { dashboardApi, guildApi, type BossScheduleData, type BossData, type AuditLogEntry } from "@/lib/api";
import { useSocket } from "@/components/providers/socket-provider";
import { useToast } from "@/components/ui/Toast";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import DashboardDecor from "@/components/dashboard/DashboardDecor";
import {
  Reveal,
  ModuleHeader,
  Magnetic,
  LiveDot
} from "@/components/dashboard/DashboardHelpers";
import { getBossImageUrl, getNextBossSpawnTime } from "@guild/shared";

// Curved and vibrant guild color palette assigned dynamically by hashing the guild name
const GUILD_PALETTE = [
  { border: "border-amber-500/30", bg: "bg-amber-500/10", text: "text-amber-400", dot: "#f59e0b" },
  { border: "border-emerald-500/30", bg: "bg-emerald-500/10", text: "text-emerald-400", dot: "#10b981" },
  { border: "border-blue-500/30", bg: "bg-blue-500/10", text: "text-blue-400", dot: "#3b82f6" },
  { border: "border-violet-500/30", bg: "bg-violet-500/10", text: "text-violet-400", dot: "#8b5cf6" },
  { border: "border-rose-500/30", bg: "bg-rose-500/10", text: "text-rose-400", dot: "#f43f5e" },
  { border: "border-cyan-500/30", bg: "bg-cyan-500/10", text: "text-cyan-400", dot: "#06b6d4" },
  { border: "border-orange-500/30", bg: "bg-orange-500/10", text: "text-orange-400", dot: "#f97316" },
  { border: "border-pink-500/30", bg: "bg-pink-500/10", text: "text-pink-400", dot: "#ec4899" },
];

function getGuildColor(guildName: string) {
  if (!guildName) {
    return { border: "border-zinc-850", bg: "bg-zinc-950/60", text: "text-zinc-400", dot: "#a1a1aa" };
  }
  let hash = 0;
  for (const c of guildName.toUpperCase()) {
    hash = (hash * 31 + c.charCodeAt(0)) % GUILD_PALETTE.length;
  }
  return GUILD_PALETTE[hash];
}

function getRelativeTime(dateStr: string) {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHrs = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHrs / 24);

  if (diffSecs < 60) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHrs < 24) return `${diffHrs}h ago`;
  return `${diffDays}d ago`;
}

interface RotationBoss {
  id: string;
  name: string;
  level: number;
  location: string;
  status: "AVAILABLE" | "CLAIMED" | "DEAD" | "LOCKED";
  imageUrl: string | null;
  spawnTime: string;
  claimedBy: string; // Guild Name
  rotationQueue: string[]; // List of Guild Names
  cooldownHours: number;
  activeScheduleId: string | null;
}

export default function BossRotationPage() {
  const { user } = useAuth();
  const { socket } = useSocket();
  const { addToast } = useToast();

  const [bosses, setBosses] = useState<RotationBoss[]>([]);
  const [schedules, setSchedules] = useState<BossScheduleData[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [currentTime, setCurrentTime] = useState(Date.now());
  const [bossRegistry, setBossRegistry] = useState<BossData[]>([]);

  // Tabs state: ROTATION (Boss cards), UPCOMING (Upcoming timeline), ACTIVITY (Activity logs)
  const [activeTab, setActiveTab] = useState<"ROTATION" | "UPCOMING" | "ACTIVITY">("ROTATION");

  // Filters State (only applies to ROTATION tab)
  const [selectedBossFilter, setSelectedBossFilter] = useState("ALL");
  const [selectedGuildFilter, setSelectedGuildFilter] = useState("ALL");
  const [availableOnly, setAvailableOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // View Switcher for Boss Rotation (Card vs Timeline)
  const [viewMode, setViewMode] = useState<"CARD" | "TIMELINE">("CARD");

  // Sync clocks every second
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const activeGuild = user?.guilds?.[0];

  const loadRotationData = useCallback(async () => {
    if (!activeGuild) return;
    setIsLoading(true);
    try {
      // Load both boss schedules and boss registry to construct active rotation cards
      const schedulesResult = await dashboardApi.getBossSchedules(activeGuild.guildId);
      const registryResult = await dashboardApi.getBosses();

      if (registryResult.success && registryResult.data?.bosses) {
        setBossRegistry(registryResult.data.bosses);
        const rawSchedules = (schedulesResult.success && schedulesResult.data) ? schedulesResult.data.schedules : [];
        setSchedules(rawSchedules);
      }
    } catch (e) {
      addToast("error", "Failed to load boss rotation data");
    } finally {
      setIsLoading(false);
    }
  }, [activeGuild, addToast]);

  // Derived state: Reconstruct boss rotation list whenever schedules, registry or guild turn updates
  useEffect(() => {
    if (!activeGuild || bossRegistry.length === 0) return;

    // Scan all schedules dynamically to identify active guilds
    const knownGuildsSet = new Set<string>();
    knownGuildsSet.add(activeGuild.guildName.toUpperCase());
    schedules.forEach((s) => {
      if (s.guildTurn) knownGuildsSet.add(s.guildTurn.toUpperCase());
    });
    const knownGuilds = Array.from(knownGuildsSet);
    if (knownGuilds.length < 3) {
      const fallbackGuilds = ["SAUSAGE", "VALHALLA", "BZDK"];
      fallbackGuilds.forEach((g) => {
        if (knownGuilds.length < 3 && !knownGuilds.includes(g)) {
          knownGuilds.push(g);
        }
      });
    }

    const constructed: RotationBoss[] = bossRegistry.map((boss) => {
      // Find matching schedule event if active (UPCOMING or SPAWNED)
      const activeSched = schedules.find(
        (s) => s.bossName.toLowerCase() === boss.name.toLowerCase() && s.status !== "KILLED"
      );

      // Get latest killed event to read who claimed it and when
      const latestKilled = schedules
        .filter((s) => s.bossName.toLowerCase() === boss.name.toLowerCase() && s.status === "KILLED")
        .sort((a, b) => new Date(b.spawnTime).getTime() - new Date(a.spawnTime).getTime())[0];

      // Determine status and next spawn time
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
        // If the bosses didn't have kill log, make the bosses ALIVED (AVAILABLE)
        if (latestKilled) {
          status = "DEAD";
          claimedBy = latestKilled.guildTurn || activeGuild.guildName;
          if (latestKilled.killedAt) {
            // Surfacing live next spawn using getNextBossSpawnTime
            spawnTime = getNextBossSpawnTime(boss.name, new Date(latestKilled.killedAt)).toISOString();
          }
        } else {
          // No kill log = ALIVE (AVAILABLE)
          status = "AVAILABLE";
          spawnTime = new Date().toISOString();
        }
      }

      // Generate dynamic queue list reordered so Claimed By is first, followed by remaining guilds
      const bossSpecificFutureScheds = schedules
        .filter((s) => s.bossName.toLowerCase() === boss.name.toLowerCase() && s.status !== "KILLED")
        .sort((a, b) => new Date(a.spawnTime).getTime() - new Date(b.spawnTime).getTime());

      const scheduledFutureGuilds = bossSpecificFutureScheds
        .map((s) => s.guildTurn?.toUpperCase())
        .filter((g): g is string => !!g);

      // Merge currently claimed guild + scheduled guilds + general guild list
      const rotationQueue = Array.from(
        new Set([claimedBy.toUpperCase(), ...scheduledFutureGuilds, ...knownGuilds])
      ).slice(0, 3);

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

  // Listen to Socket.IO real-time events for instant in-place data merging (0-Fetch Architecture)
  useEffect(() => {
    if (!socket) return;

    const handleBossRotationUpdated = (updatedSchedule: BossScheduleData) => {
      console.log("[Socket]: Received boss_rotation_updated payload:", updatedSchedule);
      
      // Update the schedules state locally in-place (avoiding HTTP re-fetch)
      setSchedules((prev) => {
        const exists = prev.some((s) => s.id === updatedSchedule.id);
        if (exists) {
          return prev.map((s) => (s.id === updatedSchedule.id ? updatedSchedule : s));
        } else {
          return [...prev, updatedSchedule];
        }
      });
      
      addToast("success", `Rotation details for ${updatedSchedule.bossName} updated in real-time.`);
    };

    const handleBossScheduleDeleted = (data: { scheduleId: string }) => {
      console.log("[Socket]: Received boss_schedule_deleted payload:", data);
      
      // Remove the schedule from local state in-place (avoiding HTTP re-fetch)
      setSchedules((prev) => prev.filter((s) => s.id !== data.scheduleId));
      addToast("info", "A boss schedule was deleted in real-time.");
    };

    socket.on("boss_rotation_updated", handleBossRotationUpdated);
    socket.on("boss_schedule_deleted", handleBossScheduleDeleted);

    return () => {
      socket.off("boss_rotation_updated", handleBossRotationUpdated);
      socket.off("boss_schedule_deleted", handleBossScheduleDeleted);
    };
  }, [socket, addToast]);

  const loadAuditLogs = useCallback(async () => {
    if (!activeGuild) return;
    setIsLoadingLogs(true);
    try {
      const result = await guildApi.getAuditLogs(activeGuild.guildId, "boss", 1, 50);
      if (result.success && result.data?.logs) {
        setAuditLogs(result.data.logs);
      } else {
        addToast("error", "Failed to load activity logs");
      }
    } catch (e) {
      addToast("error", "Error loading activity logs");
    } finally {
      setIsLoadingLogs(false);
    }
  }, [activeGuild, addToast]);

  useEffect(() => {
    loadRotationData();
  }, [loadRotationData]);

  // Dynamic live countdown calculator
  function getTickingCountdown(spawnTimeStr: string) {
    const target = new Date(spawnTimeStr).getTime();
    const diff = target - currentTime;
    if (diff <= 0) return { expired: true, text: "00h 00m 00s", warning: false };

    const hrs = Math.floor(diff / (3600 * 1000));
    const mins = Math.floor((diff % (3600 * 1000)) / (60 * 1000));
    const secs = Math.floor((diff % (60 * 1000)) / 1000);

    const hrsStr = hrs > 0 ? `${hrs}h ` : "";
    const minsStr = `${String(mins).padStart(2, "0")}m `;
    const secsStr = `${String(secs).padStart(2, "0")}s`;

    return {
      expired: false,
      text: `${hrsStr}${minsStr}${secsStr}`,
      warning: diff <= 60 * 60 * 1000 // Less than 1 hour remains
    };
  }

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
          loadRotationData();
        } else {
          addToast("error", "Failed to update rotation turn in database");
        }
      } catch (e) {
        addToast("error", "Error shifting rotation turn");
      }
    } else {
      // Local simulated fallback
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

  if (!user || !activeGuild) {
    return (
      <div className="flex items-center justify-center h-64">
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

  const ACTION_LABELS: Record<string, string> = {
    BOSS_EVENT_SCHEDULED: "📅 Scheduled",
    BOSS_KILLED_LOGGED: "💀 Defeated",
    BOSS_EVENT_UPDATED: "✏️ Updated",
    BOSS_EVENT_DELETED: "🗑️ Cancelled",
  };

  const ACTION_COLORS: Record<string, string> = {
    BOSS_EVENT_SCHEDULED: "text-sky-400 bg-sky-500/10 border-sky-500/20",
    BOSS_KILLED_LOGGED: "text-red-400 bg-red-500/10 border-red-500/20",
    BOSS_EVENT_UPDATED: "text-amber-400 bg-amber-500/10 border-amber-500/20",
    BOSS_EVENT_DELETED: "text-zinc-500 bg-zinc-500/10 border-zinc-500/25",
  };

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
                onClick={() => {
                  loadRotationData();
                  if (activeTab === "ACTIVITY") loadAuditLogs();
                }}
                isLoading={isLoading}
              >
                Refresh
              </Button>
            </div>
          }
        />

        {/* Tab system selector */}
        <div className="flex border-b border-white/[0.08] pb-1 gap-2">
          {[
            { id: "ROTATION", label: "Boss Rotation", count: filteredBosses.length },
            { id: "UPCOMING", label: "Upcoming Schedule", count: schedules.filter(s => s.status !== "KILLED").length },
            { id: "ACTIVITY", label: "Activity Logs", count: null }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id as any);
                if (tab.id === "ACTIVITY") {
                  loadAuditLogs();
                }
              }}
              className={`relative px-4 py-2.5 text-sm font-semibold transition-all cursor-pointer ${
                activeTab === tab.id
                  ? "text-amber-400 font-bold border-b-2 border-amber-500"
                  : "text-white/40 hover:text-white/70"
              }`}
            >
              <span className="flex items-center gap-2">
                {tab.label}
                {tab.count !== null && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
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
            <div className="flex flex-col xl:flex-row gap-4 items-stretch xl:items-center justify-between bg-white/[0.015] border border-white/[0.04] p-4 rounded-2xl glass-subtle animate-scale-in">
              <div className="flex flex-wrap items-center gap-3">
                {/* All Bosses Dropdown */}
                <div className="relative">
                  <select
                    value={selectedBossFilter}
                    onChange={(e) => setSelectedBossFilter(e.target.value)}
                    className="px-3.5 py-2 rounded-xl bg-[#0a0a0c] border border-white/[0.08] text-[13px] text-zinc-300 font-medium cursor-pointer focus:outline-none focus:border-amber-500/50 min-w-[140px]"
                  >
                    <option value="ALL">All Bosses</option>
                    {bosses.map((b) => (
                      <option key={b.id} value={b.name}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Guild List Filter Dropdown */}
                <div className="relative">
                  <select
                    value={selectedGuildFilter}
                    onChange={(e) => setSelectedGuildFilter(e.target.value)}
                    className="px-3.5 py-2 rounded-xl bg-[#0a0a0c] border border-white/[0.08] text-[13px] text-zinc-300 font-medium cursor-pointer focus:outline-none focus:border-amber-500/50 min-w-[155px] hover:border-white/20 transition-all"
                  >
                    <option value="ALL">Guild List (All)</option>
                    {Array.from(new Set(bosses.flatMap((b) => b.rotationQueue))).map((guild) => (
                      <option key={guild} value={guild.toUpperCase()}>
                        🛡️ {guild.toUpperCase()} Turn
                      </option>
                    ))}
                  </select>
                </div>

                {/* Available Only Toggle */}
                <button
                  onClick={() => setAvailableOnly(!availableOnly)}
                  className={`px-4 py-2 rounded-xl text-[13px] font-medium border transition-all cursor-pointer ${
                    availableOnly
                      ? "bg-amber-500/10 border-amber-500/40 text-amber-400"
                      : "bg-white/[0.02] border-white/[0.06] text-white/60 hover:text-white hover:bg-white/[0.04]"
                  }`}
                >
                  Available Only
                </button>

                {/* Search Input */}
                <div className="relative min-w-[200px]">
                  <input
                    type="text"
                    placeholder="Search boss..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 rounded-xl bg-[#0a0a0c] border border-white/[0.08] text-[13px] text-white placeholder:text-white/30 focus:outline-none focus:border-amber-500/40"
                  />
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30">
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="11" cy="11" r="8" />
                      <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                  </span>
                </div>
              </div>

              {/* View Mode Toggle */}
              <div className="flex items-center self-end xl:self-auto border border-white/[0.06] rounded-xl bg-white/[0.015] p-1">
                <button
                  onClick={() => setViewMode("CARD")}
                  className={`px-4 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all cursor-pointer ${
                    viewMode === "CARD"
                      ? "bg-amber-500/10 text-amber-400 border border-amber-500/25"
                      : "text-white/40 hover:text-white/70 border border-transparent"
                  }`}
                >
                  Card View
                </button>
                <button
                  onClick={() => setViewMode("TIMELINE")}
                  className={`px-4 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all cursor-pointer ${
                    viewMode === "TIMELINE"
                      ? "bg-amber-500/10 text-amber-400 border border-amber-500/25"
                      : "text-white/40 hover:text-white/70 border border-transparent"
                  }`}
                >
                  Timeline View
                </button>
              </div>
            </div>

            {/* LOADING STATE */}
            {isLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-5">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <Skeleton key={i} className="h-96 rounded-2xl animate-pulse" />
                ))}
              </div>
            ) : filteredBosses.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-80 rounded-2xl bg-white/[0.01] border border-white/[0.04] p-10 text-center">
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
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-5 animate-scale-in">
                {filteredBosses.map((boss) => {
                  const tick = getTickingCountdown(boss.spawnTime);
                  const isPriority = !tick.expired && tick.warning;
                  const claimedColor = getGuildColor(boss.claimedBy);

                  return (
                    <div
                      key={boss.id}
                      className={`group relative flex flex-col justify-between rounded-2xl bg-[#0c0c10] border p-4 transition-all duration-300 hover:scale-[1.03] hover:-translate-y-1 ${
                        isPriority
                          ? "border-amber-500/40 shadow-[0_0_15px_rgba(245,158,11,0.12)] bg-amber-950/[0.02]"
                          : "border-white/[0.05] hover:border-white/[0.12] hover:shadow-[0_8px_30px_rgba(0,0,0,0.5)]"
                      }`}
                    >
                      {/* Status Indicator & Image */}
                      <div className="relative w-full aspect-[4/3] rounded-xl overflow-hidden bg-zinc-950 border border-white/[0.06] mb-3.5 select-none">
                        <img
                          src={boss.imageUrl || getBossImageUrl(boss.name)}
                          alt={boss.name}
                          className="h-full w-full object-cover transform scale-100 group-hover:scale-110 group-hover:brightness-110 transition-all duration-700 ease-in-out"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = "https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?w=400";
                          }}
                        />
                        {/* Premium Sweep-Shine Hover Animation */}
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.08] to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-out pointer-events-none" />

                        {/* Status capsule overlay */}
                        {boss.status !== "LOCKED" && (
                          <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-black/60 backdrop-blur-md border border-white/10 flex items-center gap-1.5">
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${
                                boss.status === "AVAILABLE"
                                  ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]"
                                  : boss.status === "CLAIMED"
                                    ? "bg-amber-400 shadow-[0_0_6px_rgba(245,158,11,0.6)]"
                                    : boss.status === "DEAD"
                                      ? "bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.6)]"
                                      : "bg-zinc-650"
                              }`}
                            />
                            <span className="text-[9px] font-bold uppercase tracking-wider text-white/90">
                              {boss.status}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Boss Name & Timer */}
                      <div className="space-y-1 mb-4 select-none">
                        <h4 className="font-bold text-white text-[14px] truncate leading-tight">
                          {boss.name}
                        </h4>
                        <div className="text-[10px] text-zinc-500 flex items-center gap-1">
                          <span>lvl {boss.level}</span>
                          <span>·</span>
                          <span className="truncate">{boss.location}</span>
                        </div>

                        {/* Spawn Timer */}
                        <div className="pt-2">
                          <span className="block text-[8px] text-zinc-500 uppercase tracking-widest leading-none mb-1">
                            {boss.status === "DEAD" ? "Respawning In" : "Next Spawn"}
                          </span>
                          <span
                            className={`block text-[13px] font-mono leading-none ${
                              isPriority
                                ? "text-amber-400 font-bold animate-pulse"
                                : boss.status === "AVAILABLE"
                                  ? "text-emerald-400 font-medium"
                                  : "text-white/80"
                            }`}
                          >
                            {boss.status === "AVAILABLE" ? "READY / ALIVE" : tick.text}
                          </span>
                          <span className="block text-[9px] text-white/35 mt-1 font-sans">
                            {new Date(boss.spawnTime).toLocaleDateString("en-US", { weekday: "short" })}{" "}
                            {new Date(boss.spawnTime).toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>
                      </div>

                      {/* Taken By Guild Badge */}
                      <div className="mb-4">
                        <span className="block text-[8px] text-zinc-500 uppercase tracking-widest leading-none mb-1.5 select-none">
                          Taken By:
                        </span>
                        <button
                          onClick={() => setSelectedGuildFilter(
                            selectedGuildFilter === boss.claimedBy.toUpperCase() ? "ALL" : boss.claimedBy.toUpperCase()
                          )}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition-all cursor-pointer hover:brightness-110 active:scale-95 duration-200 ${claimedColor.border} ${claimedColor.bg} ${claimedColor.text}`}
                        >
                          <svg className="h-3 w-3 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                          </svg>
                          {boss.claimedBy.toUpperCase()}
                        </button>
                      </div>

                      {/* Rotation Queue list */}
                      <div className="border-t border-white/[0.04] pt-3 mb-4 space-y-2">
                        <span className="block text-[9px] text-amber-500 uppercase tracking-widest leading-none select-none font-extrabold mb-1">
                          Rotation Queue
                        </span>
                        <div className="space-y-1.5">
                          {boss.rotationQueue.map((g, idx) => {
                            const isNextTurn = idx === 1;
                            const queueGuildColor = getGuildColor(g);
                            const isCurrentlyFiltered = selectedGuildFilter === g.toUpperCase();
                            return (
                              <button
                                key={g}
                                onClick={() => setSelectedGuildFilter(
                                  isCurrentlyFiltered ? "ALL" : g.toUpperCase()
                                )}
                                className={`w-full flex items-center justify-between text-[11.5px] font-semibold px-2 py-1.5 rounded-lg transition-all cursor-pointer hover:scale-[1.02] active:scale-95 duration-200 ${
                                  isNextTurn
                                    ? `${queueGuildColor.bg} ${queueGuildColor.border} border text-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.08)]`
                                    : isCurrentlyFiltered
                                      ? "bg-amber-500/10 border border-amber-500/30 text-amber-400"
                                      : "bg-white/[0.02] border border-white/[0.04] text-zinc-300 hover:bg-white/[0.04] hover:text-white"
                                }`}
                              >
                                <span className="flex items-center gap-2">
                                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: queueGuildColor.dot }} />
                                  <span className={isNextTurn ? "text-amber-500 font-bold" : "text-zinc-500 font-bold"}>
                                    {idx + 1}.
                                  </span>
                                  <span className="font-semibold tracking-wide">{g}</span>
                                </span>
                                {isNextTurn && (
                                  <span className="text-[8px] uppercase tracking-wider text-amber-500 font-bold px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20">
                                    Next Turn
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Claim Button / Shift Turn */}
                      <div className="pt-1">
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => handleShiftTurn(boss.id)}
                          className="w-full text-[10px] uppercase font-bold tracking-wider hover:bg-amber-500/10 hover:border-amber-500/35 hover:text-amber-400 shrink-0"
                        >
                          Shift Rotation Turn
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              /* TIMELINE LIST VIEW */
              <div className="relative border-l border-white/[0.06] pl-6 ml-4 space-y-6 animate-scale-in">
                {filteredBosses.map((boss) => {
                  const tick = getTickingCountdown(boss.spawnTime);
                  const nextTurn = boss.rotationQueue[1] || boss.rotationQueue[0];
                  const claimedColor = getGuildColor(boss.claimedBy);
                  const nextColor = getGuildColor(nextTurn);

                  return (
                    <div key={boss.id} className="relative flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-xl border border-white/[0.04] bg-[#0c0c10]/40 backdrop-blur-md hover:border-white/[0.08] transition-all">
                      {/* Timeline indicator node */}
                      <div className="absolute -left-[31px] top-1/2 -translate-y-1/2 h-4 w-4 rounded-full border-2 border-zinc-950 bg-[#08080a] flex items-center justify-center">
                        <span className={`h-1.5 w-1.5 rounded-full ${
                          boss.status === "AVAILABLE" ? "bg-emerald-400 shadow-[0_0_6px_#10b981]" : boss.status === "CLAIMED" ? "bg-amber-400 shadow-[0_0_6px_#f59e0b]" : "bg-zinc-600"
                        }`} />
                      </div>

                      {/* Left: Spawn Time */}
                      <div className="flex items-center gap-4 select-none shrink-0 min-w-[120px]">
                        <div className="text-left">
                          <span className="block text-xs font-semibold text-white">
                            {new Date(boss.spawnTime).toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit" })}
                          </span>
                          <span className="block text-[10px] text-zinc-500">
                            {new Date(boss.spawnTime).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                          </span>
                        </div>
                      </div>

                      {/* Middle Left: Boss Identity */}
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-lg bg-zinc-900 border border-white/10 flex items-center justify-center shrink-0 overflow-hidden select-none">
                          <img
                            src={boss.imageUrl || getBossImageUrl(boss.name)}
                            alt={boss.name}
                            className="h-full w-full object-cover"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = "https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?w=100";
                            }}
                          />
                        </div>
                        <div>
                          <h4 className="font-bold text-white text-sm">{boss.name}</h4>
                          <p className="text-[10px] text-zinc-500">
                            Level {boss.level} · {boss.location}
                          </p>
                        </div>
                      </div>

                      {/* Middle: Claim Ownership */}
                      <div className="flex items-center gap-4">
                        <div className="flex flex-col text-left">
                          <span className="text-[9px] text-zinc-500 uppercase tracking-wider mb-1 select-none font-sans">Taken By:</span>
                          <button
                            onClick={() => setSelectedGuildFilter(
                              selectedGuildFilter === boss.claimedBy.toUpperCase() ? "ALL" : boss.claimedBy.toUpperCase()
                            )}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[11px] font-semibold border transition-all cursor-pointer hover:brightness-110 active:scale-95 duration-200 ${claimedColor.border} ${claimedColor.bg} ${claimedColor.text}`}
                          >
                            {boss.claimedBy.toUpperCase()}
                          </button>
                        </div>

                        <div className="flex flex-col text-left">
                          <span className="text-[9px] text-zinc-500 uppercase tracking-wider mb-1 select-none font-sans">Next Turn</span>
                          <button
                            onClick={() => setSelectedGuildFilter(
                              selectedGuildFilter === nextTurn.toUpperCase() ? "ALL" : nextTurn.toUpperCase()
                            )}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[11px] font-semibold border transition-all cursor-pointer hover:brightness-110 active:scale-95 duration-200 ${nextColor.border} ${nextColor.bg} ${nextColor.text} shadow-[0_0_8px_rgba(245,158,11,0.05)]`}
                          >
                            {nextTurn}
                          </button>
                        </div>
                      </div>

                      {/* Middle Right: Spawn Countdown */}
                      <div className="flex flex-col min-w-[100px] select-none text-left">
                        <span className="text-[9px] text-zinc-500 uppercase tracking-wider mb-1">Time Left</span>
                        <span className={`text-xs font-mono font-bold ${tick.warning ? "text-amber-400 animate-pulse" : "text-emerald-400"}`}>
                          {boss.status === "AVAILABLE" ? "READY / ALIVE" : tick.text}
                        </span>
                      </div>

                      {/* Right: Actions */}
                      <div className="shrink-0">
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => handleShiftTurn(boss.id)}
                          className="text-[10px] uppercase font-bold"
                        >
                          Shift Turn
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
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
          <div className="space-y-4 animate-scale-in">
            {schedules.filter(s => s.status !== "KILLED").length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 rounded-2xl bg-white/[0.01] border border-white/[0.04] p-10 text-center">
                <p className="text-sm text-white/45">No future boss schedule events are currently planned.</p>
              </div>
            ) : (
              schedules
                .filter(s => s.status !== "KILLED")
                .sort((a, b) => new Date(a.spawnTime).getTime() - new Date(b.spawnTime).getTime())
                .map((sched) => {
                  const tick = getTickingCountdown(sched.spawnTime);
                  const guildColor = getGuildColor(sched.guildTurn || "");
                  return (
                    <div key={sched.id} className="relative flex flex-col md:flex-row md:items-center justify-between gap-5 p-5 rounded-2xl border border-white/[0.04] bg-[#0c0c10]/50 backdrop-blur-md hover:border-white/[0.08] hover:shadow-[0_8px_25px_rgba(0,0,0,0.3)] transition-all duration-300">
                      <div className="flex items-center gap-4">
                        <div className="h-12 w-12 rounded-xl border border-white/10 overflow-hidden shrink-0 bg-zinc-950 select-none">
                          <img
                            src={getBossImageUrl(sched.bossName)}
                            alt={sched.bossName}
                            className="h-full w-full object-cover"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = "https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?w=100";
                            }}
                          />
                        </div>
                        <div>
                          <h4 className="font-bold text-white text-base leading-tight">{sched.bossName}</h4>
                          <div className="flex items-center gap-2 text-xs text-zinc-550 mt-1 font-medium">
                            <span className="text-zinc-400">{sched.location}</span>
                            <span>•</span>
                            <span>
                              {new Date(sched.spawnTime).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} at{" "}
                              {new Date(sched.spawnTime).toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit" })}
                            </span>
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex flex-wrap items-center gap-6">
                        <div className="flex flex-col">
                          <span className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1 select-none font-sans font-bold">Assigned Guild</span>
                          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-xl border text-[11px] font-bold ${guildColor.border} ${guildColor.bg} ${guildColor.text}`}>
                            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: guildColor.dot }} />
                            {sched.guildTurn ? sched.guildTurn.toUpperCase() : "FREE CLAIM"}
                          </span>
                        </div>

                        <div className="flex flex-col min-w-[120px]">
                          <span className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1 select-none font-sans font-bold">Countdown</span>
                          <span className={`font-mono text-sm font-bold ${tick.warning ? "text-amber-400 animate-pulse" : "text-emerald-400"}`}>
                            {sched.status === "SPAWNED" ? "ALIVE / READY" : tick.text}
                          </span>
                        </div>

                        <div className="flex flex-col select-none">
                          <span className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1 select-none font-sans font-bold">State</span>
                          <span className={`text-xs font-semibold uppercase tracking-wider ${
                            sched.status === "SPAWNED" ? "text-emerald-400" : "text-amber-500"
                          }`}>
                            {sched.status}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })
            )}
          </div>
        )}

        {/* ─── TAB 3: ACTIVITY LOGS ────────────────────────────────────────── */}
        {activeTab === "ACTIVITY" && (
          <div className="space-y-4 max-w-3xl mx-auto animate-scale-in">
            <div className="bg-[#0b0b0e] border border-white/[0.04] p-5 rounded-2xl glass-subtle">
              <h3 className="text-sm font-bold text-white mb-4 uppercase tracking-wider flex items-center gap-2">
                <span>🛡️ Guild Transparency Audit</span>
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              </h3>
              
              {isLoadingLogs ? (
                <div className="space-y-3">
                  {[1, 2, 3, 4].map((i) => (
                    <Skeleton key={i} className="h-16 rounded-xl animate-pulse bg-white/[0.02]" />
                  ))}
                </div>
              ) : auditLogs.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 rounded-xl bg-white/[0.005] border border-white/[0.02] p-6 text-center">
                  <svg className="h-8 w-8 text-white/10 mb-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 8v4l3 3" />
                  </svg>
                  <p className="text-xs text-white/35">No boss activity logs recorded yet.</p>
                </div>
              ) : (
                <div className="space-y-3.5 max-h-[550px] overflow-y-auto pr-2 custom-scrollbar">
                  {auditLogs.map((log) => {
                    const label = ACTION_LABELS[log.action] || log.action;
                    const colorClass = ACTION_COLORS[log.action] || "text-zinc-400 bg-zinc-500/10 border-zinc-500/20";
                    
                    const detailAny = log.detail as any;
                    const bossName = detailAny?.bossName || detailAny?.bossSchedule?.bossName || "";
                    const lootDrop = detailAny?.lootDrop || "";
                    const guildTurn = detailAny?.guildTurn || "";
                    
                    return (
                      <div key={log.id} className="flex items-start gap-4 p-4 rounded-xl border border-white/[0.03] bg-[#09090c]/40 hover:bg-white/[0.01] hover:border-white/[0.06] transition-all">
                        {/* Actor Avatar */}
                        <div className="h-9 w-9 rounded-full overflow-hidden border border-white/10 shrink-0 bg-amber-500/10 flex items-center justify-center text-amber-400 font-bold text-xs select-none">
                          {log.actor?.avatarUrl ? (
                            <img src={log.actor.avatarUrl} alt={log.actor.displayName} className="h-full w-full object-cover" />
                          ) : (
                            log.actor?.displayName?.charAt(0).toUpperCase() || "A"
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-bold text-white text-[13px] shrink-0">
                              {log.actor?.displayName || "System Agent"}
                            </span>
                            <span className={`px-2 py-0.5 rounded-lg border text-[9px] font-bold uppercase tracking-wider ${colorClass}`}>
                              {label}
                            </span>
                            <span className="text-[10px] text-zinc-550 ml-auto font-medium">
                              {getRelativeTime(log.createdAt)}
                            </span>
                          </div>
                          
                          <p className="text-xs text-zinc-400 mt-1.5 leading-relaxed">
                            {bossName && (
                              <>
                                Boss: <span className="text-white font-bold">{bossName}</span>
                              </>
                            )}
                            {guildTurn && (
                              <>
                                {" "}· Assigned Turn: <span className="text-amber-400 font-bold">{guildTurn}</span>
                              </>
                            )}
                            {lootDrop && (
                              <>
                                {" "}· Loot dropped: <span className="text-emerald-400 font-bold italic">{lootDrop}</span>
                              </>
                            )}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
