interface StatCardProps {
  title: string;
  value: string | number;
  subValue?: string | number;
  detail: string;
  type: "presence" | "points" | "raids" | "roster";
}

export default function StatCard({
  title,
  value,
  subValue,
  detail,
  type,
}: StatCardProps) {
  const dotColor = {
    presence: "bg-emerald-400",
    points: "bg-amber-400",
    raids: "bg-emerald-400",
    roster: "bg-blue-400",
  }[type];

  const valueColor = {
    presence: "text-white",
    points: "text-amber-400",
    raids: "text-emerald-400",
    roster: "text-white",
  }[type];

  return (
    <div className="relative p-5 rounded-2xl bg-[#0c0c10] border border-white/[0.05] flex flex-col justify-between hover:border-amber-500/25 transition-all duration-300 animate-scale-in">
      <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest leading-none">
        {title}
      </span>
      <div className="flex items-baseline gap-1 mt-4">
        <span className={`text-[32px] font-bold ${valueColor} leading-none`}>
          {value}
        </span>
        {subValue && (
          <span className="text-xs text-zinc-500 font-mono">{subValue}</span>
        )}
      </div>
      <div className="text-[10px] text-zinc-600 mt-2 font-mono flex items-center gap-1.5">
        <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} />
        <span>{detail}</span>
      </div>
    </div>
  );
}
