"use client";

import { useState, useEffect } from "react";
import { type AttendanceSessionData } from "@/lib/api";
import Button from "@/components/ui/Button";

export interface EditSessionModalProps {
  showModal: boolean;
  onClose: () => void;
  session: AttendanceSessionData | null;
  isSubmitting: boolean;
  handleEditSession: (
    title: string,
    minutes: number,
    isActive: boolean
  ) => Promise<void>;
}

export default function EditSessionModal({
  showModal,
  onClose,
  session,
  isSubmitting,
  handleEditSession,
}: EditSessionModalProps) {
  const [title, setTitle] = useState("");
  const [minutes, setMinutes] = useState(10);
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (session && showModal) {
      setTitle(session.title);
      setIsActive(session.isActive);
      
      // Calculate remaining minutes from expiresAt
      const expires = new Date(session.expiresAt).getTime();
      const diffMs = expires - Date.now();
      const diffMins = Math.max(1, Math.ceil(diffMs / 60000));
      setMinutes(diffMins);
    }
  }, [session, showModal]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || minutes <= 0) return;
    handleEditSession(title.trim(), minutes, isActive);
  };

  if (!showModal || !session) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={() => !isSubmitting && onClose()}
      />
      <div className="relative glass-strong rounded-2xl p-6 max-w-md w-full mx-4 animate-scale-in z-50 border border-white/[0.08]">
        <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-4">
          ✏️ Edit Attendance Session
        </h3>
        
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-[10px] font-bold text-white/40 uppercase tracking-widest mb-1.5">
              Session Title
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Lady Dalia Raid Attendance"
              className="w-full px-4 py-2 rounded-xl bg-[#0f0f16] border border-white/[0.08] text-xs text-white focus:outline-none focus:border-white/20"
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold text-white/40 uppercase tracking-widest mb-1.5">
              Session Expiration (Minutes from now)
            </label>
            <input
              type="number"
              required
              min={1}
              max={120}
              value={minutes}
              onChange={(e) => setMinutes(parseInt(e.target.value, 10))}
              className="w-full px-4 py-2 rounded-xl bg-[#0f0f16] border border-white/[0.08] text-xs text-white focus:outline-none focus:border-white/20 font-mono"
            />
          </div>

          <div className="flex items-center gap-2 py-2">
            <input
              type="checkbox"
              id="session-active"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="rounded border-white/10 text-primary-500 focus:ring-primary-500 cursor-pointer h-4 w-4 bg-white/[0.04]"
            />
            <label htmlFor="session-active" className="text-xs font-semibold text-white/60 cursor-pointer select-none">
              Portal Open (Accepting check-ins)
            </label>
          </div>

          <div className="flex gap-3 justify-end pt-4 border-t border-white/[0.06] mt-6">
            <Button
              variant="ghost"
              size="sm"
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              type="submit"
              isLoading={isSubmitting}
            >
              Save Changes
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
