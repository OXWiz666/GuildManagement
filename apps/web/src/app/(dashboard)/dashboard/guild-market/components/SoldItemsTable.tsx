"use client";

import Card from "@/components/ui/Card";

interface SoldItemsTableProps {
  sales: any[];
  lootSearch: string;
  onSearchChange: (value: string) => void;
  currencySymbol: string;
  secondaryCurrencySymbol: string;
}

export default function SoldItemsTable({
  sales,
  lootSearch,
  onSearchChange,
  currencySymbol,
  secondaryCurrencySymbol,
}: SoldItemsTableProps) {
  return (
    <Card className="p-6 border border-white/[0.05] bg-[#0c0d12]/40 backdrop-blur rounded-3xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/[0.06] pb-4 mb-4">
        <div>
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">🛒 Sold items registry</h3>
          <p className="text-[10px] text-white/40 mt-1">Historical logs of boss loot sales and payout transactions.</p>
        </div>
        <div className="relative max-w-xs w-full">
          <input
            type="text"
            placeholder="Search sold items or category..."
            value={lootSearch}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full px-3 py-1.5 pl-8 rounded-lg bg-white/[0.03] border border-white/[0.06] text-xs text-white placeholder:text-white/20 focus:outline-none focus:border-white/20 transition-colors"
          />
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/25 text-xs">🔍</span>
        </div>
      </div>

      {sales.length === 0 ? (
        <div className="py-16 text-center text-xs text-white/35 italic">
          No sold items found. Lead active boss battles and input loot drops from the leader actions menu.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-[12px]">
            <thead>
              <tr className="border-b border-white/[0.06] bg-white/[0.01] text-[10px] text-white/45 font-bold uppercase tracking-wider">
                <th className="px-4 py-3">Sold Date</th>
                <th className="px-4 py-3">Item Name</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Boss Fight Source</th>
                <th className="px-4 py-3 text-right">Loot Total</th>
                <th className="px-4 py-3 text-right">Tax Deduction</th>
                <th className="px-4 py-3 text-right">Net Distributed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04] text-white/70">
              {sales.map((sale) => {
                const symbol =
                  sale.currency === "DIAMOND" ? secondaryCurrencySymbol : currencySymbol;
                return (
                  <tr key={sale.id} className="hover:bg-white/[0.01] transition-colors">
                    <td className="px-4 py-3 font-mono text-[11px] text-zinc-400">
                      {new Date(sale.createdAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-4 py-3 font-bold text-white">{sale.itemName}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded bg-white/[0.04] border border-white/[0.06] text-[8px] font-bold text-white/60">
                        {sale.category}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-zinc-400">
                      {sale.bossSchedule ? (
                        <span className="font-semibold text-zinc-300">⚔️ {sale.bossSchedule.bossName}</span>
                      ) : (
                        <span className="italic text-zinc-500">General Market</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-bold font-mono">
                      {symbol} {(Number(sale.saleValue) / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-cyan-400">
                      {symbol} {(Number(sale.taxAmount) / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                      <span className="text-[9px] text-zinc-500 font-normal"> ({sale.taxRatePercent}%)</span>
                    </td>
                    <td className="px-4 py-3 text-right font-bold font-mono text-emerald-400">
                      {symbol} {(Number(sale.netProfit) / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}
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
