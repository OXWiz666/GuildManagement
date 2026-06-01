"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useSocket } from "@/components/providers/socket-provider";
import { guildApi, dashboardApi, type JoinRequestData } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import DashboardDecor from "@/components/dashboard/DashboardDecor";
import { ModuleHeader, Reveal } from "@/components/dashboard/DashboardHelpers";
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
      activeGuild.role === "ALLIANCE_LEADER" ||
      activeGuild.role === "ADMIN");

  // State
  const [applications, setApplications] = useState<JoinRequestData[]>([]);
  const [isLoadingApps, setIsLoadingApps] = useState(false);
  const [isReviewingId, setIsReviewingId] = useState<string | null>(null);

  const [activeSession, setActiveSession] = useState<any>(null);
  const [pendingRecords, setPendingRecords] = useState<any[]>([]);
  const [isLoadingAttendance, setIsLoadingAttendance] = useState(false);
  const [isConfirmingRecordId, setIsConfirmingRecordId] = useState<string | null>(null);

  // Verification Check
  useEffect(() => {
    if (!authLoading && !isOfficer) {
      router.replace("/dashboard");
    }
  }, [isOfficer, authLoading, router]);

  // Load Membership Applications
  const loadApplications = useCallback(async () => {
    if (!activeGuild) return;
    setIsLoadingApps(true);
    try {
      const result = await guildApi.getGuildApplications(activeGuild.guildId);
      if (result.success && result.data?.applications) {
        setApplications(result.data.applications);
      }
    } catch {
      addToast("error", "Failed to load guild applications");
    } finally {
      setIsLoadingApps(false);
    }
  }, [activeGuild, addToast]);

  // Load Active Attendance and Pending Check-ins
  const loadAttendanceQueue = useCallback(async () => {
    if (!activeGuild) return;
    setIsLoadingAttendance(true);
    try {
      const result = await dashboardApi.getPendingAttendance(activeGuild.guildId);
      if (result.success && result.data) {
        setActiveSession(result.data.activeSession);
        setPendingRecords(result.data.pendingRecords || []);
      }
    } catch {
      addToast("error", "Failed to load active attendance portal");
    } finally {
      setIsLoadingAttendance(false);
    }
  }, [activeGuild, addToast]);

  useEffect(() => {
    if (isOfficer && activeGuild) {
      loadApplications();
      loadAttendanceQueue();
    }
  }, [isOfficer, activeGuild, loadApplications, loadAttendanceQueue]);

  // Listen to real-time events to refresh applications queue and attendance verification queue instantly
  useEffect(() => {
    if (!socket || !activeGuild || !isOfficer) return;

    const handleApplicationsUpdate = () => {
      console.log("[Officer Panel Socket]: Applications updated. Refreshing queue...");
      loadApplications();
    };

    const handleAttendanceUpdate = () => {
      console.log("[Officer Panel Socket]: Attendance record/session updated. Refreshing verification queue...");
      loadAttendanceQueue();
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
  }, [socket, activeGuild, isOfficer, loadApplications, loadAttendanceQueue]);

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
        loadApplications();
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
        loadAttendanceQueue();
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
              onRefresh={loadApplications}
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
              onRefresh={loadAttendanceQueue}
              onConfirm={handleConfirmAttendance}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
