"use client";

import { useState, useEffect, useCallback, useMemo, memo, type CSSProperties } from "react";
import dynamic from "next/dynamic";
import { useAuth } from "@/lib/auth-context";
import { useSocket } from "@/components/providers/socket-provider";
import { dashboardApi, type BossScheduleData, type AttendanceSessionData, type AttendanceSessionSummary } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import { Skeleton } from "@/components/ui/Skeleton";
import DashboardDecor from "@/components/dashboard/DashboardDecor";
import { useQuery, queryClient } from "@/lib/query";
import {
  ModuleHeader,
  ModuleTabs,
  Reveal,
  Magnetic,
} from "@/components/dashboard/DashboardHelpers";

// Imports from co-located components
import AttendanceCoverflow from "./components/AttendanceCoverflow";
import AttendanceHistoryList, { type AttendanceHistoryItem } from "./components/AttendanceHistoryList";

// Both are modals mounted only on demand — code-split out of the main route
// chunk.
const EditSessionModal = dynamic(() => import("./components/EditSessionModal"));
const AttendanceSessionModal = dynamic(() => import("./components/AttendanceSessionModal"));

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
  history: AttendanceHistoryItem[];
}

export default function BossAttendancePage() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const { socket } = useSocket();

  const [currentTime, setCurrentTime] = useState(Date.now());

  const [activeTab, setActiveTab] = useState<"overview" | "history" | "advance">("overview");

  // Smart one-click Check-in state (no codes — boss id is the key)
  const [checkingInId, setCheckingInId] = useState<string | null>(null);

  // Which attendance session's detail modal is open — kept as an id and
  // re-resolved against the live queries below, so the modal's countdown,
  // status, and roster stay in sync instead of freezing on a snapshot.
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  // Officer Session Editing State
  const [showEditSessionModal, setShowEditSessionModal] = useState<AttendanceSessionData | null>(null);
  const [isEditingSession, setIsEditingSession] = useState(false);

  const activeGuild = user?.guilds?.[0];
  const isGuildLeader = activeGuild?.role === "GUILD_LEADER";
  const isFactionLeader = activeGuild?.role === "FACTION_LEADER" || activeGuild?.role === "ADMIN";
  const isOfficer = activeGuild?.role === "OFFICER" || isGuildLeader || isFactionLeader;

  // `currentTime` now only feeds getUserRecordStatus/getCountdownText, which
  // only matter while the session detail modal is open (AttendanceCoverflow
  // and the check-in banner tick on their own — see AttendanceCoverflow.tsx
  // and CheckInAlertBanner below). Gating the tick to "modal open" means this
  // whole page stops re-rendering every second in the common case.
  useEffect(() => {
    if (!selectedSessionId) return;
    const timer = setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [selectedSessionId]);

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
  const schedules = useMemo(() => schedulesRaw || [], [schedulesRaw]);

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

  // 3. Attendance sessions — every check-in window, open or closed. Powers
  // the coverflow browse list and the detail modal's officer roster.
  const {
    data: sessionsRaw,
    isLoading: isLoadingSessions,
  } = useQuery<AttendanceSessionSummary[]>(
    activeGuild ? `attendance_sessions:${activeGuild.guildId}` : "attendance_sessions_empty",
    async () => {
      if (!activeGuild) return [];
      const result = await dashboardApi.listAttendanceSessions(activeGuild.guildId);
      return result.success && result.data ? result.data : [];
    },
    { persist: true, staleTime: 20000 }
  );
  const sessions = useMemo(() => sessionsRaw || [], [sessionsRaw]);

  const isLoading = isLoadingSchedules || isLoadingStats;

  // Helper to trigger refetch / invalidation for all active queues
  const invalidateAll = useCallback(() => {
    if (!activeGuild) return;
    queryClient.invalidateQueries(`boss_schedules:${activeGuild.guildId}`);
    queryClient.invalidateQueries(`attendance_stats:${activeGuild.guildId}`);
    queryClient.invalidateQueries(`attendance_sessions:${activeGuild.guildId}`);
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

  // Helper to determine logged-in user's attendance status for a boss schedule
  const getUserRecordStatus = useCallback((item: BossScheduleData) => {
    if (!user) return { status: "NONE", label: "No Session", color: "text-white/40 bg-white/[0.015] border-white/[0.03]", dotColor: "bg-zinc-650" };
    if (!item.attendanceSessions || item.attendanceSessions.length === 0) {
      if (item.status === "KILLED") {
        return { status: "EXPIRED_NO_SESSION", label: "No Session Run", color: "text-white/40 bg-white/[0.01] border-zinc-900", dotColor: "bg-zinc-700" };
      }
      // No officer-opened window yet, but it's this guild's rotation turn —
      // members can stake their attendance early (see checkInToBoss).
      if (activeGuild && item.guildTurnGuildId === activeGuild.guildId) {
        return { status: "ADVANCE_ELIGIBLE", label: "Your Guild's Turn", color: "text-violet-300 bg-violet-500/5 border-violet-500/20", dotColor: "bg-violet-500 border border-violet-400/20" };
      }
      return { status: "NONE", label: "Scheduled Spawn", color: "text-white/55 bg-white/[0.01] border-zinc-900", dotColor: "bg-zinc-650" };
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
  }, [user, currentTime, activeGuild]);

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

  // Same eligibility rule AdvanceCheckInBanner applies internally — mirrored
  // here just for the tab's count badge.
  const advanceEligibleCount = useMemo(() => {
    if (!activeGuild) return 0;
    return schedules.filter(
      (s) =>
        s.status !== "KILLED" &&
        s.guildTurnGuildId === activeGuild.guildId &&
        (!s.attendanceSessions || s.attendanceSessions.length === 0),
    ).length;
  }, [schedules, activeGuild]);

  const selectedSession = useMemo(
    () => sessions.find((s) => s.id === selectedSessionId) || null,
    [sessions, selectedSessionId],
  );
  // The matching schedule row carries the current user's own record — the
  // session summary alone only has aggregate confirmed/pending counts.
  const selectedSchedule = useMemo(
    () => schedules.find((s) => s.id === selectedSession?.bossScheduleId) || null,
    [schedules, selectedSession],
  );

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

        <Reveal delay={80}>
          <ModuleTabs
            tabs={[
              { value: "overview", label: "Overview" },
              { value: "history", label: "Attendance History", count: stats?.history?.length ?? 0 },
              { value: "advance", label: "Advance Turn-In", count: advanceEligibleCount },
            ]}
            active={activeTab}
            onChange={setActiveTab}
          />
        </Reveal>

        {activeTab === "overview" && (
        <>
        {/* SMART INLINE CHECK-IN ALERT (one-click, no codes) — self-ticking,
            see CheckInAlertBanner: keeps the per-second countdown isolated
            instead of re-rendering this whole page every second. */}
        <CheckInAlertBanner
          schedules={schedules}
          user={user}
          checkingInId={checkingInId}
          onCheckIn={handleCheckIn}
        />

        {/* Missed Attendance Alerts Banner */}
        {stats && stats.missedAlerts && stats.missedAlerts.length > 0 && (
          <div className="p-4 rounded-xl bg-rose-500/5 border border-rose-500/10 shadow-sm flex items-start gap-3">
            <span className="text-rose-400 text-sm mt-0.5">▪</span>
            <div>
              <h4 className="font-bold text-rose-400 text-xs uppercase tracking-wider">Missed Boss Alert</h4>
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
                {stats ? `${stats.totalPoints} ` : "--"}
              </h3>
              <span className="text-[10px] text-zinc-650">guild share</span>
            </div>
          </div>

          {/* Total event participation */}
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 shadow-sm">
            <p className="text-[10px] font-semibold text-white/40 uppercase tracking-wider">Boss Participation</p>
            <div className="flex items-baseline gap-2 mt-2">
              <h3 className="text-2xl font-bold tracking-tight text-emerald-400">
                {stats ? `${stats.participationCount} / ${stats.participationCount + (stats.missedAlerts?.length || 0)}` : "--"}
              </h3>
              <span className="text-[10px] text-zinc-650">activities</span>
            </div>
          </div>
        </div>

        {/* Boss attendance — Netflix/coverflow row of every check-in window,
            open or closed. Click a card for the full detail modal. */}
        <AttendanceCoverflow
          sessions={sessions}
          isLoading={isLoadingSessions}
          onSelect={(session) => setSelectedSessionId(session.id)}
        />
        </>
        )}

        {activeTab === "history" && (
          /* Personal attendance history */
          <AttendanceHistoryList history={stats?.history || []} />
        )}

        {activeTab === "advance" && (
          /* Advance check-in: bosses that haven't been fought yet but are
             currently this guild's rotation turn — stake attendance early,
             officer verifies once the boss actually dies. */
          <AdvanceCheckInBanner
            schedules={schedules}
            myGuildId={activeGuild.guildId}
            checkingInId={checkingInId}
            onCheckIn={handleCheckIn}
          />
        )}

        {/* Modal: attendance session detail — your status + check-in
            action, and (officers/leaders) verification, roster, and
            reopen/edit/close window controls. */}
        {selectedSession && (
          <AttendanceSessionModal
            session={selectedSession}
            schedule={selectedSchedule}
            guildId={activeGuild.guildId}
            isOfficer={isOfficer}
            onClose={() => setSelectedSessionId(null)}
            getUserRecordStatus={getUserRecordStatus}
            getCountdownText={getCountdownText}
            checkingInId={checkingInId}
            onCheckIn={handleCheckIn}
            onEditSession={(session) =>
              setShowEditSessionModal({
                id: session.id,
                guildId: activeGuild.guildId,
                code: "",
                type: session.type,
                title: session.title,
                isActive: session.isActive,
                createdAt: session.createdAt,
                expiresAt: session.expiresAt,
              })
            }
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
      </div>
    </div>
  );
}

// ─── Check-in Alert Banner ───
// Owns its own tick + the "which open window hasn't the viewer claimed yet"
// computation entirely internally, so this — the only always-visible piece
// of the page that genuinely needs a live per-second countdown — is the only
// thing re-rendering every second, not the whole attendance page.
const CheckInAlertBanner = memo(function CheckInAlertBanner({
  schedules,
  user,
  checkingInId,
  onCheckIn,
}: {
  schedules: BossScheduleData[];
  user: { id: string } | null;
  checkingInId: string | null;
  onCheckIn: (item: BossScheduleData) => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const openCheckIns = useMemo(() => {
    return schedules
      .filter((s) => {
        const session = s.attendanceSessions?.[0];
        return session && session.isActive && new Date(session.expiresAt).getTime() > now;
      })
      .sort((a, b) => {
        const aExp = new Date(a.attendanceSessions![0].expiresAt).getTime();
        const bExp = new Date(b.attendanceSessions![0].expiresAt).getTime();
        return aExp - bExp;
      });
  }, [schedules, now]);

  // Smart detect the first open window the user has NOT claimed
  const activeSessionEvent = useMemo(() => {
    if (!user) return null;
    return openCheckIns.find((s) => {
      const userRecord = s.attendanceSessions![0].records?.find((r) => r.userId === user.id);
      return !userRecord;
    }) || null;
  }, [openCheckIns, user]);

  if (!activeSessionEvent) return null;

  const target = new Date(activeSessionEvent.attendanceSessions![0].expiresAt).getTime();
  const diff = target - now;
  const countdownText = diff <= 0
    ? "EXPIRED"
    : `${String(Math.floor(diff / (3600 * 1000))).padStart(2, "0")}:${String(Math.floor((diff % (3600 * 1000)) / (60 * 1000))).padStart(2, "0")}:${String(Math.floor((diff % (60 * 1000)) / 1000)).padStart(2, "0")}`;

  return (
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
              {countdownText}
            </span>
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={() => onCheckIn(activeSessionEvent)}
        disabled={checkingInId === activeSessionEvent.id}
        className="px-5 py-2.5 bg-violet-600 hover:bg-violet-700 active:scale-95 disabled:opacity-50 text-sm font-bold text-white rounded-xl transition-all cursor-pointer shadow-lg shadow-violet-500/20 shrink-0"
      >
        {checkingInId === activeSessionEvent.id ? "Checking in…" : "Check In Now"}
      </button>
    </div>
  );
});

// ─── Advance Check-In Banner ───
// Bosses that haven't been fought yet (no attendance session exists at all)
// but are currently this guild's rotation turn — checkInToBoss on the server
// opens the session on demand and logs a PENDING record; the officer still
// verifies it the normal way once the boss actually dies.
type AdvanceTimelineGroup = {
  key: string;
  label: string;
  subtitle: string;
  items: BossScheduleData[];
};

function buildAdvanceTimelineGroups(items: BossScheduleData[]): AdvanceTimelineGroup[] {
  const groups = new Map<string, AdvanceTimelineGroup>();

  for (const item of items) {
    const spawn = new Date(item.spawnTime);
    const key = `${spawn.getFullYear()}-${String(spawn.getMonth() + 1).padStart(2, "0")}-${String(spawn.getDate()).padStart(2, "0")}`;
    const existing = groups.get(key);

    if (existing) {
      existing.items.push(item);
      continue;
    }

    groups.set(key, {
      key,
      label: spawn.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" }),
      subtitle: spawn.toLocaleDateString("en-US", { year: "numeric" }),
      items: [item],
    });
  }

  return Array.from(groups.values()).map((group) => ({
    ...group,
    items: group.items.sort((a, b) => new Date(a.spawnTime).getTime() - new Date(b.spawnTime).getTime()),
  }));
}

function formatTimelineTime(value: string) {
  return new Date(value).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

const AdvanceCheckInBanner = memo(function AdvanceCheckInBanner({
  schedules,
  myGuildId,
  checkingInId,
  onCheckIn,
}: {
  schedules: BossScheduleData[];
  myGuildId: string;
  checkingInId: string | null;
  onCheckIn: (item: BossScheduleData) => void;
}) {
  const eligible = useMemo(
    () =>
      schedules
        .filter(
          (s) =>
            s.status !== "KILLED" &&
            s.guildTurnGuildId === myGuildId &&
            (!s.attendanceSessions || s.attendanceSessions.length === 0),
        )
        .sort((a, b) => new Date(a.spawnTime).getTime() - new Date(b.spawnTime).getTime()),
    [schedules, myGuildId],
  );
  const timelineGroups = useMemo(() => buildAdvanceTimelineGroups(eligible), [eligible]);

  return (
    <div className="rounded-2xl border border-violet-500/20 bg-[#09090d]/70 p-5 shadow-sm">
      <div className="flex flex-col gap-4 border-b border-white/[0.06] pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-violet-500/25 bg-violet-500/10">
            <span className="h-2.5 w-2.5 rounded-full bg-violet-300 shadow-[0_0_18px_rgba(196,181,253,0.45)]" />
          </div>
          <div>
            <span className="block text-[10px] font-bold uppercase tracking-widest text-violet-300">
              Advance Turn-In Timeline
            </span>
            <p className="mt-1 max-w-3xl text-[12px] leading-relaxed text-white/55">
              These bosses have not been fought yet, but it is your guild&apos;s turn. Check in early to stake your attendance;
              officers still verify once the boss dies.
            </p>
          </div>
        </div>
        {eligible.length > 0 && (
          <div className="rounded-full border border-violet-400/20 bg-violet-500/10 px-3 py-1 text-[11px] font-bold text-violet-200">
            {eligible.length} pending turn-in{eligible.length === 1 ? "" : "s"}
          </div>
        )}
      </div>

      {eligible.length === 0 ? (
        <p className="px-1 py-8 text-center text-[12px] italic text-white/35">
          Nothing to check in early for right now. This timeline fills in as soon as a boss becomes your guild&apos;s turn.
        </p>
      ) : (
        <div className="max-h-[520px] overflow-y-auto pr-1 pt-5 custom-scrollbar">
          <div className="space-y-6">
            {timelineGroups.map((group) => (
              <section key={group.key} className="relative grid gap-3 md:grid-cols-[150px_minmax(0,1fr)]">
                <div className="md:sticky md:top-0 md:self-start">
                  <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-white/45">{group.label}</p>
                  <p className="mt-1 text-[10px] font-mono text-violet-300/65">
                    {group.subtitle} / {group.items.length} boss{group.items.length === 1 ? "" : "es"}
                  </p>
                </div>

                <div className="relative space-y-2.5 border-l border-violet-400/15 pl-5">
                  {group.items.map((item, index) => (
                    <div key={item.id} className="relative">
                      <span
                        className={`absolute -left-[25px] top-4 h-2.5 w-2.5 rounded-full border border-violet-200/40 bg-violet-500 ${
                          index === 0 ? "shadow-[0_0_16px_rgba(139,92,246,0.55)]" : ""
                        }`}
                      />
                      <div className="flex flex-col gap-3 rounded-xl border border-white/[0.06] bg-white/[0.025] px-3 py-3 transition-colors hover:border-violet-400/25 hover:bg-violet-500/[0.035] sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="flex h-10 w-16 shrink-0 flex-col items-center justify-center rounded-lg border border-white/[0.06] bg-black/20 font-mono">
                            <span className="text-[11px] font-bold text-white/80">{formatTimelineTime(item.spawnTime)}</span>
                            <span className="mt-0.5 text-[8px] uppercase tracking-wider text-white/30">Spawn</span>
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-[13px] font-bold text-white">{item.bossName}</p>
                            <p className="mt-0.5 text-[10px] text-white/40">Awaiting kill verification</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => onCheckIn(item)}
                          disabled={checkingInId === item.id}
                          className="shrink-0 rounded-lg bg-violet-600 px-3.5 py-2 text-[11px] font-bold text-white transition-all hover:bg-violet-700 active:scale-95 disabled:opacity-50 cursor-pointer"
                        >
                          {checkingInId === item.id ? "Checking in..." : "Check In Early"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      )}
    </div>
  );
});
