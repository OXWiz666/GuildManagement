"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { dashboardApi, type BossScheduleData, type MarketBossDrop } from "@/lib/api";
import { useQuery } from "@/lib/query";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";

const CATEGORIES = [
  { value: "LOW_BOSS", label: "Low Boss" },
  { value: "HIGH_BOSS", label: "High Boss" },
  { value: "DUNGEON", label: "Dungeon" },
  { value: "FFA", label: "FFA" },
] as const;

// Rarity → text colour (matches the boss-rotation drops palette).
function rarityColor(rarity: string | null | undefined) {
  switch ((rarity || "").toLowerCase()) {
    case "mythic": return "text-rose-300";
    case "legend": return "text-[var(--forge-gold-bright)]";
    case "epic": return "text-violet-300";
    case "rare": return "text-sky-300";
    case "uncommon": return "text-emerald-300";
    default: return "text-white/60";
  }
}

interface RecordSaleModalProps {
  guildId: string;
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
  guildId,
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

  const killedSchedules = useMemo(
    () => schedules.filter((s) => s.status === "KILLED"),
    [schedules],
  );
  const selectedSchedule = useMemo(
    () => killedSchedules.find((s) => s.id === bossScheduleId) || null,
    [killedSchedules, bossScheduleId],
  );
  const bossName = selectedSchedule?.bossName || "";

  // Items this specific boss is recorded dropping → the loot dropdown source.
  const { data: dropData, isLoading: isLoadingDrops } = useQuery<MarketBossDrop[]>(
    bossName ? `boss_drops:${guildId}:${bossName}` : "boss_drops_none",
    async () => {
      if (!bossName) return [];
      const res = await dashboardApi.getBossDrops(guildId, bossName);
      return res.success && res.data ? res.data.drops : [];
    },
    { persist: true, staleTime: 60000, enabled: !!bossName },
  );
  const drops = useMemo(() => dropData || [], [dropData]);

  // name → drop, for showing an icon next to already-filled rows
  const dropByName = useMemo(() => {
    const m = new Map<string, MarketBossDrop>();
    for (const d of drops) m.set(d.itemName.toLowerCase(), d);
    return m;
  }, [drops]);

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
              <ActivitySelect
                schedules={killedSchedules}
                value={bossScheduleId}
                onChange={onBossScheduleChange}
              />
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

            {bossName && (
              <p className="text-[10px] text-white/35">
                {isLoadingDrops
                  ? "Loading recorded drops…"
                  : drops.length > 0
                    ? <>Pick from <span className="text-[var(--forge-gold-bright)] font-semibold">{bossName}</span>&apos;s recorded drops, or type a custom name.</>
                    : <>No drops recorded for <span className="text-white/60 font-semibold">{bossName}</span> yet — type loot names manually.</>}
              </p>
            )}

