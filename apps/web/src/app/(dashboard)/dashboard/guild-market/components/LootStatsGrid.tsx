"use client";

import Card from "@/components/ui/Card";

interface LootStatsGridProps {
  currencySymbol: string;
  totalLootSoldVal: number;
  totalTaxVal: number;
  totalDividendsVal: number;
  taxRatePercent: number;
}

export default function LootStatsGrid({
  currencySymbol,
  totalLootSoldVal,
  totalTaxVal,
  totalDividendsVal,
  taxRatePercent,
}: LootStatsGridProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <Card className="p-5 border border-white/[0.05] bg-[#0c0d12]/40 backdrop-blur">
        <p className="text-[10px] text-white/40 uppercase tracking-widest font-bold">Total Drops Value Sold</p>
        <h3 className="text-xl sm:text-2xl font-bold font-mono text-white mt-1.5">
          {currencySymbol} {totalLootSoldVal.toLocaleString("en-US", { minimumFractionDigits: 2 })}
        </h3>
        <p className="text-[10px] text-zinc-500 mt-1">From all historical sales logs</p>
      </Card>
      <Card className="p-5 border border-white/[0.05] bg-[#0c0d12]/40 backdrop-blur">
        <p className="text-[10px] text-white/40 uppercase tracking-widest font-bold">Accumulated Guild Tax</p>
        <h3 className="text-xl sm:text-2xl font-bold font-mono text-cyan-400 mt-1.5">
          {currencySymbol} {totalTaxVal.toLocaleString("en-US", { minimumFractionDigits: 2 })}
        </h3>
        <p className="text-[10px] text-zinc-500 mt-1">Tax value of {taxRatePercent}% for treasury fund</p>
      </Card>
      <Card className="p-5 border border-white/[0.05] bg-[#0c0d12]/40 backdrop-blur">
        <p className="text-[10px] text-white/40 uppercase tracking-widest font-bold">Net Member Dividends</p>
        <h3 className="text-xl sm:text-2xl font-bold font-mono text-emerald-400 mt-1.5">
          {currencySymbol} {totalDividendsVal.toLocaleString("en-US", { minimumFractionDigits: 2 })}
        </h3>
        <p className="text-[10px] text-zinc-500 mt-1">Total split payout among boss attendees</p>
      </Card>
    </div>
  );
}
