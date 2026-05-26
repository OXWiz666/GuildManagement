"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import { dashboardApi, type BossScheduleData, type BossData } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import DashboardDecor from "@/components/dashboard/DashboardDecor";
import {
  Reveal,
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

export default function BossSchedulePage() {
  const { user } = useAuth();
  const { addToast } = useToast();

  const [schedules, setSchedules] = useState<BossScheduleData[]>([]);
  const [bosses, setBosses] = useState<BossData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(Date.now());

  // Weekly Planner Navigation State
  const [anchorDate, setAnchorDate] = useState<Date>(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());

  // Add Event Form State
  const [showAddModal, setShowAddModal] = useState(false);
  const [bossName, setBossName] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [bossImageUrl, setBossImageUrl] = useState("");
  const [spawnDate, setSpawnDate] = useState("");
  const [spawnTime, setSpawnTime] = useState("");
  const [location, setLocation] = useState("");
  const [guildTurn, setGuildTurn] = useState("");
  const [isFactionWide, setIsFactionWide] = useState(false);
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
  const isOfficer = activeGuild?.role === "OFFICER" || isGuildLeader;

  // Sync clocks every second
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const loadSchedules = useCallback(async () => {
    if (!activeGuild) return;
    setIsLoading(true);
    try {
      const result = await dashboardApi.getBossSchedules(activeGuild.guildId);
      if (result.success && result.data?.schedules) {
        setSchedules(result.data.schedules);
      }
    } catch {
      addToast("error", "Failed to load boss schedules");
    } finally {
      setIsLoading(false);
    }
  }, [activeGuild, addToast]);

  const loadBosses = useCallback(async () => {
    try {
      const result = await dashboardApi.getBosses();
      if (result.success && result.data?.bosses) {
        setBosses(result.data.bosses);
      }
    } catch {
      addToast("error", "Failed to load boss registry");
    }
  }, [addToast]);

  useEffect(() => {
    loadSchedules();
    loadBosses();
  }, [loadSchedules, loadBosses]);

  // Auto-resolve spawn time for fixed schedule bosses
  useEffect(() => {
    if (!bossName || !spawnDate) return;
    const selectedBoss = bosses.find((b) => b.name.toLowerCase() === bossName.toLowerCase());
    if (selectedBoss && selectedBoss.type === "FIXED_SCHEDULE" && selectedBoss.fixedSpawns) {
      const dateParts = spawnDate.split("-");
      if (dateParts.length === 3) {
        const year = parseInt(dateParts[0], 10);
        const month = parseInt(dateParts[1], 10) - 1;
        const day = parseInt(dateParts[2], 10);
        const targetDate = new Date(year, month, day);
        const dayOfWeek = targetDate.getDay();

        let spawnsArray: Array<{ day: number; hour: number; minute: number }> = [];
        try {
          if (typeof selectedBoss.fixedSpawns === "string") {
            spawnsArray = JSON.parse(selectedBoss.fixedSpawns);
          } else if (Array.isArray(selectedBoss.fixedSpawns)) {
            spawnsArray = selectedBoss.fixedSpawns;
          }
        } catch (e) {
          spawnsArray = [];
        }

        const match = spawnsArray.find((s) => s.day === dayOfWeek);
        if (match) {
          const hh = String(match.hour).padStart(2, "0");
          const mm = String(match.minute).padStart(2, "0");
          setSpawnTime(`${hh}:${mm}`);
        } else if (spawnsArray.length > 0) {
          const first = spawnsArray[0];
          const hh = String(first.hour).padStart(2, "0");
          const mm = String(first.minute).padStart(2, "0");
          setSpawnTime(`${hh}:${mm}`);
        }
      }
    }
  }, [bossName, spawnDate, bosses]);

  // Submit new boss schedule
  async function handleAddSchedule(e: React.FormEvent) {
    e.preventDefault();
    if (!activeGuild || !bossName.trim() || !spawnDate || !spawnTime || !location.trim()) {
      addToast("error", "Please fill in all event details");
      return;
    }

    setIsSubmitting(true);
    try {
      const fullSpawnTime = new Date(`${spawnDate}T${spawnTime}:00`);
      const result = await dashboardApi.addBossSchedule(activeGuild.guildId, {
        bossName: bossName.trim(),
        bossImageUrl: bossImageUrl.trim() || undefined,
        spawnTime: fullSpawnTime.toISOString(),
        location: location.trim(),
        guildTurn: guildTurn.trim() || undefined,
        isFaction: isFactionWide,
      });

      if (result.success) {
        addToast("success", `Scheduled ${bossName} spawn successfully!`);
        setShowAddModal(false);
        // Reset form
        setBossName("");
        setSearchQuery("");
        setBossImageUrl("");
        setSpawnDate("");
        setSpawnTime("");
        setLocation("");
        setGuildTurn("");
        setIsFactionWide(false);
        await loadSchedules();
      }
    } catch (err: any) {
      addToast("error", err?.message || "Failed to add boss schedule");
    } finally {
      setIsSubmitting(false);
    }
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
      if (result.success) {
        let successMsg = `Boss kill logged for ${showKillModal.bossName}! Next spawn auto-scheduled.`;
        if (broadcastDiscord) {
          successMsg += " Discord webhook notification broadcasted! 📡";
        }
        addToast("success", successMsg);
        setShowKillModal(null);
        setKillTimeInput("");
        setLootDrop("");
        setScreenshotUrl("");
        await loadSchedules();
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
    if (diff <= 0) return { expired: true, text: "SPAWNED", danger: true };

    const hrs = Math.floor(diff / (3600 * 1000));
    const mins = Math.floor((diff % (3600 * 1000)) / (60 * 1000));
    const secs = Math.floor((diff % (60 * 1000)) / 1000);

    const text = `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
    const warning = diff <= 5 * 60 * 1000; // less than 5 mins

    return { expired: false, text, warning };
  }

  // Calendar math calculations for Weekly View
  const getDaysOfWeek = (date: Date) => {
    const start = new Date(date);
    const day = start.getDay(); // 0 is Sunday
    start.setDate(start.getDate() - day); // Move to Sunday
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

  const getFixedSpawnDaysText = (selectedBossName: string) => {
    const selectedBoss = bosses.find((b) => b.name.toLowerCase() === selectedBossName.toLowerCase());
    if (selectedBoss && selectedBoss.type === "FIXED_SCHEDULE" && selectedBoss.fixedSpawns) {
      let spawnsArray: Array<{ day: number; hour: number; minute: number }> = [];
      try {
        if (typeof selectedBoss.fixedSpawns === "string") {
          spawnsArray = JSON.parse(selectedBoss.fixedSpawns);
        } else if (Array.isArray(selectedBoss.fixedSpawns)) {
          spawnsArray = selectedBoss.fixedSpawns;
        }
      } catch (e) {
        spawnsArray = [];
      }
      
      const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      return spawnsArray.map(s => `${dayNames[s.day]} at ${String(s.hour).padStart(2, "0")}:${String(s.minute).padStart(2, "0")}`).join(", ");
    }
    return "";
  };

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

  // Events filtered by currently highlighted day column for the timeline panel on the right
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

  if (isLoading && schedules.length === 0) {
    return (
      <div className="space-y-6 max-w-full xl:max-w-[1600px] mx-auto px-2 md:px-4 lg:px-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-fade-in">
          <div className="space-y-2">
            <Skeleton className="h-7 w-64 animate-pulse" />
            <Skeleton className="h-4 w-96 animate-pulse" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-8 w-24 rounded-lg animate-pulse" />
          </div>
        </div>
        <div className="h-[520px] rounded-2xl bg-[#111116]/40 border border-white/[0.04] backdrop-blur-md relative overflow-hidden animate-pulse shadow-[0_0_15px_rgba(139,92,246,0.03)] flex flex-col justify-between p-6">
          <div className="flex items-center justify-between mb-6">
            <Skeleton className="h-6 w-48" />
            <div className="flex gap-2">
              <Skeleton className="h-8 w-20 rounded-lg" />
              <Skeleton className="h-8 w-16 rounded-lg" />
              <Skeleton className="h-8 w-20 rounded-lg" />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-4 flex-1">
            {[1, 2, 3, 4, 5, 6, 7].map((i) => (
              <div key={i} className="rounded-xl border border-white/[0.05] p-4 flex flex-col justify-between min-h-[380px] bg-white/[0.01]">
                <div className="border-b border-white/[0.05] pb-2 mb-3 space-y-2">
                  <Skeleton className="h-3 w-12" />
                  <Skeleton className="h-4 w-20" />
                </div>
                <div className="flex-1 flex flex-col justify-center items-center">
                  <div className="h-10 w-10 rounded-full bg-white/[0.02] border border-dashed border-white/10" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

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
                onClick={loadSchedules}
                isLoading={isLoading}
              >
                Refresh
              </Button>
            </div>
          }
        />

        {/* Interactive Weekly Planner Calendar */}
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
        />

        {/* 3-Column Split Details Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start animate-slide-up">
          {/* Day Highlight Timeline Panel */}
          <DaySpawnsTimeline
            selectedDate={selectedDate}
            dayEvents={dayEvents}
            getCountdownText={getCountdownText}
            isOfficer={isOfficer}
            setShowKillModal={setShowKillModal}
            setKillTimeInput={setKillTimeInput}
          />

          {/* Upcoming Active Spawns Countdown Tracker Panel */}
          <ActiveSpawnsQueue
            upcomingSpawns={upcomingSpawns}
            getCountdownText={getCountdownText}
          />

          {/* Killed History Logs panel */}
          <KilledBossHistory
            killedHistory={killedHistory}
          />
        </div>

        {/* Modal: Schedule Boss Spawn */}
        <AddScheduleModal
          showAddModal={showAddModal}
          setShowAddModal={setShowAddModal}
          bossName={bossName}
          setBossName={setBossName}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          showSuggestions={showSuggestions}
          setShowSuggestions={setShowSuggestions}
          bossImageUrl={bossImageUrl}
          setBossImageUrl={setBossImageUrl}
          spawnDate={spawnDate}
          setSpawnDate={setSpawnDate}
          spawnTime={spawnTime}
          setSpawnTime={setSpawnTime}
          location={location}
          setLocation={setLocation}
          guildTurn={guildTurn}
          setGuildTurn={setGuildTurn}
          isFactionWide={isFactionWide}
          setIsFactionWide={setIsFactionWide}
          isSubmitting={isSubmitting}
          handleAddSchedule={handleAddSchedule}
          bosses={bosses}
          getFixedSpawnDaysText={getFixedSpawnDaysText}
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
