"use client";

import React, { useState, useEffect } from "react";
import SettingsCard from "../../settings/components/SettingsCard";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import { guildApi } from "@/lib/api";
import { useRoleDisplayNames } from "@/lib/useRoleDisplayNames";
import { useToast } from "@/components/ui/Toast";
import { Magnetic } from "@/components/dashboard/DashboardHelpers";
import { useQuery, queryClient } from "@/lib/query";

export interface GuildSettingsSectionProps {
  guildId: string;
}

export default function GuildSettingsSection({ guildId }: GuildSettingsSectionProps) {
  const { addToast } = useToast();
  const { resolveRoleName } = useRoleDisplayNames();
  const [isSaving, setIsSaving] = useState(false);

  // Form states
  const [taxRatePercent, setTaxRatePercent] = useState("10");
  const [activeShareModel, setActiveShareModel] = useState("EQUAL");
  const [currencyCode, setCurrencyCode] = useState("PHP");
  const [currencySymbol, setCurrencySymbol] = useState("₱");
  const [secondaryCurrencyCode, setSecondaryCurrencyCode] = useState("");
  const [secondaryCurrencySymbol, setSecondaryCurrencySymbol] = useState("");

  // Rank Multipliers
  const [multGL, setMultGL] = useState("2.0");
  const [multOfficer, setMultOfficer] = useState("1.5");
  const [multCore, setMultCore] = useState("1.2");
  const [multElite, setMultElite] = useState("1.1");
  const [multMember, setMultMember] = useState("1.0");

  // ─── Persistent Queries ────────────────────────────────

  // 1. Settings Query
  const {
    data: guildSettings,
    isLoading: isLoadingSettings,
  } = useQuery<any | null>(
    `guild_settings:${guildId}`,
    async () => {
      const result = await guildApi.getSettings(guildId);
      return result.success ? result.data : null;
    },
    { persist: true, staleTime: 300000 }
  );

  // Sync settings states
  useEffect(() => {
    if (guildSettings) {
      setTaxRatePercent(guildSettings.taxRatePercent.toString());
      setActiveShareModel(guildSettings.activeShareModel);
      setCurrencyCode(guildSettings.currencyCode);
      setCurrencySymbol(guildSettings.currencySymbol);
      setSecondaryCurrencyCode(guildSettings.secondaryCurrencyCode || "");
      setSecondaryCurrencySymbol(guildSettings.secondaryCurrencySymbol || "");

      // Multipliers
      const mult = guildSettings.rankMultipliers || {};
      setMultGL((mult.GUILD_LEADER ?? 2.0).toString());
      setMultOfficer((mult.OFFICER ?? 1.5).toString());
      setMultCore((mult.CORE_MEMBER ?? 1.2).toString());
      setMultElite((mult.ELITE_MEMBER ?? 1.1).toString());
      setMultMember((mult.MEMBER ?? 1.0).toString());
    }
  }, [guildSettings]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const payload = {
        taxRatePercent: parseInt(taxRatePercent, 10),
        activeShareModel,
        currencyCode,
        currencySymbol,
        secondaryCurrencyCode: secondaryCurrencyCode.trim() || null,
        secondaryCurrencySymbol: secondaryCurrencySymbol.trim() || null,
        rankMultipliers: {
          GUILD_LEADER: parseFloat(multGL),
          OFFICER: parseFloat(multOfficer),
          CORE_MEMBER: parseFloat(multCore),
          ELITE_MEMBER: parseFloat(multElite),
          MEMBER: parseFloat(multMember),
        },
      };

      const result = await guildApi.updateSettings(guildId, payload);
      if (result.success) {
        addToast("success", "Guild configurations updated successfully!");
        queryClient.invalidateQueries(`guild_settings:${guildId}`);
      } else {
        addToast("error", result.error?.message || "Failed to save guild configurations");
      }
    } catch (err: any) {
      addToast("error", err?.message || "An error occurred");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoadingSettings) {
    return (
      <div className="glass rounded-2xl p-6 border border-white/[0.06] animate-pulse h-96 flex items-center justify-center">
        <span className="text-white/40 text-sm font-semibold tracking-wider animate-pulse">Loading Guild Settings Configurations...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SettingsCard
        eyebrow="Guild Settings"
        title="Guild point system & configurations"
        description="Configure tax rates, point allocations for events, rank multipliers, and preferred economies."
      >
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Economy settings — table view */}
          <div>
            <h4 className="text-[12px] font-bold text-white/70 uppercase tracking-wider mb-4 border-b border-white/[0.04] pb-1.5">
              Guild Economy & Tax
            </h4>
            <div className="overflow-x-auto rounded-xl border border-white/[0.08]">
              <table className="w-full text-sm">
                <tbody className="divide-y divide-white/[0.06]">
                  <tr>
                    <td className="px-4 py-3.5 text-[12px] font-medium text-white/60 w-1/3 align-middle">
                      Tax Rate Percent (%)
                    </td>
                    <td className="px-4 py-2.5">
                      <input
                        type="number"
                        value={taxRatePercent}
                        onChange={(e) => setTaxRatePercent(e.target.value)}
                        placeholder="e.g. 10"
                        className="w-full max-w-[180px] px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.08] text-[13px] text-white placeholder:text-white/30 focus:outline-none focus:border-white/20 transition-colors"
                      />
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3.5 text-[12px] font-medium text-white/60 align-middle">
                      Primary Currency
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-3">
                        <div className="flex-1 max-w-[220px]">
                          <span className="block text-[9px] text-white/30 uppercase tracking-wider mb-1">Code</span>
                          <input
                            value={currencyCode}
                            onChange={(e) => setCurrencyCode(e.target.value)}
                            placeholder="e.g. PHP"
                            className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.08] text-[13px] text-white placeholder:text-white/30 focus:outline-none focus:border-white/20 transition-colors"
                          />
                        </div>
                        <div className="w-24 shrink-0">
                          <span className="block text-[9px] text-white/30 uppercase tracking-wider mb-1">Symbol</span>
                          <input
                            value={currencySymbol}
                            onChange={(e) => setCurrencySymbol(e.target.value)}
                            placeholder="e.g. ₱"
                            className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.08] text-[13px] text-white placeholder:text-white/30 focus:outline-none focus:border-white/20 transition-colors"
                          />
                        </div>
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3.5 text-[12px] font-medium text-white/60 align-middle">
                      Secondary Currency <span className="text-white/30 font-normal">(optional)</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-3">
                        <div className="flex-1 max-w-[220px]">
                          <span className="block text-[9px] text-white/30 uppercase tracking-wider mb-1">Code</span>
                          <input
                            value={secondaryCurrencyCode}
                            onChange={(e) => setSecondaryCurrencyCode(e.target.value)}
                            placeholder="e.g. DIAMOND"
                            className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.08] text-[13px] text-white placeholder:text-white/30 focus:outline-none focus:border-white/20 transition-colors"
                          />
                        </div>
                        <div className="w-24 shrink-0">
                          <span className="block text-[9px] text-white/30 uppercase tracking-wider mb-1">Symbol</span>
                          <input
                            value={secondaryCurrencySymbol}
                            onChange={(e) => setSecondaryCurrencySymbol(e.target.value)}
                            placeholder="e.g. 💎"
                            className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.08] text-[13px] text-white placeholder:text-white/30 focus:outline-none focus:border-white/20 transition-colors"
                          />
                        </div>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Dividend distribution — attendance points themselves now come
              entirely from the "Boss" activity in Activities Multiplier
              (every real attendance session is boss-triggered), so the old
              flat Base Attendance Points field has been retired here. */}
          <div>
            <h4 className="text-[12px] font-bold text-white/70 uppercase tracking-wider mb-4 border-b border-white/[0.04] pb-1.5">
              Loot dividend distribution
            </h4>
            <div className="max-w-xs flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-white/50 uppercase tracking-wider">
                Default share model
              </label>
              <select
                value={activeShareModel}
                onChange={(e) => setActiveShareModel(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg bg-white/[0.03] border border-white/[0.08] text-[13px] text-white focus:outline-none focus:border-white/20 transition-colors"
              >
                <option className="bg-[#0b0c10]" value="EQUAL">EQUAL split among attendees</option>
                <option className="bg-[#0b0c10]" value="PRO_RATA">PRO RATA based on Guild Points</option>
              </select>
            </div>
          </div>

          {/* Rank Multipliers */}
          <div>
            <h4 className="text-[12px] font-bold text-white/70 uppercase tracking-wider mb-4 border-b border-white/[0.04] pb-1.5">
              Rank share multipliers
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <Input
                label={resolveRoleName("GUILD_LEADER")}
                type="number"
                step="0.1"
                value={multGL}
                onChange={(e) => setMultGL(e.target.value)}
              />
              <Input
                label={resolveRoleName("OFFICER")}
                type="number"
                step="0.1"
                value={multOfficer}
                onChange={(e) => setMultOfficer(e.target.value)}
              />
              <Input
                label={resolveRoleName("CORE_MEMBER")}
                type="number"
                step="0.1"
                value={multCore}
                onChange={(e) => setMultCore(e.target.value)}
              />
              <Input
                label={resolveRoleName("ELITE_MEMBER")}
                type="number"
                step="0.1"
                value={multElite}
                onChange={(e) => setMultElite(e.target.value)}
              />
              <Input
                label={resolveRoleName("MEMBER")}
                type="number"
                step="0.1"
                value={multMember}
                onChange={(e) => setMultMember(e.target.value)}
              />
            </div>
          </div>

          <div className="flex justify-end pt-3 border-t border-white/[0.06]">
            <Magnetic strength={4}>
              <Button variant="primary" size="sm" type="submit" isLoading={isSaving}>
                Save configurations
              </Button>
            </Magnetic>
          </div>
        </form>
      </SettingsCard>
    </div>
  );
}
