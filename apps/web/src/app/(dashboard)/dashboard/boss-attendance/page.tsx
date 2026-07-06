"use client";

import { useState, useEffect, useCallback, useMemo, type CSSProperties } from "react";
import { useAuth } from "@/lib/auth-context";
import { useSocket } from "@/components/providers/socket-provider";
import { dashboardApi, type BossScheduleData, type BossData, type AttendanceSessionData, type AttendanceRecordData } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import { Skeleton } from "@/components/ui/Skeleton";
import DashboardDecor from "@/components/dashboard/DashboardDecor";
import { useQuery, queryClient } from "@/lib/query";
import {
  ModuleHeader,
  Magnetic,
} from "@/components/dashboard/DashboardHelpers";

// Imports from co-located components
import OpenCheckIns from "./components/OpenCheckIns";
import CheckInHistory, { type CheckInHistoryItem } from "./components/CheckInHistory";
import VerificationQueue from "./components/VerificationQueue";
import EditSessionModal from "./components/EditSessionModal";
import AddScheduleModal from "../boss-schedule/components/AddScheduleModal";

interface AttendanceStats {
  presenceRate: number;
  currentStreak: number;
  participationCount: number;
  totalPoints: number;
  missedAlerts: Array<{
    sessionId: string;
    title: string;
    createdAt: string;
    expiresAt: string;
  }>;
  history: CheckInHistoryItem[];
}

