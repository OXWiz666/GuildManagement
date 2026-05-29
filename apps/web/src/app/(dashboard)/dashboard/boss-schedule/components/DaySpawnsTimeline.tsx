"use client";

import { type BossScheduleData } from "@/lib/api";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import { getBossImageUrl } from "@guild/shared";

export interface DaySpawnsTimelineProps {
  selectedDate: Date | null;
  dayEvents: BossScheduleData[];
  getCountdownText: (spawnTime: string) => { expired: boolean; text: string; danger?: boolean; warning?: boolean };
  isOfficer: boolean;
  setShowKillModal: (val: BossScheduleData | null) => void;
  setKillTimeInput: (val: string) => void;
  onEditSchedule: (item: BossScheduleData) => void;
  onDeleteSchedule: (itemId: string) => void;
}

export default function DaySpawnsTimeline({
  selectedDate,
  dayEvents,
  getCountdownText,
  isOfficer,
  setShowKillModal,
  setKillTimeInput,
  onEditSchedule,
  onDeleteSchedule,
}: DaySpawnsTimelineProps) {
  return (
    <Card>
      <div className="flex items-center justify-between mb-4 border-b border-white/[0.05] pb-2">
        <h3 className="font-bold text-white text-sm flex items-center gap-1.5">
          <span>📅</span> Spawns: {selectedDate ? selectedDate.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "Select a Day"}
        </h3>
        {selectedDate && (
          <span className="px-2 py-0.5 rounded bg-primary-500/15 text-white/85 text-[10px] font-mono font-bold">
            {dayEvents.length} Events
          </span>
        )}
      </div>

      {!selectedDate ? (
        <div className="text-center py-8 text-xs text-white/40">
          Click a calendar day to view active timeline slots.
        </div>
      ) : dayEvents.length === 0 ? (
        <div className="text-center py-8 text-xs text-white/40">
          No spawns scheduled for this date.
        </div>
      ) : (
        <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1">
          {dayEvents.map((item) => {
            const tick = getCountdownText(item.spawnTime);
            const isFaction = item.guildId === null;
            const isKilled = item.status === "KILLED";

            return (
              <div
                key={item.id}
                className={`p-3 rounded-xl bg-[#13131c] border flex flex-col gap-2 relative transition-all ${
                  isKilled
                    ? "border-white/[0.05] opacity-50"
                    : tick.expired
                      ? "border-red-500/40 bg-red-950/10 animate-pulse shadow-[0_0_10px_rgba(239,68,68,0.1)]"
                      : tick.warning
                        ? "border-amber-500/40 bg-amber-950/10"
                        : "border-white/[0.05] hover:border-white/[0.10]"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex items-center gap-2">
                    <img
                      src={item.bossImageUrl || getBossImageUrl(item.bossName)}
                      alt={item.bossName}
                      className="h-8 w-8 rounded-lg object-cover border border-white/10 shrink-0 shadow-sm"
                    />
                    <div className="min-w-0">
                      <h4 className="font-semibold text-white text-xs truncate">
                        {item.bossName}
                      </h4>
                      <p className="text-[10px] text-white/40 truncate mt-0.5">
                        📍 {item.location}
                      </p>
                    </div>
                  </div>
                  {isKilled ? (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold border bg-white/[0.04] border-white/10 text-white/50">
                      KILLED
                    </span>
                  ) : (
                    <span
                      className={`text-[10px] font-mono font-bold ${
                        tick.expired
                          ? "text-red-400 animate-pulse"
                          : tick.warning
                            ? "text-amber-400"
                            : "text-white/85"
                      }`}
                    >
                      {tick.text}
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between border-t border-white/[0.05] pt-2 text-[9px] text-white/40">
                  <span>
                    🕒 {new Date(item.spawnTime).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  {item.guildTurn && isFaction && (
                    <span className="text-amber-400/80">🛡️ {item.guildTurn}</span>
                  )}
                </div>

                {/* Actions inside timeline card */}
                {isOfficer && (
                  <div className="flex gap-2 mt-1.5 pt-1.5 border-t border-white/[0.05]">
                    {!isKilled && (tick.expired || tick.warning) && (
                      <Button
                        variant="danger"
                        size="xs"
                        onClick={() => {
                          setShowKillModal(item);
                          setKillTimeInput(new Date().toLocaleTimeString("en-US", { hour12: false }).substring(0, 5));
                        }}
                        className="flex-1"
                      >
                        Log Kill
                      </Button>
                    )}
                    <button
                      type="button"
                      onClick={() => onEditSchedule(item)}
                      className="px-2 py-1 rounded bg-white/[0.04] border border-white/10 hover:bg-white/[0.08] hover:border-white/20 text-[10px] font-bold text-white transition-all cursor-pointer flex-1"
                    >
                      ✏️ Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteSchedule(item.id)}
                      className="px-2 py-1 rounded bg-rose-500/5 border border-rose-500/10 hover:bg-rose-500/10 hover:border-rose-500/20 text-[10px] font-bold text-rose-400 transition-all cursor-pointer flex-1"
                    >
                      🗑️ Delete
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
