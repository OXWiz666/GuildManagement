"use client";

import { useMemo } from "react";
import Card from "@/components/ui/Card";

interface SoldItemsTableProps {
  sales: any[];
  lootSearch: string;
  onSearchChange: (value: string) => void;
  lootCategory: string;
  onCategoryChange: (value: string) => void;
  currencySymbol: string;
  secondaryCurrencySymbol: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  LOW_BOSS: "Low Boss",
  HIGH_BOSS: "High Boss",
  DUNGEON: "Dungeon",
  FFA: "FFA",
};

interface ActivityGroup {
  key: string;
  bossName: string | null;
  category: string;
  currency: string;
  date: string;
  loots: Array<{ id: string; name: string; value: number }>;
  totalSale: number;
  totalTax: number;
  totalNet: number;
  attendees: Array<{ userId: string; name: string }>;
}

export default function SoldItemsTable({
  sales,
  lootSearch,
  onSearchChange,
  lootCategory,
  onCategoryChange,
  currencySymbol,
  secondaryCurrencySymbol,
}: SoldItemsTableProps) {
  // Group individual loot sales into one row per activity (boss attendance).
  // Sales without a boss activity stay as their own standalone row.
  const groups = useMemo<ActivityGroup[]>(() => {
    const map = new Map<string, ActivityGroup>();
    for (const sale of sales) {
      const key = sale.bossScheduleId || `solo-${sale.id}`;
      let group = map.get(key);
      if (!group) {
        group = {
          key,
          bossName: sale.bossSchedule?.bossName ?? null,
          category: sale.category,
          currency: sale.currency,
          date: sale.createdAt,
          loots: [],
          totalSale: 0,
          totalTax: 0,
          totalNet: 0,
          attendees: sale.attendees ?? [],
        };
        map.set(key, group);
      }
      group.loots.push({
        id: sale.id,
        name: sale.itemName,
        value: Number(sale.saleValue) / 100,
      });
      group.totalSale += Number(sale.saleValue) / 100;
      group.totalTax += Number(sale.taxAmount) / 100;
      group.totalNet += Number(sale.netProfit) / 100;
      // Keep the earliest date as the activity date
      if (new Date(sale.createdAt) < new Date(group.date)) group.date = sale.createdAt;
    }
    return Array.from(map.values());
  }, [sales]);

  return (
    <Card className="p-6 border border-white/[0.05] bg-[#0c0d12]/40 backdrop-blur rounded-3xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/[0.06] pb-4 mb-4">
        <div>
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">🛒 Sold items registry</h3>
          <p className="text-[10px] text-white/40 mt-1">Loot sales grouped per activity, with tax, net profit and attendees.</p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <select
            value={lootCategory}
            onChange={(e) => onCategoryChange(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.06] text-xs text-white focus:outline-none focus:border-white/20 transition-colors cursor-pointer"
          >
            <option value="ALL">All categories</option>
            {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <div className="relative max-w-xs w-full">
            <input
              type="text"
              placeholder="Search loot, activity or category..."
              value={lootSearch}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full px-3 py-1.5 pl-8 rounded-lg bg-white/[0.03] border border-white/[0.06] text-xs text-white placeholder:text-white/20 focus:outline-none focus:border-white/20 transition-colors"
            />
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/25 text-xs">🔍</span>
          </div>
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="py-16 text-center text-xs text-white/35 italic">
          No sold items found. Log loot drops from an activity using the “Log sold items” action above.
        </div>
      ) : (
        <div className="overflow-auto max-h-[600px] rounded-xl">
          <table className="w-full border-collapse text-left text-[12px]">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-white/[0.08] bg-[#0d0e13] text-[10px] text-white/45 font-bold uppercase tracking-wider">
                <th className="px-4 py-3">Loot</th>
                <th className="px-4 py-3">Activity</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3 text-right">Guild Tax</th>
                <th className="px-4 py-3 text-right">Net Profit</th>
                <th className="px-4 py-3">Total Attendees</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04] text-white/70 align-top">
              {groups.map((group, index) => {
                const symbol = group.currency === "DIAMOND" ? secondaryCurrencySymbol : currencySymbol;
                const categoryLabel = CATEGORY_LABELS[group.category] ?? group.category;
                return (
                  <tr
                    key={group.key}
                    className="market-row hover:bg-white/[0.02] transition-colors"
                    style={{ animationDelay: `${Math.min(index, 16) * 35}ms` }}
                  >
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        {group.loots.map((loot) => (
                          <div key={loot.id} className="flex items-center justify-between gap-3">
                            <span className="font-semibold text-white">{loot.name}</span>
                            <span className="font-mono text-[10px] text-zinc-500">
                              {symbol} {loot.value.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                        ))}
                        {group.loots.length > 1 && (
                          <span className="text-[9px] text-zinc-600 mt-0.5">{group.loots.length} loots</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-zinc-400 whitespace-nowrap">
                      {group.bossName ? (
                        <span className="font-semibold text-zinc-300">⚔️ {group.bossName}</span>
                      ) : (
                        <span className="italic text-zinc-500">General Market</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded bg-white/[0.04] border border-white/[0.06] text-[8px] font-bold uppercase text-white/60 whitespace-nowrap">
                        {categoryLabel}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px] text-zinc-400 whitespace-nowrap">
                      {new Date(group.date).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </td>
                    <td className="px-4 py-3 text-right font-bold font-mono whitespace-nowrap">
                      {symbol} {group.totalSale.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-cyan-400 whitespace-nowrap">
                      {symbol} {group.totalTax.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3 text-right font-bold font-mono text-emerald-400 whitespace-nowrap">
                      {symbol} {group.totalNet.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3">
                      {group.attendees.length === 0 ? (
                        <span className="text-[10px] italic text-zinc-600">—</span>
                      ) : (
                        <div className="max-w-[220px]">
                          <span className="text-[10px] font-bold text-amber-400">
                            {group.attendees.length} member{group.attendees.length > 1 ? "s" : ""}
                          </span>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {group.attendees.map((a) => (
                              <span
                                key={a.userId}
                                className="px-1.5 py-0.5 rounded bg-white/[0.04] border border-white/[0.06] text-[9px] text-white/70"
                              >
                                {a.name}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
