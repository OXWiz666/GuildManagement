"use client";

import React, { useState, useEffect } from "react";
import SettingsCard from "./SettingsCard";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import { guildApi } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import { Magnetic } from "@/components/dashboard/DashboardHelpers";
import { useQuery, queryClient } from "@/lib/query";

export interface GuildSettingsSectionProps {
  guildId: string;
}

export default function GuildSettingsSection({ guildId }: GuildSettingsSectionProps) {
  const { addToast } = useToast();
  const [isSaving, setIsSaving] = useState(false);

  // Form states
  const [taxRatePercent, setTaxRatePercent] = useState("10");
  const [attendancePoints, setAttendancePoints] = useState("10");
  const [bossKillPoints, setBossKillPoints] = useState("50");
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
      setAttendancePoints(guildSettings.attendancePoints.toString());
      setBossKillPoints(guildSettings.bossKillPoints.toString());
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
        attendancePoints: parseInt(attendancePoints, 10),
        bossKillPoints: parseInt(bossKillPoints, 10),
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
        <span className="text-white/40 text-sm font-semibold tracking-wider animate-pulse">Loading Leader Panel Configurations...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SettingsCard
        eyebrow="Leader Panel"
        title="Guild point system & configurations"
        description="Configure tax rates, point allocations for events, rank multipliers, and preferred economies."
      >
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Economy settings */}
          <div>
            <h4 className="text-[12px] font-bold text-white/70 uppercase tracking-wider mb-4 border-b border-white/[0.04] pb-1.5">
              Guild Economy & Tax
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Input
                label="Tax Rate Percent (%)"
                type="number"
                value={taxRatePercent}
                onChange={(e) => setTaxRatePercent(e.target.value)}
                placeholder="e.g. 10"
              />
              <Input
                label="Primary Currency Code"
                value={currencyCode}
                onChange={(e) => setCurrencyCode(e.target.value)}
                placeholder="e.g. PHP"
              />
              <Input
                label="Primary Currency Symbol"
                value={currencySymbol}
                onChange={(e) => setCurrencySymbol(e.target.value)}
                placeholder="e.g. ₱"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
              <Input
                label="Secondary Currency Code (Optional)"
                value={secondaryCurrencyCode}
                onChange={(e) => setSecondaryCurrencyCode(e.target.value)}
                placeholder="e.g. DIAMOND"
              />
              <Input
                label="Secondary Currency Symbol (Optional)"
                value={secondaryCurrencySymbol}
                onChange={(e) => setSecondaryCurrencySymbol(e.target.value)}
                placeholder="e.g. 💎"
              />
            </div>
          </div>

          {/* DKP triggers */}
          <div>
            <h4 className="text-[12px] font-bold text-white/70 uppercase tracking-wider mb-4 border-b border-white/[0.04] pb-1.5">
              ⏱️ Activity point triggers
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Input
                label="Base Attendance Points"
                type="number"
                value={attendancePoints}
                onChange={(e) => setAttendancePoints(e.target.value)}
                placeholder="e.g. 10"
              />
              <Input
                label="Boss Kill Points"
                type="number"
                value={bossKillPoints}
                onChange={(e) => setBossKillPoints(e.target.value)}
                placeholder="e.g. 50"
              />
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-white/50 uppercase tracking-wider">
                  Default share model
                </label>
                <select
                  value={activeShareModel}
                  onChange={(e) => setActiveShareModel(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg bg-white/[0.03] border border-white/[0.08] text-[13px] text-white focus:outline-none focus:border-white/20 transition-colors"
                >
                  <option className="bg-[#0b0c10]" value="EQUAL">EQUAL split among attendees</option>
                  <option className="bg-[#0b0c10]" value="PRO_RATA">PRO_RATA based on Guild Points</option>
                </select>
              </div>
            </div>
          </div>

          {/* Rank Multipliers */}
          <div>
            <h4 className="text-[12px] font-bold text-white/70 uppercase tracking-wider mb-4 border-b border-white/[0.04] pb-1.5">
              Rank share multipliers
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <Input
                label="Guild Leader"
                type="number"
                step="0.1"
                value={multGL}
                onChange={(e) => setMultGL(e.target.value)}
              />
              <Input
                label="Officer"
                type="number"
                step="0.1"
                value={multOfficer}
                onChange={(e) => setMultOfficer(e.target.value)}
              />
              <Input
                label="Core Member"
                type="number"
                step="0.1"
                value={multCore}
                onChange={(e) => setMultCore(e.target.value)}
              />
              <Input
                label="Elite Member"
                type="number"
                step="0.1"
                value={multElite}
                onChange={(e) => setMultElite(e.target.value)}
              />
              <Input
                label="Member"
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
