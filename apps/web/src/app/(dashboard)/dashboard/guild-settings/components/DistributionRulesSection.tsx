"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { DISTRIBUTION_TIERS, DISTRIBUTION_TIER_LABELS, DEFAULT_MARKET_RULES } from "@guild/shared";
import { guildApi, marketApi, type GuildSettingsData, type MarketRulesData } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import Button from "@/components/ui/Button";
import { Magnetic } from "@/components/dashboard/DashboardHelpers";
import SettingsCard from "../../settings/components/SettingsCard";
import { useQuery, queryClient } from "@/lib/query";
import MountWishlistSection from "./MountWishlistSection";

interface Props {
  guildId: string;
  onDirtyChange?: (isDirty: boolean) => void;
}

export default function DistributionRulesSection({ guildId, onDirtyChange }: Props) {
  const { addToast } = useToast();
  const [rules, setRules] = useState<MarketRulesData>(DEFAULT_MARKET_RULES as MarketRulesData);
  const [savedRules, setSavedRules] = useState<MarketRulesData>(DEFAULT_MARKET_RULES as MarketRulesData);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [shareModelDraft, setShareModelDraft] = useState<string | null>(null);
  const [isSavingShareModel, setIsSavingShareModel] = useState(false);

  const { data: guildSettings } = useQuery<GuildSettingsData | null>(
    `guild_settings:${guildId}`,
    async () => {
      const result = await guildApi.getSettings(guildId);
      return result.success && result.data ? result.data : null;
    },
    { persist: true, staleTime: 300000 },
  );

  useEffect(() => {
    let cancelled = false;
    marketApi
      .getRules(guildId)
      .then((res) => {
        if (!cancelled && res.success && res.data) {
          setRules(res.data.rules);
          setSavedRules(res.data.rules);
        }
      })
      .finally(() => !cancelled && setIsLoading(false));
    return () => {
      cancelled = true;
    };
  }, [guildId]);

  const setLimit = (tier: string, field: "logs" | "temporalPieces" | "materials", v: string) =>
    setRules((r) => ({
      ...r,
      limits: { ...r.limits, [tier]: { ...r.limits[tier as keyof typeof r.limits], [field]: parseInt(v, 10) || 0 } },
    }));

  async function save() {
    setIsSaving(true);
    try {
      const res = await marketApi.updateRules(guildId, rules);
      if (res.success) {
        if (res.data) {
          setRules(res.data.rules);
          setSavedRules(res.data.rules);
        }
        addToast("success", "Distribution rules updated.");
      } else addToast("error", res.error?.message || "Failed to save rules");
    } catch (err: unknown) {
      addToast("error", err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsSaving(false);
    }
  }

  const savedShareModel = guildSettings?.activeShareModel ?? "EQUAL";
  const activeShareModel = shareModelDraft ?? savedShareModel;
  const isShareModelDirty = activeShareModel !== savedShareModel;
  const isRulesDirty = JSON.stringify(rules) !== JSON.stringify(savedRules);
  const isDirty = isShareModelDirty || isRulesDirty;

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  async function saveShareModel() {
    setIsSavingShareModel(true);
    try {
      const res = await guildApi.updateSettings(guildId, { activeShareModel });
      if (res.success) {
        addToast("success", "Loot dividend distribution updated.");
        setShareModelDraft(null);
        queryClient.invalidateQueries(`guild_settings:${guildId}`);
      } else addToast("error", res.error?.message || "Failed to save loot dividend distribution");
    } catch (err: unknown) {
      addToast("error", err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsSavingShareModel(false);
    }
  }

  return (
    <div className="space-y-6">
      <SettingsCard
        eyebrow="Distribution Rules"
        title="Loot dividend distribution"
        description="Choose how sold-item net profit is split among confirmed attendees."
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-xs flex-1 flex flex-col gap-1.5">
            <label className="text-[10px] font-bold text-white/50 uppercase tracking-wider">
              Default share model
            </label>
            <select
              value={activeShareModel}
              onChange={(e) => setShareModelDraft(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg bg-white/[0.03] border border-white/[0.08] text-[13px] text-white focus:outline-none focus:border-white/20 transition-colors"
            >
              <option className="bg-[#0b0c10]" value="EQUAL">EQUAL split among attendees</option>
              <option className="bg-[#0b0c10]" value="PRO_RATA">PRO RATA based on Guild Points</option>
            </select>
          </div>
          <Magnetic strength={4}>
            <Button
              variant="primary"
              size="sm"
              onClick={saveShareModel}
              isLoading={isSavingShareModel}
              disabled={!isShareModelDirty}
            >
              {isShareModelDirty ? "Save share model" : "Saved"}
            </Button>
          </Magnetic>
        </div>
        <Link href="/dashboard/distribution" className="mt-4 inline-flex text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--forge-gold-bright)] hover:text-white">
          View Distribution output
        </Link>
      </SettingsCard>

      <div className="relative glass rounded-2xl p-6 border border-white/[0.06] overflow-hidden">
        <span aria-hidden className="absolute inset-x-6 top-0 h-px" style={{ background: "linear-gradient(90deg, transparent, rgba(212,168,83,0.45), transparent)" }} />
        <div className="flex items-center gap-2 mb-3">
          <span className="text-[10px] text-[var(--forge-gold-bright)] uppercase tracking-[0.22em]">Guild Market</span>
          <span className="h-px flex-1 bg-gradient-to-r from-[var(--forge-gold)]/30 to-transparent" />
        </div>
        <h2 className="text-[16px] font-semibold text-white mb-1 tracking-tight">Distribution rules</h2>
        <p className="text-sm text-white/45 mb-5 leading-relaxed">
          Set per-tier item request limits. CP thresholds now live in Moderator & Permission so rank rules stay together.
        </p>

      {isLoading ? (
        <p className="text-xs text-white/40 py-4">Loading rules…</p>
      ) : (
        <div className="space-y-6">
          {/* Per-tier limits */}
          <div className="overflow-x-auto scroll-fade-x">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-white/55 mb-2">Per-tier item limits</h3>
            <table className="w-full text-[12px] min-w-[440px]">
              <thead>
                <tr className="text-[10px] text-white/45 font-bold uppercase tracking-wider text-left">
                  <th className="py-2 pr-3">Tier</th>
                  <th className="py-2 px-2">Logs</th>
                  <th className="py-2 px-2">Mount</th>
                  <th className="py-2 px-2">Materials</th>
                </tr>
              </thead>
              <tbody>
                {DISTRIBUTION_TIERS.map((tier) => (
                  <tr key={tier}>
                    <td className="py-2 pr-3 font-semibold text-white/80">{DISTRIBUTION_TIER_LABELS[tier]}</td>
                    {(["logs", "temporalPieces", "materials"] as const).map((field) => (
                      <td key={field} className="py-1.5 px-2">
                        {field === "temporalPieces" ? (
                          <select
                            value={rules.limits[tier][field]}
                            onChange={(e) => setLimit(tier, field, e.target.value)}
                            className="w-24 rounded-lg bg-surface-100 border border-white/8 text-white px-2.5 py-1.5 text-sm focus:outline-none focus:border-primary-500/50 focus:ring-2 focus:ring-primary-500/20"
                          >
                            {Array.from({ length: 11 }, (_, value) => (
                              <option key={value} className="bg-[#0b0c10]" value={value}>
                                {value} mount{value === 1 ? "" : "s"}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type="number"
                            min={0}
                            value={rules.limits[tier][field]}
                            onChange={(e) => setLimit(tier, field, e.target.value)}
                            className="w-20 rounded-lg bg-surface-100 border border-white/8 text-white px-2.5 py-1.5 text-sm focus:outline-none focus:border-primary-500/50 focus:ring-2 focus:ring-primary-500/20"
                          />
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Magnetic strength={4}>
            <Button variant="primary" size="sm" onClick={save} isLoading={isSaving}>
              Save distribution rules
            </Button>
          </Magnetic>
        </div>
      )}
    </div>
      <MountWishlistSection guildId={guildId} />
    </div>
  );
}
