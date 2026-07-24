import { useEffect, useState } from "react";
import type { AuditLogEntry, BossKilledHistoryDay, BossKilledHistoryEntry } from "@/lib/api";
import { Skeleton } from "@/components/ui/Skeleton";
import Button from "@/components/ui/Button";
import { getGuildColor } from "../utils/helpers";
import type { HistoryView, HistoryCategory, HistoryRange } from "../types";
import { HISTORY_VIEWS, HISTORY_CATEGORIES, HISTORY_RANGES } from "../constants";
import BossAvatar from "./BossAvatar";
import EmptyState from "./EmptyState";
import HistoryLedgerGrid from "./HistoryLedgerGrid";

type HistoryRow = BossKilledHistoryEntry & { date: string };

// The Ledger view is already bounded to a scrollable max-height grid keyed
// by day, but the flat table below has no such cap — a wide date range
// could mean hundreds of kill rows mounted at once. Reveal them a page at a
// time instead; "Load more" rather than numbered pages since rows are
// already newest-first and there's no reason to jump around.
const TABLE_PAGE_SIZE = 50;

export default function HistoryTab({
  historyView,
  onHistoryViewChange,
  historySearch,
  onHistorySearchChange,
  historyCategory,
  onHistoryCategoryChange,
  historyRange,
  onHistoryRangeChange,
  historyMonth,
  onHistoryMonthChange,
  killedHistoryMonth,
  isLoadingQueueChanges,
  filteredQueueChanges,
  isLoadingHistory,
  historyRows,
  filteredHistoryDays,
  categoryBossNames,
  canManage,
  onSelectKill,
  onEditKill,
}: {
  historyView: HistoryView;
  onHistoryViewChange: (value: HistoryView) => void;
  historySearch: string;
  onHistorySearchChange: (value: string) => void;
  historyCategory: HistoryCategory;
  onHistoryCategoryChange: (value: HistoryCategory) => void;
  historyRange: HistoryRange;
  onHistoryRangeChange: (value: HistoryRange) => void;
  historyMonth: string;
  onHistoryMonthChange: (value: string) => void;
  killedHistoryMonth: string;
  isLoadingQueueChanges: boolean;
  filteredQueueChanges: AuditLogEntry[];
  isLoadingHistory: boolean;
  historyRows: HistoryRow[];
  filteredHistoryDays: BossKilledHistoryDay[];
  categoryBossNames: string[];
  canManage: boolean;
  onSelectKill: (kill: BossKilledHistoryEntry) => void;
  onEditKill: (kill: BossKilledHistoryEntry) => void;
}) {
  const [visibleTableRows, setVisibleTableRows] = useState(TABLE_PAGE_SIZE);
  // historyRows is only a new array reference when the underlying filtered
  // data actually changes (it's a useMemo upstream) — reset back to page one
  // whenever a search/filter/range change swaps in a different result set.
  useEffect(() => {
    setVisibleTableRows(TABLE_PAGE_SIZE);
  }, [historyRows]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-white/[0.04] border border-white/[0.08] flex items-center justify-center shrink-0">
            <svg className="h-4 w-4 text-white/50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 3" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-white">Boss Killed History</p>
            <p className="text-xs text-white/45">Per-boss kill ledger and chronological timeline, plus recent queue changes.</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center bg-[var(--obsidian-elevated)]/40 backdrop-blur-md border border-[var(--metal-border)] rounded-lg p-1 gap-1">
            {HISTORY_VIEWS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => onHistoryViewChange(option.id)}
                className={`px-3.5 py-1.5 text-[12px] font-semibold rounded-md transition-all cursor-pointer focus-ring ${
                  historyView === option.id
                    ? "bg-white text-[#0c0d12]"
                    : "text-white/45 hover:text-white/75 border border-transparent hover:bg-white/[0.03]"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          <label className="relative block w-full sm:w-56">
            <span className="sr-only">Search boss history</span>
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              value={historySearch}
              onChange={(event) => onHistorySearchChange(event.target.value)}
              placeholder="Search boss name..."
              className="w-full pl-9 pr-3.5 py-2.5 rounded-lg bg-white/[0.03] border border-white/[0.08] text-[13px] text-white placeholder:text-white/35 focus:outline-none focus:border-[var(--forge-gold)]/40"
            />
          </label>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 rounded-xl border border-white/[0.06] bg-white/[0.025] p-1.5">
        <div className="inline-flex flex-wrap items-center gap-1">
          {HISTORY_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => onHistoryCategoryChange(cat.id)}
              className={`px-3.5 py-2 text-[12.5px] font-semibold rounded-lg transition-all cursor-pointer ${
                historyCategory === cat.id
                  ? "bg-[var(--forge-glow)] border border-[var(--forge-gold)]/25 text-[var(--forge-gold-bright)]"
                  : "text-white/45 hover:text-white/75 border border-transparent hover:bg-white/[0.03]"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2 pr-1">
          {HISTORY_RANGES.map((range) => (
            <button
              key={range.id}
              type="button"
              onClick={() => onHistoryRangeChange(range.id)}
              className={`px-3 py-1.5 text-[12px] font-semibold rounded-lg border transition-all cursor-pointer ${
                historyRange === range.id
                  ? "bg-white text-[#0c0d12] border-white"
                  : "text-white/50 border-white/[0.08] hover:text-white/80 hover:border-white/20"
              }`}
            >
              {range.label}
            </button>
          ))}
          {historyRange === "CUSTOM" && (
            <label className="block">
              <span className="sr-only">Custom history month</span>
              <input
                type="month"
                value={historyMonth || killedHistoryMonth}
                onChange={(event) => onHistoryMonthChange(event.target.value)}
                className="px-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.08] text-[12px] text-white focus:outline-none focus:border-[var(--forge-gold)]/40"
              />
            </label>
          )}
        </div>
      </div>

      {!isLoadingQueueChanges && filteredQueueChanges.length > 0 && (
        <section className="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] bg-white/[0.025] px-4 py-3">
            <h3 className="text-sm font-semibold text-white">Queue Changes</h3>
            <span className="text-[11px] text-white/35">{filteredQueueChanges.length} recent</span>
          </div>
          <div className="divide-y divide-white/[0.05]">
            {filteredQueueChanges.map((log) => {
              const bossName = typeof log.detail?.bossName === "string" ? log.detail.bossName : log.target || "Boss Rotation";
              const nextGuildName = typeof log.detail?.nextGuildName === "string" ? log.detail.nextGuildName : null;
              const nextColor = getGuildColor(nextGuildName || "");
              return (
                <div key={log.id} className="px-4 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                  <p className="text-[12px] text-white/70 truncate">
                    <span className="font-semibold text-white/90">{log.actor.displayName}</span> reordered{" "}
                    <span className="font-semibold text-white/90">{bossName}</span>&apos;s queue
                    {nextGuildName && (
                      <>
                        {" "}— next up:{" "}
                        <span className={`font-semibold ${nextColor.text}`}>{nextGuildName}</span>
                      </>
                    )}
                  </p>
                  <span className="text-[11px] text-white/35 shrink-0 font-mono">
                    {new Date(log.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {isLoadingHistory ? (
        <div className="space-y-2">
          {[1, 2, 3].map((item) => <Skeleton key={item} className="h-14 rounded-lg" />)}
        </div>
      ) : historyRows.length === 0 && filteredQueueChanges.length === 0 ? (
        <EmptyState
          title="No kills recorded for this range"
          body={`No ${historyCategory === "FIXED_HOUR" ? "Fixed-Hour" : "Fixed-Schedule"} boss kills found. Try a different range or category.`}
        />
      ) : historyRows.length === 0 ? null : historyView === "LEDGER" ? (
        <HistoryLedgerGrid
          days={filteredHistoryDays}
          bossNames={categoryBossNames}
          onSelectKill={onSelectKill}
          canEdit={canManage}
          onEditKill={onEditKill}
        />
      ) : (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-left">
              <thead>
                <tr className="border-b border-white/[0.06] bg-white/[0.03]">
                  <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.16em] text-white/40">Date</th>
                  <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.16em] text-white/40">Time</th>
                  <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.16em] text-white/40">Boss</th>
                  <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.16em] text-white/40">Taken by</th>
                  <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.16em] text-white/40">Recorded by</th>
                  <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.16em] text-white/40">Drops</th>
                  <th className="px-4 py-2.5" aria-hidden="true" />
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {historyRows.slice(0, visibleTableRows).map((kill) => {
                  const takenColor = getGuildColor(kill.takenGuildName || "");
                  return (
                    <tr key={kill.id} className="hover:bg-white/[0.02] transition-colors align-middle">
                      <td className="px-4 py-3 text-[12px] font-mono text-white/55 whitespace-nowrap">
                        {new Date(`${kill.date}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </td>
                      <td className="px-4 py-3 text-[12px] font-mono text-white/55 whitespace-nowrap">
                        {new Date(kill.killedAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td className="px-4 py-3 min-w-0">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <BossAvatar src={kill.bossImageUrl} name={kill.bossName} />
                          <div className="min-w-0">
                            <p className="text-[13px] font-semibold text-white truncate">{kill.bossName}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {kill.takenGuildName ? (
                          <span className={`text-[12px] font-semibold ${takenColor.text}`}>{kill.takenGuildName}</span>
                        ) : (
                          <span className="text-[12px] text-white/30">Unrecorded</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[12px] text-white/60 whitespace-nowrap">{kill.recordedBy.displayName}</td>
                      <td className="px-4 py-3 text-[12px] text-white/55 min-w-[220px]">
                        {kill.drops.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {kill.drops.map((drop, index) => (
                              <span
                                key={`${drop.itemName}-${index}`}
                                title={[drop.itemName, drop.rarity, drop.type].filter(Boolean).join(" - ")}
                                className="inline-flex max-w-[220px] items-center gap-1 rounded-md border border-white/[0.08] bg-white/[0.035] px-2 py-1 text-[11px] text-white/70"
                              >
                                {drop.iconUrl && (
                                  <img
                                    src={drop.iconUrl}
                                    alt=""
                                    loading="lazy"
                                    className="h-4 w-4 rounded object-cover border border-white/10"
                                  />
                                )}
                                <span className="truncate">{drop.itemName}</span>
                                {drop.quantity > 1 && <span className="text-white/35">x{drop.quantity}</span>}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-white/25">No drops recorded</span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center justify-end gap-2">
                        {canManage && (
                          <button
                            type="button"
                            onClick={() => onEditKill(kill)}
                            className="inline-flex h-7 items-center justify-center gap-1.5 rounded-md px-2 text-[11px] font-semibold text-[var(--forge-gold-bright)] transition-colors hover:bg-[var(--forge-gold)]/10 hover:text-[var(--forge-gold)] cursor-pointer"
                          >
                            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M12 20h9" />
                              <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                            </svg>
                            Edit
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onSelectKill(kill)}
                          className="inline-flex h-7 items-center justify-center rounded-md px-2 text-[11px] font-semibold text-emerald-300 transition-colors hover:bg-emerald-400/10 hover:text-emerald-200 cursor-pointer"
                        >
                          Details
                        </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {visibleTableRows < historyRows.length && (
            <div className="flex items-center justify-center border-t border-white/[0.06] py-3">
              <Button variant="ghost" size="sm" onClick={() => setVisibleTableRows((count) => count + TABLE_PAGE_SIZE)}>
                Load more ({historyRows.length - visibleTableRows} remaining)
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
