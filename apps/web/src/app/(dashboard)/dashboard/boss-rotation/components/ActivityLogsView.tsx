import type { AuditLogEntry } from "@/lib/api";
import { Skeleton } from "@/components/ui/Skeleton";
import { getRelativeTime } from "../utils/helpers";

interface ActivityLogsViewProps {
  auditLogs: AuditLogEntry[];
  isLoadingLogs: boolean;
}

const ACTION_LABELS: Record<string, string> = {
  BOSS_EVENT_SCHEDULED: "📅 Scheduled",
  BOSS_KILLED_LOGGED: "💀 Defeated",
  BOSS_EVENT_UPDATED: "✏️ Updated",
  BOSS_EVENT_DELETED: "🗑️ Cancelled",
};

const ACTION_COLORS: Record<string, string> = {
  BOSS_EVENT_SCHEDULED: "text-sky-400 bg-sky-500/10 border-sky-500/20",
  BOSS_KILLED_LOGGED: "text-red-400 bg-red-500/10 border-red-500/20",
  BOSS_EVENT_UPDATED: "text-amber-400 bg-amber-500/10 border-amber-500/20",
  BOSS_EVENT_DELETED: "text-zinc-500 bg-zinc-500/10 border-zinc-500/25",
};

export default function ActivityLogsView({
  auditLogs,
  isLoadingLogs,
}: ActivityLogsViewProps) {
  return (
    <div className="space-y-4 max-w-3xl mx-auto animate-scale-in">
      <div className="bg-[#0b0b0e] border border-white/[0.04] p-5 rounded-2xl glass-subtle">
        <div className="flex items-center justify-between mb-5">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-[10px] text-amber-500/70 uppercase tracking-[0.22em] font-medium">
                Boss Events
              </span>
              <span className="h-px w-8 bg-gradient-to-r from-amber-500/20 to-transparent" />
            </div>
            <h3 className="text-base font-semibold text-white tracking-tight">
              Guild Transparency Audit
            </h3>
          </div>
          <span className="inline-flex items-center gap-1.5 text-[10px] text-white/40">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Live
          </span>
        </div>

        {isLoadingLogs ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-16 rounded-xl animate-pulse bg-white/[0.02]" />
            ))}
          </div>
        ) : auditLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 rounded-xl bg-white/[0.005] border border-white/[0.02] p-6 text-center">
            <svg className="h-8 w-8 text-white/10 mb-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 8v4l3 3" />
            </svg>
            <p className="text-xs text-white/35">No boss activity logs recorded yet.</p>
          </div>
        ) : (
          <div className="space-y-3.5 max-h-[550px] overflow-y-auto pr-2 custom-scrollbar">
            {auditLogs.map((log) => {
              const label = ACTION_LABELS[log.action] || log.action;
              const colorClass = ACTION_COLORS[log.action] || "text-zinc-400 bg-zinc-500/10 border-zinc-500/20";

              const detailAny = log.detail as any;
              const bossName = detailAny?.bossName || detailAny?.bossSchedule?.bossName || "";
              const lootDrop = detailAny?.lootDrop || "";
              const guildTurn = detailAny?.guildTurn || "";

              return (
                <div key={log.id} className="flex items-start gap-4 p-4 rounded-xl border border-white/[0.03] bg-[#09090c]/40 hover:bg-white/[0.01] hover:border-white/[0.06] transition-all">
                  {/* Actor Avatar */}
                  <div className="h-9 w-9 rounded-full overflow-hidden border border-white/10 shrink-0 bg-amber-500/10 flex items-center justify-center text-amber-400 font-bold text-xs select-none">
                    {log.actor?.avatarUrl ? (
                      <img src={log.actor.avatarUrl} alt={log.actor.displayName} className="h-full w-full object-cover" />
                    ) : (
                      log.actor?.displayName?.charAt(0).toUpperCase() || "A"
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-white text-[13px] shrink-0">
                        {log.actor?.displayName || "System Agent"}
                      </span>
                      <span className={`px-2 py-0.5 rounded-lg border text-[9px] font-bold uppercase tracking-wider ${colorClass}`}>
                        {label}
                      </span>
                      <span className="text-[10px] text-zinc-550 ml-auto font-medium">
                        {getRelativeTime(log.createdAt)}
                      </span>
                    </div>

                    <p className="text-xs text-zinc-400 mt-1.5 leading-relaxed">
                      {bossName && (
                        <>
                          Boss: <span className="text-white font-bold">{bossName}</span>
                        </>
                      )}
                      {guildTurn && (
                        <>
                          {" "}· Assigned Turn: <span className="text-amber-400 font-bold">{guildTurn}</span>
                        </>
                      )}
                      {lootDrop && (
                        <>
                          {" "}· Loot dropped: <span className="text-emerald-400 font-bold italic">{lootDrop}</span>
                        </>
                      )}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
