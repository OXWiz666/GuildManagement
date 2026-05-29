"use client";

import { type BossScheduleData } from "@/lib/api";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";

const CATEGORIES = ["WEAPON", "ARMOR", "ACCESSORY", "MATERIAL", "SCROLL", "OTHER"] as const;

interface RecordSaleModalProps {
  settings: any;
  schedules: BossScheduleData[];
  saleItemName: string;
  saleCategory: string;
  saleBossScheduleId: string;
  saleValue: string;
  saleCurrency: string;
  previewAttendees: any[];
  isLoadingPreview: boolean;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  onItemNameChange: (v: string) => void;
  onCategoryChange: (v: string) => void;
  onBossScheduleChange: (v: string) => void;
  onValueChange: (v: string) => void;
  onCurrencyChange: (v: string) => void;
}

export default function RecordSaleModal({
  settings,
  schedules,
  saleItemName,
  saleCategory,
  saleBossScheduleId,
  saleValue,
  saleCurrency,
  previewAttendees,
  isLoadingPreview,
  isSubmitting,
  onClose,
  onSubmit,
  onItemNameChange,
  onCategoryChange,
  onBossScheduleChange,
  onValueChange,
  onCurrencyChange,
}: RecordSaleModalProps) {
  const taxRate = settings?.taxRatePercent ?? 10;
  const saleNum = parseFloat(saleValue);
  const taxAmount = saleNum * (taxRate / 100);
  const netProfit = saleNum - taxAmount;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
      <Card className="w-full max-w-lg p-6 bg-[#0c0d12] border border-white/[0.10] rounded-3xl space-y-4 animate-scale-in relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-white/40 hover:text-white/80 transition-colors cursor-pointer"
        >
          ✕
        </button>
        <h3 className="text-[16px] font-bold text-white tracking-tight">🛒 Record new boss loot sale</h3>
        <p className="text-[11px] text-white/40">Compute taxes and split profit among present members who checking in.</p>

        <form onSubmit={onSubmit} className="space-y-4">
          <Input
            label="Item Name"
            placeholder="e.g. Shield of Protection"
            value={saleItemName}
            onChange={(e) => onItemNameChange(e.target.value)}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-white/50 uppercase tracking-wider">Category</label>
              <select
                value={saleCategory}
                onChange={(e) => onCategoryChange(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.08] text-[13px] text-white focus:outline-none"
              >
                {CATEGORIES.map((cat) => (
                  <option className="bg-[#0c0d12]" key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-white/50 uppercase tracking-wider">Boss Fight Origin (Optional)</label>
              <select
                value={saleBossScheduleId}
                onChange={(e) => onBossScheduleChange(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.08] text-[13px] text-white focus:outline-none"
              >
                <option className="bg-[#0c0d12]" value="">General Market (Direct to Treasury)</option>
                {schedules
                  .filter((s) => s.status === "KILLED")
                  .map((s) => (
                    <option className="bg-[#0c0d12]" key={s.id} value={s.id}>
                      ⚔️ {s.bossName} ({new Date(s.spawnTime).toLocaleDateString()})
                    </option>
                  ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Sale Price"
              type="number"
              step="0.01"
              placeholder="e.g. 5000"
              value={saleValue}
              onChange={(e) => onValueChange(e.target.value)}
            />

            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-white/50 uppercase tracking-wider">Currency</label>
              <select
                value={saleCurrency}
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

          {/* Splitting Preview Box */}
          {saleValue && saleNum > 0 && (
            <div className="p-3.5 rounded-xl border border-white/[0.06] bg-[#07080b]/80 space-y-2.5 font-mono text-[10px] text-zinc-400">
              <p className="text-[9px] uppercase tracking-wider font-bold text-white pb-1.5 border-b border-white/[0.05]">
                ⚖️ live profit distribution preview
              </p>
              <div className="flex justify-between">
                <span>Total sale value:</span>
                <span className="text-white font-bold">{saleCurrency} {saleNum.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span>Guild tax accumulated ({taxRate}%):</span>
                <span className="text-cyan-400">-{saleCurrency} {taxAmount.toLocaleString()}</span>
              </div>
              <div className="flex justify-between border-t border-white/[0.05] pt-2">
                <span>Net profit split:</span>
                <span className="text-emerald-400 font-bold">{saleCurrency} {netProfit.toLocaleString()}</span>
              </div>
              {saleBossScheduleId ? (
                <div className="border-t border-white/[0.05] pt-2 space-y-1.5">
                  <div className="flex justify-between items-center text-zinc-400">
                    <span>Checked-in Attendees:</span>
                    <span className="px-1.5 py-0.25 rounded bg-zinc-800 text-white font-bold">
                      {isLoadingPreview ? "..." : `${previewAttendees.length} players`}
                    </span>
                  </div>
                  {!isLoadingPreview && previewAttendees.length > 0 ? (
                    <div className="flex justify-between text-white font-semibold">
                      <span>Share per attendee ({settings?.activeShareModel ?? "EQUAL"}):</span>
                      <span className="text-emerald-400">
                        {saleCurrency} {(netProfit / previewAttendees.length).toLocaleString("en-US", { maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  ) : !isLoadingPreview ? (
                    <p className="text-rose-400 italic text-[9px] mt-1.5">
                      ⚠️ No checked-in attendees found. Payout will fail unless attendees have check-in records.
                    </p>
                  ) : null}
                </div>
              ) : (
                <p className="text-cyan-400 italic text-[9px] border-t border-white/[0.05] pt-2">
                  ℹ️ direct allocation to Guild treasury funds (no schedule/attendees selected).
                </p>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-white/[0.06]">
            <Button variant="ghost" size="sm" type="button" onClick={onClose}>Cancel</Button>
            <Button variant="primary" size="sm" type="submit" isLoading={isSubmitting}>
              Submit sold log
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
