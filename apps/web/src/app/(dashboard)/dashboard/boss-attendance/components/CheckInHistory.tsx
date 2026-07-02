"use client";

export interface CheckInHistoryItem {
  sessionId: string;
  title: string;
  type: "GUILD" | "FACTION";
  createdAt: string;
  expiresAt: string;
  status: "CONFIRMED" | "PENDING" | "MISSED" | "UNCHECKED";
  joinedAt: string | null;
}

export interface CheckInHistoryProps {
  history: CheckInHistoryItem[];
}

const STATUS_STYLES: Record<CheckInHistoryItem["status"], { label: string; color: string; dot: string }> = {
  CONFIRMED: { label: "Present", color: "text-emerald-400 bg-emerald-500/5 border-emerald-500/15", dot: "bg-emerald-400" },
  PENDING: { label: "Pending", color: "text-amber-400 bg-amber-500/5 border-amber-500/15", dot: "bg-amber-400" },
  MISSED: { label: "Missed", color: "text-rose-400 bg-rose-500/5 border-rose-500/15", dot: "bg-rose-500" },
  UNCHECKED: { label: "Open", color: "text-white/50 bg-white/[0.02] border-white/[0.08]", dot: "bg-zinc-600" },
};

/**
 * Compact, personal attendance log. Replaces the weekly tracker grid with a
 * straightforward "what did I check into recently" list — easier to scan.
 */
export default function CheckInHistory({ history }: CheckInHistoryProps) {
  const recent = history.slice(0, 12);

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.01] p-5 h-full">
      <div className="flex items-center justify-between border-b border-white/[0.06] pb-3.5 mb-4">
        <h3 className="text-xs font-bold text-white uppercase tracking-wider">Your Check-In History</h3>
        <span className="text-[10px] font-mono font-bold bg-white/[0.04] border border-white/[0.06] px-2 py-0.5 rounded text-white/55">
          {history.length}
        </span>
      </div>

      {recent.length === 0 ? (
        <div className="text-center py-12 text-xs text-zinc-650 italic">
          No attendance records yet. Your check-ins will appear here once you start claiming raids.
        </div>
      ) : (
        <ul className="space-y-2 max-h-[480px] overflow-y-auto pr-1 custom-scrollbar">
          {recent.map((item) => {
            const style = STATUS_STYLES[item.status];
            return (
              <li
                key={item.sessionId}
                className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.05] bg-white/[0.015] px-3 py-2.5"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${style.dot}`} />
                    <p className="text-xs font-semibold text-white/90 truncate">{item.title}</p>
                  </div>
                  <p className="text-[10px] text-white/40 mt-1 ml-3.5">
                    {new Date(item.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    {" · "}
                    {new Date(item.createdAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                    <span className="ml-1.5 text-white/25">{item.type === "FACTION" ? "Faction" : "Guild"}</span>
                  </p>
                </div>
                <span className={`text-[9px] font-bold px-2 py-0.5 rounded border shrink-0 ${style.color}`}>
                  {style.label}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
