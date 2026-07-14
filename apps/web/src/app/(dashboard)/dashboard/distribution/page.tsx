"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useSocket } from "@/components/providers/socket-provider";
import { queryClient } from "@/lib/query";
import DashboardDecor from "@/components/dashboard/DashboardDecor";
import { ModuleHeader } from "@/components/dashboard/DashboardHelpers";
import LegendaryPriorityTab from "../guild-market/components/LegendaryPriorityTab";
import ItemDistributionTab from "../guild-market/components/ItemDistributionTab";
import DistributionHistoryTab from "../guild-market/components/DistributionHistoryTab";
import RequestItemPanel from "../guild-market/components/RequestItemPanel";

type DistributionTab = "legendary" | "wishlist" | "requests" | "history";

const TABS: Array<{ value: DistributionTab; label: string; short: string; icon: React.ReactNode }> = [
  {
    value: "legendary",
    label: "Legendary Priority",
    short: "Legendary",
    icon: (
      <svg className="h-[15px] w-[15px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />
      </svg>
    ),
  },
  {
    value: "wishlist",
    label: "Member Wishlist",
    short: "Wishlist",
    icon: (
      <svg className="h-[15px] w-[15px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="8" width="18" height="4" rx="1" />
        <path d="M12 8v13M5 12v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7" />
        <path d="M12 8S10 2 7 4s5 4 5 4M12 8s2-6 5-4-5 4-5 4" />
      </svg>
    ),
  },
  {
    value: "requests",
    label: "Resource Requests",
    short: "Requests",
    icon: (
      <svg className="h-[15px] w-[15px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 12h-6l-2 3h-4l-2-3H2" />
        <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
      </svg>
    ),
  },
  {
    value: "history",
    label: "History",
    short: "History",
    icon: (
      <svg className="h-[15px] w-[15px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 3H5a2 2 0 0 0-2 2v3h5" />
        <path d="M16 3H8v14a2 2 0 0 1-2 2h11a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2z" />
        <path d="M11 8h4M11 12h4" />
      </svg>
    ),
  },
];

export default function DistributionPage() {
  const { user } = useAuth();
  const { socket } = useSocket();
  const [activeTab, setActiveTab] = useState<DistributionTab>("legendary");

  const activeGuild = user?.guilds?.[0];
  const isGuildLeader =
    activeGuild?.role === "GUILD_LEADER" ||
    activeGuild?.role === "FACTION_LEADER" ||
    activeGuild?.role === "ADMIN";
  const isOfficer = activeGuild?.role === "OFFICER" || isGuildLeader;

  // Real-time refresh — same distribution-module events the Guild Market page
  // used to listen for, now scoped to this standalone page.
  useEffect(() => {
    if (!socket || !activeGuild) return;
    const gid = activeGuild.guildId;

    const handleLegendary = () => queryClient.invalidateQueries(`market_legendary:${gid}`);
    const handleDistribution = () => {
      queryClient.invalidateQueries(`market_priority:${gid}`);
      queryClient.invalidateQueries(`market_distributions:${gid}`);
      queryClient.invalidateQueries(`market_distributions_mine:${gid}`);
      queryClient.invalidateQueries(`market_audit:${gid}`);
    };
    const handlePriority = () => queryClient.invalidateQueries(`market_priority:${gid}`);

    socket.on("legendary_priority_submitted", handleLegendary);
    socket.on("legendary_priority_updated", handleLegendary);
    socket.on("item_distributed", handleDistribution);
    socket.on("priority_sequence_changed", handlePriority);
    socket.on("market_rules_updated", handlePriority);

    return () => {
      socket.off("legendary_priority_submitted", handleLegendary);
      socket.off("legendary_priority_updated", handleLegendary);
      socket.off("item_distributed", handleDistribution);
      socket.off("priority_sequence_changed", handlePriority);
      socket.off("market_rules_updated", handlePriority);
    };
  }, [socket, activeGuild]);

  if (!user || !activeGuild) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-white/40">No active guild selected</p>
      </div>
    );
  }

  return (
    <div className="relative max-w-7xl mx-auto w-full px-2 md:px-4 pb-12">
      <DashboardDecor />

      <div className="relative z-10 space-y-6 text-white/85">
        <ModuleHeader
          eyebrow="Distribution"
          title="Distribution"
          description="Legendary priority requests, member wishlists, and the full distribution audit trail."
        />

        {/* Local tab nav */}
        <div className="flex items-stretch gap-1.5 overflow-x-auto rounded-2xl border border-white/[0.06] bg-[#0c0d12]/50 backdrop-blur p-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.value;
            return (
              <button
                key={tab.value}
                onClick={() => setActiveTab(tab.value)}
                aria-current={isActive ? "page" : undefined}
                className={`group relative flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-[12px] font-semibold transition-all duration-300 cursor-pointer ${
                  isActive
                    ? "bg-white/[0.07] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                    : "text-white/45 hover:text-white/85 hover:bg-white/[0.03]"
                }`}
              >
                <span className={`transition-colors duration-300 ${isActive ? "text-[var(--forge-gold-bright)]" : "text-white/40 group-hover:text-white/70"}`}>
                  {tab.icon}
                </span>
                <span className="whitespace-nowrap">
                  <span className="hidden sm:inline">{tab.label}</span>
                  <span className="sm:hidden">{tab.short}</span>
                </span>
                {isActive && (
                  <span
                    aria-hidden
                    className="absolute -bottom-[3px] left-1/2 h-[2px] w-6 -translate-x-1/2 rounded-full bg-[var(--forge-gold)]"
                    style={{ boxShadow: "0 0 8px 1px rgba(212,168,83,0.6)" }}
                  />
                )}
              </button>
            );
          })}
        </div>

        <div key={activeTab} className="market-tab-panel">
          {activeTab === "legendary" && <LegendaryPriorityTab guildId={activeGuild.guildId} />}
          {activeTab === "wishlist" && <ItemDistributionTab guildId={activeGuild.guildId} isOfficer={isOfficer} />}
          {activeTab === "requests" && <RequestItemPanel guildId={activeGuild.guildId} isOfficer={isOfficer} />}
          {activeTab === "history" && <DistributionHistoryTab guildId={activeGuild.guildId} isOfficer={isOfficer} />}
        </div>
      </div>
    </div>
  );
}
