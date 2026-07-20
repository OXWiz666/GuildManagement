"use client";

import { getBossImageUrl } from "@guild/shared";

export interface AttendanceHistoryItem {
  sessionId: string;
  title: string;
  type: "GUILD" | "FACTION";
  createdAt: string;
  expiresAt: string;
  status: "CONFIRMED" | "PENDING" | "MISSED" | "UNCHECKED";
  joinedAt: string | null;
  bossName: string | null;
  bossImageUrl: string | null;
  location: string | null;
  spawnTime: string | null;
}

export interface AttendanceHistoryListProps {
  history: AttendanceHistoryItem[];
}

const STATUS_STYLES: Record<AttendanceHistoryItem["status"], { label: string; color: string }> = {
  CONFIRMED: { label: "Present", color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/25" },
  PENDING: { label: "Pending", color: "text-amber-400 bg-amber-500/10 border-amber-500/25" },
  MISSED: { label: "Missed", color: "text-rose-400 bg-rose-500/10 border-rose-500/25" },
  UNCHECKED: { label: "Open", color: "text-white/50 bg-white/[0.04] border-white/[0.1]" },
};

function dateLabel(iso: string) {
  const date = new Date(iso);
  const key = date.toDateString();
  const todayKey = new Date().toDateString();
  const yesterdayKey = new Date(Date.now() - 86400000).toDateString();
  if (key === todayKey) return "Today";
  if (key === yesterdayKey) return "Yesterday";
  return date.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", year: "numeric" });
}

function groupByDate(items: AttendanceHistoryItem[]) {
  const groups: Array<{ key: string; label: string; items: AttendanceHistoryItem[] }> = [];
  const sorted = [...items].sort((a, b) => {
    const aTime = new Date(a.spawnTime || a.createdAt).getTime();
    const bTime = new Date(b.spawnTime || b.createdAt).getTime();
    return bTime - aTime;
  });

  for (const item of sorted) {
    const iso = item.spawnTime || item.createdAt;
    const key = new Date(iso).toDateString();
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(item);
    else groups.push({ key, label: dateLabel(iso), items: [item] });
  }
  return groups;
}

/**
 * "Your Attendance History" — a plain, chronological log grouped by date.
 * The animated boss-card treatment lives in OpenCheckInDetailModal now;
 * history is a record you scan, not something you interact with, so it
 * stays flat and quick to read.
 */
export default function AttendanceHistoryList({ history }: AttendanceHistoryListProps) {
  const groups = groupByDate(history);

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.01] p-5 h-full">
      <div className="flex items-center justify-between border-b border-white/[0.06] pb-3.5 mb-4">
        <h3 className="text-xs font-bold text-white uppercase tracking-wider">Your Attendance History</h3>
        <span className="text-[10px] font-mono font-bold bg-white/[0.04] border border-white/[0.06] px-2 py-0.5 rounded text-white/55">
          {history.length}
        </span>
      </div>

      {groups.length === 0 ? (
        <div className="text-center py-16 text-xs text-zinc-650 italic">
          No attendance records yet. Your check-ins will appear here once you start claiming raids.
        </div>
      ) : (
        <div className="space-y-5 max-h-[420px] overflow-y-auto pr-1 custom-scrollbar">
          {groups.map((group) => (
            <div key={group.key}>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--forge-gold-dim)]">
                  {group.label}
                </span>
                <span className="h-px flex-1 bg-white/[0.06]" />
                <span className="text-[9px] text-white/30 font-mono">{group.items.length}</span>
              </div>

              <div className="space-y-1.5">
                {group.items.map((item) => {
                  const style = STATUS_STYLES[item.status];
                  const bossName = item.bossName || item.title;
                  const imageSrc = item.bossImageUrl || getBossImageUrl(bossName);
                  const spawnDate = item.spawnTime || item.createdAt;
                  const isChecked = item.status === "CONFIRMED" || item.status === "PENDING";

                  return (
                    <div
                      key={item.sessionId}
                      className="flex items-center gap-2.5 rounded-lg border border-white/[0.05] bg-white/[0.015] px-2.5 py-2"
                    >
                      <img
                        src={imageSrc}
                        alt={bossName}
                        className="h-8 w-8 rounded-md object-cover border border-white/[0.08] shrink-0"
                        loading="lazy"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-semibold text-white truncate">{bossName}</p>
                        <p className="text-[9px] text-white/40 truncate mt-0.5">
                          {new Date(spawnDate).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                          {item.location ? ` · ${item.location}` : ""}
                        </p>
                      </div>
                      <span className={`shrink-0 inline-flex items-center px-1.5 py-0.5 rounded-md border text-[9px] font-bold uppercase tracking-wider ${style.color}`}>
                        {style.label}
                      </span>
                      <svg
                        aria-label={isChecked ? "Checked in" : "Not checked in"}
                        className={`h-3.5 w-3.5 shrink-0 ${isChecked ? "text-emerald-400" : "text-white/15"}`}
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
