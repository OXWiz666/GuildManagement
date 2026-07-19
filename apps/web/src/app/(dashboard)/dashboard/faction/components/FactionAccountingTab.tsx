"use client";

import { useState } from "react";
import { factionApi, type FactionAccountingData } from "@/lib/api";
import Card from "@/components/ui/Card";
import Avatar from "@/components/ui/Avatar";
import Button from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { useQuery } from "@/lib/query";

function money(value: number, symbol: string) {
  return `${symbol} ${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Faction Accounting — read-only rollup of every member guild's treasury.
 * Faction Leaders/Admins and members holding the Treasurer capability grant
 * only; per-member ledgers stay guild-scoped (see the Guild Market's own
 * Accounting tab) — this view is the faction-wide overview + combined log.
 */
export default function FactionAccountingTab({ canView }: { canView: boolean }) {
  const [page, setPage] = useState(1);
  const limit = 25;

  const { data, isLoading } = useQuery<FactionAccountingData | null>(
    canView ? `faction_accounting_p${page}` : "faction_accounting_locked",
    async () => {
      if (!canView) return null;
      const result = await factionApi.getAccounting(page, limit);
      return result.success && result.data ? result.data : null;
    },
    { persist: true, staleTime: 20000 },
  );

  if (!canView) {
    return (
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-8 text-center">
        <h3 className="text-sm font-semibold text-white/80">Accounting is restricted</h3>
        <p className="text-xs text-white/45 mt-1">
          Only Faction Leaders, Admins, and Faction Treasurers can view faction-wide accounting.
        </p>
      </div>
    );
  }

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
        </div>
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  const { guilds, totals, transactions, pagination } = data;

  return (
    <div className="space-y-6">
      {/* Faction-wide totals, grouped by currency */}
      {totals.length === 0 ? (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-8 text-center">
          <h3 className="text-sm font-semibold text-white/80">No faction treasury data yet</h3>
          <p className="text-xs text-white/45 mt-1">Guild treasuries will appear here once ledger activity begins.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {totals.map((t) => (
            <Card key={t.currencyCode} className="p-5 border border-white/[0.05] bg-[#0c0d12]/40 backdrop-blur rounded-2xl">
              <p className="text-[10px] uppercase tracking-[0.16em] text-white/45 font-bold">
                Faction Treasury · {t.currencyCode} <span className="text-white/25">({t.guildCount} guild{t.guildCount === 1 ? "" : "s"})</span>
              </p>
              <h3 className="text-xl font-bold font-mono text-white mt-2">{money(t.fundBalance, t.currencySymbol)}</h3>
              <p className="text-[11px] text-white/40 mt-1">Guild fund balance across factions guilds</p>
              <div className="grid grid-cols-2 gap-2 mt-4 pt-3 border-t border-white/[0.06]">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.14em] text-white/35">Tax reserves</p>
                  <p className="text-sm font-mono font-semibold text-cyan-300 mt-0.5">{money(t.taxBalance, t.currencySymbol)}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-[0.14em] text-white/35">Expenses</p>
                  <p className="text-sm font-mono font-semibold text-rose-300 mt-0.5">{money(t.totalExpenses, t.currencySymbol)}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Per-guild treasury breakdown */}
      <Card className="p-6 border border-white/[0.05] bg-[#0c0d12]/40 backdrop-blur rounded-3xl">
        <div className="border-b border-white/[0.06] pb-4 mb-4">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">Guild treasury breakdown</h3>
          <p className="text-[10px] text-white/40 mt-1">Fund, tax, and expenses per member guild — each in its own configured currency.</p>
        </div>

        {guilds.length === 0 ? (
          <div className="py-12 text-center text-xs text-white/35 italic">No member guilds yet.</div>
        ) : (
          <div className="overflow-auto scroll-fade-x rounded-xl">
            <table className="w-full border-collapse text-left text-[12px]">
              <thead>
                <tr className="border-b border-white/[0.08] bg-[#0d0e13] text-[10px] text-white/45 font-bold uppercase tracking-wider">
                  <th className="px-4 py-3">Guild</th>
                  <th className="px-4 py-3 text-right">Fund balance</th>
                  <th className="px-4 py-3 text-right">Tax reserves</th>
                  <th className="px-4 py-3 text-right">Expenses</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04] text-white/70">
                {guilds.map((g) => (
                  <tr key={g.guildId} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Avatar name={g.guildName} src={g.guildAvatarUrl} size="sm" />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-white truncate">{g.guildName}</p>
                          <p className="text-[10px] text-white/35">{g.currencyCode}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-white">{money(g.fundBalance, g.currencySymbol)}</td>
                    <td className="px-4 py-3 text-right font-mono text-cyan-300">{money(g.taxBalance, g.currencySymbol)}</td>
                    <td className="px-4 py-3 text-right font-mono text-rose-300">{money(g.totalExpenses, g.currencySymbol)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Combined faction-wide ledger */}
      <Card className="p-6 border border-white/[0.05] bg-[#0c0d12]/40 backdrop-blur rounded-3xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/[0.06] pb-4 mb-4">
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">Faction treasury logs</h3>
            <p className="text-[10px] text-white/40 mt-1">Combined ledger across every guild in the faction.</p>
          </div>
        </div>

        {transactions.length === 0 ? (
          <div className="py-12 text-center text-xs text-white/35 italic">No transaction ledger records found.</div>
        ) : (
          <div className="space-y-4">
            <div className="overflow-auto scroll-fade-x max-h-[520px] rounded-xl">
              <table className="w-full border-collapse text-left text-[11px]">
                <thead className="sticky top-0 z-10">
                  <tr className="border-b border-white/[0.08] bg-[#0d0e13] text-[9px] text-white/45 font-bold uppercase tracking-wider">
                    <th className="px-3 py-2.5">Timestamp</th>
                    <th className="px-3 py-2.5">Guild</th>
                    <th className="px-3 py-2.5">Account</th>
                    <th className="px-3 py-2.5">Type</th>
                    <th className="px-3 py-2.5">Description</th>
                    <th className="px-3 py-2.5 text-right">Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04] text-white/70">
                  {transactions.map((t) => {
                    const isCredit = t.entryType === "CREDIT";
                    return (
                      <tr key={t.id} className="hover:bg-white/[0.02] transition-colors">
                        <td className="px-3 py-2.5 font-mono text-[10px] text-zinc-400">
                          {new Date(t.createdAt).toLocaleString()}
                        </td>
                        <td className="px-3 py-2.5 text-zinc-300 max-w-[140px] truncate">{t.guildName}</td>
                        <td className="px-3 py-2.5">
                          <span className="px-1.5 py-0.5 rounded bg-white/[0.02] border border-white/[0.04] text-[8px] font-bold uppercase text-white/85">
                            {t.accountType}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <span className={`font-bold text-[9px] ${isCredit ? "text-emerald-400" : "text-rose-400"}`}>
                            {t.entryType}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-zinc-300 max-w-xs truncate">{t.description || "—"}</td>
                        <td className={`px-3 py-2.5 text-right font-bold font-mono ${isCredit ? "text-emerald-400" : "text-rose-400"}`}>
                          {isCredit ? "+" : "-"}{t.currency} {t.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between border-t border-white/[0.04] pt-4">
              <p className="text-[11px] text-zinc-500">
                Page {pagination.page} of {pagination.totalPages} · {pagination.total.toLocaleString()} records
              </p>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={pagination.page <= 1}
                  className="border border-white/[0.05]"
                >
                  Prev
                </Button>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                  disabled={pagination.page >= pagination.totalPages}
                  className="border border-white/[0.05]"
                >
                  Next
                </Button>
              </div>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
