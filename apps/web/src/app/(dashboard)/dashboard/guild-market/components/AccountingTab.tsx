"use client";

import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import MarketStatCard from "./MarketStatCard";

interface AccountingTabProps {
  accounting: any;
  settings: any;
  filteredMembers: any[];
  memberSearch: string;
  onSearchChange: (value: string) => void;
  memberRoleFilter: string;
  onRoleFilterChange: (value: string) => void;
  ledgerPage: number;
  onPageChange: (page: number) => void;
}

const ROLE_OPTIONS = [
  { value: "ALL", label: "All roles" },
  { value: "GUILD_LEADER", label: "Guild Leader" },
  { value: "OFFICER", label: "Officer" },
  { value: "CORE_MEMBER", label: "Core Member" },
  { value: "ELITE_MEMBER", label: "Elite Member" },
  { value: "MEMBER", label: "Member" },
];

export default function AccountingTab({
  accounting,
  settings,
  filteredMembers,
  memberSearch,
  onSearchChange,
  memberRoleFilter,
  onRoleFilterChange,
  ledgerPage,
  onPageChange,
}: AccountingTabProps) {
  return (
    <div className="space-y-6">
      {/* Treasury statistics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MarketStatCard
          label="Guild Fund Treasury"
          symbol={accounting?.treasury?.primary?.currencySymbol || "₱"}
          value={accounting?.treasury?.primary?.fundBalance ?? 0}
          tone="gold"
          delay={0}
          secondary={
            accounting?.treasury?.secondary?.currencyCode
              ? `${accounting.treasury.secondary.currencySymbol} ${(accounting.treasury.secondary.fundBalance ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}`
              : undefined
          }
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
              <rect x="3" y="7" width="18" height="12" rx="2" />
              <path d="M3 11h18M7 15h2" />
              <path d="M7 7V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2" />
            </svg>
          }
        />
        <MarketStatCard
          label="Guild Tax Reserves"
          symbol={accounting?.treasury?.primary?.currencySymbol || "₱"}
          value={accounting?.treasury?.primary?.taxBalance ?? 0}
          tone="cyan"
          delay={80}
          secondary={
            accounting?.treasury?.secondary?.currencyCode
              ? `${accounting.treasury.secondary.currencySymbol} ${(accounting.treasury.secondary.taxBalance ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}`
              : undefined
          }
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
              <path d="M4 21V10l8-6 8 6v11" />
              <path d="M9 21v-6h6v6" />
            </svg>
          }
        />
        <MarketStatCard
          label="Total Expenses / Payouts"
          symbol={accounting?.treasury?.primary?.currencySymbol || "₱"}
          value={accounting?.treasury?.primary?.totalExpenses ?? 0}
          tone="rose"
          delay={160}
          secondary={
            accounting?.treasury?.secondary?.currencyCode
              ? `${accounting.treasury.secondary.currencySymbol} ${(accounting.treasury.secondary.totalExpenses ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}`
              : undefined
          }
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
              <path d="M22 7l-8.5 8.5-5-5L2 17" />
              <path d="M16 7h6v6" />
            </svg>
          }
        />
      </div>

      {/* Member Balance Board */}
      <Card className="p-6 border border-white/[0.05] bg-[#0c0d12]/40 backdrop-blur rounded-3xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/[0.06] pb-4 mb-4">
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">Member Balance board</h3>
            <p className="text-[10px] text-white/40 mt-1">Guild Points and net ledger balances.</p>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <select
              value={memberRoleFilter}
              onChange={(e) => onRoleFilterChange(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.06] text-xs text-white focus:outline-none focus:border-white/20 transition-colors cursor-pointer"
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
            <div className="relative max-w-xs w-full">
              <input
                type="text"
                placeholder="Search member by IGN..."
                value={memberSearch}
                onChange={(e) => onSearchChange(e.target.value)}
                className="w-full px-3 py-1.5 pl-8 rounded-lg bg-white/[0.03] border border-white/[0.06] text-xs text-white placeholder:text-white/20 focus:outline-none focus:border-white/20 transition-colors"
              />
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/25 text-xs"></span>
            </div>
          </div>
        </div>

        {filteredMembers.length === 0 ? (
          <div className="py-16 text-center text-xs text-white/35 italic">No member balances found.</div>
        ) : (
          <div className="overflow-auto scroll-fade-x max-h-[560px] rounded-xl">
            <table className="w-full border-collapse text-left text-[12px]">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-white/[0.08] bg-[#0d0e13] text-[10px] text-white/45 font-bold uppercase tracking-wider">
                  <th className="px-4 py-3">In-Game Name</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Class</th>
                  <th className="px-4 py-3 text-center">Combat Power</th>
                  <th className="px-4 py-3 text-center">Guild Points</th>
                  <th className="px-4 py-3 text-right">Total Payouts PHP</th>
                  <th className="px-4 py-3 text-right">Net Balance PHP</th>
                  {accounting?.treasury?.secondary?.currencyCode && (
                    <>
                      <th className="px-4 py-3 text-right">Total Payouts {accounting.treasury.secondary.currencyCode}</th>
                      <th className="px-4 py-3 text-right">Net Balance {accounting.treasury.secondary.currencyCode}</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04] text-white/70">
                {filteredMembers.map((m: any, index: number) => (
                  <tr
                    key={m.memberId}
                    className="market-row hover:bg-white/[0.02] transition-colors"
                    style={{ animationDelay: `${Math.min(index, 16) * 30}ms` }}
                  >
                    <td className="px-4 py-3 font-semibold text-white">{m.ign}</td>
                    <td className="px-4 py-3"><Badge role={m.role} /></td>
                    <td className="px-4 py-3 text-zinc-400">{m.class}</td>
                    <td className="px-4 py-3 text-center font-mono font-bold text-cyan-400">{m.cp.toLocaleString()}</td>
                    <td className="px-4 py-3 text-center font-mono font-bold text-amber-400">{m.dkp}</td>
                    <td className="px-4 py-3 text-right font-mono text-zinc-400">
                      {settings?.currencySymbol || "₱"}{" "}
                      {m.totalEarned.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                    </td>
                    <td className={`px-4 py-3 text-right font-bold font-mono ${m.balance >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                      {settings?.currencySymbol || "₱"}{" "}
                      {m.balance.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                    </td>
                    {accounting?.treasury?.secondary?.currencyCode && (
                      <>
                        <td className="px-4 py-3 text-right font-mono text-zinc-400">
                          {accounting.treasury.secondary.currencySymbol}{" "}
                          {m.secTotalEarned.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                        </td>
                        <td className={`px-4 py-3 text-right font-bold font-mono ${m.secBalance >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                          {accounting.treasury.secondary.currencySymbol}{" "}
                          {m.secBalance.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Treasury Transactions Ledger Logs Card */}
      <Card className="p-6 border border-white/[0.05] bg-[#0c0d12]/40 backdrop-blur rounded-3xl mt-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/[0.06] pb-4 mb-4">
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">Guild Treasury logs</h3>
            <p className="text-[10px] text-white/40 mt-1">Audit log of double-entry debit/credit member records.</p>
          </div>
        </div>

        {!accounting?.transactions || accounting.transactions.length === 0 ? (
          <div className="py-12 text-center text-xs text-white/35 italic">
            No guild treasury transaction ledger records found.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="overflow-auto scroll-fade-x max-h-[520px] rounded-xl">
              <table className="w-full border-collapse text-left text-[11px]">
                <thead className="sticky top-0 z-10">
                  <tr className="border-b border-white/[0.08] bg-[#0d0e13] text-[9px] text-white/45 font-bold uppercase tracking-wider">
                    <th className="px-3 py-2.5">Timestamp</th>
                    <th className="px-3 py-2.5">Account</th>
                    <th className="px-3 py-2.5">Type</th>
                    <th className="px-3 py-2.5">Description</th>
                    <th className="px-3 py-2.5 text-right">Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04] text-white/70">
                  {accounting.transactions.map((t: any, index: number) => {
                    const isCredit = t.entryType === "CREDIT";
                    const symbol =
                      t.currency === "DIAMOND"
                        ? settings?.secondaryCurrencySymbol || "💎"
                        : settings?.currencySymbol || "₱";
                    return (
                      <tr
                        key={t.id}
                        className="market-row hover:bg-white/[0.02] transition-colors"
                        style={{ animationDelay: `${Math.min(index, 16) * 25}ms` }}
                      >
                        <td className="px-3 py-2.5 font-mono text-[10px] text-zinc-400">
                          {new Date(t.createdAt).toLocaleString()}
                        </td>
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
                        <td className="px-3 py-2.5 text-zinc-300 max-w-xs truncate">{t.description}</td>
                        <td className={`px-3 py-2.5 text-right font-bold font-mono ${isCredit ? "text-emerald-400" : "text-rose-400"}`}>
                          {isCredit ? "+" : "-"}{symbol}{" "}
                          {t.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination Footer */}
            {accounting.pagination && accounting.pagination.totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-white/[0.04] pt-4 mt-2">
                <p className="text-[10px] text-zinc-500">
                  Showing page {accounting.pagination.page} of {accounting.pagination.totalPages} ({accounting.pagination.total} total logs)
                </p>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => onPageChange(accounting.pagination.page - 1)}
                    disabled={accounting.pagination.page <= 1}
                  >
                    ◀ Previous
                  </Button>
                  <span className="px-3 py-1 text-xs rounded bg-white/[0.04] text-white font-mono">
                    {accounting.pagination.page}
                  </span>
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => onPageChange(accounting.pagination.page + 1)}
                    disabled={accounting.pagination.page >= accounting.pagination.totalPages}
                  >
                    Next ▶
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
