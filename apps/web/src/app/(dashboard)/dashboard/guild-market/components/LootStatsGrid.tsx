"use client";

import MarketStatCard from "./MarketStatCard";

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
      <MarketStatCard
        label="Total Drops Value Sold"
        symbol={currencySymbol}
        value={totalLootSoldVal}
        tone="gold"
        delay={0}
        hint="From all historical sales logs"
        icon={
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
            <ellipse cx="12" cy="6" rx="8" ry="3" />
            <path d="M4 6v6c0 1.66 3.58 3 8 3s8-1.34 8-3V6" />
            <path d="M4 12v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6" />
          </svg>
        }
      />
      <MarketStatCard
        label="Accumulated Guild Tax"
        symbol={currencySymbol}
        value={totalTaxVal}
        tone="cyan"
        delay={80}
        hint={`Tax value of ${taxRatePercent}% for treasury fund`}
        icon={
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
            <path d="M4 21V10l8-6 8 6v11" />
            <path d="M9 21v-6h6v6" />
          </svg>
        }
      />
      <MarketStatCard
        label="Net Member Dividends"
        symbol={currencySymbol}
        value={totalDividendsVal}
        tone="emerald"
        delay={160}
        hint="Total split payout among boss attendees"
        icon={
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
        }
      />
    </div>
  );
}
