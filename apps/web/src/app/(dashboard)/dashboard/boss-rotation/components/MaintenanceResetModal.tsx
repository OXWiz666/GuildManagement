"use client";

import { useState, useEffect, useCallback } from "react";
import { PREDEFINED_BOSSES } from "@guild/shared";
import Button from "@/components/ui/Button";

interface MaintenanceResetModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (maintenanceEndTime: Date) => Promise<void>;
  isProcessing: boolean;
}

/** Returns only the LONG_CYCLE bosses that will be affected by a maintenance reset. */
function getCycleBosses() {
  return PREDEFINED_BOSSES.filter((b) => b.type === "LONG_CYCLE");
}

/** Returns only the FIXED_SCHEDULE bosses that will NOT be affected. */
function getFixedBosses() {
  return PREDEFINED_BOSSES.filter((b) => b.type === "FIXED_SCHEDULE");
}

/** Format a Date to the local "YYYY-MM-DDTHH:MM" string for datetime-local inputs */
function toLocalDatetimeStr(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function MaintenanceResetModal({
  isOpen,
  onClose,
  onConfirm,
  isProcessing,
}: MaintenanceResetModalProps) {
  const [maintenanceEndTime, setMaintenanceEndTime] = useState("");
  const [showAffectedList, setShowAffectedList] = useState(false);

  const cycleBosses = getCycleBosses();
  const fixedBosses = getFixedBosses();

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setMaintenanceEndTime(toLocalDatetimeStr(new Date()));
      setShowAffectedList(false);
    }
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const handleConfirm = useCallback(async () => {
    const endTime = new Date(maintenanceEndTime);
    if (isNaN(endTime.getTime())) return;
    await onConfirm(endTime);
  }, [maintenanceEndTime, onConfirm]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-lg mx-4 animate-scale-in">
        <div className="rounded-2xl bg-[#0c0c10] border border-white/[0.08] shadow-2xl shadow-black/60 overflow-hidden">

          {/* Header with warning gradient */}
          <div className="relative px-6 pt-6 pb-4">
            <div
              className="absolute inset-x-0 top-0 h-32 pointer-events-none"
              style={{
                background: "linear-gradient(180deg, rgba(245,158,11,0.08) 0%, transparent 100%)",
              }}
            />
            <div className="relative flex items-start gap-4">
              {/* Wrench Icon */}
              <div className="shrink-0 h-11 w-11 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                <svg className="h-5 w-5 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
                </svg>
              </div>
              <div>
                <h3 className="text-[16px] font-bold text-white">
                  Maintenance Reset
                </h3>
                <p className="text-[12px] text-white/45 mt-1 leading-relaxed">
                  Reset spawn timers for all <span className="text-amber-400 font-semibold">cycle based bosses</span> after
                  a game maintenance. Fixed schedule bosses will not be affected.
                </p>
              </div>
            </div>
          </div>

          {/* Body */}
          <div className="px-6 pb-2 space-y-5">

            {/* Maintenance End Time Input */}
            <div>
              <label className="block text-[11px] uppercase tracking-widest text-white/50 font-semibold mb-2">
                Maintenance End Time
              </label>
              <input
                type="datetime-local"
                value={maintenanceEndTime}
                onChange={(e) => setMaintenanceEndTime(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl bg-[#08080a] border border-white/[0.08] text-[14px] text-white font-mono focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 transition-all [color-scheme:dark]"
              />
              <p className="text-[10px] text-white/30 mt-1.5 italic">
                All cycle bosses will respawn at this time after maintenance.
              </p>
            </div>

            {/* Info card: what gets reset */}
            <div className="rounded-xl bg-amber-500/[0.04] border border-amber-500/10 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="h-2 w-2 rounded-full bg-amber-400 shadow-[0_0_6px_rgba(245,158,11,0.5)]" />
                  <span className="text-[12px] font-bold text-amber-400 uppercase tracking-wider">
                    Affected: {cycleBosses.length} Cycle Bosses
                  </span>
                </div>
                <button
                  onClick={() => setShowAffectedList(!showAffectedList)}
                  className="text-[10px] text-amber-500/70 hover:text-amber-400 font-semibold uppercase tracking-wider transition-colors cursor-pointer"
                >
                  {showAffectedList ? "Hide" : "Show"} List
                </button>
              </div>

              {showAffectedList && (
                <div className="max-h-40 overflow-y-auto space-y-1 custom-scrollbar">
                  {cycleBosses.map((boss) => (
                    <div
                      key={boss.name}
                      className="flex items-center justify-between py-1 px-2 rounded-lg text-[11px]"
                    >
                      <span className="text-white/70 font-medium">{boss.name}</span>
                      <span className="text-white/30 font-mono text-[10px]">
                        {boss.cooldownHours}h cycle
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-2.5 pt-1 border-t border-white/[0.04]">
                <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]" />
                <span className="text-[11px] font-semibold text-emerald-400/80">
                  {fixedBosses.length} Fixed Schedule Bosses — Unaffected
                </span>
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 px-6 py-5 border-t border-white/[0.04]">
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              disabled={isProcessing}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleConfirm}
              isLoading={isProcessing}
              className="bg-amber-600 hover:bg-amber-500 shadow-amber-500/15 hover:shadow-amber-500/25"
            >
              <svg className="h-3.5 w-3.5 mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21.5 2v6h-6" />
                <path d="M2.5 12a10 10 0 0 1 17.17-6.83L21.5 8" />
                <path d="M2.5 22v-6h6" />
                <path d="M21.5 12a10 10 0 0 1-17.17 6.83L2.5 16" />
              </svg>
              Reset Cycle Bosses
            </Button>
          </div>

        </div>
      </div>
    </div>
  );
}
