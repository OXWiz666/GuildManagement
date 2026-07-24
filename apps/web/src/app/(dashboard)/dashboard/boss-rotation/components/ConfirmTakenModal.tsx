import type { BossRotationItem, FactionGuildData } from "@/lib/api";
import { getBossImageUrl } from "@guild/shared";
import Button from "@/components/ui/Button";
import BossDropsPicker, { type SelectedDrop, rarityStyle } from "./BossDropsPicker";
import BossAvatar from "./BossAvatar";
import ModalLine from "./ModalLine";

export default function ConfirmTakenModal({
  killTarget,
  modalGuildQueue,
  selectedTakenGuildId,
  onSelectedTakenGuildIdChange,
  selectedTakenGuild,
  previewNextGuild,
  killTime,
  onKillTimeChange,
  killDrops,
  onKillDropsChange,
  showDropsPicker,
  onShowDropsPickerChange,
  isKilling,
  canConfirmTaken,
  onConfirm,
  onCancel,
}: {
  killTarget: BossRotationItem;
  modalGuildQueue: FactionGuildData[];
  selectedTakenGuildId: string;
  onSelectedTakenGuildIdChange: (value: string) => void;
  selectedTakenGuild: FactionGuildData | null;
  previewNextGuild: FactionGuildData | null;
  killTime: string;
  onKillTimeChange: (value: string) => void;
  killDrops: SelectedDrop[];
  onKillDropsChange: (drops: SelectedDrop[]) => void;
  showDropsPicker: boolean;
  onShowDropsPickerChange: (open: boolean) => void;
  isKilling: boolean;
  canConfirmTaken: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
        <div className="absolute inset-0 bg-black/70 backdrop-blur-md" onClick={() => !isKilling && onCancel()} />
        <div className="relative w-full max-w-md rounded-xl border border-[var(--metal-border)] bg-[var(--obsidian-elevated)] shadow-[0_40px_90px_-25px_rgba(0,0,0,0.8)] p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="relative p-0.5 rounded-xl border border-emerald-500/30 glow-gold-active">
              <BossAvatar src={killTarget.bossImageUrl || getBossImageUrl(killTarget.bossName)} name={killTarget.bossName} />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.22em] text-emerald-300">Confirm taken</p>
              <h3 className="text-base font-semibold text-white">{killTarget.bossName}</h3>
            </div>
          </div>

          <div className="rounded-xl border border-[var(--metal-border)] bg-[var(--obsidian-elevated)]/60 p-3 space-y-2 mb-4">
            <ModalLine label="Taking guild" value={selectedTakenGuild?.name || "Select a guild"} tone="emerald" />
            <ModalLine label="Next guild" value={previewNextGuild?.name || "Unassigned"} tone="amber" />
            <ModalLine label="Next spawn source" value="Calculated from taken time" />
          </div>

          {!killTarget.activeSchedule && (
            <p className="mb-4 rounded-lg border border-[var(--forge-gold)]/20 bg-[var(--forge-glow)]/20 px-3 py-2 text-xs leading-5 text-[var(--forge-gold-dim)]">
              This boss has no active schedule yet. Confirming will import the latest killed time and calculate the next spawn.
            </p>
          )}

          <label className="block mb-4">
            <span className="block text-[10px] font-medium text-white/50 uppercase tracking-[0.18em] mb-2">
              Taking guild
            </span>
            <select
              value={selectedTakenGuildId}
              onChange={(event) => onSelectedTakenGuildIdChange(event.target.value)}
              disabled={isKilling}
              className="w-full px-3.5 py-2.5 rounded-lg bg-[var(--obsidian-elevated)]/60 border border-[var(--metal-border)] text-[13px] text-white focus:outline-none focus:border-[var(--forge-gold)]/40 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              <option className="bg-[#0c0d12]" value="">Select taking guild</option>
              {modalGuildQueue.map((guild) => (
                <option className="bg-[#0c0d12]" key={guild.id} value={guild.id}>
                  {guild.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block mb-5">
            <span className="block text-[10px] font-medium text-white/50 uppercase tracking-[0.18em] mb-2">
              Taken time
            </span>
            <input
              type="datetime-local"
              value={killTime}
              onChange={(event) => onKillTimeChange(event.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg bg-[var(--obsidian-elevated)]/60 border border-[var(--metal-border)] text-[13px] text-white focus:outline-none focus:border-[var(--forge-gold)]/40"
            />
          </label>

          {/* Boss drops */}
          <div className="mb-5">
            <div className="flex items-center justify-between mb-2">
              <span className="block text-[10px] font-medium text-white/50 uppercase tracking-[0.18em]">
                Boss drops <span className="text-white/30 normal-case tracking-normal">(optional)</span>
              </span>
              <button
                type="button"
                onClick={() => onShowDropsPickerChange(true)}
                disabled={isKilling}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--forge-gold)]/30 bg-[var(--forge-glow)] px-2.5 py-1 text-[11px] font-bold text-[var(--forge-gold-bright)] hover:border-[var(--forge-gold)]/50 transition-colors cursor-pointer disabled:opacity-40"
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                {killDrops.length > 0 ? "Edit drops" : "Add drops"}
              </button>
            </div>
            {killDrops.length === 0 ? (
              <button
                type="button"
                onClick={() => onShowDropsPickerChange(true)}
                disabled={isKilling}
                className="w-full rounded-lg border border-dashed border-white/[0.1] bg-white/[0.01] px-3 py-3 text-[11px] text-white/35 hover:text-white/60 hover:border-white/20 transition-colors cursor-pointer disabled:opacity-40"
              >
                No drops recorded — click to add the items this boss dropped.
              </button>
            ) : (
              <div className="flex flex-wrap gap-1.5 rounded-lg border border-white/[0.06] bg-white/[0.02] p-2">
                {killDrops.map(({ item, quantity }) => {
                  const rs = rarityStyle(item.rarity);
                  return (
                    <span key={`${item.bucket}::${item.path}`} className={`inline-flex items-center gap-1.5 rounded-md border ${rs.border} ${rs.bg} pl-1 pr-1.5 py-0.5`}>
                      <img src={item.iconUrl} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-4 w-4 rounded object-cover" />
                      <span className="text-[10px] font-semibold text-white/85 max-w-[110px] truncate">{item.itemName}</span>
                      {quantity > 1 && <span className="text-[9px] font-mono text-white/50">×{quantity}</span>}
                    </span>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 border-t border-white/[0.06] pt-4">
            <Button variant="ghost" size="sm" onClick={onCancel} disabled={isKilling}>
              Cancel
            </Button>
            <Button variant="accent" size="sm" onClick={onConfirm} isLoading={isKilling} disabled={!canConfirmTaken}>
              Confirm taken
            </Button>
          </div>
        </div>
      </div>

      {showDropsPicker && (
        <BossDropsPicker
          bossName={killTarget.bossName}
          initial={killDrops}
          onCancel={() => onShowDropsPickerChange(false)}
          onApply={(selected) => {
            onKillDropsChange(selected);
            onShowDropsPickerChange(false);
          }}
        />
      )}
    </>
  );
}
