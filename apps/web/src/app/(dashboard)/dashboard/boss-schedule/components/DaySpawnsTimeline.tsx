"use client";

import { type BossScheduleData } from "@/lib/api";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";

export interface DaySpawnsTimelineProps {
  selectedDate: Date | null;
  dayEvents: BossScheduleData[];
  getCountdownText: (spawnTime: string) => { expired: boolean; text: string; danger?: boolean; warning?: boolean };
  isOfficer: boolean;
  setShowKillModal: (val: BossScheduleData | null) => void;
  setKillTimeInput: (val: string) => void;
}

export default function DaySpawnsTimeline({
  selectedDate,
  dayEvents,
  getCountdownText,
  isOfficer,
  setShowKillModal,
  setKillTimeInput,
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
                  <div className="min-w-0">
                    <h4 className="font-semibold text-white text-xs truncate">
                      {item.bossName}
                    </h4>
                    <p className="text-[10px] text-white/40 truncate mt-0.5">
                      📍 {item.location}
                    </p>
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

                {/* Log Kill trigger inside active card */}
                {isOfficer && !isKilled && (tick.expired || tick.warning) && (
                  <div className="mt-1">
                    <Button
                      variant="danger"
                      size="xs"
                      fullWidth
                      onClick={() => {
                        setShowKillModal(item);
                        setKillTimeInput(new Date().toLocaleTimeString("en-US", { hour12: false }).substring(0, 5));
                      }}
                    >
                      Log Kill
                    </Button>
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
