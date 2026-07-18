"use client";

import React, { useState, useEffect } from "react";
import SettingsCard from "../../settings/components/SettingsCard";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import { guildApi, type GuildProfileData, type GuildSettingsData } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useRoleDisplayNames } from "@/lib/useRoleDisplayNames";
import { useToast } from "@/components/ui/Toast";
import { Magnetic } from "@/components/dashboard/DashboardHelpers";
import { useQuery, queryClient } from "@/lib/query";

export interface GuildSettingsSectionProps {
  guildId: string;
}

const TIMEZONE_OPTIONS = [
  "Asia/Singapore",
  "Asia/Manila",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Asia/Hong_Kong",
  "Asia/Bangkok",
  "Asia/Jakarta",
  "Australia/Sydney",
  "Europe/London",
  "America/Los_Angeles",
  "America/New_York",
  "UTC",
] as const;

const REGION_OPTIONS = ["SEA", "PH", "SG", "JP", "KR", "NA", "EU", "OCE", "Global"] as const;
const LANGUAGE_OPTIONS = [
  { value: "en", label: "English" },
  { value: "fil", label: "Filipino" },
  { value: "ja", label: "Japanese" },
  { value: "ko", label: "Korean" },
  { value: "zh", label: "Chinese" },
] as const;

export default function GuildSettingsSection({ guildId }: GuildSettingsSectionProps) {
  const { addToast } = useToast();
  const { user, refreshUser } = useAuth();
  const { resolveRoleName } = useRoleDisplayNames();
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingGeneral, setIsSavingGeneral] = useState(false);

  // Form states
  const [guildName, setGuildName] = useState("");
  const [serverName, setServerName] = useState("");
  const [timezone, setTimezone] = useState("Asia/Singapore");
  const [region, setRegion] = useState("");
  const [language, setLanguage] = useState("en");
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
  } = useQuery<GuildSettingsData | null>(
    `guild_settings:${guildId}`,
    async () => {
      const result = await guildApi.getSettings(guildId);
      return result.success && result.data ? result.data : null;
    },
    { persist: true, staleTime: 300000 }
  );

  const {
    data: guildProfile,
    isLoading: isLoadingProfile,
  } = useQuery<GuildProfileData | null>(
    `guild_profile:${guildId}`,
    async () => {
      const result = await guildApi.getProfile(guildId);
      return result.success && result.data ? result.data : null;
    },
    { persist: true, staleTime: 60000 }
  );

  // Sync settings states
  useEffect(() => {
    if (guildSettings) {
      setServerName(guildSettings.serverName || "");
      setTimezone(guildSettings.timezone || "Asia/Singapore");
      setRegion(guildSettings.region || "");
      setLanguage(guildSettings.language || "en");
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

  useEffect(() => {
    if (guildProfile) {
      setGuildName(guildProfile.name);
    }
  }, [guildProfile]);

  const activeMembership = user?.guilds.find((guild) => guild.guildId === guildId);
  const canRenameGuild = ["GUILD_LEADER", "FACTION_LEADER", "ADMIN"].includes(activeMembership?.role ?? "");
  const isGuildNameDirty = guildName.trim().length > 0 && guildName.trim() !== guildProfile?.name;
  const isGeneralDirty =
    isGuildNameDirty ||
    serverName.trim() !== (guildSettings?.serverName || "") ||
    timezone !== (guildSettings?.timezone || "Asia/Singapore") ||
    region !== (guildSettings?.region || "") ||
    language !== (guildSettings?.language || "en");

  const handleGeneralSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const nextName = guildName.trim();
    if (!isGeneralDirty) return;

    setIsSavingGeneral(true);
    try {
      if (isGuildNameDirty) {
        if (!canRenameGuild) {
          addToast("error", "Only Guild Leaders can rename the guild");
          return;
        }
        const renameResult = await guildApi.updateProfile(guildId, { name: nextName });
        if (!renameResult.success) {
          addToast("error", renameResult.error?.message || "Failed to rename guild");
          return;
        }
        queryClient.invalidateQueries(`guild_profile:${guildId}`);
        await refreshUser();
      }

      const settingsResult = await guildApi.updateSettings(guildId, {
        serverName: serverName.trim() || null,
        timezone,
        region: region.trim() || null,
        language,
      });
      if (settingsResult.success) {
        addToast("success", "General guild settings saved");
        queryClient.invalidateQueries(`guild_settings:${guildId}`);
      } else {
        addToast("error", settingsResult.error?.message || "Failed to save general settings");
      }
    } catch (err: unknown) {
      addToast("error", err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsSavingGeneral(false);
    }
  };

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

  if (isLoadingSettings || isLoadingProfile) {
    return (
      <div className="glass rounded-2xl p-6 border border-white/[0.06] animate-pulse h-96 flex items-center justify-center">
        <span className="text-white/40 text-sm font-semibold tracking-wider animate-pulse">Loading Guild Settings Configurations...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SettingsCard
        eyebrow="General Settings"
        title="Guild identity & locale"
        description="Control the guild name, server label, timezone, region, and default language used across the website and Discord workflows."
      >
        <form onSubmit={handleGeneralSubmit} className="space-y-4">
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="min-w-0">
                <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-white/45">
                  Guild name
                </label>
                <input
                  value={guildName}
                  onChange={(e) => setGuildName(e.target.value)}
                  disabled={!canRenameGuild || !guildProfile?.canRename || isSavingGeneral}
                  maxLength={48}
                  placeholder="Enter guild name"
                  className="w-full rounded-lg border border-white/[0.08] bg-black/20 px-3.5 py-2.5 text-[13px] font-semibold text-white placeholder:text-white/25 transition-colors focus:border-white/20 focus:outline-none disabled:cursor-not-allowed disabled:opacity-45"
                />
              </div>
              <div className="min-w-0">
                <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-white/45">
                  Server name
                </label>
                <input
                  value={serverName}
                  onChange={(e) => setServerName(e.target.value)}
                  maxLength={80}
                  placeholder="e.g. Vengeance SEA 1"
                  className="w-full rounded-lg border border-white/[0.08] bg-black/20 px-3.5 py-2.5 text-[13px] font-semibold text-white placeholder:text-white/25 transition-colors focus:border-white/20 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-white/45">
                  Timezone
                </label>
                <select
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="w-full rounded-lg border border-white/[0.08] bg-black/20 px-3.5 py-2.5 text-[13px] font-semibold text-white transition-colors focus:border-white/20 focus:outline-none"
                >
                  {TIMEZONE_OPTIONS.map((option) => (
                    <option key={option} className="bg-[#0b0c10]" value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-white/45">
                    Region
                  </label>
                  <select
                    value={region}
                    onChange={(e) => setRegion(e.target.value)}
                    className="w-full rounded-lg border border-white/[0.08] bg-black/20 px-3.5 py-2.5 text-[13px] font-semibold text-white transition-colors focus:border-white/20 focus:outline-none"
                  >
                    <option className="bg-[#0b0c10]" value="">Not set</option>
                    {REGION_OPTIONS.map((option) => (
                      <option key={option} className="bg-[#0b0c10]" value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-white/45">
                    Language
                  </label>
                  <select
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    className="w-full rounded-lg border border-white/[0.08] bg-black/20 px-3.5 py-2.5 text-[13px] font-semibold text-white transition-colors focus:border-white/20 focus:outline-none"
                  >
                    {LANGUAGE_OPTIONS.map((option) => (
                      <option key={option.value} className="bg-[#0b0c10]" value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            <div className="mt-4 flex flex-col gap-3 border-t border-white/[0.06] pt-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-2 text-[11px]">
                <span className="rounded-full border border-white/[0.06] bg-white/[0.03] px-2.5 py-1 font-mono text-white/50">
                  /{guildProfile?.slug}
                </span>
                {guildProfile?.isSubscribed ? (
                  <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2.5 py-1 font-bold text-emerald-300">
                    Subscribed / unlimited renames
                  </span>
                ) : (
                  <span
                    className={`rounded-full border px-2.5 py-1 font-bold ${
                      guildProfile?.canRename
                        ? "border-amber-400/20 bg-amber-500/10 text-amber-300"
                        : "border-rose-400/20 bg-rose-500/10 text-rose-300"
                    }`}
                  >
                    Free plan / {guildProfile?.remainingNameChanges ?? 0} rename left
                  </span>
                )}
              </div>
              <Magnetic strength={3}>
                <Button
                  type="submit"
                  variant="secondary"
                  size="sm"
                  isLoading={isSavingGeneral}
                  disabled={!isGeneralDirty || (isGuildNameDirty && (!canRenameGuild || !guildProfile?.canRename))}
                  className="border border-violet-400/20 text-violet-100"
                >
                  Save general settings
                </Button>
              </Magnetic>
            </div>
          </div>
        </form>
      </SettingsCard>

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
