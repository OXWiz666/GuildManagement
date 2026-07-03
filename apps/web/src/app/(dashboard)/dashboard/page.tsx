"use client";

import { useAuth } from "@/lib/auth-context";
import OnboardingDashboard from "@/components/dashboard/roles/OnboardingDashboard";
import MemberDashboard from "@/components/dashboard/roles/MemberDashboard";
import OfficerDashboard from "@/components/dashboard/roles/OfficerDashboard";
import GuildLeaderDashboard from "@/components/dashboard/roles/GuildLeaderDashboard";
import FactionLeaderDashboard from "@/components/dashboard/roles/FactionLeaderDashboard";
import AdminDashboard from "@/components/dashboard/roles/AdminDashboard";

export default function DashboardPage() {
  const { user, isSessionReady } = useAuth();

  if (!user) return null;

  // 1. If user is not in any guilds, show onboarding flow.
  //    Guard on isSessionReady: right after login the user is seeded with an
  //    empty guilds array while refreshUser() fetches the real membership. If
  //    we rendered onboarding during that gap, a user who already has a guild
  //    would briefly see the "Join Guild" screen before it flips to their real
  //    dashboard. Wait until the profile is fully loaded before deciding.
  if (user.guilds.length === 0) {
    if (!isSessionReady) {
      return (
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-forge-gold/30 border-t-forge-gold" />
        </div>
      );
    }
    return <OnboardingDashboard />;
  }

  // 2. Otherwise, check user's role in the active guild and delegate
  const activeGuild = user.guilds[0];
  const role = activeGuild.role;

  switch (role) {
    case "ADMIN":
      return <AdminDashboard />;
    case "FACTION_LEADER":
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
