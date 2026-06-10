"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import { dashboardApi } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import Button from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import DashboardDecor from "@/components/dashboard/DashboardDecor";
import {
  ModuleHeader,
  StaggerReveal
} from "@/components/dashboard/DashboardHelpers";

// Subcomponents
import StatCard from "./components/StatCard";
import PerformanceChart from "./components/PerformanceChart";
import FactionClaimsChart from "./components/FactionClaimsChart";
import AuditTrailTable from "./components/AuditTrailTable";
import AttendanceHistoryTable from "./components/AttendanceHistoryTable";

import { useMemo } from "react";
import { useQuery, queryClient } from "@/lib/query";

export default function StatisticsPage() {
  const { user } = useAuth();
  const { addToast } = useToast();
  
  const activeGuild = user?.guilds?.[0];

  // ─── Persistent Queries ────────────────────────────────

  // 1. Dashboard Stats Query (shares cache key!)
  const {
    data: dashboardStats,
    isLoading: isLoadingDashboard,
  } = useQuery<any | null>(
    activeGuild ? `dashboard_stats:${activeGuild.guildId}` : "dashboard_stats_empty",
    async () => {
      if (!activeGuild) return null;
      const result = await dashboardApi.getDashboardStats(activeGuild.guildId);
      return result.success && result.data ? result.data : null;
    },
    { persist: true, staleTime: 30000 }
  );

  // 2. Attendance Stats Query (shares cache key!)
  const {
    data: attendanceStats,
    isLoading: isLoadingAttendance,
  } = useQuery<any | null>(
    activeGuild ? `attendance_stats:${activeGuild.guildId}` : "attendance_stats_empty",
    async () => {
      if (!activeGuild) return null;
      const result = await dashboardApi.getAttendanceStats(activeGuild.guildId);
      return result.success && result.data ? result.data : null;
    },
    { persist: true, staleTime: 30000 }
  );

  const stats = useMemo(() => {
    if (!dashboardStats) return null;
    return {
      ...dashboardStats,
      attendance: attendanceStats || {
        presenceRate: 85,
        participationCount: 42,
        totalPoints: 420
      }
    };
  }, [dashboardStats, attendanceStats]);

  const isLoading = isLoadingDashboard || isLoadingAttendance;

  const handleRecalculate = () => {
    if (!activeGuild) return;
    queryClient.invalidateQueries(`dashboard_stats:${activeGuild.guildId}`);
    queryClient.invalidateQueries(`attendance_stats:${activeGuild.guildId}`);
  };

  if (!user || !activeGuild) {
    return (
      <div className="flex items-center justify-center h-64 animate-fade-in">
        <p className="text-white/40">No active guild selected</p>
      </div>
    );
  }

  return (
    <div className="relative max-w-full xl:max-w-[1600px] mx-auto w-full px-2 md:px-4 lg:px-6">
      <DashboardDecor />

      <div className="relative z-10 space-y-6 text-white/85">
        
        {/* Module Header */}
        <ModuleHeader
          eyebrow="Raid Operations"
          title="Statistics & analytics"
          description="High-fidelity visual performance indicators, presence ratios, points ledgers, and tactical metrics."
          right={
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRecalculate}
              isLoading={isLoading}
            >
              Recalculate Stats
            </Button>
          }
        />

        {/* LOADING SHIMMER */}
        {isLoading || !stats ? (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-32 rounded-2xl animate-pulse" />
              ))}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Skeleton className="h-80 rounded-2xl animate-pulse" />
              <Skeleton className="h-80 rounded-2xl animate-pulse" />
            </div>
          </div>
        ) : (
          <StaggerReveal baseDelay={80} stagger={60} className="space-y-6">
            
            {/* Top Cards row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              
              {/* Presence rate */}
              <StatCard
                title="Presence Ratio"
                value={`${stats.attendance?.presenceRate || 85}%`}
                detail="Tactical efficiency: High"
                type="presence"
              />

              {/* Total points */}
              <StatCard
                title="Guild Activity Points"
                value={stats.guildPoints?.raw || 1280}
                subValue="pts"
                detail={stats.guildPoints?.sub || "15% increase this week"}
                type="points"
              />

              {/* Active raids */}
              <StatCard
                title="Bosses Defeated Today"
                value={stats.bossToday?.raw || 3}
                subValue={`/ ${stats.bossToday?.total || 5}`}
                detail={stats.bossToday?.sub || "All rotations claimed"}
                type="raids"
              />

              {/* Total Members */}
              <StatCard
                title="Total Members"
                value={stats.members?.raw || 45}
                subValue="Active"
                detail={`${stats.members?.online || 12} members online now`}
                type="roster"
              />

            </div>

            {/* Graphics Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              
              {/* Graphic 1: Points Accrual (Custom interactive SVG line chart) */}
              <PerformanceChart data={stats.performanceHistory} />

              {/* Graphic 2: Faction Claim Ratios (Custom interactive SVG donut chart) */}
              <FactionClaimsChart data={stats.factionClaims} />

            </div>

            {/* Tactical Activity & Personal Attendance History */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <AuditTrailTable recentActivity={stats.recentActivity} />
              <AttendanceHistoryTable history={stats.attendance?.history} />
            </div>

          </StaggerReveal>
        )}
      </div>
    </div>
  );
}
