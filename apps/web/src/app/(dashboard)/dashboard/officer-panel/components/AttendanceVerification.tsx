"use client";

import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";

interface AttendanceVerificationProps {
  activeSession: any;
  pendingRecords: any[];
  isLoading: boolean;
  isConfirmingRecordId: string | null;
  onRefresh: () => void;
  onConfirm: (recordId: string) => void;
}

export default function AttendanceVerification({
  activeSession,
  pendingRecords,
  isLoading,
  isConfirmingRecordId,
  onRefresh,
  onConfirm,
}: AttendanceVerificationProps) {
  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-md font-bold text-white">Attendance Verification</h3>
        <Button
          variant="ghost"
          size="xs"
          onClick={onRefresh}
          isLoading={isLoading}
        >
          Refresh
        </Button>
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-xs text-white/35 italic animate-pulse">
          Loading portals...
        </div>
      ) : !activeSession ? (
        <div className="py-12 text-center text-xs text-zinc-500 italic space-y-2">
          <p>No active attendance portal check-in sessions running right now.</p>
          <p className="text-[10px] text-white/20">
            Create a portal in the Boss Attendance panel to gather check-in codes.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Portal overview card */}
          <div className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.02] space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">
                ● Portal Active
              </span>
              <span className="text-[10px] font-mono text-zinc-500">
                Code: {activeSession.code}
              </span>
            </div>
            <h4 className="text-sm font-bold text-white truncate">
              {activeSession.title}
            </h4>
            <p className="text-[11px] text-white/40">
              Opened: {new Date(activeSession.createdAt).toLocaleTimeString()}
            </p>
          </div>

          {/* Pending Approvals queue */}
          <div>
            <h5 className="text-[10px] font-bold text-white/50 uppercase tracking-widest mb-2 px-1">
              Check-in Requests ({pendingRecords.length})
            </h5>
            {pendingRecords.length === 0 ? (
              <div className="p-4 rounded-xl bg-white/[0.01] border border-white/[0.03] text-center text-xs text-white/30 italic">
                No pending approvals in queue
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
                {pendingRecords.map((rec) => (
                  <div
                    key={rec.id}
                    className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.04] flex items-center justify-between gap-3 hover:bg-white/[0.04] transition-all"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-white truncate">
                        {rec.ign || "Unknown Member"}
                      </p>
                      <p className="text-[9px] text-zinc-500">
                        {new Date(rec.createdAt).toLocaleTimeString()}
                      </p>
                    </div>
                    <Button
                      variant="primary"
                      size="xs"
                      onClick={() => onConfirm(rec.id)}
                      disabled={isConfirmingRecordId !== null}
                      isLoading={isConfirmingRecordId === rec.id}
                    >
                      Verify
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
