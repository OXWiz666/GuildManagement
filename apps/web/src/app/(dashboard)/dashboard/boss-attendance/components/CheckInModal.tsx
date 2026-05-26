"use client";

import { type BossScheduleData } from "@/lib/api";
import Button from "@/components/ui/Button";

export interface CheckInModalProps {
  showCheckInModal: BossScheduleData | null;
  attendanceCode: string;
  setAttendanceCode: (val: string) => void;
  isSubmittingCode: boolean;
  handleSubmitCode: (e: React.FormEvent) => void;
  onClose: () => void;
}

export default function CheckInModal({
  showCheckInModal,
  attendanceCode,
  setAttendanceCode,
  isSubmittingCode,
  handleSubmitCode,
  onClose,
}: CheckInModalProps) {
  if (!showCheckInModal) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div 
        className="absolute inset-0 bg-black/70 backdrop-blur-sm" 
        onClick={() => !isSubmittingCode && onClose()} 
      />
      <div className="relative border border-white/[0.06] bg-[#0c0d10] rounded-2xl p-6 max-w-sm w-full mx-4 shadow-xl z-50">
        <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-1">
          Member Check-in
        </h3>
        <p className="text-xs text-white/40 mb-4 leading-relaxed">
          Verify attendance for **{showCheckInModal.bossName}**.
        </p>

        <form onSubmit={handleSubmitCode} className="space-y-4">
          <div>
            <label className="block text-[10px] font-bold text-white/40 uppercase tracking-wider mb-2">Check-in Code</label>
            <input
              type="text"
              placeholder="e.g. ATT-B82C"
              value={attendanceCode}
              onChange={(e) => setAttendanceCode(e.target.value.toUpperCase())}
              required
              maxLength={10}
              className="w-full px-3 py-2.5 rounded-xl bg-zinc-950 border border-white/[0.06] text-base font-mono font-bold text-center text-white focus:outline-none focus:border-violet-500/40 uppercase tracking-wider"
            />
          </div>

          <div className="flex gap-2 justify-end pt-3 border-t border-zinc-900">
            <Button variant="ghost" size="sm" type="button" onClick={onClose} disabled={isSubmittingCode}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" type="submit" isLoading={isSubmittingCode}>
              Verify Presence
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
