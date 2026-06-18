"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import DashboardDecor from "@/components/dashboard/DashboardDecor";
import { ModuleHeader } from "@/components/dashboard/DashboardHelpers";
import LeaderPanelContent from "./components/LeaderPanelContent";

export default function LeaderPanelPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  const activeGuild = user?.guilds?.[0];
  const isLeader =
    activeGuild &&
    (activeGuild.role === "GUILD_LEADER" ||
      activeGuild.role === "FACTION_LEADER" ||
      activeGuild.role === "ADMIN");

  useEffect(() => {
    if (!isLoading && !isLeader) {
      router.replace("/dashboard");
    }
  }, [isLeader, isLoading, router]);

  if (isLoading || !isLeader) {
    return (
      <div className="glass rounded-2xl p-6 border border-white/[0.06] animate-pulse h-96 flex items-center justify-center">
        <span className="text-white/40 text-sm font-semibold tracking-wider animate-pulse">
          Verifying Authority...
        </span>
      </div>
    );
  }

  return (
    <div className="relative max-w-4xl mx-auto w-full pb-10">
      <DashboardDecor />

      <div className="relative z-10 space-y-7 text-white/85">
        <ModuleHeader
          eyebrow="Management"
          title="Leader Panel"
          description="Guild points configurations, preferred economies, tax overrides, and active DKP leaderboard lists."
        />

        <LeaderPanelContent guildId={activeGuild.guildId} />
      </div>
    </div>
  );
}
