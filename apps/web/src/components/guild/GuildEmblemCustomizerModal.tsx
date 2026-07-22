"use client";

import { useEffect, useState } from "react";
import {
  GUILD_EMBLEM_SHAPES,
  GUILD_EMBLEM_COLORS,
  GUILD_EMBLEM_ICONS,
  GUILD_EMBLEM_ACCENTS,
  GUILD_EMBLEM_BORDERS,
  type GuildEmblemConfig,
} from "@guild/shared";
import { guildApi } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import { queryClient } from "@/lib/query";
import Button from "@/components/ui/Button";
import GuildEmblem, { EMBLEM_PALETTE } from "./GuildEmblem";

const DEFAULT_EMBLEM: GuildEmblemConfig = {
  shape: "shield",
  bgColor: "crimson",
  icon: "lion",
  accent: "none",
  border: "gold",
  banner: { enabled: true },
};

const LABELS: Record<string, string> = {
  shield: "Shield",
  "shield-flat": "Flat Shield",
  circle: "Circle",
  hexagon: "Hexagon",
  diamond: "Diamond",
  star: "Star",
  lion: "Lion",
  dragon: "Dragon",
  wolf: "Wolf",
  phoenix: "Phoenix",
  sword: "Sword",
  "crossed-swords": "Crossed Swords",
  axe: "Axe",
  crown: "Crown",
  skull: "Skull",
  tree: "Tree",
  compass: "Compass",
  helm: "Helm",
  none: "None",
  wings: "Wings",
  laurels: "Laurels",
  stars: "Stars",
  chevrons: "Chevrons",
  gold: "Gold",
  silver: "Silver",
  double: "Double",
};

function StepLabel({ step, title }: { step: number; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-2.5">
      <span className="h-5 w-5 rounded-full border border-[var(--forge-gold)]/40 text-[var(--forge-gold-bright)] text-[10px] font-bold flex items-center justify-center">
        {step}
      </span>
      <h4 className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/60">{title}</h4>
    </div>
  );
}

export interface GuildEmblemCustomizerModalProps {
  show: boolean;
  guildId: string;
  guildName: string;
  currentEmblem: GuildEmblemConfig | null;
  onClose: () => void;
  onSaved?: (emblem: GuildEmblemConfig | null) => void;
}

/**
 * "Design your identity" — full emblem customizer. Pickers preview each
 * option applied to the current draft so choices read in context.
 */
