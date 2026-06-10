import Card from "@/components/ui/Card";

interface FactionClaim {
  guildName: string;
  claimsCount: number;
  percentage: number;
}

interface FactionClaimsChartProps {
  data?: FactionClaim[];
}

const COLORS = ["#f59e0b", "#10b981", "#3b82f6", "#a855f7", "#ec4899", "#f43f5e"];
const BG_COLORS = [
  "bg-amber-500",
  "bg-emerald-500",
  "bg-blue-500",
  "bg-purple-500",
  "bg-pink-500",
  "bg-rose-500",
];

export default function FactionClaimsChart({ data }: FactionClaimsChartProps) {
  // Graceful empty state
  if (!data || data.length === 0) {
    return (
      <Card>
        <div className="mb-4">
          <span className="text-xs font-semibold text-white uppercase tracking-wider block">
            Faction Guild Boss Turn
          </span>
          <span className="text-[10px] text-zinc-500 block">
            Distribution of boss turns among rival high-tier guilds.
          </span>
        </div>
        <div className="relative w-full bg-[#070709] border border-white/[0.04] p-8 rounded-xl flex items-center justify-center min-h-[200px]">
          <span className="text-xs text-zinc-500 italic">No boss turn recorded.</span>
        </div>
      </Card>
    );
  }

  // Pre-calculate cumulative dashes and offsets for the donut visualization
  let accumulatedPercentage = 0;
  const segments = data.map((item, index) => {
    const percentage = item.percentage;
    const offset = -accumulatedPercentage;
    accumulatedPercentage += percentage;
    return {
      ...item,
      color: COLORS[index % COLORS.length],
      bgColor: BG_COLORS[index % BG_COLORS.length],
      dashArray: `${percentage} 100`,
      dashOffset: offset.toString(),
    };
  });

  const leadingFaction = data[0];
  const leadingText = leadingFaction ? `${leadingFaction.percentage}%` : "0%";
  const leadingLabel = leadingFaction ? `${leadingFaction.guildName} Lead` : "No Claims";

  return (
    <Card>
      <div className="mb-4">
        <span className="text-xs font-semibold text-white uppercase tracking-wider block">
          Faction Guild Boss Turn
        </span>
        <span className="text-[10px] text-zinc-500 block">
          Distribution of boss turns among rival high-tier guilds.
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center justify-center bg-[#070709] border border-white/[0.04] p-5 rounded-xl">
        {/* SVG Donut */}
        <div className="relative w-40 h-40 mx-auto shrink-0 flex items-center justify-center select-none">
          <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
            {/* Grey background circle */}
            <circle
              cx="18"
              cy="18"
              r="15.91"
              fill="none"
              stroke="rgba(255,255,255,0.03)"
              strokeWidth="3"
            />

            {/* Dynamic visual slices */}
            {segments.map((seg, i) => (
              <circle
                key={seg.guildName}
                cx="18"
                cy="18"
                r="15.91"
                fill="none"
                stroke={seg.color}
                strokeWidth="3"
                strokeDasharray={seg.dashArray}
                strokeDashoffset={seg.dashOffset}
                className="transition-all duration-300"
                style={{
                  filter: `drop-shadow(0 0 4px ${seg.color}33)`,
                }}
              />
            ))}
          </svg>

          {/* Center text summary */}
          <div className="absolute flex flex-col items-center text-center px-4 max-w-[120px] truncate">
            <span className="text-[20px] font-bold text-white leading-tight">
              {leadingText}
            </span>
            <span className="text-[7px] text-zinc-500 uppercase tracking-widest font-semibold mt-0.5 truncate block w-full">
              {leadingLabel}
            </span>
          </div>
        </div>

        {/* Donut Legend */}
        <div className="space-y-3 font-mono text-[10px] text-zinc-400 max-h-[160px] overflow-y-auto pr-1">
          {segments.map((seg) => (
            <div
              key={seg.guildName}
              className="flex items-center justify-between p-2 rounded-lg bg-zinc-950/40 border border-white/[0.02]"
            >
              <span className="flex items-center gap-2 truncate">
                <span className={`h-2 w-2 rounded shrink-0 ${seg.bgColor}`} />
                <span className="truncate">{seg.guildName}</span>
              </span>
              <span className="font-bold text-white shrink-0 ml-2">
                {seg.claimsCount} Claims ({seg.percentage}%)
              </span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}
