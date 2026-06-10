"use client";

import { useAuth } from "@/lib/auth-context";
import OnboardingDashboard from "@/components/dashboard/roles/OnboardingDashboard";
import MemberDashboard from "@/components/dashboard/roles/MemberDashboard";
import OfficerDashboard from "@/components/dashboard/roles/OfficerDashboard";
import GuildLeaderDashboard from "@/components/dashboard/roles/GuildLeaderDashboard";
import FactionLeaderDashboard from "@/components/dashboard/roles/FactionLeaderDashboard";
import AdminDashboard from "@/components/dashboard/roles/AdminDashboard";

export default function DashboardPage() {
  const { user } = useAuth();

  if (!user) return null;

  // 1. If user is not in any guilds, show onboarding flow
  if (user.guilds.length === 0) {
    return <OnboardingDashboard />;
  }

  // 2. Otherwise, check user's role in the active guild and delegate
  const activeGuild = user.guilds[0];
  const role = activeGuild.role;

  switch (role) {
    case "ADMIN":
      return <AdminDashboard />;
    case "ALLIANCE_LEADER":
      return <FactionLeaderDashboard />;
    case "GUILD_LEADER":
      return <GuildLeaderDashboard />;
    case "OFFICER":
      return <OfficerDashboard />;
    case "MEMBER":
    default:
      return <MemberDashboard />;
  }
}
