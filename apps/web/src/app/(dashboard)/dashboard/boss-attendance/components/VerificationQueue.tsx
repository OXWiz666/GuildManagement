"use client";

import { type AttendanceSessionData, type AttendanceRecordData } from "@/lib/api";
import { Skeleton } from "@/components/ui/Skeleton";

export interface VerificationQueueProps {
  selectedActiveSession: AttendanceSessionData | null;
  pendingRecords: AttendanceRecordData[];
  isLoadingPending: boolean;
  isVerifyingAll: boolean;
  isVerifying: string | null;
  handleApproveAll: () => void;
  handleVerifyPresence: (recordId: string) => void;
  onEditSession: (session: AttendanceSessionData) => void;
  onDeleteSession: (sessionId: string) => void;
}

export default function VerificationQueue({
  selectedActiveSession,
  pendingRecords,
  isLoadingPending,
  isVerifyingAll,
  isVerifying,
  handleApproveAll,
  handleVerifyPresence,
  onEditSession,
  onDeleteSession,
}: VerificationQueueProps) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.01] p-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-white/[0.06] pb-4 mb-4 gap-3">
        <div>
          <h3 className="text-xs font-bold text-white uppercase tracking-wider">
            Verification Queue
          </h3>
          <p className="text-xs text-white/40 mt-1.5 flex flex-wrap items-center gap-2">
            {selectedActiveSession ? (
              <>
                <span className="font-medium text-white/70">Active window: "{selectedActiveSession.title}"</span>
                <button
                  type="button"
                  onClick={() => onEditSession(selectedActiveSession)}
                  className="text-violet-400 hover:text-violet-300 transition-colors font-bold text-[10px] bg-violet-500/5 hover:bg-violet-500/10 px-1.5 py-0.5 rounded cursor-pointer"
                >
                  ✏️ Edit
                </button>
                <button
                  type="button"
                  onClick={() => onDeleteSession(selectedActiveSession.id)}
                  className="text-rose-400 hover:text-rose-300 transition-colors font-bold text-[10px] bg-rose-500/5 hover:bg-rose-500/10 px-1.5 py-0.5 rounded cursor-pointer"
                >
                  🗑️ Delete
                </button>
              </>
            ) : (
              "No check-in portal active"
            )}
          </p>
        </div>
        {pendingRecords.length > 0 && (
          <button
            type="button"
            onClick={handleApproveAll}
            disabled={isVerifyingAll}
            className="px-3 py-1.5 bg-violet-650 hover:bg-violet-755 text-xs font-semibold text-white rounded-lg transition-all cursor-pointer shrink-0 disabled:bg-white/[0.18]"
          >
            Approve All Present
          </button>
        )}
      </div>

      {isLoadingPending ? (
        <div className="space-y-3 py-4">
          {[1, 2].map((i) => (
            <div key={i} className="flex items-center justify-between border-b border-white/5 pb-3">
              <div className="flex items-center gap-3">
                <Skeleton className="h-6 w-6 rounded-md" />
                <Skeleton className="h-4 w-32" />
              </div>
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-7 w-16 rounded-lg" />
            </div>
          ))}
        </div>
      ) : !selectedActiveSession ? (
        <div className="text-center py-12 text-xs text-zinc-650 italic">
          Raid verification is inactive. A check-in window opens automatically when you log a boss kill in Boss Schedule.
        </div>
      ) : pendingRecords.length === 0 ? (
        <div className="text-center py-12 text-xs text-zinc-650 italic">
          Verification queue is empty. Member check-ins for this boss will show up here instantly.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-white/[0.06] text-white/40 font-bold uppercase tracking-wider text-[10px]">
                <th className="py-2.5 px-3">Member</th>
                <th className="py-2.5 px-3">Character IGN</th>
                <th className="py-2.5 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-850">
              {pendingRecords.map((rec) => (
                <tr key={rec.id} className="hover:bg-white/[0.01]">
                  <td className="py-3 px-3">
                    <div className="flex items-center gap-2.5">
                      <div className="h-6 w-6 rounded-md bg-white/[0.04] border border-white/[0.06] flex items-center justify-center font-bold text-white/55">
                        {rec.user?.displayName[0]}
                      </div>
                      <div>
                        <p className="font-semibold text-white">{rec.user?.displayName}</p>
                        <p className="text-[10px] text-white/40 truncate max-w-[180px]">{rec.user?.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-3">
                    <span className="font-mono text-white/55 bg-white/[0.02] border border-white/[0.06] px-2 py-0.5 rounded text-[11px]">
                      {rec.user?.displayName || "N/A"}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-right">
                    <button
                      type="button"
                      onClick={() => handleVerifyPresence(rec.id)}
                      disabled={isVerifying === rec.id}
                      className="px-2.5 py-1.25 bg-white/[0.10] hover:bg-white/[0.14] disabled:bg-white/[0.18] text-[11px] font-semibold text-white rounded-md transition-all cursor-pointer"
                    >
                      Confirm Presence
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