export default function GuildEmblemCustomizerModal({
  show,
  guildId,
  guildName,
  currentEmblem,
  onClose,
  onSaved,
}: GuildEmblemCustomizerModalProps) {
  const { addToast } = useToast();
  const [draft, setDraft] = useState<GuildEmblemConfig>(currentEmblem ?? DEFAULT_EMBLEM);
  const [isSaving, setIsSaving] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);

  useEffect(() => {
    if (show) setDraft(currentEmblem ?? DEFAULT_EMBLEM);
  }, [show, currentEmblem]);

  if (!show) return null;

  const set = <K extends keyof GuildEmblemConfig>(key: K, value: GuildEmblemConfig[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  async function save(emblem: GuildEmblemConfig | null) {
    if (emblem === null) setIsRemoving(true);
    else setIsSaving(true);
    try {
      const result = await guildApi.updateEmblem(guildId, emblem);
      if (result.success) {
        addToast("success", emblem === null ? "Emblem removed" : "Guild emblem saved");
        queryClient.invalidateQueries(`guild_profile:${guildId}`);
        onSaved?.(emblem);
        onClose();
      } else {
        addToast("error", result.error?.message || "Failed to save emblem");
      }
    } finally {
      setIsSaving(false);
      setIsRemoving(false);
    }
  }

  const optionBtn = (selected: boolean) =>
    `flex flex-col items-center gap-1.5 rounded-xl border p-2.5 transition-all cursor-pointer ${
      selected
        ? "border-[var(--forge-gold)]/50 bg-[var(--forge-gold)]/10"
        : "border-white/[0.07] bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/[0.14]"
    }`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={() => !isSaving && !isRemoving && onClose()} />
      <div className="relative glass-strong rounded-2xl border border-white/10 w-full max-w-3xl max-h-[90vh] flex flex-col animate-scale-in overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06] shrink-0">
          <div>
            <h3 className="text-base font-bold text-white">Custom Guild Emblem</h3>
            <p className="text-[11px] text-white/45 mt-0.5">Design your identity — it replaces the guild avatar everywhere.</p>
          </div>
          <button
            onClick={onClose}
            disabled={isSaving || isRemoving}
            className="h-8 w-8 rounded-lg hover:bg-white/[0.06] text-white/50 hover:text-white transition-colors cursor-pointer"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="grid grid-cols-1 md:grid-cols-[220px_1fr]">
            {/* Live preview */}
            <div className="md:sticky md:top-0 md:self-start flex md:flex-col items-center gap-3 p-5 md:p-6 border-b md:border-b-0 md:border-r border-white/[0.06]">
              <GuildEmblem emblem={draft} name={guildName} size={150} />
              <p className="hidden md:block text-[10px] uppercase tracking-[0.16em] text-white/35 text-center">
                Live preview
              </p>
            </div>

            {/* Pickers */}
            <div className="p-5 md:p-6 space-y-6">
              <section>
                <StepLabel step={1} title="Background shape" />
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                  {GUILD_EMBLEM_SHAPES.map((shape) => (
                    <button key={shape} type="button" onClick={() => set("shape", shape)} className={optionBtn(draft.shape === shape)}>
                      <GuildEmblem emblem={{ ...draft, shape, banner: undefined }} name={guildName} size={34} />
                      <span className="text-[9px] text-white/50 leading-none">{LABELS[shape]}</span>
                    </button>
                  ))}
                </div>
              </section>

              <section>
                <StepLabel step={2} title="Background color" />
                <div className="flex flex-wrap gap-2">
                  {GUILD_EMBLEM_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => set("bgColor", color)}
                      title={color}
                      className={`h-8 w-8 rounded-full border-2 transition-all cursor-pointer ${
                        draft.bgColor === color
                          ? "border-[var(--forge-gold)] scale-110"
                          : "border-white/15 hover:border-white/40"
                      }`}
                      style={{
                        background: `linear-gradient(160deg, ${EMBLEM_PALETTE[color].light}, ${EMBLEM_PALETTE[color].mid} 55%, ${EMBLEM_PALETTE[color].dark})`,
                      }}
                      aria-label={color}
                    />
                  ))}
                </div>
              </section>

              <section>
                <StepLabel step={3} title="Main icon" />
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                  {GUILD_EMBLEM_ICONS.map((icon) => (
                    <button key={icon} type="button" onClick={() => set("icon", icon)} className={optionBtn(draft.icon === icon)}>
                      <GuildEmblem emblem={{ ...draft, icon, banner: undefined }} name={guildName} size={34} />
                      <span className="text-[9px] text-white/50 leading-none text-center">{LABELS[icon]}</span>
                    </button>
                  ))}
                </div>
              </section>

              <section>
                <StepLabel step={4} title="Accent elements" />
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                  {GUILD_EMBLEM_ACCENTS.map((accent) => (
                    <button key={accent} type="button" onClick={() => set("accent", accent)} className={optionBtn(draft.accent === accent)}>
                      <GuildEmblem emblem={{ ...draft, accent, banner: undefined }} name={guildName} size={34} />
                      <span className="text-[9px] text-white/50 leading-none">{LABELS[accent]}</span>
                    </button>
                  ))}
                </div>
              </section>

              <section>
                <StepLabel step={5} title="Border style" />
                <div className="grid grid-cols-4 gap-2">
                  {GUILD_EMBLEM_BORDERS.map((border) => (
                    <button key={border} type="button" onClick={() => set("border", border)} className={optionBtn(draft.border === border)}>
                      <GuildEmblem emblem={{ ...draft, border, banner: undefined }} name={guildName} size={34} />
                      <span className="text-[9px] text-white/50 leading-none">{LABELS[border]}</span>
                    </button>
                  ))}
                </div>
              </section>

              <section>
                <StepLabel step={6} title="Banner & text" />
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={Boolean(draft.banner?.enabled)}
                      onChange={(e) => set("banner", { enabled: e.target.checked, text: draft.banner?.text })}
                      className="h-4 w-4 accent-[var(--forge-gold)] cursor-pointer"
                    />
                    <span className="text-[12px] text-white/70 font-medium">Show name banner</span>
                  </label>
                  <input
                    value={draft.banner?.text ?? ""}
                    onChange={(e) => set("banner", { enabled: draft.banner?.enabled ?? false, text: e.target.value })}
                    maxLength={16}
                    disabled={!draft.banner?.enabled}
                    placeholder={guildName.slice(0, 16) || "Banner text"}
                    className="flex-1 px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-[13px] text-white placeholder:text-white/25 focus:outline-none focus:border-[var(--forge-gold)]/40 disabled:opacity-40 disabled:cursor-not-allowed uppercase tracking-wider"
                  />
                </div>
              </section>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-white/[0.06] shrink-0">
          {currentEmblem ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => save(null)}
              isLoading={isRemoving}
              disabled={isSaving}
              className="hover:text-red-300 hover:border-red-500/35"
            >
              Remove emblem
            </Button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onClose} disabled={isSaving || isRemoving}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={() => save(draft)} isLoading={isSaving} disabled={isRemoving}>
              Save emblem
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
