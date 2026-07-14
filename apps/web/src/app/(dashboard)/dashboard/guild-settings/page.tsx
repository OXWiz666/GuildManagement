"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useSocket } from "@/components/providers/socket-provider";
import { dashboardApi } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import DashboardDecor from "@/components/dashboard/DashboardDecor";
import { ModuleHeader, Reveal } from "@/components/dashboard/DashboardHelpers";
import { useQuery, queryClient } from "@/lib/query";
import GuildSettingsNav, { type GuildSettingsTab } from "./components/GuildSettingsNav";
import GuildSettingsSection from "./components/GuildSettingsSection";
import GuildPointsResetSection from "./components/GuildPointsResetSection";
import RegisterActivitySection from "./components/RegisterActivitySection";
import RoleManagementSection from "./components/RoleManagementSection";
import DistributionRulesSection from "./components/DistributionRulesSection";
import MountWishlistSection from "./components/MountWishlistSection";
import AttendanceVerification from "./components/AttendanceVerification";

const LEADER_TABS: GuildSettingsTab[] = ["points", "activities", "roles", "distribution", "mounts"];
const OFFICER_TABS: GuildSettingsTab[] = ["attendance"];

export default function GuildSettingsPage() {
  const { user, isLoading: authLoading } = useAuth();
  const { addToast } = useToast();
  const { socket } = useSocket();
  const router = useRouter();

  const activeGuild = user?.guilds?.[0];
  const isGuildLeader =
    !!activeGuild &&
    (activeGuild.role === "GUILD_LEADER" ||
      activeGuild.role === "FACTION_LEADER" ||
      activeGuild.role === "ADMIN");
  const isOfficer =
    !!activeGuild &&
    (isGuildLeader || activeGuild.role === "OFFICER");

  const visibleTabs = useMemo(() => {
    const tabs = new Set<GuildSettingsTab>();
    if (isGuildLeader) LEADER_TABS.forEach((t) => tabs.add(t));
    if (isOfficer) OFFICER_TABS.forEach((t) => tabs.add(t));
    return tabs;
  }, [isGuildLeader, isOfficer]);

  const [requestedTab, setRequestedTab] = useState<GuildSettingsTab | null>(null);
  const activeTab =
    requestedTab && visibleTabs.has(requestedTab)
      ? requestedTab
      : [...LEADER_TABS, ...OFFICER_TABS].find((t) => visibleTabs.has(t)) ?? null;

  const [isConfirmingRecordId, setIsConfirmingRecordId] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !isOfficer) {
      router.replace("/dashboard");
    }
  }, [isOfficer, authLoading, router]);

  const {
    data: pendingAttendanceRaw,
    isLoading: isLoadingAttendance,
    refetch: refetchAttendance,
  } = useQuery<any>(
    activeGuild && isOfficer ? `pending_attendance:${activeGuild.guildId}` : "pending_attendance_empty",
    async () => {
      if (!activeGuild || !isOfficer) return null;
      const result = await dashboardApi.getPendingAttendance(activeGuild.guildId);
      return result.success && result.data ? result.data : null;
    },
    { persist: true, staleTime: 15000 },
  );

  const activeSession = pendingAttendanceRaw?.activeSession || null;
  const pendingRecords = pendingAttendanceRaw?.pendingRecords || [];

  useEffect(() => {
    if (!socket || !activeGuild || !isOfficer) return;

    const handleAttendanceUpdate = () => {
      queryClient.invalidateQueries(`pending_attendance:${activeGuild.guildId}`);
    };

    socket.on("attendance_session_created", handleAttendanceUpdate);
    socket.on("attendance_session_updated", handleAttendanceUpdate);
    socket.on("attendance_session_deleted", handleAttendanceUpdate);
    socket.on("attendance_record_created", handleAttendanceUpdate);
    socket.on("attendance_record_confirmed", handleAttendanceUpdate);

    return () => {
      socket.off("attendance_session_created", handleAttendanceUpdate);
      socket.off("attendance_session_updated", handleAttendanceUpdate);
      socket.off("attendance_session_deleted", handleAttendanceUpdate);
      socket.off("attendance_record_created", handleAttendanceUpdate);
      socket.off("attendance_record_confirmed", handleAttendanceUpdate);
    };
  }, [socket, activeGuild, isOfficer]);

  const handleConfirmAttendance = useCallback(
    async (recordId: string) => {
      if (!activeGuild) return;
      setIsConfirmingRecordId(recordId);
      try {
        const result = await dashboardApi.confirmAttendance(recordId, activeGuild.guildId);
        if (result.success) {
          addToast("success", "Raid check-in verified successfully!");
          queryClient.invalidateQueries(`pending_attendance:${activeGuild.guildId}`);
          queryClient.invalidateQueries(`attendance_stats:${activeGuild.guildId}`);
          queryClient.invalidateQueries(`boss_schedules:${activeGuild.guildId}`);
        } else {
          addToast("error", result.error?.message || "Failed to confirm check-in");
        }
      } catch (err: any) {
        addToast("error", err?.message || "An error occurred");
      } finally {
        setIsConfirmingRecordId(null);
      }
    },
    [activeGuild, addToast],
  );

  if (authLoading || !isOfficer || !activeGuild || !activeTab) {
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
            counts={{ attendance: pendingRecords.length }}
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
          {activeTab === "attendance" && (
            <AttendanceVerification
              activeSession={activeSession}
              pendingRecords={pendingRecords}
              isLoading={isLoadingAttendance}
              isConfirmingRecordId={isConfirmingRecordId}
              onRefresh={refetchAttendance}
              onConfirm={handleConfirmAttendance}
            />
          )}
        </Reveal>
      </div>
    </div>
  );
}
