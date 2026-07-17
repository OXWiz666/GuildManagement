import { getBossImageUrl } from "@guild/shared";
import Button from "@/components/ui/Button";
import { getGuildColor, getTickingCountdown, type RotationBoss } from "../utils/helpers";

interface BossCardViewProps {
  filteredBosses: RotationBoss[];
  currentTime: number;
  selectedGuildFilter: string;
  setSelectedGuildFilter: (val: string) => void;
  handleShiftTurn: (bossId: string) => void;
}

export default function BossCardView({
  filteredBosses,
  currentTime,
  selectedGuildFilter,
  setSelectedGuildFilter,
  handleShiftTurn,
}: BossCardViewProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-5 animate-scale-in">
      {filteredBosses.map((boss) => {
        const tick = getTickingCountdown(boss.spawnTime, currentTime);
        const isPriority = !tick.expired && tick.warning;
        const claimedColor = getGuildColor(boss.claimedBy);

        return (
          <div
            key={boss.id}
            className={`group relative flex flex-col justify-between rounded-2xl border p-4 transition-all duration-300 hover:scale-[1.03] hover:-translate-y-1 backdrop-blur-sm ${
              isPriority
                ? "bg-white/[0.03] border-amber-500/35 shadow-[0_0_20px_rgba(245,158,11,0.10)]"
                : boss.status === "CLAIMED"
                  ? "bg-white/[0.025] border-white/[0.07] hover:border-amber-500/20 hover:shadow-[0_8px_30px_rgba(0,0,0,0.4)]"
                  : "bg-white/[0.025] border-white/[0.05] hover:border-white/[0.12] hover:shadow-[0_8px_30px_rgba(0,0,0,0.5)]"
            }`}
          >
            {/* Amber gradient header wash on claimed/priority */}
            {(isPriority || boss.status === "CLAIMED") && (
              <div
                aria-hidden
                className="absolute inset-x-0 top-0 h-24 rounded-t-2xl pointer-events-none"
                style={{
                  background: "linear-gradient(180deg, rgba(245,158,11,0.06) 0%, transparent 100%)",
                }}
              />
            )}
            {/* Status Indicator & Image */}
            <div className="relative w-full aspect-[4/3] rounded-xl overflow-hidden bg-zinc-950 border border-white/[0.06] mb-3.5 select-none">
              <img
                src={boss.imageUrl || getBossImageUrl(boss.name)}
                alt={boss.name}
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover transform scale-100 group-hover:scale-110 group-hover:brightness-110 transition-all duration-700 ease-in-out"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = "https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?w=400";
                }}
              />
              {/* Premium Sweep-Shine Hover Animation */}
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.08] to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-out pointer-events-none" />

              {/* Status capsule overlay */}
              {boss.status !== "LOCKED" && (
                <div className="absolute top-2 left-2 px-2.5 py-0.5 rounded-full bg-black/60 backdrop-blur-md border border-white/10 flex items-center gap-1.5">
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      boss.status === "AVAILABLE"
                        ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]"
                        : boss.status === "CLAIMED"
                          ? "bg-amber-400 shadow-[0_0_6px_rgba(245,158,11,0.6)]"
                          : boss.status === "DEAD"
                            ? "bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.6)]"
                            : "bg-zinc-650"
                    }`}
                  />
                  <span className="text-[9px] font-bold uppercase tracking-wider text-white/90">
                    {boss.status}
                  </span>
                </div>
              )}
            </div>

            {/* Boss Name & Timer */}
            <div className="space-y-1 mb-4 select-none animate-fade-in">
              <h4 className="font-bold text-white text-[14px] truncate leading-tight">
                {boss.name}
              </h4>
              <div className="text-[10px] text-zinc-500 flex items-center gap-1">
                <span>lvl {boss.level}</span>
                <span>·</span>
                <span className="truncate">{boss.location}</span>
              </div>

              {/* Spawn Timer */}
              <div className="pt-2 animate-fade-in">
                <span className="block text-[8px] text-zinc-500 uppercase tracking-widest leading-none mb-1">
                  {boss.status === "DEAD" ? "Respawning In" : "Next Spawn"}
                </span>
                <span
                  className={`block text-[13px] font-mono leading-none ${
                    isPriority
                      ? "text-amber-400 font-bold animate-pulse"
                      : boss.status === "AVAILABLE"
                        ? "text-emerald-400 font-medium"
                        : "text-white/80"
                  }`}
                >
                  {boss.status === "AVAILABLE" ? "READY / ALIVE" : tick.text}
                </span>
                <span className="block text-[9px] text-white/35 mt-1 font-sans">
                  {new Date(boss.spawnTime).toLocaleDateString("en-US", { weekday: "short" })}{" "}
                  {new Date(boss.spawnTime).toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            </div>

            {/* Taken By Guild Badge */}
            <div className="mb-4">
              <span className="block text-[8px] text-zinc-500 uppercase tracking-widest leading-none mb-1.5 select-none">
                Taken By:
              </span>
              <div
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-semibold select-none ${claimedColor.border} ${claimedColor.bg} ${claimedColor.text}`}
              >
                <svg className="h-3 w-3 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
                {boss.claimedBy.toUpperCase()}
              </div>
            </div>

            {/* Rotation Queue list */}
            <div className="border-t border-white/[0.04] pt-3 mb-4 space-y-2">
              <span className="block text-[9px] text-amber-500/80 uppercase tracking-widest leading-none select-none font-extrabold mb-1">
                Rotation Queue
              </span>
              <div className="space-y-1.5">
                {boss.rotationQueue.map((g, idx) => {
                  const isNextTurn = idx === 1;
                  const queueGuildColor = getGuildColor(g);
                  return (
                    <div
                      key={g}
                      className={`w-full flex items-center justify-between text-[11.5px] font-semibold px-2 py-1.5 rounded-lg select-none ${
                        isNextTurn
                          ? `${queueGuildColor.bg} ${queueGuildColor.border} border text-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.08)]`
                          : "bg-white/[0.02] border border-white/[0.04] text-zinc-300"
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: queueGuildColor.dot }} />
                        <span className={isNextTurn ? "text-amber-500 font-bold" : "text-zinc-500 font-bold"}>
                          {idx + 1}.
                        </span>
                        <span className="font-semibold tracking-wide">{g}</span>
                      </span>
                      {isNextTurn && (
                        <span className="text-[8px] uppercase tracking-wider text-amber-500 font-bold px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20">
                          Next Turn
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Claim Button / Shift Turn */}
            <div className="pt-1">
              <Button
                variant="ghost"
                size="xs"
                onClick={() => handleShiftTurn(boss.id)}
                className="w-full text-[10px] uppercase font-bold tracking-wider hover:bg-amber-500/10 hover:border-amber-500/35 hover:text-amber-400 shrink-0"
              >
                Next Turn
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
