"use client";

import React, { useState, useEffect } from "react";
import SettingsCard from "../../settings/components/SettingsCard";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import { guildApi, type GuildProfileData, type GuildSettingsData } from "@/lib/api";
import GuildEmblem from "@/components/guild/GuildEmblem";
import GuildEmblemCustomizerModal from "@/components/guild/GuildEmblemCustomizerModal";
import { useAuth } from "@/lib/auth-context";
import { useRoleDisplayNames } from "@/lib/useRoleDisplayNames";
import { useToast } from "@/components/ui/Toast";
import { Magnetic } from "@/components/dashboard/DashboardHelpers";
import { useQuery, queryClient } from "@/lib/query";

export interface GuildSettingsSectionProps {
  guildId: string;
  mode?: "all" | "general" | "points";
  onDirtyChange?: (isDirty: boolean) => void;
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

const PRIMARY_CURRENCY_SYMBOL_OPTIONS = [
  { symbol: "₱", label: "Philippine peso" },
  { symbol: "$", label: "Dollar" },
  { symbol: "€", label: "Euro" },
  { symbol: "¥", label: "Yen" },
  { symbol: "₩", label: "Won" },
  { symbol: "£", label: "Pound" },
  { symbol: "₹", label: "Rupee" },
  { symbol: "₽", label: "Ruble" },
  { symbol: "₫", label: "Dong" },
  { symbol: "฿", label: "Baht" },
] as const;

const GAME_CURRENCY_SYMBOL_OPTIONS = [
  { symbol: "💎", label: "Diamond" },
  { symbol: "🪙", label: "Gold coin" },
  { symbol: "⚔️", label: "Weapon token" },
  { symbol: "🛡️", label: "Defense token" },
  { symbol: "🔮", label: "Magic orb" },
  { symbol: "✨", label: "Essence" },
  { symbol: "🏅", label: "Medal" },
  { symbol: "🧿", label: "Relic" },
] as const;

const SETTINGS_TEMPLATES = [
  {
    id: "democratic",
    name: "Democratic",
    description: "Balanced guild economy with modest tax, shared member influence, and light leadership weighting.",
    taxRatePercent: "20",
    activeShareModel: "PRO_RATA",
    currencyCode: "PHP",
    secondaryCurrencyCode: "DIAMOND",
    multipliers: { gl: "1.2", officer: "1.1", core: "1.05", elite: "1.0", member: "1.0" },
  },
  {
    id: "socialist",
    name: "Socialist",
    description: "Everyone receives equal multiplier weight. Best for fully equal-share guilds.",
    taxRatePercent: "0",
    activeShareModel: "EQUAL",
    currencyCode: "PHP",
    secondaryCurrencyCode: "DIAMOND",
    multipliers: { gl: "1.0", officer: "1.0", core: "1.0", elite: "1.0", member: "1.0" },
  },
] as const;

type SettingsTemplate = (typeof SETTINGS_TEMPLATES)[number];
type TemplateSelectionId = SettingsTemplate["id"] | "custom";

const CUSTOM_PRESET_ID = "custom" as const;

const isPrimaryCurrencySymbol = (symbol?: string | null): symbol is string =>
  Boolean(symbol && PRIMARY_CURRENCY_SYMBOL_OPTIONS.some((option) => option.symbol === symbol));

const isGameCurrencySymbol = (symbol?: string | null): symbol is string =>
  Boolean(symbol && GAME_CURRENCY_SYMBOL_OPTIONS.some((option) => option.symbol === symbol));

function formatTimezoneOption(timeZone: string) {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "longOffset",
      hour12: false,
    });
    const parts = formatter.formatToParts(new Date());
    const offset = parts.find((part) => part.type === "timeZoneName")?.value.replace("GMT", "UTC");
    const time = parts
      .filter((part) => part.type === "hour" || part.type === "minute" || part.type === "literal")
      .map((part) => part.value)
      .join("");
    return offset ? `${timeZone} (${offset}, ${time})` : timeZone;
  } catch {
    return timeZone;
  }
}

