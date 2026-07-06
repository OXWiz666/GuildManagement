"use client";

import { useEffect, useMemo, useState } from "react";
import { dashboardApi, guildApi, type BossKilledHistoryEntry } from "@/lib/api";
import { useQuery, queryClient } from "@/lib/query";
import { useToast } from "@/components/ui/Toast";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";

const CATEGORIES = [
  { value: "LOW_BOSS", label: "Low Boss" },
  { value: "HIGH_BOSS", label: "High Boss" },
  { value: "DUNGEON", label: "Dungeon" },
  { value: "FFA", label: "FFA" },
] as const;

interface SaleItemRow {
  itemName: string;
  saleValue: string;
}

export default function BossKillSaleModal({
  guildId,
  kill,
  isOfficer,
  onClose,
}: {
  guildId: string;
  kill: BossKilledHistoryEntry;
  isOfficer: boolean;
  onClose: () => void;
}) {
  const { addToast } = useToast();

  const { data: settings } = useQuery<any | null>(
    `guild_settings:${guildId}`,
    async () => {
      const res = await guildApi.getSettings(guildId);
      return res.success ? res.data : null;
    },
    { persist: true, staleTime: 300000 },
  );

  const { data: salesRaw, isLoading: isLoadingSales } = useQuery<any[]>(
    `loot_sales:${guildId}`,
    async () => {
      const res = await dashboardApi.getLootSales(guildId);
      return res.success && res.data?.sales ? res.data.sales : [];
    },
    { persist: true, staleTime: 30000 },
  );

  const alreadySold = useMemo(() => {
    if (!salesRaw || !kill.bossScheduleId) return [];
    return salesRaw.filter((s) => s.bossScheduleId === kill.bossScheduleId);
  }, [salesRaw, kill.bossScheduleId]);

  const { data: attendeesRaw, isLoading: isLoadingAttendees } = useQuery<Array<{ userId: string; name: string }>>(
    kill.bossScheduleId ? `boss_attendees:${guildId}:${kill.bossScheduleId}` : "boss_attendees_none",
    async () => {
      if (!kill.bossScheduleId) return [];
      const res = await dashboardApi.getBossAttendees(guildId, kill.bossScheduleId);
      return res.success && res.data?.attendees ? res.data.attendees : [];
    },
    { persist: true, staleTime: 60000, enabled: !!kill.bossScheduleId },
  );
  const attendees = attendeesRaw || [];

  const [category, setCategory] = useState("LOW_BOSS");
  const [currency, setCurrency] = useState("PHP");
  const [soldDate, setSoldDate] = useState(() => kill.killedAt.slice(0, 10));
  const [items, setItems] = useState<SaleItemRow[]>(() =>
    kill.drops.length > 0
      ? kill.drops.map((d) => ({ itemName: d.itemName, saleValue: "" }))
      : [{ itemName: "", saleValue: "" }],
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (settings?.currencyCode) setCurrency(settings.currencyCode);
  }, [settings]);

  const addItem = () => setItems((prev) => [...prev, { itemName: "", saleValue: "" }]);
  const removeItem = (index: number) =>
    setItems((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  const updateItem = (index: number, field: "itemName" | "saleValue", value: string) =>
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)));

  const taxRate = settings?.taxRatePercent ?? 10;
  const totalSale = items.reduce((acc, it) => acc + (parseFloat(it.saleValue) || 0), 0);
  const taxAmount = totalSale * (taxRate / 100);
  const netProfit = totalSale - taxAmount;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = items
      .map((it) => ({ itemName: it.itemName.trim(), saleValue: parseFloat(it.saleValue) }))
      .filter((it) => it.itemName && !isNaN(it.saleValue) && it.saleValue > 0);

    if (cleaned.length === 0) {
      addToast("error", "Add at least one loot item with a name and positive sale value");
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await dashboardApi.addLootSaleBatch(guildId, {
        category,
        bossScheduleId: kill.bossScheduleId,
        currency,
        soldDate,
        items: cleaned,
      });
      if (result.success) {
        addToast(
          "success",
          `Logged ${cleaned.length} sold item${cleaned.length > 1 ? "s" : ""} for ${kill.bossName}.`,
        );
        queryClient.invalidateQueries(`loot_sales:${guildId}`);
        queryClient.invalidateQueries(`accounting_dashboard:${guildId}`);
        setItems([{ itemName: "", saleValue: "" }]);
      } else {
        addToast("error", result.error?.message || "Failed to log sold items");
      }
    } catch (err: any) {
      addToast("error", err?.message || "An error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4 py-8 overflow-y-auto">
      <Card className="w-full max-w-2xl p-6 bg-[#0c0d12] border border-white/[0.10] rounded-3xl space-y-4 animate-scale-in relative my-auto">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-white/40 hover:text-white/80 transition-colors cursor-pointer"
        >
          ✕
        </button>

        <div className="flex items-center gap-3">
          <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-white/[0.08] bg-zinc-950">
            {kill.bossImageUrl && (
              <img
                src={kill.bossImageUrl}
                alt={kill.bossName}
                className="h-full w-full object-cover"
                referrerPolicy="no-referrer"
              />
            )}
          </span>
          <div>
            <h3 className="text-[16px] font-bold text-white tracking-tight">{kill.bossName} — Sold items</h3>
            <p className="text-[11px] text-white/40 mt-0.5">
              Killed{" "}
              {new Date(kill.killedAt).toLocaleString("en-US", {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </div>
        </div>

        {/* Already sold section */}
        <div className="space-y-2">
          <label className="text-[10px] font-bold text-white/50 uppercase tracking-wider">
            Already sold from this kill
          </label>
          {isLoadingSales ? (
            <div className="h-16 rounded-lg bg-white/[0.02] animate-pulse" />
          ) : alreadySold.length === 0 ? (
            <p className="text-[11px] text-white/35 italic px-3 py-2.5 rounded-lg border border-white/[0.05] bg-white/[0.01]">
              No items sold yet from this kill.
            </p>
          ) : (
            <div className="rounded-lg border border-white/[0.06] divide-y divide-white/[0.05] overflow-hidden max-h-40 overflow-y-auto">
              {alreadySold.map((sale) => (
                <div key={sale.id} className="flex items-center justify-between px-3 py-2 text-[12px]">
                  <span className="font-semibold text-white">{sale.itemName}</span>
                  <span className="font-mono text-white/60">
                    {sale.currency} {(Number(sale.saleValue) / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {!isOfficer ? (
          <p className="text-[11px] text-white/35 italic border-t border-white/[0.06] pt-3">
            Only officers and above can log new sold items.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 border-t border-white/[0.06] pt-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-white/50 uppercase tracking-wider">Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
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
                <label className="text-[10px] font-bold text-white/50 uppercase tracking-wider">Sold date</label>
                <input
                  type="date"
                  value={soldDate}
                  onChange={(e) => setSoldDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.08] text-[13px] text-white focus:outline-none [color-scheme:dark]"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-white/50 uppercase tracking-wider">Currency</label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
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

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-bold text-white/50 uppercase tracking-wider">Loot items</label>
                <button
                  type="button"
                  onClick={addItem}
                  className="text-[11px] font-semibold text-emerald-400 hover:text-emerald-300 transition-colors cursor-pointer"
                >
                  + Add loot
                </button>
              </div>

              {kill.drops.length > 0 && (
                <p className="text-[10px] text-white/35">
                  Pre-filled from this kill&apos;s recorded drops — adjust names or add more as needed.
                </p>
              )}

              <div className="space-y-2">
                {items.map((item, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <input
                      type="text"
                      list="boss-kill-sale-drop-names"
                      placeholder="Loot name (e.g. Serus Greatsword)"
                      value={item.itemName}
                      onChange={(e) => updateItem(index, "itemName", e.target.value)}
                      className="flex-1 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.08] text-[13px] text-white placeholder:text-white/20 focus:outline-none focus:border-white/20"
                    />
                    <input
                      type="number"
                      step="0.01"
                      placeholder="Sale price"
                      value={item.saleValue}
                      onChange={(e) => updateItem(index, "saleValue", e.target.value)}
                      className="w-32 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.08] text-[13px] text-white placeholder:text-white/20 focus:outline-none focus:border-white/20 font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => removeItem(index)}
                      disabled={items.length <= 1}
                      className="w-8 h-8 flex items-center justify-center rounded-lg text-white/30 hover:text-rose-400 hover:bg-white/[0.04] transition-colors cursor-pointer disabled:opacity-25 disabled:cursor-not-allowed"
                      aria-label="Remove loot"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
              <datalist id="boss-kill-sale-drop-names">
                {kill.drops.map((d) => (
                  <option key={d.itemName} value={d.itemName} />
                ))}
              </datalist>
            </div>

            {totalSale > 0 && (
              <div className="p-3.5 rounded-xl border border-white/[0.06] bg-[#07080b]/80 space-y-2.5 font-mono text-[10px] text-zinc-400">
                <p className="text-[9px] uppercase tracking-wider font-bold text-white pb-1.5 border-b border-white/[0.05]">
                  Live profit distribution preview
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
                {kill.bossScheduleId ? (
                  <div className="border-t border-white/[0.05] pt-2 space-y-1.5">
                    <div className="flex justify-between items-center text-zinc-400">
                      <span>Checked-in attendees:</span>
                      <span className="px-1.5 py-0.25 rounded bg-zinc-800 text-white font-bold">
                        {isLoadingAttendees ? "..." : `${attendees.length} players`}
                      </span>
                    </div>
                    {!isLoadingAttendees && attendees.length > 0 ? (
                      <div className="flex justify-between text-white font-semibold pt-1">
                        <span>Share per attendee:</span>
                        <span className="text-emerald-400">
                          {currency} {(netProfit / attendees.length).toLocaleString("en-US", { maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    ) : !isLoadingAttendees ? (
                      <p className="text-rose-400 italic text-[9px] mt-1.5">
                        No checked-in attendees found for this activity. Payout will fail unless attendees have check-in records.
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <p className="text-cyan-400 italic text-[9px] border-t border-white/[0.05] pt-2">
                    Direct allocation to Guild treasury funds (no attendees tracked for this kill).
                  </p>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-white/[0.06]">
              <Button variant="ghost" size="sm" type="button" onClick={onClose}>
                Close
              </Button>
              <Button variant="primary" size="sm" type="submit" isLoading={isSubmitting}>
                Log sold items
              </Button>
            </div>
          </form>
        )}
      </Card>
    </div>
  );
}
