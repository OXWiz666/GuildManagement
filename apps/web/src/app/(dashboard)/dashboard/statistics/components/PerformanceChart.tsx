import Card from "@/components/ui/Card";

interface PerformanceData {
  dayName: string;
  amount: number;
}

interface PerformanceChartProps {
  data?: PerformanceData[];
}

export default function PerformanceChart({ data }: PerformanceChartProps) {
  // If no data is available or all records are empty, show a premium empty state
  if (!data || data.length === 0) {
    return (
      <Card>
        <div className="mb-4">
          <span className="text-xs font-semibold text-white uppercase tracking-wider block">
            Field Boss Performance & Growth Trend
          </span>
          <span className="text-[10px] text-zinc-500 block">
            Credit accumulations over the last 7 calendar periods.
          </span>
        </div>
        <div className="relative w-full aspect-[2/1] bg-[#070709] border border-white/[0.04] rounded-xl flex items-center justify-center p-4">
          <span className="text-xs text-zinc-500 italic">No credit accumulations recorded.</span>
        </div>
      </Card>
    );
  }

  // Calculate coordinates mapping for dynamic SVG rendering
  const maxVal = Math.max(...data.map((d) => d.amount), 1);
  const points = data.map((d, i) => {
    const x = data.length > 1 ? (i / (data.length - 1)) * 100 : 50;
    const ratio = d.amount / maxVal;
    const y = 32 - ratio * 30; // Map between y = [2..32] for a 30px span
    return { x, y, label: d.dayName, val: d.amount };
  });

  // Construct line and shadow area paths
  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(" ");
  const areaPath = `${linePath} L 100 35 L 0 35 Z`;

  return (
    <Card>
      <div className="mb-4">
        <span className="text-xs font-semibold text-white uppercase tracking-wider block">
          Field Boss Performance & Growth Trend
        </span>
        <span className="text-[10px] text-zinc-500 block">
          Credit accumulations over the last 7 calendar periods.
        </span>
      </div>

      <div className="relative w-full aspect-[2/1] bg-[#070709] border border-white/[0.04] rounded-xl flex flex-col justify-between p-4 overflow-hidden">
        {/* Subtle Grid overlay */}
        <div className="absolute inset-0 bg-grid opacity-10 bg-grid-fade" />

        {/* SVG Chart */}
        <svg className="w-full h-full min-h-[140px] pt-4" viewBox="0 0 100 35" fill="none">
          {/* Shadow Area below line */}
          <path d={areaPath} fill="url(#goldGradient)" opacity="0.08" />

          {/* Glowing golden trendline */}
          <path
            d={linePath}
            stroke="#f59e0b"
            strokeWidth="0.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="drop-shadow-[0_0_8px_rgba(245,158,11,0.6)]"
          />

          {/* Dynamic Interactive points */}
          {points.map((p, i) => (
            <circle
              key={i}
              cx={p.x.toFixed(1)}
              cy={p.y.toFixed(1)}
              r="0.8"
              fill="#ffffff"
              stroke="#f59e0b"
              strokeWidth="0.4"
            />
          ))}

          {/* Gradients definitions */}
          <defs>
            <linearGradient id="goldGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f59e0b" />
              <stop offset="100%" stopColor="#08080a" stopOpacity="0" />
            </linearGradient>
          </defs>
        </svg>

        {/* Horizontal Labels */}
        <div className="flex items-center justify-between text-[8px] font-mono text-zinc-500 pt-2 border-t border-white/[0.04]">
          {data.map((d, i) => (
            <span key={i}>{d.dayName}</span>
          ))}
        </div>
      </div>
    </Card>
  );
}
