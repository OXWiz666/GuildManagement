"use client";

import { useMemo, useState } from "react";
import { dashboardApi, type AttendanceSessionSummary, type BossScheduleData, type PendingAttendanceData } from "@/lib/api";
import { useQuery, queryClient } from "@/lib/query";
import { useToast } from "@/components/ui/Toast";
import { Skeleton } from "@/components/ui/Skeleton";
import { getBossImageUrl } from "@guild/shared";

export interface AttendanceSessionModalProps {
  session: AttendanceSessionSummary;
  schedule: BossScheduleData | null;
  guildId: string;
  isOfficer: boolean;
  onClose: () => void;
  getUserRecordStatus: (item: BossScheduleData) => {
    status: string;
    label: string;
    color: string;
    dotColor: string;
  };
  getCountdownText: (expiresAt: string) => { expired: boolean; text: string; warning?: boolean };
  checkingInId: string | null;
  onCheckIn: (item: BossScheduleData) => void;
  onEditSession: (session: AttendanceSessionSummary) => void;
}

function MemberIdentity({ displayName, email }: { displayName: string; email?: string }) {
  return (
    <div className="flex items-center gap-2.5 min-w-0">
      <div className="h-6 w-6 shrink-0 rounded-md bg-white/[0.04] border border-white/[0.06] flex items-center justify-center font-bold text-white/55 text-[11px]">
        {displayName[0]?.toUpperCase()}
      </div>
      <div className="min-w-0">
        <p className="font-semibold text-white truncate">{displayName}</p>
        {email && <p className="text-[10px] text-white/40 truncate max-w-[180px]">{email}</p>}
      </div>
    </div>
  );
}

/**
 * Full detail popup for one boss attendance window, opened from
 * AttendanceCoverflow. Combines what used to be two separate surfaces:
 * the member's own check-in status/action (from the schedule record), and
 * — for officers/leaders — the full roster with verify/mark-present/revoke
 * and reopen/edit/close window controls (previously BossAttendanceBoard's
 * per-card expansion).
 */
