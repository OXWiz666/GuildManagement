"use client";

import { useEffect, useState } from "react";
import SettingsCard from "../../settings/components/SettingsCard";
import Button from "@/components/ui/Button";
import { guildApi } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import { Magnetic } from "@/components/dashboard/DashboardHelpers";
import { useQuery, queryClient } from "@/lib/query";

interface GuildPointsResetSectionProps {
  guildId: string;
}

const CYCLES = [
  {
    value: "MANUAL",
    label: "No reset",
    tag: "Lifetime",
    description: "Guild Points accumulate forever. Rankings reflect all-time attendance.",
  },
  {
    value: "WEEKLY",
    label: "Weekly",
    tag: "Every Monday",
    description: "Points count only from the start of the current week (Mon). Resets each Monday.",
  },
  {
    value: "MONTHLY",
    label: "Monthly",
    tag: "1st of month",
    description: "Points count only from the first day of the current month. Resets monthly.",
  },
] as const;

export default function GuildPointsResetSection({ guildId }: GuildPointsResetSectionProps) {
  const { addToast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [cycle, setCycle] = useState<string>("MANUAL");

  const { data: guildSettings } = useQuery<any | null>(
    `guild_settings:${guildId}`,
    async () => {
      const result = await guildApi.getSettings(guildId);
      return result.success ? result.data : null;
    },
    { persist: true, staleTime: 300000 },
  );

  useEffect(() => {
    if (guildSettings?.pointsResetCycle) {
      setCycle(guildSettings.pointsResetCycle);
    }
  }, [guildSettings]);

  const savedCycle = guildSettings?.pointsResetCycle ?? "MANUAL";
  const isDirty = cycle !== savedCycle;

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const result = await guildApi.updateSettings(guildId, { pointsResetCycle: cycle });
      if (result.success) {
        const label = CYCLES.find((c) => c.value === cycle)?.label ?? cycle;
        addToast("success", `Guild Points reset cycle set to ${label}.`);
        queryClient.invalidateQueries(`guild_settings:${guildId}`);
        queryClient.invalidateQueries(`accounting_dashboard:${guildId}`);
      } else {
        addToast("error", result.error?.message || "Failed to update reset cycle");
      }
    } catch (err: any) {
      addToast("error", err?.message || "An error occurred");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SettingsCard
      eyebrow="Leader Panel"
      title="Guild Points reset cycle"
      description="Choose how often member Guild Points reset for ranking. This only affects the points leaderboard — member balances, dividends and treasury are never touched."
    >
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {CYCLES.map((c) => {
          const active = cycle === c.value;
          return (
            <button
              key={c.value}
              type="button"
              onClick={() => setCycle(c.value)}
              className={`text-left p-4 rounded-xl border transition-all cursor-pointer ${
                active
                  ? "border-amber-400/50 bg-amber-400/[0.06] shadow-[0_0_0_1px_rgba(251,191,36,0.25)]"
                  : "border-white/[0.08] bg-white/[0.02] hover:border-white/20"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className={`text-[13px] font-bold ${active ? "text-amber-300" : "text-white"}`}>
                  {c.label}
                </span>
                {active && <span className="text-amber-400 text-xs">●</span>}
              </div>
              <span className="block text-[9px] uppercase tracking-wider font-bold text-white/35 mt-1">
                {c.tag}
              </span>
              <p className="text-[11px] text-white/45 mt-2 leading-relaxed">{c.description}</p>
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-3 pt-4 mt-4 border-t border-white/[0.06]">
        <p className="text-[11px] text-white/40">
          Currently:{" "}
          <span className="font-semibold text-white/70">
            {CYCLES.find((c) => c.value === savedCycle)?.label ?? savedCycle}
          </span>
        </p>
        <Magnetic strength={4}>
          <Button
            variant="primary"
            size="sm"
            onClick={handleSave}
            isLoading={isSaving}
            disabled={!isDirty}
          >
            {isDirty ? "Apply reset cycle" : "Saved"}
          </Button>
        </Magnetic>
      </div>
    </SettingsCard>
  );
}
