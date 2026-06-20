"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useSocket } from "@/components/providers/socket-provider";
import { guildApi, dashboardApi, type JoinRequestData } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import DashboardDecor from "@/components/dashboard/DashboardDecor";
import { ModuleHeader, Reveal } from "@/components/dashboard/DashboardHelpers";
import { useQuery, queryClient } from "@/lib/query";
import OfficerQuickLinks from "./components/OfficerQuickLinks";
import ApplicationsQueue from "./components/ApplicationsQueue";
import AttendanceVerification from "./components/AttendanceVerification";

export default function OfficerPanelPage() {
  const { user, isLoading: authLoading } = useAuth();
  const { addToast } = useToast();
  const { socket } = useSocket();
  const router = useRouter();

  const activeGuild = user?.guilds?.[0];
  const isOfficer =
    activeGuild &&
    (activeGuild.role === "OFFICER" ||
      activeGuild.role === "GUILD_LEADER" ||
      activeGuild.role === "FACTION_LEADER" ||
      activeGuild.role === "ADMIN");

  // State
  const [isReviewingId, setIsReviewingId] = useState<string | null>(null);
  const [isConfirmingRecordId, setIsConfirmingRecordId] = useState<string | null>(null);

  // Verification Check
  useEffect(() => {
    if (!authLoading && !isOfficer) {
      router.replace("/dashboard");
    }
  }, [isOfficer, authLoading, router]);

  // ─── Persistent Queries ────────────────────────────────

  // 1. Applications Query (shares key!)
  const {
    data: applicationsRaw,
    isLoading: isLoadingApps,
    refetch: refetchApplications,
  } = useQuery<JoinRequestData[]>(
    activeGuild ? `guild_applications:${activeGuild.guildId}` : "guild_applications_empty",
    async () => {
      if (!activeGuild || !isOfficer) return [];
      const result = await guildApi.getGuildApplications(activeGuild.guildId);
      return result.success && result.data?.applications ? result.data.applications : [];
    },
    { persist: true, staleTime: 30000 }
  );
  const applications = applicationsRaw || [];

  // 2. Attendance Query (shares key!)
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
    { persist: true, staleTime: 15000 }
  );

  const activeSession = pendingAttendanceRaw?.activeSession || null;
  const pendingRecords = pendingAttendanceRaw?.pendingRecords || [];

  // Listen to Socket.IO real-time events for instant cache invalidation
  useEffect(() => {
    if (!socket || !activeGuild || !isOfficer) return;

    const handleApplicationsUpdate = () => {
      console.log("[Officer Panel Socket]: Applications updated. Refreshing queue...");
      queryClient.invalidateQueries(`guild_applications:${activeGuild.guildId}`);
    };

    const handleAttendanceUpdate = () => {
      console.log("[Officer Panel Socket]: Attendance record/session updated. Refreshing queue...");
      queryClient.invalidateQueries(`pending_attendance:${activeGuild.guildId}`);
    };

    socket.on("join_request_created", handleApplicationsUpdate);
    socket.on("join_request_cancelled", handleApplicationsUpdate);
    socket.on("join_request_processed", handleApplicationsUpdate);

    socket.on("attendance_session_created", handleAttendanceUpdate);
    socket.on("attendance_session_updated", handleAttendanceUpdate);
    socket.on("attendance_session_deleted", handleAttendanceUpdate);
    socket.on("attendance_record_created", handleAttendanceUpdate);
    socket.on("attendance_record_confirmed", handleAttendanceUpdate);

    return () => {
      socket.off("join_request_created", handleApplicationsUpdate);
      socket.off("join_request_cancelled", handleApplicationsUpdate);
      socket.off("join_request_processed", handleApplicationsUpdate);

      socket.off("attendance_session_created", handleAttendanceUpdate);
      socket.off("attendance_session_updated", handleAttendanceUpdate);
      socket.off("attendance_session_deleted", handleAttendanceUpdate);
      socket.off("attendance_record_created", handleAttendanceUpdate);
      socket.off("attendance_record_confirmed", handleAttendanceUpdate);
    };
  }, [socket, activeGuild, isOfficer]);

  // Review Application (Accept/Decline)
  async function handleReviewApplication(requestId: string, action: "ACCEPT" | "DECLINE") {
    if (!activeGuild) return;
    setIsReviewingId(requestId);
    try {
      const result = await guildApi.reviewApplication(activeGuild.guildId, requestId, action);
      if (result.success) {
        addToast(
          "success",
          action === "ACCEPT"
            ? "Applicant accepted into the guild!"
            : "Application declined successfully."
        );
        queryClient.invalidateQueries(`guild_applications:${activeGuild.guildId}`);
        queryClient.invalidateQueries(`guild_members:${activeGuild.guildId}`);
      } else {
        addToast("error", result.error?.message || "Failed to review application");
      }
    } catch (err: any) {
      addToast("error", err?.message || "An error occurred");
    } finally {
      setIsReviewingId(null);
    }
  }

  // Confirm Attendance Record
  async function handleConfirmAttendance(recordId: string) {
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
  }

  if (authLoading || !isOfficer || !activeGuild) {
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

      <div className="relative z-10 space-y-8 text-white/85">
        <ModuleHeader
          eyebrow="Raid & Administration"
          title="Officer Panel"
          description="Central operations hub to manage raid attendance check-ins, approve guild membership applications, and access shortcut utilities."
        />

        {/* Quick Utilities Hub */}
        <Reveal>
          <OfficerQuickLinks />
        </Reveal>

        {/* Dual Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Join Applications Queue */}
          <div className="lg:col-span-2 space-y-4">
            <ApplicationsQueue
              applications={applications}
              isLoading={isLoadingApps}
              isReviewingId={isReviewingId}
              onRefresh={refetchApplications}
              onReview={handleReviewApplication}
            />
          </div>

          {/* Active Attendance Portal verification */}
          <div className="space-y-4">
            <AttendanceVerification
              activeSession={activeSession}
              pendingRecords={pendingRecords}
              isLoading={isLoadingAttendance}
              isConfirmingRecordId={isConfirmingRecordId}
              onRefresh={refetchAttendance}
              onConfirm={handleConfirmAttendance}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
