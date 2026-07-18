"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import DashboardDecor from "@/components/dashboard/DashboardDecor";
import { ModuleHeader, Reveal } from "@/components/dashboard/DashboardHelpers";
import GuildSettingsNav, { type GuildSettingsTab } from "./components/GuildSettingsNav";
import GuildSettingsSection from "./components/GuildSettingsSection";
import GuildPointsResetSection from "./components/GuildPointsResetSection";
import RegisterActivitySection from "./components/RegisterActivitySection";
import RoleManagementSection from "./components/RoleManagementSection";
import DistributionRulesSection from "./components/DistributionRulesSection";
import MountWishlistSection from "./components/MountWishlistSection";
import DiscordIntegrationSection from "./components/DiscordIntegrationSection";

const LEADER_TABS: GuildSettingsTab[] = ["points", "activities", "roles", "distribution", "mounts", "discord"];

export default function GuildSettingsPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();

  const activeGuild = user?.guilds?.[0];
  const isGuildLeader =
    !!activeGuild &&
    (activeGuild.role === "GUILD_LEADER" ||
      activeGuild.role === "FACTION_LEADER" ||
      activeGuild.role === "ADMIN");

  const visibleTabs = useMemo(() => {
    const tabs = new Set<GuildSettingsTab>();
    if (isGuildLeader) LEADER_TABS.forEach((t) => tabs.add(t));
    return tabs;
  }, [isGuildLeader]);

  const [requestedTab, setRequestedTab] = useState<GuildSettingsTab | null>(null);
  const activeTab =
    requestedTab && visibleTabs.has(requestedTab)
      ? requestedTab
      : LEADER_TABS.find((t) => visibleTabs.has(t)) ?? null;

  useEffect(() => {
    if (!authLoading && !isGuildLeader) {
      router.replace("/dashboard");
    }
  }, [isGuildLeader, authLoading, router]);

  if (authLoading || !isGuildLeader || !activeGuild || !activeTab) {
    return (
      <div className="glass rounded-2xl p-6 border border-white/[0.06] animate-pulse h-96 flex items-center justify-center">
        <span className="text-white/40 text-sm font-semibold tracking-wider animate-pulse">
          Verifying Authority...
        </span>
      </div>
    );
  }

  return (
    <div className="relative max-w-6xl mx-auto w-full pb-10">
      <DashboardDecor />

      <div className="relative z-10 space-y-6 text-white/85">
        <ModuleHeader
          eyebrow="Administration"
          title="Guild Settings"
          description="Configure Guild Points, activity multipliers, moderator permissions, and manage raid attendance — all in one place."
        />

        <Reveal delay={80}>
          <GuildSettingsNav
            active={activeTab}
            onChange={setRequestedTab}
            visibleTabs={visibleTabs}
          />
        </Reveal>

        <Reveal delay={120}>
          {activeTab === "points" && (
            <div className="space-y-6">
              <GuildSettingsSection guildId={activeGuild.guildId} />
              <GuildPointsResetSection guildId={activeGuild.guildId} />
            </div>
          )}
          {activeTab === "activities" && <RegisterActivitySection guildId={activeGuild.guildId} />}
          {activeTab === "roles" && <RoleManagementSection guildId={activeGuild.guildId} />}
          {activeTab === "distribution" && <DistributionRulesSection guildId={activeGuild.guildId} />}
          {activeTab === "mounts" && <MountWishlistSection guildId={activeGuild.guildId} />}
          {activeTab === "discord" && <DiscordIntegrationSection guildId={activeGuild.guildId} />}
        </Reveal>
      </div>
    </div>
  );
}