export default function AttendanceSessionModal({
  session,
  schedule,
  guildId,
  isOfficer,
  onClose,
  getUserRecordStatus,
  getCountdownText,
  checkingInId,
  onCheckIn,
  onEditSession,
}: AttendanceSessionModalProps) {
  const { addToast } = useToast();
  const [actionId, setActionId] = useState<string | null>(null);
  const [isVerifyingAll, setIsVerifyingAll] = useState(false);
  const [isMarkingAll, setIsMarkingAll] = useState(false);
  const [deselectedIds, setDeselectedIds] = useState<Set<string>>(new Set());
  const [showReopen, setShowReopen] = useState(false);
  const [reopenMinutes, setReopenMinutes] = useState(30);
  const [isReopening, setIsReopening] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  const boss = session.bossSchedule;
  const bossName = boss?.bossName || schedule?.bossName || session.title;
  const imageSrc = boss?.bossImageUrl || schedule?.bossImageUrl || getBossImageUrl(bossName);
  const dateSrc = boss?.spawnTime || schedule?.spawnTime || session.createdAt;
  const location = boss?.location || schedule?.location;

  function invalidateAll() {
    queryClient.invalidateQueries(`attendance_sessions:${guildId}`);
    queryClient.invalidateQueries(`attendance_session_detail:${guildId}`);
    queryClient.invalidateQueries(`pending_attendance:${guildId}`);
    queryClient.invalidateQueries(`attendance_stats:${guildId}`);
    queryClient.invalidateQueries(`boss_schedules:${guildId}`);
  }

  // ─── Officer: full roster + verification (permission-gated fetch — a
  // regular member never requests the roster endpoint at all) ───
  const {
    data: detailRaw,
    isLoading: isLoadingDetail,
  } = useQuery<PendingAttendanceData | null>(
    `attendance_session_detail:${guildId}:${session.id}`,
    async () => {
      const result = await dashboardApi.getAttendanceSessionDetail(guildId, session.id);
      return result.success && result.data ? result.data : null;
    },
    { staleTime: 5000, enabled: isOfficer },
  );

  const checkedIn = useMemo(() => {
    if (!detailRaw) return [];
    return [...detailRaw.pendingRecords, ...detailRaw.confirmedRecords].sort(
      (a, b) => new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime(),
    );
  }, [detailRaw]);

  const pendingIds = useMemo(() => detailRaw?.pendingRecords.map((r) => r.id) ?? [], [detailRaw]);
  const selectedIds = useMemo(
    () => new Set(pendingIds.filter((id) => !deselectedIds.has(id))),
    [pendingIds, deselectedIds],
  );
  const allPendingSelected = pendingIds.length > 0 && pendingIds.every((id) => selectedIds.has(id));

  async function runAction(id: string, fn: () => Promise<{ success: boolean; error?: { message?: string } }>, successMsg: string, failMsg: string) {
    setActionId(id);
    try {
      const res = await fn();
      if (res.success) {
        addToast("success", successMsg);
        invalidateAll();
      } else {
        addToast("error", res.error?.message || failMsg);
      }
    } catch (err) {
      addToast("error", err instanceof Error ? err.message : failMsg);
    } finally {
      setActionId(null);
    }
  }

  const handleConfirm = (recordId: string) =>
    runAction(recordId, () => dashboardApi.confirmAttendance(recordId, guildId), "Marked present.", "Failed to confirm");

  const handleMarkPresent = (userId: string) =>
    runAction(userId, () => dashboardApi.markMemberPresent(guildId, session.id, userId), "Member marked present.", "Failed to mark present");

  const handleRevoke = (recordId: string) =>
    runAction(recordId, () => dashboardApi.revokeAttendance(recordId, guildId), "Attendance revoked.", "Failed to revoke attendance");

  async function handleVerifySelected() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setIsVerifyingAll(true);
    try {
      let succeeded = 0;
      for (const recordId of ids) {
        try {
          const res = await dashboardApi.confirmAttendance(recordId, guildId);
          if (res.success) succeeded++;
        } catch {
          // ignore individual failures, continue the batch
        }
      }
      addToast("success", `Verified ${succeeded} check-in(s).`);
      invalidateAll();
    } finally {
      setIsVerifyingAll(false);
    }
  }

  async function handleMarkAllPresent() {
    if (!detailRaw) return;
    const ids = detailRaw.notCheckedInMembers.map((m) => m.userId);
    if (ids.length === 0) return;
    setIsMarkingAll(true);
    try {
      let succeeded = 0;
      for (const userId of ids) {
        try {
          const res = await dashboardApi.markMemberPresent(guildId, session.id, userId);
          if (res.success) succeeded++;
        } catch {
          // ignore individual failures, continue the batch
        }
      }
      addToast("success", `Marked ${succeeded} member(s) present.`);
      invalidateAll();
    } finally {
      setIsMarkingAll(false);
    }
  }

  async function handleReopen() {
    setIsReopening(true);
    try {
      const res = await dashboardApi.reopenAttendanceSession(guildId, session.id, reopenMinutes);
      if (res.success) {
        addToast("success", `Reopened "${bossName}" for ${reopenMinutes} minute(s).`);
        setShowReopen(false);
        invalidateAll();
      } else {
        addToast("error", res.error?.message || "Failed to reopen session");
      }
    } catch (err) {
      addToast("error", err instanceof Error ? err.message : "Failed to reopen session");
    } finally {
      setIsReopening(false);
    }
  }

  function handleClose() {
    addToast(
      "warning",
      "Are you sure you want to close this check-in window? All pending check-in requests for it will be removed.",
      0,
      {
        label: "Close",
        variant: "danger",
        onClick: async () => {
          setIsClosing(true);
          try {
            const result = await dashboardApi.deleteAttendanceSession(guildId, session.id);
            if (result.success) {
              addToast("success", "Check-in window closed.");
              invalidateAll();
              onClose();
            }
          } catch (err) {
            addToast("error", err instanceof Error ? err.message : "Failed to close check-in window");
          } finally {
            setIsClosing(false);
          }
        },
      },
    );
  }

  // ─── Member: your own status (derived from the schedule record, same
  // source the old Open Check-Ins list used) ───
  const userStatus = schedule ? getUserRecordStatus(schedule) : null;
  const memberSession = schedule?.attendanceSessions?.[0];
  const tick = memberSession
    ? getCountdownText(memberSession.expiresAt)
    : getCountdownText(session.expiresAt);
  const canCheckIn = userStatus?.status === "ACTIVE_CHECKIN" && !tick.expired;
  const isPresent = userStatus?.status === "PRESENT";
  const isPending = userStatus?.status === "PENDING";
  const isMissed = userStatus?.status === "MISSED";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-2xl max-h-full overflow-y-auto custom-scrollbar animate-scale-in rounded-2xl border border-white/[0.1] bg-[#0c0d12] shadow-2xl shadow-black/60">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-3 right-3 z-10 h-7 w-7 rounded-full bg-black/50 backdrop-blur border border-white/[0.1] text-white/60 hover:text-white hover:border-white/25 flex items-center justify-center cursor-pointer transition-colors"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12" /></svg>
        </button>

        {/* Boss portrait */}
        <div className="relative h-40 w-full bg-zinc-950 border-b border-white/[0.06] rounded-t-2xl overflow-hidden">
          <img src={imageSrc} alt={bossName} className="h-full w-full object-cover" loading="lazy" />
          <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/80 to-transparent" />
          <p className="absolute bottom-3 left-4 right-4 text-lg font-bold text-white truncate">{bossName}</p>
        </div>

        <div className="p-5 space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[9px] uppercase tracking-wider text-white/30 font-bold">Spawn Date</p>
              <p className="text-xs text-white/80 font-semibold mt-0.5">
                {new Date(dateSrc).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              </p>
            </div>
            <div>
              <p className="text-[9px] uppercase tracking-wider text-white/30 font-bold">Spawn Time</p>
              <p className="text-xs text-white/80 font-mono mt-0.5">
                {new Date(dateSrc).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
              </p>
            </div>
            {location && (
              <div className="col-span-2">
                <p className="text-[9px] uppercase tracking-wider text-white/30 font-bold">Location</p>
                <p className="text-xs text-white/80 mt-0.5">📍 {location}</p>
              </div>
            )}
          </div>

          {/* ─── Your status ─── */}
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3.5">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[10px] text-white/40 uppercase tracking-wider font-bold">Your Status</span>
              {!tick.expired && session.isActive && (
                <span className={`font-mono font-bold text-xs tracking-tight ${tick.warning ? "text-amber-400" : "text-white/60"}`}>
                  Closes in {tick.text}
                </span>
              )}
            </div>
            <div className="flex items-center justify-between gap-3 mt-2.5">
              {userStatus ? (
                <span className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[10px] font-bold uppercase tracking-wider ${userStatus.color}`}>
                  {userStatus.label}
                </span>
              ) : (
                <span className="text-[11px] text-white/35 italic">No record for this window.</span>
              )}

              {isPresent ? (
                <span className="px-3.5 py-2 text-xs font-bold text-emerald-400 bg-emerald-500/5 border border-emerald-500/15 rounded-lg">✓ Present</span>
              ) : isPending ? (
                <span className="px-3.5 py-2 text-xs font-bold text-amber-400 bg-amber-500/5 border border-amber-500/15 rounded-lg">Awaiting verify</span>
              ) : isMissed ? (
                <span className="px-3.5 py-2 text-xs font-bold text-rose-400 bg-rose-500/5 border border-rose-500/15 rounded-lg">Missed</span>
              ) : schedule ? (
                <button
                  type="button"
                  onClick={() => onCheckIn(schedule)}
                  disabled={!canCheckIn || checkingInId === schedule.id}
                  className="px-4 py-2 bg-violet-600 hover:bg-violet-700 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed text-xs font-bold text-white rounded-lg transition-all cursor-pointer shadow-lg shadow-violet-500/15"
                >
                  {checkingInId === schedule.id ? "Checking in…" : "Check In"}
                </button>
              ) : null}
            </div>
          </div>

          {/* ─── Officer: verification + roster + window controls ─── */}
          {isOfficer && (
            <div className="space-y-4 border-t border-white/[0.06] pt-4">
              <div className="flex items-center justify-between gap-3">
                <h4 className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/50">Officer Tools</h4>
                <div className="flex items-center gap-2">
                  {session.isActive ? (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onEditSession(session);
                        }}
                        className="text-violet-400 hover:text-violet-300 transition-colors font-bold text-[10px] bg-violet-500/5 hover:bg-violet-500/10 px-2 py-1 rounded cursor-pointer"
                      >
                        ✏️ Edit
                      </button>
                      <button
                        type="button"
                        onClick={handleClose}
                        disabled={isClosing}
                        className="text-rose-400 hover:text-rose-300 transition-colors font-bold text-[10px] bg-rose-500/5 hover:bg-rose-500/10 px-2 py-1 rounded cursor-pointer disabled:opacity-50"
                      >
                        🗑️ Close
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowReopen((v) => !v)}
                      className="px-3 py-1.5 bg-violet-650 hover:bg-violet-755 text-[11px] font-semibold text-white rounded-lg transition-all cursor-pointer"
                    >
                      Reopen Window
                    </button>
                  )}
                </div>
              </div>

              {showReopen && !session.isActive && (
                <div className="rounded-xl border border-violet-500/25 bg-violet-500/[0.04] p-3.5 space-y-3">
                  <p className="text-[11px] text-white/55 leading-relaxed">
                    Members will be able to self check-in again for this window.
                  </p>
                  <label className="block">
                    <span className="block text-[10px] font-medium text-white/50 uppercase tracking-[0.18em] mb-1.5">Open for (minutes)</span>
                    <input
                      type="number"
                      min={1}
                      max={1440}
                      value={reopenMinutes}
                      onChange={(e) => setReopenMinutes(Math.max(1, Number(e.target.value) || 1))}
                      className="w-full px-3.5 py-2 rounded-lg bg-white/[0.03] border border-white/[0.08] text-sm text-white focus:outline-none focus:border-violet-500/40"
                    />
                  </label>
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => setShowReopen(false)} disabled={isReopening} className="px-3 py-1.5 text-xs font-semibold text-white/60 hover:text-white transition-colors cursor-pointer">
                      Cancel
                    </button>
                    <button type="button" onClick={handleReopen} disabled={isReopening} className="px-3 py-1.5 bg-violet-650 hover:bg-violet-755 disabled:opacity-50 text-xs font-semibold text-white rounded-lg transition-all cursor-pointer">
                      {isReopening ? "Reopening…" : "Reopen"}
                    </button>
                  </div>
                </div>
              )}

              {isLoadingDetail ? (
                <div className="space-y-2">
                  {[1, 2].map((i) => <Skeleton key={i} className="h-10 rounded-lg" />)}
                </div>
              ) : !detailRaw ? (
                <p className="text-[11px] text-white/35 italic">Could not load this session&apos;s roster.</p>
              ) : (
                <>
                  {/* NOT CHECKED-IN */}
                  <section>
                    <div className="flex items-center justify-between mb-2">
                      <h5 className="text-[10px] font-bold uppercase tracking-[0.16em] text-rose-400/80">
                        Not Checked-In ({detailRaw.notCheckedInMembers.length})
                      </h5>
                      {detailRaw.notCheckedInMembers.length > 1 && (
                        <button
                          type="button"
                          onClick={handleMarkAllPresent}
                          disabled={isMarkingAll || actionId !== null}
                          className="px-2.5 py-1 bg-violet-650 hover:bg-violet-755 disabled:bg-white/[0.18] text-[10px] font-semibold text-white rounded-md transition-all cursor-pointer disabled:cursor-not-allowed"
                        >
                          {isMarkingAll ? "Marking…" : `Mark All Present (${detailRaw.notCheckedInMembers.length})`}
                        </button>
                      )}
                    </div>
                    {detailRaw.notCheckedInMembers.length === 0 ? (
                      <p className="text-[11px] text-white/35 italic px-1">Every active member checked in.</p>
                    ) : (
                      <div className="rounded-lg border border-white/[0.05] max-h-72 overflow-y-auto custom-scrollbar p-1.5">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                          {detailRaw.notCheckedInMembers.map((member) => (
                            <div key={member.userId} className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-md bg-white/[0.015] border border-white/[0.04] hover:bg-white/[0.03]">
                              <MemberIdentity displayName={member.user.displayName} email={member.user.email} />
                              <button
                                type="button"
                                onClick={() => handleMarkPresent(member.userId)}
                                disabled={actionId === member.userId}
                                className="px-2.5 py-1.25 bg-white/[0.10] hover:bg-white/[0.14] disabled:bg-white/[0.18] text-[11px] font-semibold text-white rounded-md transition-all cursor-pointer shrink-0"
                              >
                                Mark Present
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </section>

                  {/* CHECKED-IN */}
                  <section>
                    <div className="flex items-center justify-between mb-2">
                      <h5 className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-400/80">
                        Checked-In ({checkedIn.length})
                      </h5>
                      <div className="flex items-center gap-2">
                        {pendingIds.length > 0 && (
                          <>
                            <button
                              type="button"
                              onClick={() => setDeselectedIds(allPendingSelected ? new Set(pendingIds) : new Set())}
                              className="text-[10px] font-bold text-white/40 hover:text-white/70 transition-colors cursor-pointer"
                            >
                              {allPendingSelected ? "Uncheck all" : "Check all"}
                            </button>
                            <button
                              type="button"
                              onClick={handleVerifySelected}
                              disabled={isVerifyingAll || selectedIds.size === 0}
                              className="px-2.5 py-1 bg-violet-650 hover:bg-violet-755 text-[10px] font-semibold text-white rounded-md transition-all cursor-pointer disabled:bg-white/[0.18] disabled:cursor-not-allowed"
                            >
                              Verify Checked ({selectedIds.size})
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                    {checkedIn.length === 0 ? (
                      <p className="text-[11px] text-white/35 italic px-1">No one checked in for this window.</p>
                    ) : (
                      <div className="rounded-lg border border-white/[0.05] max-h-72 overflow-y-auto custom-scrollbar divide-y divide-zinc-850">
                        {checkedIn.map((rec) => {
                          const isPendingRec = rec.status === "PENDING";
                          return (
                            <div key={rec.id} className="flex items-center justify-between gap-3 px-3 py-2 hover:bg-white/[0.01]">
                              {isPendingRec && (
                                <input
                                  type="checkbox"
                                  checked={selectedIds.has(rec.id)}
                                  onChange={() =>
                                    setDeselectedIds((prev) => {
                                      const next = new Set(prev);
                                      if (next.has(rec.id)) next.delete(rec.id);
                                      else next.add(rec.id);
                                      return next;
                                    })
                                  }
                                  className="h-3.5 w-3.5 rounded border-white/20 bg-white/[0.04] accent-violet-600 cursor-pointer shrink-0"
                                />
                              )}
                              <MemberIdentity displayName={rec.user?.displayName || "Unknown member"} email={rec.user?.email} />
                              <div className="flex items-center gap-2 shrink-0 ml-auto">
                                {isPendingRec ? (
                                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border border-amber-500/10 bg-amber-500/5 text-amber-400 text-[10px] font-bold uppercase tracking-wider">
                                    Pending
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border border-emerald-500/10 bg-emerald-500/5 text-emerald-400 text-[10px] font-bold uppercase tracking-wider">
                                    Confirmed
                                  </span>
                                )}
                                {isPendingRec && (
                                  <button
                                    type="button"
                                    onClick={() => handleConfirm(rec.id)}
                                    disabled={actionId === rec.id}
                                    className="px-2.5 py-1.25 bg-white/[0.10] hover:bg-white/[0.14] disabled:bg-white/[0.18] text-[11px] font-semibold text-white rounded-md transition-all cursor-pointer"
                                  >
                                    Confirm
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => handleRevoke(rec.id)}
                                  disabled={actionId === rec.id}
                                  className="px-2.5 py-1.25 bg-rose-500/10 hover:bg-rose-500/20 disabled:bg-white/[0.08] text-[11px] font-semibold text-rose-300 rounded-md transition-all cursor-pointer"
                                >
                                  Revoke
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </section>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
