"use client";

import { type BossScheduleData } from "@/lib/api";
import Button from "@/components/ui/Button";

export interface CreateSessionModalProps {
  showCreateSessionModal: BossScheduleData | null;
  sessionDuration: string;
  setSessionDuration: (val: string) => void;
  sessionType: "GUILD" | "FACTION";
  setSessionType: (val: "GUILD" | "FACTION") => void;
  isGeneratingSession: boolean;
  generatedCode: string | null;
  handleStartSession: (e: React.FormEvent) => void;
  onClose: () => void;
  setGeneratedCode: (val: string | null) => void;
  addToast: (type: "success" | "error" | "info" | "warning", message: string) => void;
}

export default function CreateSessionModal({
  showCreateSessionModal,
  sessionDuration,
  setSessionDuration,
  sessionType,
  setSessionType,
  isGeneratingSession,
  generatedCode,
  handleStartSession,
  onClose,
  setGeneratedCode,
  addToast,
}: CreateSessionModalProps) {
  if (!showCreateSessionModal) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div 
        className="absolute inset-0 bg-black/70 backdrop-blur-sm" 
        onClick={() => !isGeneratingSession && onClose()} 
      />
      <div className="relative border border-white/[0.06] bg-[#0c0d10] rounded-2xl p-6 max-w-sm w-full mx-4 shadow-xl z-50">
        <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-1">
          Start Raid Attendance
        </h3>
        <p className="text-xs text-white/40 mb-4 leading-relaxed">
          Activate check-in session for **{showCreateSessionModal.bossName}**.
        </p>

        {!generatedCode ? (
          <form onSubmit={handleStartSession} className="space-y-4">
            <div>
              <label className="block text-[10px] font-bold text-white/40 uppercase tracking-wider mb-2">Check-in Duration</label>
              <select
                value={sessionDuration}
                onChange={(e) => setSessionDuration(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-[#08080a] border border-white/[0.06] text-xs text-white focus:outline-none cursor-pointer"
              >
                <option value="5">5 Minutes</option>
                <option value="10">10 Minutes</option>
                <option value="15">15 Minutes</option>
                <option value="30">30 Minutes</option>
                <option value="60">60 Minutes</option>
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-white/40 uppercase tracking-wider mb-2">Raid Scope</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setSessionType("GUILD")}
                  className={`px-3 py-2 rounded-lg border font-semibold text-[10px] transition-all cursor-pointer ${
                    sessionType === "GUILD"
                      ? "bg-violet-500/10 border-violet-500/30 text-white"
                      : "bg-zinc-950 border-white/[0.06] text-white/55 hover:text-white"
                  }`}
                >
                  Guild Exclusive
                </button>
                <button
                  type="button"
                  onClick={() => setSessionType("FACTION")}
                  className={`px-3 py-2 rounded-lg border font-semibold text-[10px] transition-all cursor-pointer ${
                    sessionType === "FACTION"
                      ? "bg-violet-500/10 border-violet-500/30 text-white"
                      : "bg-zinc-950 border-white/[0.06] text-white/55 hover:text-white"
                  }`}
                >
                  Faction Raid
                </button>
              </div>
            </div>

            <div className="flex gap-2 justify-end pt-3 border-t border-zinc-900">
              <Button variant="ghost" size="sm" type="button" onClick={onClose} disabled={isGeneratingSession}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" type="submit" isLoading={isGeneratingSession}>
                Create Code
              </Button>
            </div>
          </form>
        ) : (
          <div className="space-y-5 py-2 text-center">
            <div className="p-3 bg-zinc-950 border border-white/[0.06] rounded-xl">
              <p className="text-[10px] text-white/40 font-bold tracking-widest uppercase mb-1">Raid Code</p>
              <div className="flex justify-center gap-1 mt-2">
                {generatedCode.split("").map((char, index) => (
                  <span
                    key={index}
                    className="h-9 w-8 rounded-lg bg-[#050507] border border-white/[0.06] flex items-center justify-center text-sm font-black text-white font-mono shadow-sm"
                  >
                    {char}
                  </span>
                ))}
              </div>
            </div>
            <p className="text-[11px] text-white/40 leading-relaxed px-2">
              Share this code with raid participants to allow check-in for the next <strong className="text-white/55">{sessionDuration} minutes</strong>.
            </p>
            <div className="flex gap-2 justify-center pt-2">
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(generatedCode);
                  addToast("success", "Code copied to clipboard!");
                }}
                className="px-3.5 py-1.5 bg-white/[0.10] hover:bg-white/[0.14] text-xs font-semibold text-white rounded-lg transition-all cursor-pointer"
              >
                Copy Code
              </button>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  setGeneratedCode(null);
                }}
                className="px-3.5 py-1.5 border border-white/[0.06] hover:bg-white/[0.04] text-xs font-semibold text-white/55 hover:text-white rounded-lg transition-all cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
