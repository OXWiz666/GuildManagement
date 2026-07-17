import { getBossImageUrl } from "@guild/shared";
import Button from "@/components/ui/Button";
import { getGuildColor, getTickingCountdown, type RotationBoss } from "../utils/helpers";

interface BossTimelineViewProps {
  filteredBosses: RotationBoss[];
  currentTime: number;
  selectedGuildFilter: string;
  setSelectedGuildFilter: (val: string) => void;
  handleShiftTurn: (bossId: string) => void;
}

export default function BossTimelineView({
  filteredBosses,
  currentTime,
  selectedGuildFilter,
  setSelectedGuildFilter,
  handleShiftTurn,
}: BossTimelineViewProps) {
  return (
    <div className="relative border-l border-white/[0.06] pl-6 ml-4 space-y-6 animate-scale-in">
      {filteredBosses.map((boss) => {
        const tick = getTickingCountdown(boss.spawnTime, currentTime);
        const nextTurn = boss.rotationQueue[1] || boss.rotationQueue[0];
        const claimedColor = getGuildColor(boss.claimedBy);
        const nextColor = getGuildColor(nextTurn);

        return (
          <div key={boss.id} className="relative flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-xl border border-white/[0.04] bg-white/[0.02] backdrop-blur-md hover:border-amber-500/15 hover:bg-white/[0.03] transition-all">
            {/* Timeline indicator node */}
            <div className="absolute -left-[31px] top-1/2 -translate-y-1/2 h-4 w-4 rounded-full border-2 border-zinc-950 bg-[#08080a] flex items-center justify-center">
              <span className={`h-1.5 w-1.5 rounded-full ${
                boss.status === "AVAILABLE" ? "bg-emerald-400 shadow-[0_0_6px_#10b981]" : boss.status === "CLAIMED" ? "bg-amber-400 shadow-[0_0_6px_#f59e0b]" : "bg-zinc-600"
              }`} />
            </div>

            {/* Left: Spawn Time */}
            <div className="flex items-center gap-4 select-none shrink-0 min-w-[120px]">
              <div className="text-left">
                <span className="block text-xs font-semibold text-white">
                  {new Date(boss.spawnTime).toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit" })}
                </span>
                <span className="block text-[10px] text-zinc-500">
                  {new Date(boss.spawnTime).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                </span>
              </div>
            </div>

            {/* Middle Left: Boss Identity */}
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-zinc-900 border border-white/10 flex items-center justify-center shrink-0 overflow-hidden select-none">
                <img
                  src={boss.imageUrl || getBossImageUrl(boss.name)}
                  alt={boss.name}
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = "https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?w=100";
                  }}
                />
              </div>
              <div>
                <h4 className="font-bold text-white text-sm">{boss.name}</h4>
                <p className="text-[10px] text-zinc-500">
                  Level {boss.level} · {boss.location}
                </p>
              </div>
            </div>

            {/* Middle: Claim Ownership */}
            <div className="flex items-center gap-4 animate-fade-in">
              <div className="flex flex-col text-left">
                <span className="text-[9px] text-zinc-500 uppercase tracking-wider mb-1 select-none font-sans">Taken By:</span>
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[11px] font-semibold border select-none ${claimedColor.border} ${claimedColor.bg} ${claimedColor.text}`}
                >
                  {boss.claimedBy.toUpperCase()}
                </span>
              </div>

              <div className="flex flex-col text-left">
                <span className="text-[9px] text-zinc-500 uppercase tracking-wider mb-1 select-none font-sans">Next Turn</span>
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[11px] font-semibold border select-none ${nextColor.border} ${nextColor.bg} ${nextColor.text} shadow-[0_0_8px_rgba(245,158,11,0.05)]`}
                >
                  {nextTurn}
                </span>
              </div>
            </div>

            {/* Middle Right: Spawn Countdown */}
            <div className="flex flex-col min-w-[100px] select-none text-left">
              <span className="text-[9px] text-zinc-500 uppercase tracking-wider mb-1">Time Left</span>
              <span className={`text-xs font-mono font-bold ${tick.warning ? "text-amber-400 animate-pulse" : "text-emerald-400"}`}>
                {boss.status === "AVAILABLE" ? "READY / ALIVE" : tick.text}
              </span>
            </div>

            {/* Right: Actions */}
            <div className="shrink-0">
              <Button
                variant="ghost"
                size="xs"
                onClick={() => handleShiftTurn(boss.id)}
                className="text-[10px] uppercase font-bold"
              >
                Shift Turn
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
