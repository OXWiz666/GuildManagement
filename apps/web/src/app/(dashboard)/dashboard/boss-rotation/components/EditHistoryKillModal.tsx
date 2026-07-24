import type { BossKilledHistoryEntry } from "@/lib/api";
import { getBossImageUrl } from "@guild/shared";
import Button from "@/components/ui/Button";
import { toDateTimeInputValue } from "../utils/helpers";
import BossAvatar from "./BossAvatar";
import ModalLine from "./ModalLine";

export default function EditHistoryKillModal({
  editingHistoryKill,
  editHistoryKillTime,
  onEditHistoryKillTimeChange,
  isEditingHistoryKill,
  canSaveHistoryEdit,
  onSave,
  onCancel,
}: {
  editingHistoryKill: BossKilledHistoryEntry;
  editHistoryKillTime: string;
  onEditHistoryKillTimeChange: (value: string) => void;
  isEditingHistoryKill: boolean;
  canSaveHistoryEdit: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-md"
        onClick={() => !isEditingHistoryKill && onCancel()}
      />
      <div className="relative w-full max-w-md rounded-xl border border-[var(--metal-border)] bg-[var(--obsidian-elevated)] shadow-[0_40px_90px_-25px_rgba(0,0,0,0.8)] p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="relative p-0.5 rounded-xl border border-[var(--forge-gold)]/30 glow-gold-active">
            <BossAvatar src={editingHistoryKill.bossImageUrl || getBossImageUrl(editingHistoryKill.bossName)} name={editingHistoryKill.bossName} />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.22em] text-[var(--forge-gold-bright)]">Edit kill time</p>
            <h3 className="text-base font-semibold text-white truncate">{editingHistoryKill.bossName}</h3>
          </div>
        </div>

        <div className="rounded-xl border border-[var(--metal-border)] bg-[var(--obsidian-elevated)]/60 p-3 space-y-2 mb-4">
          <ModalLine label="Taken by" value={editingHistoryKill.takenGuildName || "Unrecorded"} tone="emerald" />
          <ModalLine label="Recorded by" value={editingHistoryKill.recordedBy.displayName} />
          <ModalLine
            label="Current time"
            value={new Date(editingHistoryKill.killedAt).toLocaleString("en-US", {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
            tone="amber"
          />
        </div>

        {!editingHistoryKill.bossScheduleId && (
          <p className="mb-4 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs leading-5 text-red-200/80">
            This history entry is not linked to a boss schedule, so its timer cannot be corrected.
          </p>
        )}

        <label className="block mb-5">
          <span className="block text-[10px] font-medium text-white/50 uppercase tracking-[0.18em] mb-2">
            Corrected killed time
          </span>
          <input
            type="datetime-local"
            value={editHistoryKillTime}
            max={toDateTimeInputValue(new Date())}
            onChange={(event) => onEditHistoryKillTimeChange(event.target.value)}
            disabled={isEditingHistoryKill || !editingHistoryKill.bossScheduleId}
            className="w-full px-3.5 py-2.5 rounded-lg bg-[var(--obsidian-elevated)]/60 border border-[var(--metal-border)] text-[13px] text-white focus:outline-none focus:border-[var(--forge-gold)]/40 disabled:opacity-50 disabled:cursor-not-allowed"
          />
        </label>

        <div className="flex justify-end gap-2 border-t border-white/[0.06] pt-4">
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={isEditingHistoryKill}>
            Cancel
          </Button>
          <Button variant="accent" size="sm" onClick={onSave} isLoading={isEditingHistoryKill} disabled={!canSaveHistoryEdit}>
            Save edit
          </Button>
        </div>
      </div>
    </div>
  );
}
