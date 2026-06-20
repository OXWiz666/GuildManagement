"use client";

import { type BossScheduleData } from "@/lib/api";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";

const CATEGORIES = [
  { value: "LOW_BOSS", label: "Low Boss" },
  { value: "HIGH_BOSS", label: "High Boss" },
  { value: "DUNGEON", label: "Dungeon" },
  { value: "FFA", label: "FFA" },
] as const;

interface RecordSaleModalProps {
  settings: any;
  schedules: BossScheduleData[];
  category: string;
  bossScheduleId: string;
  soldDate: string;
  currency: string;
  items: Array<{ itemName: string; saleValue: string }>;
  attendees: Array<{ userId: string; name: string }>;
  isLoadingAttendees: boolean;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  onCategoryChange: (v: string) => void;
  onBossScheduleChange: (v: string) => void;
  onSoldDateChange: (v: string) => void;
  onCurrencyChange: (v: string) => void;
  onAddItem: () => void;
  onRemoveItem: (index: number) => void;
  onItemChange: (index: number, field: "itemName" | "saleValue", value: string) => void;
}

export default function RecordSaleModal({
  settings,
  schedules,
  category,
  bossScheduleId,
  soldDate,
  currency,
  items,
  attendees,
  isLoadingAttendees,
  isSubmitting,
  onClose,
  onSubmit,
  onCategoryChange,
  onBossScheduleChange,
  onSoldDateChange,
  onCurrencyChange,
  onAddItem,
  onRemoveItem,
  onItemChange,
}: RecordSaleModalProps) {
  const taxRate = settings?.taxRatePercent ?? 10;
  const totalSale = items.reduce((acc, it) => acc + (parseFloat(it.saleValue) || 0), 0);
  const taxAmount = totalSale * (taxRate / 100);
  const netProfit = totalSale - taxAmount;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4 py-8 overflow-y-auto">
      <Card className="w-full max-w-2xl p-6 bg-[#0c0d12] border border-white/[0.10] rounded-3xl space-y-4 animate-scale-in relative my-auto">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-white/40 hover:text-white/80 transition-colors cursor-pointer"
        >
          ✕
        </button>
        <div>
          <h3 className="text-[16px] font-bold text-white tracking-tight">Log sold items from an activity</h3>
          <p className="text-[11px] text-white/40 mt-1">
            Record every loot sold from one activity. Taxes and dividends split among the boss attendees below.
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          {/* Activity meta: category / activity / date / currency */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-white/50 uppercase tracking-wider">Category</label>
              <select
                value={category}
                onChange={(e) => onCategoryChange(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.08] text-[13px] text-white focus:outline-none"
              >
                {CATEGORIES.map((cat) => (
                  <option className="bg-[#0c0d12]" key={cat.value} value={cat.value}>
                    {cat.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-white/50 uppercase tracking-wider">Activity (Boss Attendance)</label>
              <select
                value={bossScheduleId}
                onChange={(e) => onBossScheduleChange(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.08] text-[13px] text-white focus:outline-none"
              >
                <option className="bg-[#0c0d12]" value="">General Market (No attendees)</option>
                {schedules
                  .filter((s) => s.status === "KILLED")
                  .map((s) => (
                    <option className="bg-[#0c0d12]" key={s.id} value={s.id}>
                      {s.bossName} ({new Date(s.spawnTime).toLocaleDateString()})
                    </option>
                  ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-white/50 uppercase tracking-wider">Activity Date</label>
              <input
                type="date"
                value={soldDate}
                onChange={(e) => onSoldDateChange(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.08] text-[13px] text-white focus:outline-none [color-scheme:dark]"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-white/50 uppercase tracking-wider">Currency</label>
              <select
                value={currency}
                onChange={(e) => onCurrencyChange(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.08] text-[13px] text-white focus:outline-none"
              >
                <option className="bg-[#0c0d12]" value={settings?.currencyCode || "PHP"}>
                  {settings?.currencyCode || "PHP"}
                </option>
                {settings?.secondaryCurrencyCode && (
                  <option className="bg-[#0c0d12]" value={settings.secondaryCurrencyCode}>
                    {settings.secondaryCurrencyCode}
                  </option>
                )}
              </select>
            </div>
          </div>

          {/* Loot item rows (many loots per activity) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-bold text-white/50 uppercase tracking-wider">Loot Items</label>
              <button
                type="button"
                onClick={onAddItem}
                className="text-[11px] font-semibold text-emerald-400 hover:text-emerald-300 transition-colors cursor-pointer"
              >
                + Add loot
              </button>
            </div>
            <div className="space-y-2">
              {items.map((item, index) => (
                <div key={index} className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Loot name (e.g. Serus Greatsword)"
                    value={item.itemName}
                    onChange={(e) => onItemChange(index, "itemName", e.target.value)}
                    className="flex-1 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.08] text-[13px] text-white placeholder:text-white/20 focus:outline-none focus:border-white/20"
                  />
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Sale price"
                    value={item.saleValue}
                    onChange={(e) => onItemChange(index, "saleValue", e.target.value)}
                    className="w-32 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.08] text-[13px] text-white placeholder:text-white/20 focus:outline-none focus:border-white/20 font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => onRemoveItem(index)}
                    disabled={items.length <= 1}
                    className="w-8 h-8 flex items-center justify-center rounded-lg text-white/30 hover:text-rose-400 hover:bg-white/[0.04] transition-colors cursor-pointer disabled:opacity-25 disabled:cursor-not-allowed"
                    aria-label="Remove loot"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Distribution preview */}
          {totalSale > 0 && (
            <div className="p-3.5 rounded-xl border border-white/[0.06] bg-[#07080b]/80 space-y-2.5 font-mono text-[10px] text-zinc-400">
              <p className="text-[9px] uppercase tracking-wider font-bold text-white pb-1.5 border-b border-white/[0.05]">
                Live profit distribution preview ({items.filter((i) => parseFloat(i.saleValue) > 0).length} loots)
              </p>
              <div className="flex justify-between">
                <span>Total sale value:</span>
                <span className="text-white font-bold">{currency} {totalSale.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span>Guild tax accumulated ({taxRate}%):</span>
                <span className="text-cyan-400">-{currency} {taxAmount.toLocaleString()}</span>
              </div>
              <div className="flex justify-between border-t border-white/[0.05] pt-2">
                <span>Net profit split:</span>
                <span className="text-emerald-400 font-bold">{currency} {netProfit.toLocaleString()}</span>
              </div>
              {bossScheduleId ? (
                <div className="border-t border-white/[0.05] pt-2 space-y-1.5">
                  <div className="flex justify-between items-center text-zinc-400">
                    <span>Checked-in attendees:</span>
                    <span className="px-1.5 py-0.25 rounded bg-zinc-800 text-white font-bold">
                      {isLoadingAttendees ? "..." : `${attendees.length} players`}
                    </span>
                  </div>
                  {!isLoadingAttendees && attendees.length > 0 ? (
                    <>
                      <div className="flex flex-wrap gap-1">
                        {attendees.map((a) => (
                          <span
                            key={a.userId}
                            className="px-1.5 py-0.5 rounded bg-white/[0.04] border border-white/[0.06] text-[9px] text-white/70"
                          >
                            {a.name}
                          </span>
                        ))}
                      </div>
                      <div className="flex justify-between text-white font-semibold pt-1">
                        <span>Share per attendee ({settings?.activeShareModel ?? "EQUAL"}):</span>
                        <span className="text-emerald-400">
                          {currency} {(netProfit / attendees.length).toLocaleString("en-US", { maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    </>
                  ) : !isLoadingAttendees ? (
                    <p className="text-rose-400 italic text-[9px] mt-1.5">
                      No checked-in attendees found for this activity. Payout will fail unless attendees have check-in records.
                    </p>
                  ) : null}
                </div>
              ) : (
                <p className="text-cyan-400 italic text-[9px] border-t border-white/[0.05] pt-2">
                  Direct allocation to Guild treasury funds (no activity/attendees selected).
                </p>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-white/[0.06]">
            <Button variant="ghost" size="sm" type="button" onClick={onClose}>Cancel</Button>
            <Button variant="primary" size="sm" type="submit" isLoading={isSubmitting}>
              Log sold items
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
