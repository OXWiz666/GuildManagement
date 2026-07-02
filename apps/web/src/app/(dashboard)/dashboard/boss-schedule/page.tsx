"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/lib/auth-context";
import { dashboardApi, type BossScheduleData, type BossData } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import { getRealtimeBossTimer } from "@guild/shared";
import { useSocket } from "@/components/providers/socket-provider";
import Button from "@/components/ui/Button";
import DashboardDecor from "@/components/dashboard/DashboardDecor";
import { useQuery, queryClient } from "@/lib/query";
import { ModuleHeader, Magnetic } from "@/components/dashboard/DashboardHelpers";

// Imports from co-located components
import ScheduleStats from "./components/ScheduleStats";
import WeeklySchedule from "./components/WeeklySchedule";
import ActiveSpawnsQueue from "./components/ActiveSpawnsQueue";
import RecentKills from "./components/RecentKills";
import UpNextPanel from "./components/UpNextPanel";
import AddScheduleModal from "./components/AddScheduleModal";
import LogKillModal from "./components/LogKillModal";
import LiveCheckIns from "./components/LiveCheckIns";

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

  // One-click member check-in state (windows open automatically on a logged kill)
  const [checkingInId, setCheckingInId] = useState<string | null>(null);

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

  // 3. Attendance stats (for the headline Attendance Rate stat)
  const { data: attendanceStats } = useQuery<{ presenceRate: number } | null>(
    activeGuild ? `attendance_stats:${activeGuild.guildId}` : "attendance_stats_empty",
    async () => {
      if (!activeGuild) return null;
      const result = await dashboardApi.getAttendanceStats(activeGuild.guildId);
      return result.success && result.data ? result.data : null;
    },
    { persist: true, staleTime: 30000, enabled: !!activeGuild }
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
      queryClient.invalidateQueries(`boss_schedules:${activeGuild.guildId}`);
    };

    socket.on("boss_rotation_updated", handleRealTimeRefresh);
    socket.on("boss_schedule_deleted", handleRealTimeRefresh);
    // A check-in window opens/changes as kills are logged and members claim presence
    socket.on("attendance_session_created", handleRealTimeRefresh);
    socket.on("attendance_record_created", handleRealTimeRefresh);
    socket.on("attendance_record_confirmed", handleRealTimeRefresh);

    return () => {
      socket.off("boss_rotation_updated", handleRealTimeRefresh);
      socket.off("boss_schedule_deleted", handleRealTimeRefresh);
      socket.off("attendance_session_created", handleRealTimeRefresh);
      socket.off("attendance_record_created", handleRealTimeRefresh);
      socket.off("attendance_record_confirmed", handleRealTimeRefresh);
    };
  }, [socket, activeGuild]);

  // One-click check-in for a killed boss (no code typing). The boss id resolves
  // the active check-in window server-side.
  const handleCheckIn = useCallback(async (item: BossScheduleData) => {
    if (!activeGuild) return;
    setCheckingInId(item.id);
    try {
      const result = await dashboardApi.checkInToBoss(activeGuild.guildId, item.id);
      if (result.success) {
        addToast("success", `Checked in for ${item.bossName}. Awaiting officer verification.`);
        queryClient.invalidateQueries(`boss_schedules:${activeGuild.guildId}`);
      }
    } catch (err: any) {
      addToast("error", err?.message || "Failed to check in");
    } finally {
      setCheckingInId(null);
    }
  }, [activeGuild, addToast]);

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

  // Real-time respawn countdown for a specific boss. Overdue spawns roll forward
  // to the boss's next real respawn instead of reading "LIVE" indefinitely.
  function getCountdownText(
    spawnTimeStr: string,
    ctx?: { bossName?: string; status?: string },
  ) {
    const t = getRealtimeBossTimer(ctx?.bossName ?? "", spawnTimeStr, currentTime, { status: ctx?.status });
    return {
      expired: t.live,
      live: t.live,
      text: t.text,
      liveText: t.liveElapsedText,
      nextSpawn: t.nextSpawn,
      danger: t.live,
      warning: t.warning,
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

  // Officer helpers to open the schedule/kill modals
  const openAddForDate = useCallback((date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    setSpawnDate(`${y}-${m}-${d}`);
    setSpawnTime(new Date().toTimeString().substring(0, 5));
    setShowAddModal(true);
  }, []);

  const openLogKill = useCallback((item: BossScheduleData) => {
    setShowKillModal(item);
    setKillTimeInput(new Date().toLocaleTimeString("en-US", { hour12: false }).substring(0, 5));
  }, []);

  const handleSetReminder = useCallback(
    (bossName: string, minutes: number) => {
      addToast("success", `Reminder set — we'll ping you ${minutes} min before ${bossName} spawns.`);
    },
    [addToast]
  );

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

  // Filter history logs: ALL KILLED bosses
  const killedHistory = schedules
    .filter((s) => s.status === "KILLED")
    .sort((a, b) => new Date(b.killedAt || b.spawnTime).getTime() - new Date(a.killedAt || a.spawnTime).getTime());

  // Filter active countdown queue: chronologically ordered UPCOMING or SPAWNED bosses
  const upcomingSpawns = schedules
    .filter((s) => s.status !== "KILLED")
    .sort((a, b) => new Date(a.spawnTime).getTime() - new Date(b.spawnTime).getTime());

  // Bosses with an open check-in window (auto-opened when a kill is logged)
  const openCheckIns = schedules
    .filter((s) => {
      const session = s.attendanceSessions?.[0];
      return session && session.isActive && new Date(session.expiresAt).getTime() > currentTime;
    })
    .sort(
      (a, b) =>
        new Date(a.attendanceSessions![0].expiresAt).getTime() -
        new Date(b.attendanceSessions![0].expiresAt).getTime(),
    );

  // ─── Headline stat computations ──────────────────────────
  const weekStart = daysOfWeek[0];
  const weekEnd = new Date(daysOfWeek[6]);
  weekEnd.setHours(23, 59, 59, 999);
  const weekRangeLabel = `${weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${daysOfWeek[6].toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;

  const nextSpawn = upcomingSpawns.find((s) => new Date(s.spawnTime).getTime() > currentTime) || upcomingSpawns[0] || null;
  const nextLabel = nextSpawn
    ? `Next: ${nextSpawn.bossName} ${getCountdownText(nextSpawn.spawnTime, { bossName: nextSpawn.bossName, status: nextSpawn.status }).text}`
    : "No upcoming spawns";

  const thisWeekCount = schedules.filter((s) => {
    const t = new Date(s.spawnTime).getTime();
    return s.status !== "KILLED" && t >= weekStart.getTime() && t <= weekEnd.getTime();
  }).length;

  const now = new Date(currentTime);
  const thisMonthKills = killedHistory.filter((s) => {
    const d = new Date(s.killedAt || s.spawnTime);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;
  const monthLabel = now.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  return (
    <div className="relative max-w-full xl:max-w-[1600px] mx-auto w-full px-2 md:px-4 lg:px-6">
      <DashboardDecor />

      <div className="relative z-10 space-y-6 text-white/85">
        <ModuleHeader
          eyebrow="Calendar"
          title="Boss schedule"
          description="View all upcoming field boss spawns, set reminders, and track weekly activity."
          right={
            <div className="flex items-center gap-2">
              {isOfficer && (
                <Magnetic strength={4}>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => openAddForDate(new Date())}
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <line x1="5" y1="12" x2="19" y2="12" />
                      </svg>
                      Schedule Boss
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

        {/* Headline stats */}
        <ScheduleStats
          upcomingCount={upcomingSpawns.length}
          nextLabel={nextLabel}
          thisWeekCount={thisWeekCount}
          weekRangeLabel={weekRangeLabel}
          thisMonthKills={thisMonthKills}
          monthLabel={monthLabel}
          attendanceRate={attendanceStats ? attendanceStats.presenceRate : null}
        />

        {/* Live one-click check-ins for freshly killed bosses (merged from Attendance) */}
        <LiveCheckIns
          openCheckIns={openCheckIns}
          userId={user.id}
          currentTime={currentTime}
          checkingInId={checkingInId}
          onCheckIn={handleCheckIn}
        />

        {/* Main grid: schedule column + Up Next sidebar */}
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-6 items-start">
          <div className="space-y-6 min-w-0">
            <WeeklySchedule
              anchorDate={anchorDate}
              setAnchorDate={setAnchorDate}
              selectedDate={selectedDate}
              setSelectedDate={setSelectedDate}
              daysOfWeek={daysOfWeek}
              weekRangeLabel={weekRangeLabel}
              bosses={bosses}
              getEventsForDay={getEventsForDay}
              getCountdownText={getCountdownText}
              isOfficer={isOfficer}
              isLoading={isLoading}
              onAddForDate={openAddForDate}
              onLogKill={openLogKill}
              onEditSchedule={(item) => {
                setEditingEvent(item);
                setShowAddModal(true);
              }}
              onDeleteSchedule={handleDeleteSchedule}
            />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <ActiveSpawnsQueue
                upcomingSpawns={upcomingSpawns}
                currentTime={currentTime}
                getCountdownText={getCountdownText}
              />
              <RecentKills killedHistory={killedHistory} />
            </div>
          </div>

          {/* Up Next sidebar */}
          <div className="xl:sticky xl:top-6">
            <UpNextPanel
              upcomingSpawns={upcomingSpawns}
              killedHistory={killedHistory}
              bosses={bosses}
              currentTime={currentTime}
              onSetReminder={handleSetReminder}
            />
          </div>
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
