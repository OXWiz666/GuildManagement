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
  LiveDot
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

  const [schedules, setSchedules] = useState<BossScheduleData[]>([]);
  const [bosses, setBosses] = useState<BossData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(Date.now());

  // View Switcher (Card vs Timeline) for active schedules
  const [viewMode, setViewMode] = useState<"CARD" | "TIMELINE">("CARD");

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
  const isFactionLeader = activeGuild?.role === "ALLIANCE_LEADER" || activeGuild?.role === "ADMIN";
  const isOfficer = activeGuild?.role === "OFFICER" || isGuildLeader || isFactionLeader;

  // State for single editing event
  const [editingEvent, setEditingEvent] = useState<BossScheduleData | null>(null);

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
        if (result.success) {
          succeeded++;
        }
      }

      addToast("success", `Successfully scheduled ${succeeded} boss spawn(s)!`);
      setShowAddModal(false);
      await loadSchedules();
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
      if (result.success) {
        addToast("success", "Boss schedule updated successfully!");
        setShowAddModal(false);
        setEditingEvent(null);
        await loadSchedules();
      }
    } catch (err: any) {
      addToast("error", err?.message || "Failed to update boss schedule");
    } finally {
      setIsSubmitting(false);
    }
  }

  // Delete boss schedule handler
  async function handleDeleteSchedule(scheduleId: string) {
    if (!activeGuild) return;
    if (!window.confirm("Are you sure you want to delete this scheduled boss fight? This will also remove any check-in data.")) return;

    try {
      const result = await dashboardApi.deleteBossSchedule(activeGuild.guildId, scheduleId);
      if (result.success) {
        addToast("success", "Boss schedule deleted successfully!");
        await loadSchedules();
      }
    } catch (err: any) {
      addToast("error", err?.message || "Failed to delete boss schedule");
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
        let successMsg = `Boss kill logged for ${showKillModal.bossName}! Expected respawn timer updated.`;
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

  // Dynamic Grouping of Upcoming Schedules by Day (for Timeline View)
  const groupedSchedules = upcomingSpawns.reduce<Record<string, BossScheduleData[]>>((acc, item) => {
    const d = new Date(item.spawnTime);
    const dayStr = d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
    if (!acc[dayStr]) acc[dayStr] = [];
    acc[dayStr].push(item);
    return acc;
  }, {});

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

        {/* View Switcher Bar */}
        <div className="flex items-center justify-between bg-white/[0.015] border border-white/[0.04] px-4 py-3 rounded-2xl glass-subtle">
          <div className="text-xs font-semibold text-white/40 uppercase tracking-widest">
            Raid Schedule Viewer
          </div>
          <div className="flex items-center border border-white/[0.06] rounded-xl bg-white/[0.015] p-1">
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

        {/* ACTIVE VIEW MODES */}
        {viewMode === "CARD" ? (
          /* CARD GRID VIEW */
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-5 animate-scale-in">
            {upcomingSpawns.length === 0 ? (
              <div className="col-span-full py-12 text-center text-zinc-500 text-sm border border-dashed border-white/5 rounded-2xl bg-white/[0.005]">
                No upcoming boss spawns scheduled.
              </div>
            ) : (
              upcomingSpawns.map((item) => {
                const tick = getCountdownText(item.spawnTime);
                const isPriority = !tick.expired && tick.warning;
                const claimGuild = item.guildTurn || "SAUSAGE";

                return (
                  <div
                    key={item.id}
                    className={`group relative flex flex-col justify-between rounded-2xl bg-[#0c0c10] border p-4 transition-all duration-300 hover:scale-[1.03] hover:-translate-y-1 ${
                      isPriority
                        ? "border-amber-500/40 shadow-[0_0_15px_rgba(245,158,11,0.12)] bg-amber-950/[0.02] animate-pulse"
                        : "border-white/[0.05] hover:border-white/[0.12]"
                    }`}
                  >
                    <div className="relative w-full aspect-[4/3] rounded-xl overflow-hidden bg-zinc-950 border border-white/[0.06] mb-3 select-none">
                      {item.bossImageUrl ? (
                        <img
                          src={item.bossImageUrl}
                          alt={item.bossName}
                          className="h-full w-full object-cover transform scale-100 group-hover:scale-110 transition-transform duration-700 ease-in-out"
                        />
                      ) : (
                        <div className="h-full w-full bg-gradient-to-br from-zinc-800/40 to-black flex items-center justify-center">
                          <svg className="h-8 w-8 text-white/20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                            <path d="M12 2L2 7l10 5 10-5-10-5z" />
                          </svg>
                        </div>
                      )}
                      {/* Active status indicator overlay */}
                      <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-black/60 backdrop-blur-md border border-white/10 flex items-center gap-1.5">
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            item.status === "SPAWNED"
                              ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]"
                              : "bg-amber-400 shadow-[0_0_6px_rgba(245,158,11,0.6)]"
                          }`}
                        />
                        <span className="text-[9px] font-bold uppercase tracking-wider text-white/95">
                          {item.status === "SPAWNED" ? "LIVE" : "CLAIMED"}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-1 mb-4 select-none">
                      <h4 className="font-bold text-white text-[14px] truncate leading-tight">
                        {item.bossName}
                      </h4>
                      <div className="text-[9px] text-zinc-500 flex flex-col gap-0.5">
                        <p className="truncate">📍 {item.location}</p>
                      </div>

                      {/* Spawn timer countdown */}
                      <div className="pt-2">
                        <span className="block text-[8px] text-zinc-500 uppercase tracking-widest mb-1">
                          Respawning In
                        </span>
                        <span
                          className={`block text-[13px] font-mono leading-none ${
                            isPriority ? "text-amber-400 font-bold" : "text-emerald-400 font-medium"
                          }`}
                        >
                          {tick.text}
                        </span>
                        <span className="block text-[9px] text-white/35 mt-1 font-sans">
                          {new Date(item.spawnTime).toLocaleDateString("en-US", { weekday: "short" })}{" "}
                          {new Date(item.spawnTime).toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                    </div>

                    {/* Taken By Badge */}
                    <div className="mb-4">
                      <span className="block text-[8px] text-zinc-500 uppercase tracking-widest leading-none mb-1.5 select-none">
                        Taken By:
                      </span>
                      <div
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-semibold ${
                          GUILD_CONFIG[claimGuild.toUpperCase()]?.border || "border-zinc-800"
                        } ${GUILD_CONFIG[claimGuild.toUpperCase()]?.bg || "bg-zinc-950"} ${
                          GUILD_CONFIG[claimGuild.toUpperCase()]?.text || "text-zinc-400"
                        }`}
                      >
                        <svg className="h-3 w-3 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                        </svg>
                        {claimGuild.toUpperCase()}
                      </div>
                    </div>

                    {/* Next Turn Badge with Gold Glow */}
                    <div className="border-t border-white/[0.04] pt-3.5 space-y-1.5">
                      <span className="block text-[8px] text-zinc-500 uppercase tracking-widest leading-none select-none">
                        Next Guild Turn
                      </span>
                      <div className="flex items-center justify-between text-[11px] font-semibold px-2 py-1 rounded-lg bg-amber-500/[0.06] border border-amber-500/25 text-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.06)] animate-pulse">
                        <span>{claimGuild.toUpperCase()}</span>
                        <span className="text-[9px] uppercase tracking-wider text-amber-500 font-bold bg-amber-500/10 px-1 py-0.2 rounded">
                          UP NEXT
                        </span>
                      </div>
                    </div>

                    {/* Action buttons co-located with schedule */}
                    {isOfficer && (
                      <div className="mt-4 pt-1 flex gap-2">
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => {
                            setKillTimeInput(new Date().toTimeString().substring(0, 5));
                            setShowKillModal(item);
                          }}
                          className="w-full text-[10px] uppercase font-bold tracking-wider hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/35"
                        >
                          Record Defeat
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        ) : (
          /* TIMELINE VIEW (Grouped Chronologically by Day) */
          <div className="space-y-8 animate-scale-in">
            {upcomingSpawns.length === 0 ? (
              <div className="py-12 text-center text-zinc-500 text-sm border border-dashed border-white/5 rounded-2xl bg-white/[0.005]">
                No upcoming boss spawns scheduled.
              </div>
            ) : (
              Object.keys(groupedSchedules).map((dayStr) => (
                <div key={dayStr} className="space-y-4">
                  {/* Sticky Date Header */}
                  <div className="sticky top-[80px] z-30 bg-[#08080a]/90 backdrop-blur px-4 py-2 border-y border-white/[0.04] text-xs font-bold text-amber-500/90 tracking-widest uppercase flex items-center gap-2">
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                      <line x1="16" y1="2" x2="16" y2="6" />
                      <line x1="8" y1="2" x2="8" y2="6" />
                    </svg>
                    {dayStr}
                  </div>

                  <div className="relative border-l border-white/[0.06] pl-6 ml-4 space-y-4">
                    {groupedSchedules[dayStr].map((item) => {
                      const tick = getCountdownText(item.spawnTime);
                      const claimGuild = item.guildTurn || "SAUSAGE";

                      return (
                        <div
                          key={item.id}
                          className="relative flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-xl border border-white/[0.04] bg-[#0c0c10]/40 backdrop-blur-md hover:border-white/[0.08] transition-colors"
                        >
                          {/* Timeline node */}
                          <div className="absolute -left-[31px] top-1/2 -translate-y-1/2 h-4 w-4 rounded-full border-2 border-zinc-950 bg-[#08080a] flex items-center justify-center">
                            <span className="h-1.5 w-1.5 rounded-full bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.6)]" />
                          </div>

                          {/* Spawn Time */}
                          <div className="shrink-0 min-w-[80px] select-none text-left">
                            <span className="block text-xs font-semibold text-white">
                              {new Date(item.spawnTime).toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit" })}
                            </span>
                            <span className="block text-[9px] text-zinc-500 font-mono">
                              Spawn Time
                            </span>
                          </div>

                          {/* Identity */}
                          <div className="flex items-center gap-3">
                            <div className="h-9 w-9 rounded-lg bg-zinc-900 border border-white/10 flex items-center justify-center shrink-0 overflow-hidden">
                              {item.bossImageUrl ? (
                                <img src={item.bossImageUrl} alt={item.bossName} className="h-full w-full object-cover" />
                              ) : (
                                <svg className="h-4 w-4 text-white/30" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                  <path d="M12 2L2 7l10 5 10-5-10-5z" />
                                </svg>
                              )}
                            </div>
                            <div>
                              <h5 className="font-bold text-white text-xs">{item.bossName}</h5>
                              <p className="text-[10px] text-zinc-500">📍 {item.location}</p>
                            </div>
                          </div>

                          {/* Ownership display */}
                          <div className="flex flex-col">
                            <span className="text-[9px] text-zinc-500 uppercase tracking-wider mb-1 select-none">Taken By:</span>
                            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-semibold border ${
                              GUILD_CONFIG[claimGuild.toUpperCase()]?.border || "border-zinc-800"
                            } ${GUILD_CONFIG[claimGuild.toUpperCase()]?.bg || "bg-zinc-950"} ${
                              GUILD_CONFIG[claimGuild.toUpperCase()]?.text || "text-zinc-400"
                            }`}>
                              {claimGuild.toUpperCase()}
                            </span>
                          </div>

                          {/* Respawn timer */}
                          <div className="flex flex-col select-none text-left">
                            <span className="text-[9px] text-zinc-500 uppercase tracking-wider mb-0.5">Respawn countdown</span>
                            <span className={`text-xs font-mono font-bold ${tick.warning ? "text-amber-400 animate-pulse" : "text-emerald-400"}`}>
                              {tick.text}
                            </span>
                          </div>

                          {/* Faction Indicator */}
                          <div className="flex flex-col select-none text-left">
                            <span className="text-[9px] text-zinc-500 uppercase tracking-wider mb-0.5">Event Type</span>
                            <span className="text-[10px] text-zinc-400 font-medium">
                              {item.guildId ? "🛡️ Guild Event" : "🔱 Alliance Faction"}
                            </span>
                          </div>

                          {/* Action Log Defeat */}
                          {isOfficer && (
                            <div className="shrink-0">
                              <Button
                                variant="ghost"
                                size="xs"
                                onClick={() => {
                                  setKillTimeInput(new Date().toTimeString().substring(0, 5));
                                  setShowKillModal(item);
                                }}
                                className="text-[10px] uppercase font-bold tracking-wider hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/35"
                              >
                                Record Defeat
                              </Button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Global Status Legend Panel */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-white/[0.06] pt-5 text-white/50 text-xs select-none">
          <div className="flex flex-wrap items-center gap-5">
            <span className="font-semibold text-white/40 uppercase tracking-wider">Status Legend:</span>
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]" />
              <span>🟢 Available (Spawned/LIVE)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-amber-400 shadow-[0_0_6px_rgba(245,158,11,0.5)]" />
              <span>🟡 Claimed (Upcoming Spawn)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.5)]" />
              <span>🔴 Dead (Defeated logs)</span>
            </div>
          </div>
          <div className="text-[10px] text-zinc-500 italic">
            Times and schedules are synchronized with global server time.
          </div>
        </div>

        {/* Interactive Weekly Planner Calendar */}
        <div className="border-t border-white/[0.05] pt-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white uppercase tracking-widest flex items-center gap-2">
              📅 Planner Calendar & Historical Data
            </h3>
          </div>
          
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