export default function GuildSettingsSection({ guildId, mode = "all", onDirtyChange }: GuildSettingsSectionProps) {
  const { addToast } = useToast();
  const { user, refreshUser } = useAuth();
  const { resolveRoleName } = useRoleDisplayNames();
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingGeneral, setIsSavingGeneral] = useState(false);
  const [showEmblemModal, setShowEmblemModal] = useState(false);

  // Form states
  const [guildName, setGuildName] = useState("");
  const [serverName, setServerName] = useState("");
  const [timezone, setTimezone] = useState("Asia/Singapore");
  const [region, setRegion] = useState("");
  const [settingsTemplateName, setSettingsTemplateName] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState<TemplateSelectionId>("democratic");
  const [taxRatePercent, setTaxRatePercent] = useState("10");
  const [currencyCode, setCurrencyCode] = useState("PHP");
  const [currencySymbol, setCurrencySymbol] = useState("₱");
  const [secondaryCurrencyCode, setSecondaryCurrencyCode] = useState("DIAMOND");
  const [activeShareModel, setActiveShareModel] = useState("EQUAL");
  const [secondaryCurrencySymbol, setSecondaryCurrencySymbol] = useState("💎");

  // Rank Multipliers
  const [multCore, setMultCore] = useState("1.2");
  const [multElite, setMultElite] = useState("1.1");
  const [multMember, setMultMember] = useState("1.0");
  const [isApplyingTemplate, setIsApplyingTemplate] = useState(false);

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
      setSettingsTemplateName(guildSettings.settingsTemplateName || "");
      const savedTemplate = SETTINGS_TEMPLATES.find((template) => template.name === guildSettings.settingsTemplateName);
      if (savedTemplate) {
        setSelectedTemplateId(savedTemplate.id);
      } else if (guildSettings.settingsTemplateName) {
        setSelectedTemplateId(CUSTOM_PRESET_ID);
      }
      setTaxRatePercent(guildSettings.taxRatePercent.toString());
      setCurrencyCode(guildSettings.currencyCode);
      setCurrencySymbol(isPrimaryCurrencySymbol(guildSettings.currencySymbol) ? guildSettings.currencySymbol : "₱");
      setSecondaryCurrencyCode(guildSettings.secondaryCurrencyCode || "DIAMOND");
      setActiveShareModel(guildSettings.activeShareModel || "EQUAL");
      setSecondaryCurrencySymbol(isGameCurrencySymbol(guildSettings.secondaryCurrencySymbol) ? guildSettings.secondaryCurrencySymbol : "💎");

      // Multipliers
      const mult = guildSettings.rankMultipliers || {};
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
    settingsTemplateName.trim() !== (guildSettings?.settingsTemplateName || "");
  const isPointsDirty =
    taxRatePercent !== (guildSettings?.taxRatePercent.toString() ?? "10") ||
    currencyCode !== (guildSettings?.currencyCode ?? "PHP") ||
    currencySymbol !== (isPrimaryCurrencySymbol(guildSettings?.currencySymbol) ? guildSettings?.currencySymbol : "₱") ||
    secondaryCurrencyCode.trim() !== (guildSettings?.secondaryCurrencyCode || "DIAMOND") ||
    secondaryCurrencySymbol.trim() !== (guildSettings?.secondaryCurrencySymbol || "💎") ||
    activeShareModel !== (guildSettings?.activeShareModel ?? "EQUAL") ||
    multCore !== (guildSettings?.rankMultipliers?.CORE_MEMBER ?? 1.2).toString() ||
    multElite !== (guildSettings?.rankMultipliers?.ELITE_MEMBER ?? 1.1).toString() ||
    multMember !== (guildSettings?.rankMultipliers?.MEMBER ?? 1.0).toString();
  const activeDirty = mode === "general" ? isGeneralDirty : mode === "points" ? isPointsDirty : isGeneralDirty || isPointsDirty;

  useEffect(() => {
    onDirtyChange?.(activeDirty);
  }, [activeDirty, onDirtyChange]);

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
        settingsTemplateName: settingsTemplateName.trim() || null,
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
        currencyCode,
        currencySymbol,
        secondaryCurrencyCode: secondaryCurrencyCode.trim() || "DIAMOND",
        secondaryCurrencySymbol: secondaryCurrencySymbol.trim() || "💎",
        activeShareModel,
        rankMultipliers: {
          GUILD_LEADER: 1,
          OFFICER: 1,
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

  const buildTemplatePayload = (template: SettingsTemplate) => ({
    settingsTemplateName: template.name,
    taxRatePercent: parseInt(template.taxRatePercent, 10),
    activeShareModel: template.activeShareModel,
    currencyCode: template.currencyCode,
    currencySymbol: PRIMARY_CURRENCY_SYMBOL_OPTIONS[0].symbol,
    secondaryCurrencyCode: template.secondaryCurrencyCode,
    secondaryCurrencySymbol: GAME_CURRENCY_SYMBOL_OPTIONS[0].symbol,
    rankMultipliers: {
      GUILD_LEADER: 1,
      OFFICER: 1,
      CORE_MEMBER: parseFloat(template.multipliers.core),
      ELITE_MEMBER: parseFloat(template.multipliers.elite),
      MEMBER: parseFloat(template.multipliers.member),
    },
  });

  const buildCustomPresetPayload = (name: string) => ({
    settingsTemplateName: name,
    taxRatePercent: parseInt(taxRatePercent, 10),
    activeShareModel,
    currencyCode,
    currencySymbol,
    secondaryCurrencyCode: secondaryCurrencyCode.trim() || "DIAMOND",
    secondaryCurrencySymbol: secondaryCurrencySymbol.trim() || "💎",
    rankMultipliers: {
      GUILD_LEADER: 1,
      OFFICER: 1,
      CORE_MEMBER: parseFloat(multCore),
      ELITE_MEMBER: parseFloat(multElite),
      MEMBER: parseFloat(multMember),
    },
  });

  const applyTemplateToDraft = (template: SettingsTemplate) => {
    setSettingsTemplateName(template.name);
    setTaxRatePercent(template.taxRatePercent);
    setCurrencyCode(template.currencyCode);
    setCurrencySymbol(PRIMARY_CURRENCY_SYMBOL_OPTIONS[0].symbol);
    setSecondaryCurrencyCode(template.secondaryCurrencyCode);
    setSecondaryCurrencySymbol(GAME_CURRENCY_SYMBOL_OPTIONS[0].symbol);
    setActiveShareModel(template.activeShareModel);
    setMultCore(template.multipliers.core);
    setMultElite(template.multipliers.elite);
    setMultMember(template.multipliers.member);
  };

  const applyTemplate = async (template: SettingsTemplate) => {
    applyTemplateToDraft(template);
    setIsApplyingTemplate(true);
    try {
      const result = await guildApi.updateSettings(guildId, buildTemplatePayload(template));
      if (result.success) {
        addToast("success", `${template.name} template applied.`);
        queryClient.invalidateQueries(`guild_settings:${guildId}`);
      } else {
        addToast("error", result.error?.message || "Failed to apply template");
      }
    } catch (err: unknown) {
      addToast("error", err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsApplyingTemplate(false);
    }
  };

  const saveCustomPreset = async () => {
    const name = settingsTemplateName.trim();
    if (!name) {
      addToast("error", "Enter a custom preset name");
      return;
    }
    setIsApplyingTemplate(true);
    try {
      const result = await guildApi.updateSettings(guildId, buildCustomPresetPayload(name));
      if (result.success) {
        addToast("success", `${name} custom preset saved.`);
        queryClient.invalidateQueries(`guild_settings:${guildId}`);
      } else {
        addToast("error", result.error?.message || "Failed to save custom preset");
      }
    } catch (err: unknown) {
      addToast("error", err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsApplyingTemplate(false);
    }
  };

  const selectedTemplate =
    selectedTemplateId === CUSTOM_PRESET_ID
      ? null
      : SETTINGS_TEMPLATES.find((template) => template.id === selectedTemplateId) ?? SETTINGS_TEMPLATES[0];

  if (isLoadingSettings || isLoadingProfile) {
    return (
      <div className="glass rounded-2xl p-6 border border-white/[0.06] animate-pulse h-96 flex items-center justify-center">
        <span className="text-white/40 text-sm font-semibold tracking-wider animate-pulse">Loading Guild Settings Configurations...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {(mode === "all" || mode === "general") && (
      <SettingsCard
        eyebrow="Guild Emblem"
        title="Design your identity"
        description="Your emblem replaces the guild avatar across the website — customize its shape, colors, icon, and banner."
      >
        <div className="flex flex-col sm:flex-row items-center gap-5 rounded-xl border border-white/[0.08] bg-white/[0.025] p-4">
          <GuildEmblem emblem={guildProfile?.emblem ?? null} name={guildProfile?.name || "Guild"} size={92} />
          <div className="flex-1 min-w-0 text-center sm:text-left">
            <p className="text-[13px] font-semibold text-white">
              {guildProfile?.emblem ? "Current emblem" : "No emblem yet"}
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-white/45">
              {guildProfile?.emblem
                ? "Members see this emblem wherever your guild appears. Leaders can change it at any time."
                : "Your guild currently shows a plain initial. Forge an emblem to give it a real identity."}
            </p>
            <div className="mt-3">
              <Magnetic strength={3}>
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={() => setShowEmblemModal(true)}
                  disabled={!canRenameGuild}
                >
                  {guildProfile?.emblem ? "Customize emblem" : "Create emblem"}
                </Button>
              </Magnetic>
              {!canRenameGuild && (
                <p className="mt-2 text-[10px] text-white/35">Only Guild Leaders can change the emblem.</p>
              )}
            </div>
          </div>
        </div>
      </SettingsCard>
      )}

      {(mode === "all" || mode === "general") && (
      <SettingsCard
        eyebrow="General Settings"
        title="Guild identity & region"
        description="Control the guild name, server label, timezone, and region used across the website and Discord workflows."
      >
        <form onSubmit={handleGeneralSubmit} className="space-y-4">
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-4">
            <div className="mb-5 rounded-xl border border-[var(--forge-gold)]/15 bg-[var(--forge-gold)]/[0.035] p-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div className="min-w-0 flex-1">
                  <h4 className="text-[12px] font-bold uppercase tracking-wider text-white/75">
                    Customize Template
                  </h4>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-white/45">
                    Apply a named guild setup template, or save the guild&apos;s current manual settings as a custom preset.
                  </p>
                  <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,190px)_minmax(0,220px)_minmax(0,1fr)]">
                    <div>
                      <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-white/45">
                        Preset
                      </label>
                      <select
                        value={selectedTemplateId}
                        onChange={(e) => {
                          if (e.target.value === CUSTOM_PRESET_ID) {
                            setSelectedTemplateId(CUSTOM_PRESET_ID);
                            setSettingsTemplateName(settingsTemplateName || "Custom Preset");
                            return;
                          }
                          const nextTemplate =
                            SETTINGS_TEMPLATES.find((template) => template.id === e.target.value) ?? SETTINGS_TEMPLATES[0];
                          setSelectedTemplateId(nextTemplate.id);
                          setSettingsTemplateName(nextTemplate.name);
                        }}
                        className="w-full rounded-lg border border-white/[0.08] bg-black/25 px-3.5 py-2.5 text-[13px] font-semibold text-white transition-colors focus:border-white/20 focus:outline-none"
                      >
                        {SETTINGS_TEMPLATES.map((template) => (
                          <option key={template.id} className="bg-[#0b0c10]" value={template.id}>
                            {template.name}
                          </option>
                        ))}
                        <option className="bg-[#0b0c10]" value={CUSTOM_PRESET_ID}>
                          Custom Preset
                        </option>
                      </select>
                    </div>
                    <div>
                      <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-white/45">
                        Template name
                      </label>
                      <input
                        value={settingsTemplateName}
                        onChange={(e) => {
                          setSelectedTemplateId(CUSTOM_PRESET_ID);
                          setSettingsTemplateName(e.target.value);
                        }}
                        maxLength={64}
                        placeholder="e.g. Kurakorp raid split"
                        className="w-full rounded-lg border border-white/[0.08] bg-black/25 px-3.5 py-2.5 text-[13px] font-semibold text-white placeholder:text-white/25 transition-colors focus:border-white/20 focus:outline-none"
                      />
                    </div>
                    <div className="rounded-lg border border-white/[0.06] bg-black/15 px-3.5 py-2.5">
                      <p className="text-[11px] font-semibold text-white">
                        {selectedTemplate
                          ? selectedTemplate.description
                          : "Use the guild's current manual settings as a named preset."}
                      </p>
                      <p className="mt-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--forge-gold-bright)]">
                        {selectedTemplate
                          ? `${selectedTemplate.taxRatePercent}% tax - ${selectedTemplate.activeShareModel.replace("_", " ")} split`
                          : "Custom values from your saved guild settings"}
                      </p>
                    </div>
                  </div>
                </div>
                <Magnetic strength={3}>
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={() => {
                      if (selectedTemplate) void applyTemplate(selectedTemplate);
                      else void saveCustomPreset();
                    }}
                    isLoading={isApplyingTemplate}
                    className="shrink-0"
                  >
                    {selectedTemplate ? "Apply template" : "Save custom preset"}
                  </Button>
                </Magnetic>
              </div>
            </div>
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
                  placeholder="e.g. HORATIO 1"
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
                      {formatTimezoneOption(option)}
                    </option>
                  ))}
                </select>
                <p className="mt-1.5 text-[10px] text-white/35">
                  Offsets are calculated from the selected IANA timezone, including daylight-saving changes where applicable.
                </p>
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
      )}

      {(mode === "all" || mode === "points") && (
      <SettingsCard
        eyebrow="Guild Settings"
        title="Guild Points System"
        description="Configure tax rates, currencies, and rank multipliers used by the guild economy."
      >
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Economy settings - table view */}
          <div>
            <h4 className="text-[12px] font-bold text-white/70 uppercase tracking-wider mb-4 border-b border-white/[0.04] pb-1.5">
              Guild Economy & Tax
            </h4>
            <p className="mb-3 text-[11px] leading-relaxed text-white/40">
              These values control how sold item taxes, treasury totals, and member balances are displayed in Guild Market and Distribution.
            </p>
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
                      Default Share Model
                    </td>
                    <td className="px-4 py-2.5">
                      <select
                        value={activeShareModel}
                        onChange={(e) => setActiveShareModel(e.target.value)}
                        className="w-full max-w-[280px] px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.08] text-[13px] text-white focus:outline-none focus:border-white/20 transition-colors"
                      >
                        <option className="bg-[#0b0c10]" value="EQUAL">EQUAL split among attendees</option>
                        <option className="bg-[#0b0c10]" value="PRO_RATA">PRO RATA based on Guild Points</option>
                      </select>
                      <p className="mt-1.5 text-[10px] text-white/35">
                        Used as the default loot dividend split for sold boss drops.
                      </p>
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
                          <select
                            value={currencySymbol}
                            onChange={(e) => setCurrencySymbol(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.08] text-[13px] text-white placeholder:text-white/30 focus:outline-none focus:border-white/20 transition-colors"
                          >
                            {PRIMARY_CURRENCY_SYMBOL_OPTIONS.map((option) => (
                              <option key={`${option.symbol}-${option.label}`} className="bg-[#0b0c10]" value={option.symbol}>
                                {option.symbol}
                              </option>
                            ))}
                          </select>
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
                          <select
                            value={secondaryCurrencySymbol}
                            onChange={(e) => setSecondaryCurrencySymbol(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.08] text-[13px] text-white placeholder:text-white/30 focus:outline-none focus:border-white/20 transition-colors"
                          >
                            {GAME_CURRENCY_SYMBOL_OPTIONS.map((option) => (
                              <option key={`${option.symbol}-${option.label}`} className="bg-[#0b0c10]" value={option.symbol}>
                                {option.symbol}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Rank Multipliers */}
          <div>
            <h4 className="text-[12px] font-bold text-white/70 uppercase tracking-wider mb-4 border-b border-white/[0.04] pb-1.5">
              Rank share multipliers
            </h4>
            <p className="mb-3 text-[11px] leading-relaxed text-white/40">
              Multipliers apply to CP-based ranks only. Leader, Faction Leader, and Officer are permissions, not rank tiers.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
      )}

      <GuildEmblemCustomizerModal
        show={showEmblemModal}
        guildId={guildId}
        guildName={guildProfile?.name || "Guild"}
        currentEmblem={guildProfile?.emblem ?? null}
        onClose={() => setShowEmblemModal(false)}
        onSaved={() => void refreshUser()}
      />
    </div>
  );
}
