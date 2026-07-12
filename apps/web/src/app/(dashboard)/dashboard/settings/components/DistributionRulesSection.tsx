"use client";

import { useEffect, useState } from "react";
import { DISTRIBUTION_TIERS, DISTRIBUTION_TIER_LABELS, DEFAULT_MARKET_RULES } from "@guild/shared";
import { marketApi, type MarketRulesData } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { Magnetic } from "@/components/dashboard/DashboardHelpers";

interface Props {
  guildId: string;
}

export default function DistributionRulesSection({ guildId }: Props) {
  const { addToast } = useToast();
  const [rules, setRules] = useState<MarketRulesData>(DEFAULT_MARKET_RULES as MarketRulesData);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    marketApi
      .getRules(guildId)
      .then((res) => {
        if (!cancelled && res.success && res.data) setRules(res.data.rules);
      })
      .finally(() => !cancelled && setIsLoading(false));
    return () => {
      cancelled = true;
    };
  }, [guildId]);

  const setCp = (key: "eliteMinCp" | "upperMinCp", v: string) =>
    setRules((r) => ({ ...r, cpTiers: { ...r.cpTiers, [key]: parseInt(v, 10) || 0 } }));

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
        if (res.data) setRules(res.data.rules);
        addToast("success", "Distribution rules updated.");
      } else addToast("error", res.error?.message || "Failed to save rules");
    } catch (err: any) {
      addToast("error", err?.message || "An error occurred");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="relative glass rounded-2xl p-6 border border-white/[0.06] overflow-hidden">
      <span aria-hidden className="absolute inset-x-6 top-0 h-px" style={{ background: "linear-gradient(90deg, transparent, rgba(212,168,83,0.45), transparent)" }} />
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[10px] text-[var(--forge-gold-bright)] uppercase tracking-[0.22em]">Guild Market</span>
        <span className="h-px flex-1 bg-gradient-to-r from-[var(--forge-gold)]/30 to-transparent" />
      </div>
      <h2 className="text-[16px] font-semibold text-white mb-1 tracking-tight">Distribution rules</h2>
      <p className="text-sm text-white/45 mb-5 leading-relaxed">
        Set the CP thresholds that define Elite / Upper / Lower tiers, and the per-tier item limits for logs, temporal pieces, and materials.
      </p>

      {isLoading ? (
        <p className="text-xs text-white/40 py-4">Loading rules…</p>
      ) : (
        <div className="space-y-6">
          {/* CP thresholds */}
          <div>
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-white/55 mb-2">CP tier thresholds</h3>
            <div className="grid grid-cols-2 gap-3 max-w-md">
              <Input label="Elite min CP" type="number" min={0} value={rules.cpTiers.eliteMinCp} onChange={(e) => setCp("eliteMinCp", e.target.value)} />
              <Input label="Upper min CP" type="number" min={0} value={rules.cpTiers.upperMinCp} onChange={(e) => setCp("upperMinCp", e.target.value)} />
            </div>
            <p className="text-[10px] text-white/35 mt-1.5">Members at/above Elite CP → Elite; at/above Upper CP → Upper; otherwise Lower. Core is the CORE_MEMBER role.</p>
          </div>

          {/* Per-tier limits */}
          <div className="overflow-x-auto scroll-fade-x">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-white/55 mb-2">Per-tier item limits</h3>
            <table className="w-full text-[12px] min-w-[440px]">
              <thead>
                <tr className="text-[10px] text-white/45 font-bold uppercase tracking-wider text-left">
                  <th className="py-2 pr-3">Tier</th>
                  <th className="py-2 px-2">Logs</th>
                  <th className="py-2 px-2">Temporal</th>
                  <th className="py-2 px-2">Materials</th>
                </tr>
              </thead>
              <tbody>
                {DISTRIBUTION_TIERS.map((tier) => (
                  <tr key={tier}>
                    <td className="py-2 pr-3 font-semibold text-white/80">{DISTRIBUTION_TIER_LABELS[tier]}</td>
                    {(["logs", "temporalPieces", "materials"] as const).map((field) => (
                      <td key={field} className="py-1.5 px-2">
                        <input
                          type="number"
                          min={0}
                          value={rules.limits[tier][field]}
                          onChange={(e) => setLimit(tier, field, e.target.value)}
                          className="w-20 rounded-lg bg-surface-100 border border-white/8 text-white px-2.5 py-1.5 text-sm focus:outline-none focus:border-primary-500/50 focus:ring-2 focus:ring-primary-500/20"
                        />
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
  );
}
