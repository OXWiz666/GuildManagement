"use client";

import { type BossScheduleData } from "@/lib/api";
import Button from "@/components/ui/Button";
import { ImageUrlField } from "@/components/dashboard/DashboardHelpers";

export interface LogKillModalProps {
  showKillModal: BossScheduleData | null;
  killTimeInput: string;
  setKillTimeInput: (val: string) => void;
  lootDrop: string;
  setLootDrop: (val: string) => void;
  screenshotUrl: string;
  setScreenshotUrl: (val: string) => void;
  broadcastDiscord: boolean;
  setBroadcastDiscord: (val: boolean) => void;
  isLoggingKill: boolean;
  handleLogKill: (e: React.FormEvent) => void;
  onClose: () => void;
}

export default function LogKillModal({
  showKillModal,
  killTimeInput,
  setKillTimeInput,
  lootDrop,
  setLootDrop,
  screenshotUrl,
  setScreenshotUrl,
  broadcastDiscord,
  setBroadcastDiscord,
  isLoggingKill,
  handleLogKill,
  onClose,
}: LogKillModalProps) {
  if (!showKillModal) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div 
        className="absolute inset-0 bg-black/70 backdrop-blur-sm" 
        onClick={() => !isLoggingKill && onClose()} 
      />
      <div className="relative glass-strong rounded-2xl p-6 max-w-md w-full mx-4 animate-scale-in">
        <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
          <span>💀</span> Log Boss Death
        </h3>
        <p className="text-xs text-white/50 mb-4 font-normal leading-relaxed">
          Verify in-game kill for **{showKillModal.bossName}** at {showKillModal.location}. This will instantly archive this event and auto-schedule the next respawn in the calendar.
        </p>
        <form onSubmit={handleLogKill} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-white/40 uppercase tracking-wider mb-2">Death Time (Local HH:MM)</label>
            <div className="flex gap-2 items-center">
              <input
                type="text"
                placeholder="HH:MM"
                pattern="^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$"
                title="Please enter time in HH:MM format (24-hour style, e.g. 14:30)"
                value={killTimeInput}
                onChange={(e) => setKillTimeInput(e.target.value)}
                required
                className="flex-1 px-4 py-2 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm text-white focus:outline-none font-mono"
              />
              <Button
                variant="secondary"
                size="sm"
                type="button"
                onClick={() => {
                  const now = new Date();
                  const hours = String(now.getHours()).padStart(2, "0");
                  const minutes = String(now.getMinutes()).padStart(2, "0");
                  setKillTimeInput(`${hours}:${minutes}`);
                }}
              >
                ⏱️ Now
              </Button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-white/40 uppercase tracking-wider mb-2">Dropped Loot (Guild Treasury Ledger)</label>
            <input
              type="text"
              placeholder="e.g. Legendary Weapon Chest, Ancient Crafting Recipe (or None)"
              value={lootDrop}
              onChange={(e) => setLootDrop(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm text-white focus:outline-none focus:border-white/25"
            />
          </div>

          <ImageUrlField
            label="Screenshot verification link"
            value={screenshotUrl}
            onChange={setScreenshotUrl}
            placeholder="https://cdn.discordapp.com/attachments/.../proof.png"
            shape="square"
            helperText="Discord CDN or other image host"
          />

          <div className="flex items-center gap-2 py-1">
            <input
              type="checkbox"
              id="broadcast-discord"
              checked={broadcastDiscord}
              onChange={(e) => setBroadcastDiscord(e.target.checked)}
              className="rounded border-white/10 text-primary-500 focus:ring-primary-500 cursor-pointer h-4 w-4 bg-white/[0.04]"
            />
            <label htmlFor="broadcast-discord" className="text-xs font-semibold text-white/70 cursor-pointer select-none">
              Broadcast next spawn schedule to Guild Discord 📡
            </label>
          </div>

          <div className="flex gap-3 justify-end pt-4 border-t border-white/[0.05]">
            <Button variant="ghost" size="sm" type="button" onClick={onClose}>Cancel</Button>
            <Button variant="danger" size="sm" type="submit" isLoading={isLoggingKill}>Record Death</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
