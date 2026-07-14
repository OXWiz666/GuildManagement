"use client";

import { useState } from "react";
import { STORAGE_CATEGORY_LABELS } from "@guild/shared";
import { guildApi, type StorageItemData } from "@/lib/api";
import { marketRpc } from "@/lib/rpc";
import { useQuery, queryClient } from "@/lib/query";
import { Skeleton } from "@/components/ui/Skeleton";
import ItemDetailModal from "./ItemDetailModal";

const CATEGORY_ICONS: Record<string, string> = {
  LEGEND_WEAPON: "⚔️",
  LEGEND_ARMOR: "🛡️",
  LEGEND_ACCESSORY: "💍",
  MOUNT: "🐎",
  OTHER: "📦",
};

interface Props {
  guildId: string;
}

export default function GuildStorageTab({ guildId }: Props) {
  const [selectedItem, setSelectedItem] = useState<StorageItemData | null>(null);

  const key = `market_storage:${guildId}`;
  const { data, isLoading } = useQuery(
    key,
    async () => {
      const res = await marketRpc.getStorage(guildId);
      return res.success && res.data ? res.data : { storage: [], listed: [], canManage: false };
    },
    { staleTime: 15000 },
  );

  const { data: settings } = useQuery<any | null>(
    `guild_settings:${guildId}`,
    async () => {
      const result = await guildApi.getSettings(guildId);
      return result.success ? result.data : null;
    },
    { persist: true, staleTime: 300000 },
  );
  const currencySymbol = settings?.currencySymbol || "₱";

  const storage = data?.storage || [];
  const listed = data?.listed || [];
  const canManage = data?.canManage || false;
  const refresh = () => queryClient.invalidateQueries(key);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">Guild Storage</h3>
          <p className="text-[11px] text-white/45 mt-1">
            Vault of high-value boss drops. List them in the next market or distribute to a member.
          </p>
        </div>
      </div>

      {isLoading && storage.length === 0 && listed.length === 0 ? (
        <Skeleton className="h-64 w-full rounded-2xl animate-pulse" />
      ) : (
        <>
          {/* GUILD STORAGE board */}
          <StorageBoard
            title="Guild Storage"
            subtitle="In the vault"
            accent="gold"
            items={storage}
            empty="No items in storage yet — boss-kill drops are added here automatically."
            currencySymbol={currencySymbol}
            onSelect={setSelectedItem}
          />

          {/* LISTED IN THE NEXT MARKET board */}
          <StorageBoard
            title="Listed in the Next Market"
            subtitle="Awaiting the next market"
            accent="cyan"
            items={listed}
            empty="Nothing listed for the next market."
            currencySymbol={currencySymbol}
            onSelect={setSelectedItem}
          />
        </>
      )}

      {selectedItem && (
        <ItemDetailModal
          guildId={guildId}
          item={selectedItem}
          canManage={canManage}
          currencySymbol={currencySymbol}
          onClose={() => setSelectedItem(null)}
          onChanged={refresh}
        />
      )}
    </div>
  );
}

// ─── A single board (storage / listed) ───────────────────────────────
function StorageBoard({
  title,
  subtitle,
  accent,
  items,
  empty,
  currencySymbol,
  onSelect,
}: {
  title: string;
  subtitle: string;
  accent: "gold" | "cyan";
  items: StorageItemData[];
  empty: string;
  currencySymbol: string;
  onSelect: (item: StorageItemData) => void;
}) {
  const dot = accent === "gold" ? "bg-[var(--forge-gold)]" : "bg-cyan-400";
  return (
    <section>
      <div className="flex items-center gap-2.5 mb-3">
        <span className={`h-2 w-2 rounded-full ${dot}`} />
        <h4 className="text-[13px] font-bold text-white tracking-tight">{title}</h4>
        <span className="text-[10px] text-white/35 uppercase tracking-wider">{subtitle}</span>
        <span className="ml-auto text-[11px] font-mono text-white/40">{items.length}</span>
      </div>
      {items.length === 0 ? (
        <div className="text-center py-10 text-xs text-white/35 border border-dashed border-white/[0.06] rounded-2xl">
          {empty}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {items.map((item, index) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item)}
              className="market-row text-left rounded-2xl border border-white/[0.06] bg-[#0c0d12]/40 backdrop-blur p-4 flex items-start gap-3 cursor-pointer transition-colors hover:border-white/15 hover:bg-[#0c0d12]/60"
              style={{ animationDelay: `${Math.min(index, 16) * 30}ms` }}
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/[0.04] border border-white/[0.06] text-xl">
                {item.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.imageUrl} alt="" className="h-full w-full rounded-xl object-cover" />
                ) : (
                  <span aria-hidden>{CATEGORY_ICONS[item.category] || "📦"}</span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-white truncate">
                    {item.itemName}
                    {item.quantity > 1 && <span className="text-white/40 font-mono text-xs"> ×{item.quantity}</span>}
                  </p>
                  {item.listingPrice != null && (
                    <span className="shrink-0 text-[11px] font-bold text-[var(--forge-gold-bright)]">
                      {currencySymbol}
                      {(Number(item.listingPrice) / 100).toLocaleString()}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-white/45 mt-0.5">
                  <span className="text-violet-200/80">{STORAGE_CATEGORY_LABELS[item.category as keyof typeof STORAGE_CATEGORY_LABELS] || item.category}</span>
                  {item.sourceBoss && <span className="text-white/35"> · from {item.sourceBoss}</span>}
                </p>
                {item.note && <p className="text-[11px] text-white/40 mt-1 line-clamp-2">{item.note}</p>}
              </div>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
