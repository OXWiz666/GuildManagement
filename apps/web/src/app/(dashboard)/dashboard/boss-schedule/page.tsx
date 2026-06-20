"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/lib/auth-context";
import { dashboardApi, type BossScheduleData, type BossData } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import { useSocket } from "@/components/providers/socket-provider";
import Button from "@/components/ui/Button";
import DashboardDecor from "@/components/dashboard/DashboardDecor";
import { useQuery, queryClient } from "@/lib/query";
import {
  ModuleHeader,
  Magnetic,

} from "@/components/dashboard/DashboardHelpers";

// Imports from co-located components
import WeeklyCalendar from "./components/WeeklyCalendar";
import DaySpawnsTimeline from "./components/DaySpawnsTimeline";
import ActiveSpawnsQueue from "./components/ActiveSpawnsQueue";
import KilledBossHistory from "./components/KilledBossHistory";
import AddScheduleModal from "./components/AddScheduleModal";
import LogKillModal from "./components/LogKillModal";
import BossRespawnList from "./components/BossRespawnList";

// Guild badges and colors configuration
const GUILD_CONFIG: Record<string, { color: string; border: string; bg: string; text: string }> = {
  SAUSAGE: {
    color: "#f59e0b",
    border: "border-amber-500/20",
    bg: "bg-amber-500/[0.08]",
    text: "text-amber-400"
  },
  VALHALLA: {
    color: "#10b981",
    border: "border-emerald-500/20",
    bg: "bg-emerald-500/[0.08]",
    text: "text-emerald-400"
  },
  BZDK: {
    color: "#3b82f6",
    border: "border-blue-500/20",
    bg: "bg-blue-500/[0.08]",
    text: "text-blue-400"
  }
};