export default function BossAttendancePage() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const { socket } = useSocket();

  const [currentTime, setCurrentTime] = useState(Date.now());

  // Smart one-click Check-in state (no codes — boss id is the key)
  const [checkingInId, setCheckingInId] = useState<string | null>(null);

  // Officer Session Editing State
  const [showEditSessionModal, setShowEditSessionModal] = useState<AttendanceSessionData | null>(null);
  const [isEditingSession, setIsEditingSession] = useState(false);

  // Officer Verification Queue State
  const [isVerifying, setIsVerifying] = useState<string | null>(null); // recordId of loading verification
  const [isVerifyingAll, setIsVerifyingAll] = useState(false);

  // Officer "Edit Boss" state (reuses the schedule's AddScheduleModal in edit mode)
  const [editingEvent, setEditingEvent] = useState<BossScheduleData | null>(null);
  const [showBossModal, setShowBossModal] = useState(false);
  const [isSubmittingBoss, setIsSubmittingBoss] = useState(false);
  const [spawnDate, setSpawnDate] = useState("");
  const [spawnTime, setSpawnTime] = useState("");

  const activeGuild = user?.guilds?.[0];
  const isGuildLeader = activeGuild?.role === "GUILD_LEADER";
  const isFactionLeader = activeGuild?.role === "FACTION_LEADER" || activeGuild?.role === "ADMIN";
  const isOfficer = activeGuild?.role === "OFFICER" || isGuildLeader || isFactionLeader;

  // Sync clocks every second
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // ─── Persistent Queries ────────────────────────────────

  // 1. Boss Schedules Query (shares cache key with Boss Schedule hub!)
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

  // 2. Attendance Stats Query
  const {
    data: stats,
    isLoading: isLoadingStats,
  } = useQuery<AttendanceStats | null>(
    activeGuild ? `attendance_stats:${activeGuild.guildId}` : "attendance_stats_empty",
    async () => {
      if (!activeGuild) return null;
      const result = await dashboardApi.getAttendanceStats(activeGuild.guildId);
      return result.success && result.data ? (result.data as AttendanceStats) : null;
    },
    { persist: true, staleTime: 30000 }
  );

  // 3. Officer Verification Queue Query
  const {
    data: pendingAttendanceRaw,
    isLoading: isLoadingPending,
    refetch: refetchPendingRecords,
  } = useQuery<{ activeSession: AttendanceSessionData | null; pendingRecords: AttendanceRecordData[] } | null>(
    activeGuild && isOfficer ? `pending_attendance:${activeGuild.guildId}` : "pending_attendance_empty",
    async () => {
      if (!activeGuild || !isOfficer) return null;
      const result = await dashboardApi.getPendingAttendance(activeGuild.guildId);
      return result.success && result.data ? result.data : null;
    },
    { persist: true, staleTime: 15000 }
  );

  // 4. Boss registry (for the Edit Boss modal)
  const { data: bossRegistryRaw } = useQuery<BossData[]>(
    "boss_registry",
    async () => {
      const result = await dashboardApi.getBosses();
      return result.success && result.data?.bosses ? result.data.bosses : [];
    },
    { persist: true, staleTime: 300000 }
  );
  const bosses = bossRegistryRaw || [];

  const selectedActiveSession = pendingAttendanceRaw?.activeSession || null;
  const pendingRecords = pendingAttendanceRaw?.pendingRecords || [];

  const isLoading = isLoadingSchedules || isLoadingStats;

  // Helper to trigger refetch / invalidation for all active queues
  const invalidateAll = useCallback(() => {
    if (!activeGuild) return;
    queryClient.invalidateQueries(`boss_schedules:${activeGuild.guildId}`);
    queryClient.invalidateQueries(`attendance_stats:${activeGuild.guildId}`);
    if (isOfficer) {
      queryClient.invalidateQueries(`pending_attendance:${activeGuild.guildId}`);
    }
  }, [activeGuild, isOfficer]);

  // Listen to Socket.IO real-time events for instant cache invalidation
  useEffect(() => {
    if (!socket || !activeGuild) return;

    const handleAttendanceUpdate = () => {
      invalidateAll();
    };

    socket.on("attendance_session_created", handleAttendanceUpdate);
    socket.on("attendance_session_updated", handleAttendanceUpdate);
    socket.on("attendance_session_deleted", handleAttendanceUpdate);
    socket.on("attendance_record_created", handleAttendanceUpdate);
    socket.on("attendance_record_confirmed", handleAttendanceUpdate);
    socket.on("boss_rotation_updated", handleAttendanceUpdate);

    return () => {
      socket.off("attendance_session_created", handleAttendanceUpdate);
      socket.off("attendance_session_updated", handleAttendanceUpdate);
      socket.off("attendance_session_deleted", handleAttendanceUpdate);
      socket.off("attendance_record_created", handleAttendanceUpdate);
      socket.off("attendance_record_confirmed", handleAttendanceUpdate);
      socket.off("boss_rotation_updated", handleAttendanceUpdate);
    };
  }, [socket, activeGuild, invalidateAll]);

  // One-click check-in for a killed boss (no code typing). The boss id resolves
  // the active check-in window server-side.
  const handleCheckIn = useCallback(async (item: BossScheduleData) => {
    if (!activeGuild) return;
    setCheckingInId(item.id);
    try {
      const result = await dashboardApi.checkInToBoss(activeGuild.guildId, item.id);
      if (result.success) {
        addToast("success", `Checked in for ${item.bossName}. Awaiting officer verification.`);
        invalidateAll();
      }
    } catch (err: any) {
      addToast("error", err?.message || "Failed to check in");
    } finally {
      setCheckingInId(null);
    }
  }, [activeGuild, addToast, invalidateAll]);

  // Edit a boss schedule entry (Officer) — reuses the schedule's AddScheduleModal.
  const handleEditSchedule = async (
    scheduleId: string,
    payload: {
      bossName?: string;
      bossImageUrl?: string;
      spawnTime?: string;
      location?: string;
      guildTurn?: string;
      isFaction?: boolean;
    }
  ) => {
    if (!activeGuild) return;
    setIsSubmittingBoss(true);
    try {
      const result = await dashboardApi.updateBossSchedule(activeGuild.guildId, scheduleId, payload);
      if (result.success && result.data?.schedule) {
        addToast("success", "Boss updated successfully!");
        setShowBossModal(false);
        setEditingEvent(null);
        invalidateAll();
      }
    } catch (err: any) {
      addToast("error", err?.message || "Failed to update boss");
    } finally {
      setIsSubmittingBoss(false);
    }
  };

  // Schedule new boss spawn(s) (Officer) — required by AddScheduleModal's add mode.
  const handleAddScheduleBatch = async (
    spawnDateArg: string,
    isFactionWide: boolean,
    items: Array<{ bossName: string; bossImageUrl?: string; spawnTime: string; location: string; guildTurn?: string }>
  ) => {
    if (!activeGuild || items.length === 0) return;
    setIsSubmittingBoss(true);
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
        if (result.success && result.data?.schedule) succeeded++;
      }
      addToast("success", `Scheduled ${succeeded} boss spawn(s)!`);
      setShowBossModal(false);
      invalidateAll();
    } catch (err: any) {
      addToast("error", err?.message || "Failed to schedule boss");
    } finally {
      setIsSubmittingBoss(false);
    }
  };

  const openEditBoss = useCallback((item: BossScheduleData) => {
    setEditingEvent(item);
    const d = new Date(item.spawnTime);
    setSpawnDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
    setSpawnTime(d.toTimeString().substring(0, 5));
    setShowBossModal(true);
  }, []);

  // Edit attendance session (Officer)
  const handleEditSession = async (title: string, minutes: number, isActive: boolean) => {
    if (!activeGuild || !showEditSessionModal) return;

    setIsEditingSession(true);
    try {
      const expiresAt = new Date(Date.now() + minutes * 60 * 1000).toISOString();
      const result = await dashboardApi.updateAttendanceSession(
        activeGuild.guildId,
        showEditSessionModal.id,
        { title, expiresAt, isActive }
      );

      if (result.success) {
        addToast("success", "Check-in window updated successfully!");
        setShowEditSessionModal(null);
        invalidateAll();
      }
    } catch (err: any) {
      addToast("error", err?.message || "Failed to update check-in window");
    } finally {
      setIsEditingSession(false);
    }
  };

  // Delete attendance session (Officer)
  const handleDeleteSession = (sessionId: string) => {
    if (!activeGuild) return;

    addToast(
      "warning",
      "Are you sure you want to close this check-in window? All pending check-in requests for it will be removed.",
      0, // stays until action or dismiss
      {
        label: "Close",
        variant: "danger",
        onClick: async () => {
          try {
            const result = await dashboardApi.deleteAttendanceSession(activeGuild.guildId, sessionId);
            if (result.success) {
              addToast("success", "Check-in window closed.");
              invalidateAll();
            }
          } catch (err: any) {
            addToast("error", err?.message || "Failed to close check-in window");
          }
        },
      }
    );
  };

  // Verify pending attendance record (Officer)
  const handleVerifyPresence = async (recordId: string) => {
    if (!activeGuild) return;
    setIsVerifying(recordId);
    try {
      const result = await dashboardApi.confirmAttendance(recordId, activeGuild.guildId);
      if (result.success) {
        addToast("success", `Verified member attendance.`);
        invalidateAll();
      }
    } catch (err: any) {
      addToast("error", err?.message || "Failed to verify presence");
    } finally {
      setIsVerifying(null);
    }
  };

  // Approve all pending check-ins at once (Officer batch verification)
  const handleApproveAll = async () => {
    if (!activeGuild || pendingRecords.length === 0) return;
    setIsVerifyingAll(true);
    try {
      let succeeded = 0;
      for (const rec of pendingRecords) {
        try {
          const res = await dashboardApi.confirmAttendance(rec.id, activeGuild.guildId);
          if (res.success) succeeded++;
        } catch {
          // ignore failed attempts
        }
      }
      addToast("success", `Approved ${succeeded} check-ins.`);
      invalidateAll();
    } catch {
      addToast("error", "Error processing batch verification");
    } finally {
      setIsVerifyingAll(false);
    }
  };

  // Helper to determine logged-in user's attendance status for a boss schedule
  const getUserRecordStatus = useCallback((item: BossScheduleData) => {
    if (!user) return { status: "NONE", label: "No Session", color: "text-white/40 bg-white/[0.015] border-white/[0.03]", dotColor: "bg-zinc-650" };
    if (!item.attendanceSessions || item.attendanceSessions.length === 0) {
      return item.status === "KILLED"
        ? { status: "EXPIRED_NO_SESSION", label: "No Session Run", color: "text-white/40 bg-white/[0.01] border-zinc-900", dotColor: "bg-zinc-700" }
        : { status: "NONE", label: "Scheduled Spawn", color: "text-white/55 bg-white/[0.01] border-zinc-900", dotColor: "bg-zinc-650" };
    }

    const session = item.attendanceSessions[0];
    const isSessionActive = session.isActive && new Date(session.expiresAt).getTime() > currentTime;
    const userRecord = session.records?.find(r => r.userId === user.id);

    if (userRecord) {
      if (userRecord.status === "CONFIRMED") {
        return { status: "PRESENT", label: "Present", color: "text-emerald-400 bg-emerald-500/5 border-emerald-500/10", dotColor: "bg-emerald-500 border border-emerald-400/20" };
      }
      return { status: "PENDING", label: "Pending", color: "text-amber-400 bg-amber-500/5 border-amber-500/10", dotColor: "bg-amber-400" };
    }

    if (isSessionActive) {
      return { status: "ACTIVE_CHECKIN", label: "Check In Open", color: "text-violet-300 bg-violet-500/5 border-violet-500/20", dotColor: "bg-violet-500 border border-violet-400/20" };
    }

    return { status: "MISSED", label: "Missed", color: "text-rose-400 bg-rose-500/5 border-rose-500/10", dotColor: "bg-rose-500" };
  }, [user, currentTime]);

  // Countdown formatter for active attendance session windows
  const getCountdownText = useCallback((expiresAtStr: string) => {
    const target = new Date(expiresAtStr).getTime();
    const diff = target - currentTime;
    if (diff <= 0) return { expired: true, text: "EXPIRED", warning: false };

    const hrs = Math.floor(diff / (3600 * 1000));
    const mins = Math.floor((diff % (3600 * 1000)) / (60 * 1000));
    const secs = Math.floor((diff % (60 * 1000)) / 1000);
    const text = `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
    const warning = diff <= 5 * 60 * 1000;

    return { expired: false, text, warning };
  }, [currentTime]);

  // Bosses with an open check-in window (auto-opened when a kill is logged).
  const openCheckIns = useMemo(() => {
    return schedules
      .filter((s) => {
        const session = s.attendanceSessions?.[0];
        return session && session.isActive && new Date(session.expiresAt).getTime() > currentTime;
      })
      .sort((a, b) => {
        const aExp = new Date(a.attendanceSessions![0].expiresAt).getTime();
        const bExp = new Date(b.attendanceSessions![0].expiresAt).getTime();
        return aExp - bExp;
      });
  }, [schedules, currentTime]);

  // Smart detect the first open window the user has NOT claimed (for the banner)
  const activeSessionEvent = useMemo(() => {
    if (!user) return null;
    return openCheckIns.find((s) => {
      const userRecord = s.attendanceSessions![0].records?.find(r => r.userId === user.id);
      return !userRecord;
    }) || null;
  }, [openCheckIns, user]);

  if (!user || !activeGuild) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-white/40 text-sm">No active guild selected</p>
      </div>
    );
  }

  if (isLoading && schedules.length === 0) {
    return (
      <div className="space-y-6 max-w-full xl:max-w-[1400px] mx-auto px-4 md:px-6 lg:px-8 text-white/85">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-white/[0.06] pb-5 gap-4 animate-fade-in">
          <div className="space-y-2">
            <Skeleton className="h-7 w-48 animate-pulse" />
            <Skeleton className="h-4 w-80 animate-pulse" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-8 w-28 rounded-lg animate-pulse" />
            <Skeleton className="h-8 w-32 rounded-lg animate-pulse" />
          </div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24 rounded-xl animate-pulse" />
          ))}
        </div>
        <Skeleton className="h-[360px] rounded-2xl animate-pulse" />
      </div>
    );
  }

  return (
    <div className="relative max-w-full xl:max-w-[1400px] mx-auto w-full px-4 md:px-6 lg:px-8">
      <DashboardDecor />

      <div className="relative z-10 space-y-6 text-white/85">
        <ModuleHeader
          eyebrow="Raids"
          title="Boss attendance"
          description="One-tap check-ins for every boss killed in Boss Schedule — plus your attendance stats."
          right={
            <div className="flex items-center gap-2">
              {isOfficer && (
                <Magnetic strength={4}>
                  <button
                    type="button"
                    onClick={() => {
                      refetchPendingRecords();
                      addToast("success", "Queue refreshed");
                    }}
                    className="px-3 py-1.5 rounded-full border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/25 text-[11px] font-medium text-white/70 hover:text-white transition-all cursor-pointer"
                  >
                    Refresh queue
                  </button>
                </Magnetic>
              )}
              <Magnetic strength={4}>
                <button
                  type="button"
                  onClick={invalidateAll}
                  className="px-3 py-1.5 rounded-full bg-white text-black hover:bg-white/90 text-[11px] font-semibold transition-all cursor-pointer"
                >
                  Refresh
                </button>
              </Magnetic>
            </div>
          }
        />

        {/* SMART INLINE CHECK-IN ALERT (one-click, no codes) */}
        {activeSessionEvent && (
          <div className="rounded-2xl border border-violet-500/25 bg-violet-950/10 p-5 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="flex items-start gap-4">
              <div className="h-10 w-10 rounded-xl bg-violet-500/10 border border-violet-500/30 flex items-center justify-center text-violet-300 text-base shrink-0">
                ✦
              </div>
              <div>
                <span className="text-[10px] font-bold text-violet-300 uppercase tracking-widest block">
                  Check-in Open
                </span>
                <h3 className="font-bold text-white text-sm mt-0.5">
                  {activeSessionEvent.bossName} was killed — claim your attendance
                </h3>
                <div className="flex items-center gap-2 mt-2 text-xs text-white/55">
                  <span className="text-[11px] text-white/40">Closes in</span>
                  <span className="font-mono bg-white/[0.04] border border-white/[0.06] px-2 py-0.5 rounded font-bold text-xs text-amber-400">
                    {getCountdownText(activeSessionEvent.attendanceSessions![0].expiresAt).text}
                  </span>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => handleCheckIn(activeSessionEvent)}
              disabled={checkingInId === activeSessionEvent.id}
              className="px-5 py-2.5 bg-violet-600 hover:bg-violet-700 active:scale-95 disabled:opacity-50 text-sm font-bold text-white rounded-xl transition-all cursor-pointer shadow-lg shadow-violet-500/20 shrink-0"
            >
              {checkingInId === activeSessionEvent.id ? "Checking in…" : "Check In Now"}
            </button>
          </div>
        )}

        {/* Missed Attendance Alerts Banner */}
        {stats && stats.missedAlerts && stats.missedAlerts.length > 0 && (
          <div className="p-4 rounded-xl bg-rose-500/5 border border-rose-500/10 shadow-sm flex items-start gap-3">
            <span className="text-rose-400 text-sm mt-0.5">▪</span>
            <div>
              <h4 className="font-bold text-rose-400 text-xs uppercase tracking-wider">Missed Raids Alert</h4>
              <p className="text-xs text-white/55 leading-relaxed mt-1">
                You did not check in for: <strong className="text-white/70 font-semibold">{stats.missedAlerts.map(a => a.title).join(", ")}</strong>. Please contact an officer if you were present to claim retrospective points.
              </p>
            </div>
          </div>
        )}

        {/* Minimalist Stats Grid — kept as-is per spec */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Presence rate */}
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 shadow-sm">
            <p className="text-[10px] font-semibold text-white/40 uppercase tracking-wider">Attendance Rate</p>
            <div className="flex items-baseline gap-2 mt-2">
              <h3 className={`text-2xl font-bold tracking-tight ${
                (stats?.presenceRate || 0) >= 80 ? "text-emerald-400" : (stats?.presenceRate || 0) >= 50 ? "text-amber-400" : "text-rose-400"
              }`}>
                {stats ? `${stats.presenceRate}%` : "--"}
              </h3>
              <span className="text-[10px] text-zinc-650">participated</span>
            </div>
          </div>

          {/* Current streak — flames up while the streak is alive */}
          <div
            className={`relative overflow-hidden rounded-xl border p-4 shadow-sm transition-colors duration-500 ${
              (stats?.currentStreak ?? 0) > 0
                ? "border-amber-500/30 bg-gradient-to-br from-amber-500/[0.10] via-orange-600/[0.05] to-transparent"
                : "border-white/[0.06] bg-white/[0.02]"
            }`}
          >
            {(stats?.currentStreak ?? 0) > 0 && (
              <span
                aria-hidden
                className="streak-heat pointer-events-none absolute -right-5 -top-6 h-20 w-20 rounded-full bg-orange-500/25 blur-2xl"
              />
            )}
            <p className="relative text-[10px] font-semibold text-white/40 uppercase tracking-wider">Current Streak</p>
            <div className="relative flex items-baseline gap-2 mt-2">
              <h3 className={`text-2xl font-bold tracking-tight ${(stats?.currentStreak ?? 0) > 0 ? "text-amber-300" : "text-amber-400"}`}>
                {stats ? stats.currentStreak : "--"}
              </h3>
              {(stats?.currentStreak ?? 0) > 0 ? (
                <span className="relative inline-flex h-5 w-5 items-center justify-center leading-none">
                  <span className="streak-flame text-base">🔥</span>
                  <span
                    className="streak-ember absolute left-1/2 top-1 h-1 w-1 -translate-x-1/2 rounded-full bg-amber-300"
                    style={{ animationDelay: "0.15s", "--ember-x": "-2px" } as CSSProperties}
                  />
                  <span
                    className="streak-ember absolute left-1/2 top-1.5 h-0.5 w-0.5 -translate-x-1/2 rounded-full bg-orange-400"
                    style={{ animationDelay: "0.75s", "--ember-x": "3px" } as CSSProperties}
                  />
                </span>
              ) : (
                <span className="text-[10px] text-zinc-650">Attendance in a row</span>
              )}
            </div>
            {(stats?.currentStreak ?? 0) > 0 && (
              <p className="relative mt-1 text-[9px] font-semibold uppercase tracking-wide text-amber-400/80">
                On fire · keep it going
              </p>
            )}
          </div>

          {/* Total Points */}
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 shadow-sm">
            <p className="text-[10px] font-semibold text-white/40 uppercase tracking-wider">Activity Points</p>
            <div className="flex items-baseline gap-2 mt-2">
              <h3 className="text-2xl font-bold tracking-tight text-cyan-400">
                {stats ? `${stats.totalPoints} ₱` : "--"}
              </h3>
              <span className="text-[10px] text-zinc-650">guild share</span>
            </div>
          </div>

          {/* Total event participation */}
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 shadow-sm">
            <p className="text-[10px] font-semibold text-white/40 uppercase tracking-wider">Raid Participation</p>
            <div className="flex items-baseline gap-2 mt-2">
              <h3 className="text-2xl font-bold tracking-tight text-emerald-400">
                {stats ? `${stats.participationCount} / ${stats.participationCount + (stats.missedAlerts?.length || 0)}` : "--"}
              </h3>
              <span className="text-[10px] text-zinc-650">activities</span>
            </div>
          </div>
        </div>

        {/* Open check-ins + personal history */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          <div className="lg:col-span-2">
            <OpenCheckIns
              openCheckIns={openCheckIns}
              getUserRecordStatus={getUserRecordStatus}
              getCountdownText={getCountdownText}
              checkingInId={checkingInId}
              onCheckIn={handleCheckIn}
              isOfficer={isOfficer}
              onEditBoss={openEditBoss}
            />
          </div>
          <div className="lg:col-span-1">
            <CheckInHistory history={stats?.history || []} />
          </div>
        </div>

        {/* Verification Queue (Officers only) */}
        {isOfficer && (
          <VerificationQueue
            selectedActiveSession={selectedActiveSession}
            pendingRecords={pendingRecords}
            isLoadingPending={isLoadingPending}
            isVerifyingAll={isVerifyingAll}
            isVerifying={isVerifying}
            handleApproveAll={handleApproveAll}
            handleVerifyPresence={handleVerifyPresence}
            onEditSession={(session) => setShowEditSessionModal(session)}
            onDeleteSession={handleDeleteSession}
          />
        )}

        {/* Modal: Edit Check-in Window */}
        <EditSessionModal
          showModal={!!showEditSessionModal}
          onClose={() => setShowEditSessionModal(null)}
          session={showEditSessionModal}
          isSubmitting={isEditingSession}
          handleEditSession={handleEditSession}
        />

        {/* Modal: Edit / Schedule Boss (officers) */}
        {isOfficer && (
          <AddScheduleModal
            showAddModal={showBossModal}
            setShowAddModal={(val) => {
              setShowBossModal(val);
              if (!val) setEditingEvent(null);
            }}
            bosses={bosses}
            isFactionLeader={isFactionLeader}
            isSubmitting={isSubmittingBoss}
            spawnDate={spawnDate}
            setSpawnDate={setSpawnDate}
            spawnTime={spawnTime}
            setSpawnTime={setSpawnTime}
            handleAddScheduleBatch={handleAddScheduleBatch}
            editingEvent={editingEvent}
            handleEditSchedule={handleEditSchedule}
          />
        )}
      </div>
    </div>
  );
}
