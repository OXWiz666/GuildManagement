import { useMemo } from "react";
import { getGuildColor } from "../utils/helpers";
import { type ViewEntry, spawnSortValue, groupByDay } from "../utils/viewEntry";
import BossAvatar from "./BossAvatar";

export default function TimelineView({
  entries,
  canManage,
  onTaken,
}: {
  entries: ViewEntry[];
  canManage?: boolean;
  onTaken?: (id: string) => void;
}) {
  const sorted = useMemo(
    () => [...entries].sort((a, b) => spawnSortValue(a.spawnTime) - spawnSortValue(b.spawnTime)),
    [entries],
  );
  const groups = useMemo(() => groupByDay(sorted), [sorted]);

  return (
    <div className="space-y-6 animate-scale-in">
      {groups.map((group) => (
        <div key={group.key}>
          <div className="flex items-center gap-3 mb-3">
            <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--forge-gold)]">{group.label}</span>
            <span className="h-px flex-1 bg-white/[0.06]" />
            <span className="text-[10px] text-white/30 font-mono">{group.items.length}</span>
          </div>
          <div className="relative pl-6 border-l border-white/[0.08] space-y-3">
            {group.items.map((entry) => (
              <TimelineRow key={entry.id} entry={entry} canManage={canManage} onTaken={onTaken} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function TimelineRow({
  entry,
  canManage,
  onTaken,
}: {
  entry: ViewEntry;
  canManage?: boolean;
  onTaken?: (id: string) => void;
}) {
  const color = getGuildColor(entry.guildName === "Unassigned" ? "" : entry.guildName);
  const timeLabel = entry.spawnTime
    ? new Date(entry.spawnTime).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
    : "--:--";
  const dotColor = entry.timerLive ? "bg-emerald-400" : entry.timerWarning ? "bg-[var(--forge-gold)]" : "bg-white/25";

  return (
    <div className="relative flex flex-wrap items-center gap-3 rounded-xl border border-white/[0.05] bg-white/[0.02] hover:bg-white/[0.035] hover:border-white/10 transition-colors p-3">
      <span className={`absolute -left-[29px] top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border-2 border-[#0c0d12] ${dotColor}`} />
      <span className="w-14 shrink-0 font-mono text-xs text-white/50">{timeLabel}</span>
      <BossAvatar src={entry.bossImageUrl} name={entry.bossName} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-white truncate">{entry.bossName}</p>
        <p className="text-[11px] text-white/40 truncate">{entry.location}</p>
      </div>
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[10px] font-bold shrink-0 ${color.border} ${color.bg} ${color.text}`}>
        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color.dot }} />
        {entry.guildName}
      </span>
      <span className={`shrink-0 font-mono text-xs font-bold ${entry.timerLive ? "text-emerald-400" : entry.timerWarning ? "text-[var(--forge-gold-bright)]" : "text-white/60"}`}>
        {entry.timerText}
      </span>
      {canManage && onTaken && (
        <button
          type="button"
          onClick={() => onTaken(entry.id)}
          className="shrink-0 h-7 px-3 inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 text-[10px] font-bold uppercase tracking-wider text-emerald-400 hover:bg-emerald-500/20 hover:border-emerald-500/60 hover:text-white transition-all cursor-pointer"
        >
          <svg className="h-3 w-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
            <path d="M22 4L12 14.01l-3-3" />
          </svg>
          Taken
        </button>
      )}
    </div>
  );
}
