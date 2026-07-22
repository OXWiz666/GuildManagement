"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { hasMinimumRole, type GuildRoleType } from "@guild/shared";
import DashboardDecor from "@/components/dashboard/DashboardDecor";
import { ModuleHeader, Reveal } from "@/components/dashboard/DashboardHelpers";
import ConfirmModal from "@/components/ui/ConfirmModal";
import GuildSettingsNav, { type GuildSettingsTab } from "./components/GuildSettingsNav";
import GuildSettingsSection from "./components/GuildSettingsSection";
import GuildPointsResetSection from "./components/GuildPointsResetSection";
import RegisterActivitySection from "./components/RegisterActivitySection";
import RoleManagementSection from "./components/RoleManagementSection";
import DistributionRulesSection from "./components/DistributionRulesSection";
import DiscordIntegrationSection from "./components/DiscordIntegrationSection";

const LEADER_TABS: GuildSettingsTab[] = ["general", "points", "activities", "distribution", "roles", "discord"];

export default function GuildSettingsPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [pendingTab, setPendingTab] = useState<GuildSettingsTab | null>(null);
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  const activeGuild = user?.guilds?.[0];
  const canManageSettings = activeGuild
    ? hasMinimumRole(activeGuild.role as GuildRoleType, "OFFICER")
    : false;

  const visibleTabs = useMemo(() => {
    const tabs = new Set<GuildSettingsTab>();
    if (canManageSettings) LEADER_TABS.forEach((t) => tabs.add(t));
    return tabs;
  }, [canManageSettings]);

  const [requestedTab, setRequestedTab] = useState<GuildSettingsTab | null>(null);
  const activeTab =
    requestedTab && visibleTabs.has(requestedTab)
      ? requestedTab
      : LEADER_TABS.find((t) => visibleTabs.has(t)) ?? null;

  useEffect(() => {
    if (!authLoading && !canManageSettings) {
      router.replace("/dashboard");
    }
  }, [canManageSettings, authLoading, router]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasUnsavedChanges) return;
      event.preventDefault();
      event.returnValue = "";
    };
    const handleDocumentClick = (event: MouseEvent) => {
      if (!hasUnsavedChanges) return;
      const target = event.target as Element | null;
      const anchor = target?.closest("a[href]") as HTMLAnchorElement | null;
      if (!anchor || anchor.target || anchor.href === window.location.href) return;
      event.preventDefault();
      event.stopPropagation();
      setPendingHref(anchor.href);
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("click", handleDocumentClick, true);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("click", handleDocumentClick, true);
    };
  }, [hasUnsavedChanges]);

  const handleTabChange = (tab: GuildSettingsTab) => {
    if (tab === activeTab) return;
    if (hasUnsavedChanges) {
      setPendingTab(tab);
      return;
    }
    setHasUnsavedChanges(false);
    setRequestedTab(tab);
  };

  const closeUnsavedConfirm = () => {
    setPendingTab(null);
    setPendingHref(null);
  };

  const confirmUnsavedNavigation = () => {
    setHasUnsavedChanges(false);
    if (pendingTab) {
      setRequestedTab(pendingTab);
      closeUnsavedConfirm();
      return;
    }
    if (pendingHref) {
      const href = pendingHref;
      closeUnsavedConfirm();
      window.location.assign(href);
    }
  };

  if (authLoading || !canManageSettings || !activeGuild || !activeTab) {
    return (
      <div className="glass rounded-2xl p-6 border border-white/[0.06] animate-pulse h-96 flex items-center justify-center">
        <span className="text-white/40 text-sm font-semibold tracking-wider animate-pulse">
          Verifying Authority...
        </span>
      </div>
    );
  }

  return (
    <div className="relative max-w-7xl mx-auto w-full pb-10">
      <DashboardDecor />

      <div className="relative z-10 space-y-6 text-white/85">
        <ModuleHeader
          eyebrow="Administration"
          title="Guild Settings"
          description="Configure Guild Points, activity multipliers, moderator permissions, and manage raid attendance — all in one place."
        />
        <p className="text-[12px] leading-relaxed text-white/45">
          Save each settings panel before switching tabs. Distribution-related changes can be reviewed from the Distribution page after saving.
        </p>

        <Reveal delay={80}>
          <GuildSettingsNav
            active={activeTab}
            onChange={handleTabChange}
            visibleTabs={visibleTabs}
          />
        </Reveal>

        <Reveal delay={120}>
          {activeTab === "general" && <GuildSettingsSection guildId={activeGuild.guildId} mode="general" onDirtyChange={setHasUnsavedChanges} />}
          {activeTab === "points" && (
            <div className="space-y-6">
              <GuildSettingsSection guildId={activeGuild.guildId} mode="points" onDirtyChange={setHasUnsavedChanges} />
              <GuildPointsResetSection guildId={activeGuild.guildId} />
            </div>
          )}
          {activeTab === "activities" && <RegisterActivitySection guildId={activeGuild.guildId} />}
          {activeTab === "roles" && <RoleManagementSection guildId={activeGuild.guildId} onDirtyChange={setHasUnsavedChanges} />}
          {activeTab === "distribution" && <DistributionRulesSection guildId={activeGuild.guildId} onDirtyChange={setHasUnsavedChanges} />}
          {activeTab === "discord" && <DiscordIntegrationSection guildId={activeGuild.guildId} />}
        </Reveal>
      </div>
      <ConfirmModal
        show={Boolean(pendingTab || pendingHref)}
        title="Unsaved Changes"
        message="You have unsaved guild settings changes. Save first, or continue and discard the current edits."
        confirmText="Discard changes"
        cancelText="Keep editing"
        onConfirm={confirmUnsavedNavigation}
        onCancel={closeUnsavedConfirm}
      />
    </div>
  );
}
