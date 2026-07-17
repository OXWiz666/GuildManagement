"use client";

import type { BossKilledHistoryDay, BossKilledHistoryEntry } from "@/lib/api";
import { getBossImageUrl } from "@guild/shared";
import { getGuildColor } from "../utils/helpers";

interface HistoryLedgerGridProps {
  /** Newest-day-first, each day's kills already newest-first. */
  days: BossKilledHistoryDay[];
  /** Column order for the selected boss category. */
  bossNames: string[];
  onSelectKill: (kill: BossKilledHistoryEntry) => void;
}

function formatDayHeader(dateKey: string) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  return {
    month: date.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }),
    day: date.toLocaleDateString("en-US", { day: "numeric", timeZone: "UTC" }),
    weekday: date.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" }),
  };
}

function isToday(dateKey: string) {
  const today = new Date();
  const todayKey = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, "0")}-${String(
    today.getUTCDate(),
  ).padStart(2, "0")}`;
  return dateKey === todayKey;
}

// One row per date, one column per boss — each cell stacks every kill logged
// for that boss on that date (time + taking guild), so a busy day shows every
// hand-off instead of collapsing to a single "last kill" entry.
export default function HistoryLedgerGrid({ days, bossNames, onSelectKill }: HistoryLedgerGridProps) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
      <div className="max-h-[560px] overflow-auto custom-scrollbar">
        <table className="border-collapse text-left">
          <thead>
            <tr>
              <th className="sticky top-0 left-0 z-30 bg-[var(--obsidian-elevated)] px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.16em] text-white/40 min-w-[112px] text-left border-b border-r border-white/[0.06] shadow-[1px_0_0_rgba(255,255,255,0.04)]">
                Date
              </th>
              {bossNames.map((bossName) => (
                <th
                  key={bossName}
                  title={bossName}
                  className="sticky top-0 z-20 bg-[var(--obsidian-elevated)] px-2 py-2.5 text-center min-w-[92px] border-b border-l border-white/[0.05] first:border-l-0"
                >
                  <div className="flex flex-col items-center gap-1.5">
                    <img
                      src={getBossImageUrl(bossName)}
                      alt=""
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      className="h-8 w-8 rounded-full object-cover border border-white/10 ring-1 ring-black/40"
                    />
                    <span className="text-[9.5px] font-bold uppercase tracking-[0.05em] text-white/55 leading-tight max-w-[88px] truncate">
                      {bossName}
                    </span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {days.map((day, index) => {
              const { month, day: dayNum, weekday } = formatDayHeader(day.date);
              const today = isToday(day.date);
              return (
                <tr
                  key={day.date}
                  className={`align-top border-b border-white/[0.04] transition-colors hover:bg-[var(--forge-glow)]/40 ${
                    index % 2 === 1 ? "bg-white/[0.012]" : ""
                  }`}
                >
                  <td
                    className={`sticky left-0 z-10 px-4 py-3 whitespace-nowrap border-r border-white/[0.06] ${
                      today ? "bg-[var(--forge-glow)]" : index % 2 === 1 ? "bg-[#0e0e15]" : "bg-[var(--obsidian-elevated)]"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {today && <span className="h-1.5 w-1.5 rounded-full bg-[var(--forge-gold-bright)] shrink-0" />}
                      <div>
                        <p className={`text-[13px] font-semibold ${today ? "text-[var(--forge-gold-bright)]" : "text-white"}`}>
                          {month} {dayNum}
                        </p>
                        <p className="text-[10px] text-white/35">{today ? "Today" : weekday}</p>
                      </div>
                    </div>
                  </td>
                  {bossNames.map((bossName) => {
                    const kills = day.kills
                      .filter((kill) => kill.bossName.toLowerCase() === bossName.toLowerCase())
                      .sort((a, b) => new Date(b.killedAt).getTime() - new Date(a.killedAt).getTime());
                    return (
                      <td key={bossName} className="px-2 py-2.5 border-l border-white/[0.04] first:border-l-0 text-center">
                        {kills.length === 0 ? (
                          <span className="text-white/10 text-xs select-none">·</span>
                        ) : (
                          <div className="flex flex-col items-center gap-1.5">
                            {kills.map((kill) => {
                              const color = getGuildColor(kill.takenGuildName || "");
                              return (
                                <button
                                  key={kill.id}
                                  type="button"
                                  onClick={() => onSelectKill(kill)}
                                  className={`flex items-center gap-1.5 rounded-md border px-1.5 py-1 cursor-pointer transition-all hover:-translate-y-px hover:shadow-[0_2px_8px_rgba(0,0,0,0.35)] ${color.bg} ${color.border}`}
                                >
                                  <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: color.dot }} />
                                  <span className="flex flex-col items-start leading-tight">
                                    <span className={`text-[10px] font-bold whitespace-nowrap ${color.text}`}>
                                      {kill.takenGuildName || "Unrecorded"}
                                    </span>
                                    <span className="text-[9px] font-mono text-white/40 whitespace-nowrap">
                                      {new Date(kill.killedAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                                    </span>
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
