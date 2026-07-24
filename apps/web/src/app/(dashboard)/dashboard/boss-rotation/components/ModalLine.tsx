export default function ModalLine({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "amber" | "emerald" }) {
  const toneClass = tone === "amber"
    ? "text-amber-300"
    : tone === "emerald"
      ? "text-emerald-300"
      : "text-white/80";

  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[11px] text-white/40">{label}</span>
      <span className={`text-[12px] font-semibold text-right ${toneClass}`}>{value}</span>
    </div>
  );
}