export default function BossSchedulePage() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const { socket } = useSocket();

  const [currentTime, setCurrentTime] = useState(Date.now());

  // Weekly Planner Navigation State
  const [anchorDate, setAnchorDate] = useState<Date>(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());

  // Add Event Form State
  const [showAddModal, setShowAddModal] = useState(false);
  const [spawnDate, setSpawnDate] = useState("");
  const [spawnTime, setSpawnTime] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Log Kill Form State
  const [showKillModal, setShowKillModal] = useState<BossScheduleData | null>(null);
  const [killTimeInput, setKillTimeInput] = useState("");
  const [isLoggingKill, setIsLoggingKill] = useState(false);
  const [lootDrop, setLootDrop] = useState("");
  const [screenshotUrl, setScreenshotUrl] = useState("");
  const [broadcastDiscord, setBroadcastDiscord] = useState(true);

  const activeGuild = user?.guilds?.[0];
  const isGuildLeader = activeGuild?.role === "GUILD_LEADER";
  const isFactionLeader = activeGuild?.role === "FACTION_LEADER" || activeGuild?.role === "ADMIN";
  const isOfficer = activeGuild?.role === "OFFICER" || isGuildLeader || isFactionLeader;

  // State for editing single event
  const [editingEvent, setEditingEvent] = useState<BossScheduleData | null>(null);

  // Sync clocks every second
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

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
  const bosses = bossRegistryRaw || [];

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
    { persist: true, staleTime: 15000, enabled: !!activeGuild }
  );

  const schedules = (schedulesRaw || []).filter((s) => {
    if (!activeGuild) return false;
    if (s.guildId && s.guildId !== activeGuild.guildId) return false;
    if (s.guildTurn && s.guildTurn.toUpperCase() !== activeGuild.guildName.toUpperCase()) return false;
    return true;
  });

  const isLoading = isLoadingRegistry || isLoadingSchedules;

  // Listen to Socket.IO real-time events for instant cache invalidation
  useEffect(() => {
    if (!socket || !activeGuild) return;

    const handleRealTimeRefresh = () => {
      console.log("[Socket Real-time]: Invalidating schedules...");
      queryClient.invalidateQueries(`boss_schedules:${activeGuild.guildId}`);
    };

    socket.on("boss_rotation_updated", handleRealTimeRefresh);
    socket.on("boss_schedule_deleted", handleRealTimeRefresh);

    return () => {
      socket.off("boss_rotation_updated", handleRealTimeRefresh);
      socket.off("boss_schedule_deleted", handleRealTimeRefresh);
    };
  }, [socket, activeGuild]);

  // Submit new boss schedule batch
  async function handleAddScheduleBatch(
    spawnDate: string,
    isFactionWide: boolean,
    items: Array<{
      bossName: string;
      bossImageUrl?: string;
      spawnTime: string;
      location: string;
      guildTurn?: string;
    }>
  ) {
    if (!activeGuild || items.length === 0) return;
    setIsSubmitting(true);
    try {
      let succeeded = 0;
      for (const item of items) {
        const result = await dashboardApi.addBossSchedule(activeGuild.guildId, {
          bossName: item.bossName,
          bossImageUrl: item.bossImageUrl,
          spawnTime: item.spawnTime,
          location: item.location,
          guildTurn: item.guildTurn,
          isFaction: isFactionWide,
        });
        if (result.success && result.data?.schedule) {
          succeeded++;
        }
      }

      addToast("success", `Successfully scheduled ${succeeded} boss spawn(s)!`);
      setShowAddModal(false);
      queryClient.invalidateQueries(`boss_schedules:${activeGuild.guildId}`);
    } catch (err: any) {
      addToast("error", err?.message || "Failed to add boss schedule batch");
    } finally {
      setIsSubmitting(false);
    }
  }

  // Edit boss schedule handler
  async function handleEditSchedule(
    scheduleId: string,
    payload: {
      bossName?: string;
      bossImageUrl?: string;
      spawnTime?: string;
      location?: string;
      guildTurn?: string;
      isFaction?: boolean;
    }
  ) {
    if (!activeGuild) return;
    setIsSubmitting(true);
    try {
      const result = await dashboardApi.updateBossSchedule(activeGuild.guildId, scheduleId, payload);
      if (result.success && result.data?.schedule) {
        addToast("success", "Boss schedule updated successfully!");
        setShowAddModal(false);
        setEditingEvent(null);
        queryClient.invalidateQueries(`boss_schedules:${activeGuild.guildId}`);
      }
    } catch (err: any) {
      addToast("error", err?.message || "Failed to update boss schedule");
    } finally {
      setIsSubmitting(false);
    }
  }

  // Delete boss schedule handler
  function handleDeleteSchedule(scheduleId: string) {
    const targetSchedule = schedules.find((s) => s.id === scheduleId);
    if (!targetSchedule || !activeGuild) return;

    addToast(
      "warning",
      `Are you sure you want to delete the scheduled fight for ${targetSchedule.bossName}? This will also remove any associated DKP check-in data.`,
      0, // stays until action or dismiss
      {
        label: "Delete",
        variant: "danger",
        onClick: async () => {
          try {
            const result = await dashboardApi.deleteBossSchedule(activeGuild.guildId, scheduleId);
            if (result.success) {
              addToast("success", `Schedule for ${targetSchedule.bossName} has been deleted.`);
              queryClient.invalidateQueries(`boss_schedules:${activeGuild.guildId}`);
            }
          } catch (err: any) {
            addToast("error", err?.message || `Failed to delete schedule for ${targetSchedule.bossName}`);
          }
        },
      }
    );
  }

  // Submit boss death log
  async function handleLogKill(e: React.FormEvent) {
    e.preventDefault();
    if (!activeGuild || !showKillModal || !killTimeInput) return;

    setIsLoggingKill(true);
    try {
      const formattedTime = new Date(`${new Date().toISOString().split("T")[0]}T${killTimeInput}:00`);
      const result = await dashboardApi.logBossKill(
        activeGuild.guildId,
        showKillModal.id,
        formattedTime.toISOString(),
        lootDrop.trim() && lootDrop.trim() !== "None" ? lootDrop.trim() : undefined,
        screenshotUrl.trim() || undefined
      );
      if (result.success && result.data) {
        let successMsg = `Boss kill logged for ${showKillModal.bossName}! Expected respawn timer updated.`;
        if (broadcastDiscord) {
          successMsg += " Discord webhook notification broadcasted! 📡";
        }
        addToast("success", successMsg);
        setShowKillModal(null);
        setKillTimeInput("");
        setLootDrop("");
        setScreenshotUrl("");
        queryClient.invalidateQueries(`boss_schedules:${activeGuild.guildId}`);
      }
    } catch (err: any) {
      addToast("error", err?.message || "Failed to log boss kill");
    } finally {
      setIsLoggingKill(false);
    }
  }

  // Format real-time countdown
  function getCountdownText(spawnTimeStr: string) {
    const target = new Date(spawnTimeStr).getTime();
    const diff = target - currentTime;
    if (diff <= 0) return { expired: true, text: "LIVE", danger: true, warning: false };

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

  // Calendar math calculations for Weekly View
  const getDaysOfWeek = (date: Date) => {
    const start = new Date(date);
    const day = start.getDay();
    start.setDate(start.getDate() - day);
    start.setHours(0, 0, 0, 0);

    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      days.push(d);
    }
    return days;
  };

  const daysOfWeek = getDaysOfWeek(anchorDate);

  if (!user || !activeGuild) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-white/40">No active guild selected</p>
      </div>
    );
  }

  // Filter events inside weekly calendar
  const getEventsForDay = (date: Date) => {
    return schedules
      .filter((s) => {
        const sDate = new Date(s.spawnTime);
        return (
          sDate.getDate() === date.getDate() &&
          sDate.getMonth() === date.getMonth() &&
          sDate.getFullYear() === date.getFullYear()
        );
      })
      .sort((a, b) => new Date(a.spawnTime).getTime() - new Date(b.spawnTime).getTime());
  };

  // Events filtered by currently highlighted day column
  const dayEvents = selectedDate
    ? schedules
        .filter((s) => {
          const sDate = new Date(s.spawnTime);
          return (
            sDate.getDate() === selectedDate.getDate() &&
            sDate.getMonth() === selectedDate.getMonth() &&
            sDate.getFullYear() === selectedDate.getFullYear()
          );
        })
        .sort((a, b) => new Date(a.spawnTime).getTime() - new Date(b.spawnTime).getTime())
    : [];

  // Filter history logs: ALL KILLED bosses
  const killedHistory = schedules
    .filter((s) => s.status === "KILLED")
    .sort((a, b) => new Date(b.killedAt || b.spawnTime).getTime() - new Date(a.killedAt || a.spawnTime).getTime());

  // Filter active countdown queue: chronologically ordered UPCOMING or SPAWNED bosses
  const upcomingSpawns = schedules
    .filter((s) => s.status !== "KILLED")
    .sort((a, b) => new Date(a.spawnTime).getTime() - new Date(b.spawnTime).getTime());



  return (
    <div className="relative max-w-full xl:max-w-[1600px] mx-auto w-full px-2 md:px-4 lg:px-6">
      <DashboardDecor />

      <div className="relative z-10 space-y-6 text-white/85">
        <ModuleHeader
          eyebrow="Calendar"
          title="Boss schedule"
          description="Active countdowns, fixed spawns, and respawn history."
          right={
            <div className="flex items-center gap-2">
              {isOfficer && (
                <Magnetic strength={4}>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => {
                      const todayStr = new Date().toISOString().split("T")[0];
                      setSpawnDate(todayStr);
                      setSpawnTime(new Date().toTimeString().substring(0, 5));
                      setShowAddModal(true);
                    }}
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <svg
                        className="h-3.5 w-3.5"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                      >
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <line x1="5" y1="12" x2="19" y2="12" />
                      </svg>
                      Schedule boss
                    </span>
                  </Button>
                </Magnetic>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => queryClient.invalidateQueries(`boss_schedules:${activeGuild?.guildId}`)}
                isLoading={isLoading}
              >
                Refresh
              </Button>
            </div>
          }
        />



        {/* Global Status Legend Panel */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-white/[0.06] pt-5 text-white/50 text-xs select-none">
          <div className="flex flex-wrap items-center gap-5">
            <span className="font-semibold text-white/40 uppercase tracking-wider">Status:</span>
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]" />
              <span>Spawned</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-amber-400 shadow-[0_0_6px_rgba(245,158,11,0.5)]" />
              <span>Upcoming Spawn</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.5)]" />
              <span>Killed</span>
            </div>
          </div>
          <div className="text-[10px] text-zinc-500 italic">
            Times and schedules are synchronized with global server time.
          </div>
        </div>

        {/* Interactive Weekly Planner Calendar */}
        <div className="border-t border-white/[0.05] pt-6 space-y-4">
  
          <WeeklyCalendar
            anchorDate={anchorDate}
            setAnchorDate={setAnchorDate}
            selectedDate={selectedDate}
            setSelectedDate={setSelectedDate}
            daysOfWeek={daysOfWeek}
            getEventsForDay={getEventsForDay}
            getCountdownText={getCountdownText}
            isOfficer={isOfficer}
            isLoading={isLoading}
            setShowAddModal={setShowAddModal}
            setSpawnDate={setSpawnDate}
            setSpawnTime={setSpawnTime}
            setShowKillModal={setShowKillModal}
            setKillTimeInput={setKillTimeInput}
            onDeleteSchedule={handleDeleteSchedule}
          />

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start animate-slide-up pt-4">
            <DaySpawnsTimeline
              selectedDate={selectedDate}
              dayEvents={dayEvents}
              getCountdownText={getCountdownText}
              isOfficer={isOfficer}
              setShowKillModal={setShowKillModal}
              setKillTimeInput={setKillTimeInput}
              onEditSchedule={(item) => {
                setEditingEvent(item);
                setShowAddModal(true);
              }}
              onDeleteSchedule={handleDeleteSchedule}
            />

            <ActiveSpawnsQueue
              upcomingSpawns={upcomingSpawns}
              getCountdownText={getCountdownText}
            />

            <KilledBossHistory
              killedHistory={killedHistory}
            />
          </div>

          <BossRespawnList
            killedHistory={killedHistory}
            bosses={bosses}
          />
        </div>

        {/* Modal: Schedule / Edit Boss Spawn */}
        <AddScheduleModal
          showAddModal={showAddModal}
          setShowAddModal={(val) => {
            setShowAddModal(val);
            if (!val) setEditingEvent(null);
          }}
          bosses={bosses}
          isFactionLeader={isFactionLeader}
          isSubmitting={isSubmitting}
          spawnDate={spawnDate}
          setSpawnDate={setSpawnDate}
          spawnTime={spawnTime}
          setSpawnTime={setSpawnTime}
          handleAddScheduleBatch={handleAddScheduleBatch}
          editingEvent={editingEvent}
          handleEditSchedule={handleEditSchedule}
        />

        {/* Modal: Log Boss Death */}
        <LogKillModal
          showKillModal={showKillModal}
          killTimeInput={killTimeInput}
          setKillTimeInput={setKillTimeInput}
          lootDrop={lootDrop}
          setLootDrop={setLootDrop}
          screenshotUrl={screenshotUrl}
          setScreenshotUrl={setScreenshotUrl}
          broadcastDiscord={broadcastDiscord}
          setBroadcastDiscord={setBroadcastDiscord}
          isLoggingKill={isLoggingKill}
          handleLogKill={handleLogKill}
          onClose={() => setShowKillModal(null)}
        />
      </div>
    </div>
  );
}
