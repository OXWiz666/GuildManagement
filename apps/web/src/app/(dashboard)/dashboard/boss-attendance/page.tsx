"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import { dashboardApi, type BossScheduleData, type AttendanceSessionData, type AttendanceRecordData } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import { Skeleton, SkeletonCard } from "@/components/ui/Skeleton";
import DashboardDecor from "@/components/dashboard/DashboardDecor";
import {
  Reveal,
  ModuleHeader,
  Magnetic,
} from "@/components/dashboard/DashboardHelpers";

// Imports from co-located components
import WeeklyTracker from "./components/WeeklyTracker";
import TimelineSpawns from "./components/TimelineSpawns";
import VerificationQueue from "./components/VerificationQueue";
import CheckInModal from "./components/CheckInModal";
import CreateSessionModal from "./components/CreateSessionModal";

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
}

export default function BossAttendancePage() {
  const { user } = useAuth();
  const { addToast } = useToast();

  const [schedules, setSchedules] = useState<BossScheduleData[]>([]);
  const [stats, setStats] = useState<AttendanceStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(Date.now());

  // Weekly Planner Navigation State
  const [anchorDate, setAnchorDate] = useState<Date>(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());

  // Smart Check-in Code Submission State
  const [showCheckInModal, setShowCheckInModal] = useState<BossScheduleData | null>(null);
  const [attendanceCode, setAttendanceCode] = useState("");
  const [isSubmittingCode, setIsSubmittingCode] = useState(false);

  // Officer Session Generation State
  const [showCreateSessionModal, setShowCreateSessionModal] = useState<BossScheduleData | null>(null);
  const [sessionDuration, setSessionDuration] = useState("10"); // default 10 minutes
  const [sessionType, setSessionType] = useState<"GUILD" | "FACTION">("GUILD");
  const [isGeneratingSession, setIsGeneratingSession] = useState(false);
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);

  // Officer Verification Queue State
  const [selectedActiveSession, setSelectedActiveSession] = useState<AttendanceSessionData | null>(null);
  const [pendingRecords, setPendingRecords] = useState<AttendanceRecordData[]>([]);
  const [isLoadingPending, setIsLoadingPending] = useState(false);
  const [isVerifying, setIsVerifying] = useState<string | null>(null); // recordId of loading verification
  const [isVerifyingAll, setIsVerifyingAll] = useState(false);

  const activeGuild = user?.guilds?.[0];
  const isGuildLeader = activeGuild?.role === "GUILD_LEADER";
  const isOfficer = activeGuild?.role === "OFFICER" || isGuildLeader;

  // Sync clocks every second
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const loadData = useCallback(async () => {
    if (!activeGuild) return;
    setIsLoading(true);
    try {
      // 1. Fetch boss schedules with associated attendance sessions
      const schedulesResult = await dashboardApi.getBossSchedules(activeGuild.guildId);
      if (schedulesResult.success && schedulesResult.data?.schedules) {
        setSchedules(schedulesResult.data.schedules);
      }

      // 2. Fetch member attendance stats
      const statsResult = await dashboardApi.getAttendanceStats(activeGuild.guildId);
      if (statsResult.success && statsResult.data) {
        setStats(statsResult.data);
      }
    } catch {
      addToast("error", "Failed to load attendance details");
    } finally {
      setIsLoading(false);
    }
  }, [activeGuild, addToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Load pending records for selected active session (Officer view)
  const loadPendingRecords = useCallback(async () => {
    if (!activeGuild || !isOfficer) return;
    setIsLoadingPending(true);
    try {
      const result = await dashboardApi.getPendingAttendance(activeGuild.guildId);
      if (result.success && result.data) {
        setSelectedActiveSession(result.data.activeSession);
        setPendingRecords(result.data.pendingRecords);
      }
    } catch {
      addToast("error", "Failed to refresh verification queue");
    } finally {
      setIsLoadingPending(false);
    }
  }, [activeGuild, isOfficer, addToast]);

  useEffect(() => {
    if (isOfficer && activeGuild) {
      loadPendingRecords();
    }
  }, [isOfficer, activeGuild, loadPendingRecords]);

  // Format real-time countdown
  const getCountdownText = (spawnTimeStr: string) => {
    const target = new Date(spawnTimeStr).getTime();
    const diff = target - currentTime;
    if (diff <= 0) return { expired: true, text: "LIVE NOW", danger: true };

    const hrs = Math.floor(diff / (3600 * 1000));
    const mins = Math.floor((diff % (3600 * 1000)) / (60 * 1000));
    const secs = Math.floor((diff % (60 * 1000)) / 1000);

    const text = `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
    const warning = diff <= 5 * 60 * 1000; // less than 5 mins

    return { expired: false, text, warning };
  };

  // Submit check-in code
  const handleSubmitCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!attendanceCode.trim()) {
      addToast("error", "Please enter a valid check-in code");
      return;
    }

    setIsSubmittingCode(true);
    try {
      const result = await dashboardApi.submitAttendanceCode(attendanceCode.trim());
      if (result.success) {
        addToast("success", `Checked in. Awaiting verification.`);
        setShowCheckInModal(null);
        setAttendanceCode("");
        await loadData();
        if (isOfficer) await loadPendingRecords();
      }
    } catch (err: any) {
      addToast("error", err?.message || "Failed to submit attendance code");
    } finally {
      setIsSubmittingCode(false);
    }
  };

  // Start attendance session for boss schedule (Officer)
  const handleStartSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeGuild || !showCreateSessionModal) return;

    setIsGeneratingSession(true);
    try {
      const result = await dashboardApi.startAttendanceSession({
        guildId: activeGuild.guildId,
        type: sessionType,
        minutes: parseInt(sessionDuration, 10),
        bossScheduleId: showCreateSessionModal.id,
      });

      if (result.success && result.data?.session) {
        addToast("success", `Raid session started.`);
        setGeneratedCode(result.data.session.code);
        await loadData();
        await loadPendingRecords();
      }
    } catch (err: any) {
      addToast("error", err?.message || "Failed to create attendance session");
    } finally {
      setIsGeneratingSession(false);
    }
  };

  // Verify pending attendance record (Officer)
  const handleVerifyPresence = async (recordId: string) => {
    if (!activeGuild) return;
    setIsVerifying(recordId);
    try {
      const result = await dashboardApi.confirmAttendance(recordId, activeGuild.guildId);
      if (result.success) {
        addToast("success", `Verified member attendance.`);
        await loadPendingRecords();
        await loadData();
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
      await loadPendingRecords();
      await loadData();
    } catch {
      addToast("error", "Error processing batch verification");
    } finally {
      setIsVerifyingAll(false);
    }
  };

  // Calendar Weekly Math calculations
  const getDaysOfWeek = (date: Date) => {
    const start = new Date(date);
    const day = start.getDay(); // 0 = Sunday
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
      return { status: "ACTIVE_CHECKIN", label: "Check In Open", color: "text-white bg-violet-500/5 border-white/[0.08]", dotColor: "bg-violet-500 border border-violet-400/20" };
    }

    return { status: "MISSED", label: "Missed", color: "text-rose-400 bg-rose-500/5 border-rose-500/10", dotColor: "bg-rose-500" };
  }, [user, currentTime]);

  // SMART DETECT ACTIVE ATTENDANCE SESSION FOR QUICK PORTAL
  const activeSessionEvent = useMemo(() => {
    if (!user) return null;
    return schedules.find(s => {
      if (!s.attendanceSessions || s.attendanceSessions.length === 0) return false;
      const session = s.attendanceSessions[0];
      const isExpired = new Date(session.expiresAt).getTime() < currentTime;
      const userRecord = session.records?.find(r => r.userId === user.id);
      return session.isActive && !isExpired && !userRecord;
    });
  }, [schedules, user, currentTime]);

  // Dynamic Day Timeline Events List for selected highlighted day column
  const dayEvents = selectedDate ? getEventsForDay(selectedDate) : [];

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
        <div className="h-[480px] rounded-2xl bg-[#111116]/40 border border-white/[0.04] backdrop-blur-md relative overflow-hidden animate-pulse shadow-[0_0_15px_rgba(139,92,246,0.03)] flex flex-col justify-between p-6">
          <div className="space-y-6 flex-1 flex flex-col">
            <Skeleton className="h-6 w-1/4" />
            <div className="grid grid-cols-7 gap-4 flex-1">
              {[1, 2, 3, 4, 5, 6, 7].map((i) => (
                <div key={i} className="rounded-xl bg-white/[0.015] border border-white/[0.04] p-3 space-y-3 flex flex-col justify-between">
                  <div className="space-y-1.5 pb-2 border-b border-white/5">
                    <Skeleton className="h-3 w-10" />
                    <Skeleton className="h-4 w-16" />
                  </div>
                  <div className="flex-1 flex items-center justify-center">
                    <div className="h-8 w-8 rounded-full bg-white/[0.02] border border-dashed border-white/10" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
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
          description="Track weekly raid sessions, verify check-ins, and manage member presence."
          right={
            <div className="flex items-center gap-2">
              {isOfficer && (
                <Magnetic strength={4}>
                  <button
                    type="button"
                    onClick={() => {
                      loadPendingRecords();
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
                  onClick={loadData}
                  className="px-3 py-1.5 rounded-full bg-white text-black hover:bg-white/90 text-[11px] font-semibold transition-all cursor-pointer"
                >
                  Refresh dashboard
                </button>
              </Magnetic>
            </div>
          }
        />

        {/* SMART INLINE CHECK-IN ALERT */}
        {activeSessionEvent && (
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 shadow-sm transition-all flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="flex items-start gap-4">
              <div className="h-10 w-10 rounded-xl bg-white/[0.06] border border-white/[0.18]/30 flex items-center justify-center text-white text-base shrink-0">
                ✦
              </div>
              <div>
                <span className="text-[10px] font-bold text-white uppercase tracking-widest block">
                  Raid Check-in Active
                </span>
                <h3 className="font-bold text-white text-sm mt-0.5">
                  {activeSessionEvent.bossName} spawn check-in portal running
                </h3>
                <p className="text-xs text-white/40 mt-1 max-w-xl">
                  Raid is currently underway. Input the check-in code shared by the officer to claim attendance points.
                </p>
                <div className="flex items-center gap-2 mt-3 text-xs text-white/55">
                  <span className="text-[11px] text-white/40">Closes in</span>
                  <span className="font-mono bg-white/[0.04] border border-white/[0.06] px-2 py-0.5 rounded font-bold text-xs text-amber-400">
                    {getCountdownText(activeSessionEvent.attendanceSessions![0].expiresAt).text}
                  </span>
                </div>
              </div>
            </div>

            {/* Inline Check-in Form */}
            <form onSubmit={handleSubmitCode} className="flex gap-2 w-full lg:max-w-xs bg-white/[0.02] border border-white/[0.06] p-1.5 rounded-xl">
              <input
                type="text"
                placeholder="CODE (e.g. ATT-D3FB)"
                value={attendanceCode}
                onChange={(e) => setAttendanceCode(e.target.value.toUpperCase())}
                required
                maxLength={10}
                className="flex-1 px-3 py-2 rounded-lg bg-transparent border-0 text-sm font-mono font-bold text-center text-white focus:outline-none placeholder-zinc-700 tracking-wider uppercase"
              />
              <button 
                type="submit" 
                disabled={isSubmittingCode}
                className="px-3.5 py-1.5 bg-white/[0.10] hover:bg-white/[0.14] disabled:bg-white/[0.18] text-xs font-semibold text-white rounded-lg transition-all cursor-pointer shrink-0"
              >
                Verify
              </button>
            </form>
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

        {/* Minimalist Stats Grid */}
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
              <span className="text-[10px] text-zinc-650">guild battles</span>
            </div>
          </div>

          {/* Current streak */}
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 shadow-sm">
            <p className="text-[10px] font-semibold text-white/40 uppercase tracking-wider">Current Streak</p>
            <div className="flex items-baseline gap-2 mt-2">
              <h3 className="text-2xl font-bold tracking-tight text-amber-400">
                {stats ? stats.currentStreak : "--"}
              </h3>
              <span className="text-[10px] text-zinc-650">raids in a row</span>
            </div>
          </div>

          {/* Total Points */}
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 shadow-sm">
            <p className="text-[10px] font-semibold text-white/40 uppercase tracking-wider">Activity Points</p>
            <div className="flex items-baseline gap-2 mt-2">
              <h3 className="text-2xl font-bold tracking-tight text-cyan-400">
                {stats ? `${stats.totalPoints} ₱` : "--"}
              </h3>
              <span className="text-[10px] text-zinc-650">ledger share</span>
            </div>
          </div>

          {/* Total event participation */}
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 shadow-sm">
            <p className="text-[10px] font-semibold text-white/40 uppercase tracking-wider">Raid Participation</p>
            <div className="flex items-baseline gap-2 mt-2">
              <h3 className="text-2xl font-bold tracking-tight text-emerald-400">
                {stats ? `${stats.participationCount} / ${stats.participationCount + (stats.missedAlerts?.length || 0)}` : "--"}
              </h3>
              <span className="text-[10px] text-zinc-650">total events</span>
            </div>
          </div>
        </div>

        {/* Weekly Attendance Tracker */}
        <WeeklyTracker
          daysOfWeek={daysOfWeek}
          selectedDate={selectedDate}
          setSelectedDate={setSelectedDate}
          getEventsForDay={getEventsForDay}
          getUserRecordStatus={getUserRecordStatus}
          getCountdownText={getCountdownText}
          isOfficer={isOfficer}
          onCheckInClick={(item) => setShowCheckInModal(item)}
          onCreateSessionClick={(item) => setShowCreateSessionModal(item)}
          anchorDate={anchorDate}
          setAnchorDate={setAnchorDate}
        />

        {/* Details timeline and guide */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          <div className="lg:col-span-2">
            <TimelineSpawns
              selectedDate={selectedDate}
              dayEvents={dayEvents}
              getUserRecordStatus={getUserRecordStatus}
              getCountdownText={getCountdownText}
              isOfficer={isOfficer}
              onCheckInClick={(item) => setShowCheckInModal(item)}
              onCreateSessionClick={(item) => setShowCreateSessionModal(item)}
            />
          </div>

          {/* Minimalist Guide Panel */}
          <div className="lg:col-span-1">
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.01] p-5">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-2.5">
                Raid Check-In Guide
              </h3>
              <p className="text-xs text-white/40 leading-relaxed">
                Checking in for scheduled raids is simple and automated:
              </p>
              <ul className="text-xs text-white/40 mt-3 space-y-2.5">
                <li className="flex gap-2">
                  <span className="text-white">▪</span>
                  <span>Active check-ins pop up automatically as a slim notification at the top of the dashboard.</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-white">▪</span>
                  <span>Input the check-in code shared by raid organizers inside the notification box.</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-white">▪</span>
                  <span>Once entered, your presence transitions to pending status, awaiting officer approval.</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-white">▪</span>
                  <span>Verification credits attendance activity points directly to your ledger wallet.</span>
                </li>
              </ul>
            </div>
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
          />
        )}

        {/* Modal: Check In */}
        <CheckInModal
          showCheckInModal={showCheckInModal}
          attendanceCode={attendanceCode}
          setAttendanceCode={setAttendanceCode}
          isSubmittingCode={isSubmittingCode}
          handleSubmitCode={handleSubmitCode}
          onClose={() => setShowCheckInModal(null)}
        />

        {/* Modal: Start Raid Attendance */}
        <CreateSessionModal
          showCreateSessionModal={showCreateSessionModal}
          sessionDuration={sessionDuration}
          setSessionDuration={setSessionDuration}
          sessionType={sessionType}
          setSessionType={setSessionType}
          isGeneratingSession={isGeneratingSession}
          generatedCode={generatedCode}
          handleStartSession={handleStartSession}
          onClose={() => setShowCreateSessionModal(null)}
          setGeneratedCode={setGeneratedCode}
          addToast={addToast}
        />
      </div>
    </div>
  );
}