            <div className="space-y-2">
              {items.map((item, index) => (
                <div key={index} className="flex items-center gap-2">
                  <LootNameCombobox
                    value={item.itemName}
                    drops={drops}
                    matched={dropByName.get(item.itemName.trim().toLowerCase()) || null}
                    onChange={(v) => onItemChange(index, "itemName", v)}
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

// ─── Activity selector with boss icons ───────────────────────────────
function ActivitySelect({
  schedules,
  value,
  onChange,
}: {
  schedules: BossScheduleData[];
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = schedules.find((s) => s.id === value) || null;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.08] text-[13px] text-white focus:outline-none hover:border-white/20 transition-colors cursor-pointer"
      >
        {selected ? (
          <>
            <BossIcon src={selected.bossImageUrl} name={selected.bossName} />
            <span className="truncate">{selected.bossName}</span>
            <span className="text-white/40 text-[11px] shrink-0">({new Date(selected.spawnTime).toLocaleDateString()})</span>
          </>
        ) : (
          <span className="text-white/50">General Market (No attendees)</span>
        )}
        <svg className={`ml-auto h-4 w-4 text-white/40 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6" /></svg>
      </button>

      {open && (
        <div className="absolute z-20 mt-1.5 w-full max-h-64 overflow-y-auto rounded-xl border border-white/[0.1] bg-[#0c0d12] shadow-[0_20px_50px_-15px_rgba(0,0,0,0.8)] p-1">
          <button
            type="button"
            onClick={() => { onChange(""); setOpen(false); }}
            className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-[13px] text-left transition-colors cursor-pointer ${
              !value ? "bg-white/[0.06] text-white" : "text-white/60 hover:bg-white/[0.04] hover:text-white"
            }`}
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-white/[0.08] bg-white/[0.03] text-white/30">
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18" /></svg>
            </span>
            Next Market (No attendees)
          </button>
          {schedules.map((s) => (
            <button
              type="button"
              key={s.id}
              onClick={() => { onChange(s.id); setOpen(false); }}
              className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-[13px] text-left transition-colors cursor-pointer ${
                value === s.id ? "bg-white/[0.06] text-white" : "text-white/70 hover:bg-white/[0.04] hover:text-white"
              }`}
            >
              <BossIcon src={s.bossImageUrl} name={s.bossName} />
              <span className="truncate">{s.bossName}</span>
              <span className="ml-auto text-white/40 text-[11px] shrink-0">{new Date(s.spawnTime).toLocaleDateString()}</span>
            </button>
          ))}
          {schedules.length === 0 && (
            <p className="px-2.5 py-3 text-[11px] text-white/35 text-center">No killed activities yet.</p>
          )}
        </div>
      )}
    </div>
  );
}

function BossIcon({ src, name }: { src?: string | null; name: string }) {
  return (
    <span className="relative h-7 w-7 shrink-0 overflow-hidden rounded-md border border-white/[0.08] bg-zinc-950">
      {src ? (
        <img src={src} alt={name} loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-[11px] font-bold text-white/40">{name.slice(0, 1)}</span>
      )}
    </span>
  );
}

// ─── Loot name combobox (dropdown of this boss's drops + free text) ───
function LootNameCombobox({
  value,
  drops,
  matched,
  onChange,
}: {
  value: string;
  drops: MarketBossDrop[];
  matched: MarketBossDrop | null;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Filter the dropdown by whatever is typed.
  const filtered = useMemo(() => {
    const s = value.trim().toLowerCase();
    if (!s) return drops;
    return drops.filter(
      (d) =>
        d.itemName.toLowerCase().includes(s) ||
        (d.type || "").toLowerCase().includes(s) ||
        (d.category || "").toLowerCase().includes(s),
    );
  }, [drops, value]);

  const hasDrops = drops.length > 0;

  return (
    <div ref={ref} className="relative flex-1">
      <div className="relative flex items-center">
        {matched && (
          <img
            src={matched.iconUrl}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            className="absolute left-2 h-5 w-5 rounded object-cover pointer-events-none"
          />
        )}
        <input
          type="text"
          placeholder="Loot name (e.g. Serus Greatsword)"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => hasDrops && setOpen(true)}
          className={`w-full py-2 rounded-lg bg-white/[0.03] border border-white/[0.08] text-[13px] text-white placeholder:text-white/20 focus:outline-none focus:border-white/20 ${
            matched ? "pl-9" : "pl-3"
          } ${hasDrops ? "pr-8" : "pr-3"}`}
        />
        {hasDrops && (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-label="Show boss drops"
            className="absolute right-1.5 flex h-6 w-6 items-center justify-center rounded text-white/40 hover:text-white cursor-pointer"
          >
            <svg className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6" /></svg>
          </button>
        )}
      </div>

      {open && hasDrops && (
        <div className="absolute z-30 mt-1.5 w-full max-h-56 overflow-y-auto rounded-xl border border-white/[0.1] bg-[#0c0d12] shadow-[0_20px_50px_-15px_rgba(0,0,0,0.8)] p-1">
          {filtered.length === 0 ? (
            <p className="px-2.5 py-3 text-[11px] text-white/35 text-center">No matching drop — press to keep &quot;{value}&quot; as custom.</p>
          ) : (
            filtered.map((d, i) => (
              <button
                type="button"
                key={`${d.itemName}-${i}`}
                onClick={() => { onChange(d.itemName); setOpen(false); }}
                className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-left hover:bg-white/[0.05] transition-colors cursor-pointer"
              >
                <img src={d.iconUrl} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-7 w-7 rounded-md object-cover border border-white/[0.08] shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[12px] font-medium text-white/90 truncate">{d.itemName}</span>
                  <span className="block text-[10px] text-white/40">
                    {d.type}{d.category ? ` · ${d.category}` : ""}
                  </span>
                </span>
                {d.rarity && (
                  <span className={`text-[9px] font-bold uppercase tracking-wide shrink-0 ${rarityColor(d.rarity)}`}>{d.rarity}</span>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
