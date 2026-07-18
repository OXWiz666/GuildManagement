"use client";

import type { BossKilledHistoryEntry } from "@/lib/api";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";

export default function BossKillSaleModal({
  kill,
  onClose,
}: {
  guildId: string;
  kill: BossKilledHistoryEntry;
  isOfficer: boolean;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4 py-8 overflow-y-auto">
      <Card className="w-full max-w-xl p-6 bg-[#0c0d12] border border-white/[0.10] rounded-3xl space-y-4 animate-scale-in relative my-auto">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 text-white/40 hover:text-white/80 transition-colors cursor-pointer"
          aria-label="Close details"
        >
          &times;
        </button>

        <div className="flex items-center gap-3 pr-8">
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
          <div className="min-w-0">
            <h3 className="text-[16px] font-bold text-white tracking-tight truncate">{kill.bossName} Details</h3>
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

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
          <DetailLine label="Taken by" value={kill.takenGuildName || "Unrecorded"} />
          <DetailLine label="Recorded by" value={kill.recordedBy.displayName} />
          <DetailLine
            label="Recorded at"
            value={new Date(kill.recordedAt).toLocaleString("en-US", {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          />
          <DetailLine
            label="Next spawn"
            value={
              kill.nextSpawnTime
                ? new Date(kill.nextSpawnTime).toLocaleString("en-US", {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "Not scheduled"
            }
          />
        </div>

        <div className="space-y-2">
          <label className="text-[10px] font-bold text-white/50 uppercase tracking-wider">
            Recorded drops
          </label>
          {kill.drops.length === 0 ? (
            <p className="text-[11px] text-white/35 italic px-3 py-2.5 rounded-lg border border-white/[0.05] bg-white/[0.01]">
              No drops recorded for this kill.
            </p>
          ) : (
            <div className="rounded-lg border border-white/[0.06] divide-y divide-white/[0.05] overflow-hidden">
              {kill.drops.map((drop, index) => (
                <div key={`${drop.itemName}-${index}`} className="flex items-center justify-between gap-3 px-3 py-2 text-[12px]">
                  <div className="flex items-center gap-2 min-w-0">
                    {drop.iconUrl && (
                      <img
                        src={drop.iconUrl}
                        alt=""
                        loading="lazy"
                        className="h-7 w-7 rounded-md object-cover border border-white/10 shrink-0"
                      />
                    )}
                    <div className="min-w-0">
                      <p className="font-semibold text-white truncate">{drop.itemName}</p>
                      <p className="text-[10px] text-white/35 truncate">
                        {[drop.rarity, drop.type, drop.category].filter(Boolean).join(" / ") || "Item drop"}
                      </p>
                    </div>
                  </div>
                  <span className="font-mono text-white/50 shrink-0">x{drop.quantity}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end pt-2 border-t border-white/[0.06]">
          <Button variant="ghost" size="sm" type="button" onClick={onClose}>
            Close
          </Button>
        </div>
      </Card>
    </div>
  );
}

function DetailLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/[0.05] bg-black/20 px-3 py-2">
      <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-white/35">{label}</p>
      <p className="mt-1 text-[12px] font-semibold text-white/75 truncate">{value}</p>
    </div>
  );
}
