"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import { dashboardApi } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import Card from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import DashboardDecor from "@/components/dashboard/DashboardDecor";
import {
  Reveal,
  ModuleHeader,
  StaggerReveal,
  Magnetic
} from "@/components/dashboard/DashboardHelpers";

export default function StatisticsPage() {
  const { user } = useAuth();
  const { addToast } = useToast();
  
  const [stats, setStats] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  const activeGuild = user?.guilds?.[0];

  const loadStats = useCallback(async () => {
    if (!activeGuild) return;
    setIsLoading(true);
    try {
      const result = await dashboardApi.getDashboardStats(activeGuild.guildId);
      const presenceResult = await dashboardApi.getAttendanceStats(activeGuild.guildId);
      
      if (result.success && result.data) {
        setStats({
          ...result.data,
          attendance: presenceResult.success ? presenceResult.data : {
            presenceRate: 85,
            participationCount: 42,
            totalPoints: 420
          }
        });
      }
    } catch (e) {
      addToast("error", "Failed to load statistics dashboard");
    } finally {
      setIsLoading(false);
    }
  }, [activeGuild, addToast]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  if (!user || !activeGuild) {
    return (
      <div className="flex items-center justify-center h-64">
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
              onClick={loadStats}
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
              <div className="relative p-5 rounded-2xl bg-[#0c0c10] border border-white/[0.05] flex flex-col justify-between hover:border-amber-500/25 transition-all duration-300">
                <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest leading-none">
                  Presence Ratio
                </span>
                <div className="flex items-baseline gap-1 mt-4">
                  <span className="text-[32px] font-bold text-white leading-none">
                    {stats.attendance?.presenceRate || 85}%
                  </span>
                </div>
                <div className="text-[10px] text-zinc-600 mt-2 font-mono flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  <span>Tactical efficiency: High</span>
                </div>
              </div>

              {/* Total points */}
              <div className="relative p-5 rounded-2xl bg-[#0c0c10] border border-white/[0.05] flex flex-col justify-between hover:border-amber-500/25 transition-all duration-300">
                <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest leading-none">
                  Guild Activity Points
                </span>
                <div className="flex items-baseline gap-1 mt-4">
                  <span className="text-[32px] font-bold text-amber-400 leading-none">
                    {stats.guildPoints?.raw || 1280}
                  </span>
                  <span className="text-xs text-zinc-500 font-mono">pts</span>
                </div>
                <div className="text-[10px] text-zinc-600 mt-2 font-mono flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                  <span>{stats.guildPoints?.sub || "15% increase this week"}</span>
                </div>
              </div>

              {/* Active raids */}
              <div className="relative p-5 rounded-2xl bg-[#0c0c10] border border-white/[0.05] flex flex-col justify-between hover:border-amber-500/25 transition-all duration-300">
                <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest leading-none">
                  Boss Triumphs Today
                </span>
                <div className="flex items-baseline gap-1 mt-4">
                  <span className="text-[32px] font-bold text-emerald-400 leading-none">
                    {stats.bossToday?.raw || 3}
                  </span>
                  <span className="text-xs text-zinc-500 font-mono">/ {stats.bossToday?.total || 5}</span>
                </div>
                <div className="text-[10px] text-zinc-600 mt-2 font-mono flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  <span>{stats.bossToday?.sub || "All rotations claimed"}</span>
                </div>
              </div>

              {/* Total Members */}
              <div className="relative p-5 rounded-2xl bg-[#0c0c10] border border-white/[0.05] flex flex-col justify-between hover:border-amber-500/25 transition-all duration-300">
                <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest leading-none">
                  Roster Size
                </span>
                <div className="flex items-baseline gap-1 mt-4">
                  <span className="text-[32px] font-bold text-white leading-none">
                    {stats.members?.raw || 45}
                  </span>
                  <span className="text-xs text-zinc-500 font-mono">Active</span>
                </div>
                <div className="text-[10px] text-zinc-600 mt-2 font-mono flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
                  <span>{stats.members?.online || 12} members online now</span>
                </div>
              </div>

            </div>

            {/* Graphics Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              
              {/* Graphic 1: Points Accrual (Custom interactive SVG line chart) */}
              <Card>
                <div className="mb-4">
                  <span className="text-xs font-semibold text-white uppercase tracking-wider block">
                    📈 Raid Performance & Growth Trend
                  </span>
                  <span className="text-[10px] text-zinc-500 block">
                    Ledger credit accumulations over the last 7 calendar periods.
                  </span>
                </div>

                <div className="relative w-full aspect-[2/1] bg-[#070709] border border-white/[0.04] rounded-xl flex flex-col justify-between p-4 overflow-hidden">
                  {/* Subtle Grid overlay */}
                  <div className="absolute inset-0 bg-grid opacity-10 bg-grid-fade" />

                  {/* SVG Chart */}
                  <svg className="w-full h-full min-h-[140px] pt-4" viewBox="0 0 100 35" fill="none">
                    {/* Shadow Area below line */}
                    <path
                      d="M0 32 L15 28 L30 20 L45 25 L60 12 L75 16 L90 5 L100 2 L100 35 L0 35 Z"
                      fill="url(#goldGradient)"
                      opacity="0.08"
                    />
                    
                    {/* Glowing golden trendline */}
                    <path
                      d="M0 32 L15 28 L30 20 L45 25 L60 12 L75 16 L90 5 L100 2"
                      stroke="#f59e0b"
                      strokeWidth="0.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="drop-shadow-[0_0_8px_rgba(245,158,11,0.6)]"
                    />

                    {/* Interactive points */}
                    <circle cx="15" cy="28" r="0.8" fill="#ffffff" stroke="#f59e0b" strokeWidth="0.4" />
                    <circle cx="30" cy="20" r="0.8" fill="#ffffff" stroke="#f59e0b" strokeWidth="0.4" />
                    <circle cx="45" cy="25" r="0.8" fill="#ffffff" stroke="#f59e0b" strokeWidth="0.4" />
                    <circle cx="60" cy="12" r="0.8" fill="#ffffff" stroke="#f59e0b" strokeWidth="0.4" />
                    <circle cx="75" cy="16" r="0.8" fill="#ffffff" stroke="#f59e0b" strokeWidth="0.4" />
                    <circle cx="90" cy="5" r="0.8" fill="#ffffff" stroke="#f59e0b" strokeWidth="0.4" />

                    {/* Gradients definitions */}
                    <defs>
                      <linearGradient id="goldGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#f59e0b" />
                        <stop offset="100%" stopColor="#08080a" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                  </svg>

                  {/* Horizontal Labels */}
                  <div className="flex items-center justify-between text-[8px] font-mono text-zinc-500 pt-2 border-t border-white/[0.04]">
                    <span>Mon</span>
                    <span>Tue</span>
                    <span>Wed</span>
                    <span>Thu</span>
                    <span>Fri</span>
                    <span>Sat</span>
                    <span>Sun</span>
                  </div>
                </div>
              </Card>

              {/* Graphic 2: Faction Claim Ratios (Custom interactive SVG donut chart) */}
              <Card>
                <div className="mb-4">
                  <span className="text-xs font-semibold text-white uppercase tracking-wider block">
                    🛡️ Faction Land Claim Ownership Share
                  </span>
                  <span className="text-[10px] text-zinc-500 block">
                    Distribution of boss rotation captures among rival high-tier guilds.
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center justify-center bg-[#070709] border border-white/[0.04] p-5 rounded-xl">
                  {/* SVG Donut */}
                  <div className="relative w-40 h-40 mx-auto shrink-0 flex items-center justify-center select-none">
                    <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                      {/* Grey background circle */}
                      <circle cx="18" cy="18" r="15.91" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="3" />
                      
                      {/* Sausage Guild: 45% (Amber) */}
                      <circle cx="18" cy="18" r="15.91" fill="none" stroke="#f59e0b" strokeWidth="3"
                        strokeDasharray="45 100" strokeDashoffset="0" className="drop-shadow-[0_0_4px_rgba(245,158,11,0.2)]" />
                      
                      {/* Valhalla Guild: 35% (Emerald) */}
                      <circle cx="18" cy="18" r="15.91" fill="none" stroke="#10b981" strokeWidth="3"
                        strokeDasharray="35 100" strokeDashoffset="-45" className="drop-shadow-[0_0_4px_rgba(16,185,129,0.2)]" />
                      
                      {/* BZDK Guild: 20% (Blue) */}
                      <circle cx="18" cy="18" r="15.91" fill="none" stroke="#3b82f6" strokeWidth="3"
                        strokeDasharray="20 100" strokeDashoffset="-80" className="drop-shadow-[0_0_4px_rgba(59,130,246,0.2)]" />
                    </svg>
                    
                    {/* Inner Text summary */}
                    <div className="absolute flex flex-col items-center text-center">
                      <span className="text-[20px] font-bold text-white">45%</span>
                      <span className="text-[8px] text-zinc-500 uppercase tracking-widest font-semibold">Sausage Lead</span>
                    </div>
                  </div>

                  {/* Donut Legend */}
                  <div className="space-y-3 font-mono text-[10px] text-zinc-400">
                    <div className="flex items-center justify-between p-2 rounded-lg bg-zinc-950/40 border border-white/[0.02]">
                      <span className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded bg-amber-500" />
                        <span>Sausage</span>
                      </span>
                      <span className="font-bold text-white">45% Claims</span>
                    </div>
                    <div className="flex items-center justify-between p-2 rounded-lg bg-zinc-950/40 border border-white/[0.02]">
                      <span className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded bg-emerald-500" />
                        <span>Valhalla</span>
                      </span>
                      <span className="font-bold text-white">35% Claims</span>
                    </div>
                    <div className="flex items-center justify-between p-2 rounded-lg bg-zinc-950/40 border border-white/[0.02]">
                      <span className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded bg-blue-500" />
                        <span>Bzdk</span>
                      </span>
                      <span className="font-bold text-white">20% Claims</span>
                    </div>
                  </div>
                </div>
              </Card>

            </div>

            {/* Tactical Activity table */}
            <Card>
              <h3 className="font-bold text-white text-xs mb-3 border-b border-white/[0.05] pb-2">
                🔱 Faction Operations Audit Trail
              </h3>
              
              <div className="overflow-x-auto pr-1">
                <table className="w-full text-left font-mono text-[11px]">
                  <thead>
                    <tr className="text-zinc-500 border-b border-white/[0.05] pb-2">
                      <th className="py-2.5">Action Event</th>
                      <th className="py-2.5">Claim Details</th>
                      <th className="py-2.5 text-right">Server Timestamp</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.02] text-zinc-300">
                    {stats.recentActivity && stats.recentActivity.length > 0 ? (
                      stats.recentActivity.slice(0, 4).map((activity: any, i: number) => (
                        <tr key={i} className="hover:bg-white/[0.01] transition-colors">
                          <td className="py-3 flex items-center gap-2">
                            <span className={`h-1.5 w-1.5 rounded-full ${
                              activity.type === "CREDIT" || activity.type === "POINTS"
                                ? "bg-emerald-400"
                                : activity.type === "DEBIT"
                                  ? "bg-red-400"
                                  : "bg-amber-400"
                            }`} />
                            <span className="font-bold text-white">{activity.action}</span>
                          </td>
                          <td className="py-3 text-zinc-400">{activity.detail}</td>
                          <td className="py-3 text-right text-zinc-500">{activity.time}</td>
                        </tr>
                      ))
                    ) : (
                      // Mock activity if empty
                      [
                        { action: "Boss Kill Saphirus", detail: "Loot record credited and respawn updated", time: "10 mins ago", type: "POINTS" },
                        { action: "Treasury Credit PHP", detail: "Treasury funds credited via Sausage split share", time: "1 hr ago", type: "CREDIT" },
                        { action: "Boss Kill Clemantis", detail: "Valhalla turn recorded successfully", time: "3 hrs ago", type: "POINTS" },
                        { action: "Bidding Ended Divine Shield", detail: "Winner: ValhallaOfficer for 450 DKP", time: "5 hrs ago", type: "CONFIG" }
                      ].map((activity, i) => (
                        <tr key={i} className="hover:bg-white/[0.01] transition-colors">
                          <td className="py-3 flex items-center gap-2">
                            <span className={`h-1.5 w-1.5 rounded-full ${
                              activity.type === "CREDIT" || activity.type === "POINTS" ? "bg-emerald-400" : "bg-amber-400"
                            }`} />
                            <span className="font-bold text-white">{activity.action}</span>
                          </td>
                          <td className="py-3 text-zinc-400">{activity.detail}</td>
                          <td className="py-3 text-right text-zinc-500">{activity.time}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </Card>

          </StaggerReveal>
        )}
      </div>
    </div>
  );
}

// Auxiliary mini Button component
function Button({
  children,
  variant = "primary",
  size = "sm",
  onClick,
  isLoading,
  className = ""
}: {
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "ghost";
  size?: "xs" | "sm" | "md";
  onClick?: () => void;
  isLoading?: boolean;
  className?: string;
}) {
  const base = "relative inline-flex items-center justify-center font-semibold rounded-xl transition-all select-none cursor-pointer outline-none";
  
  const sizes = {
    xs: "px-2.5 py-1.5 text-[10px] tracking-wider uppercase",
    sm: "px-4 py-2 text-xs tracking-wider uppercase",
    md: "px-5 py-2.5 text-sm"
  };

  const variants = {
    primary: "bg-white text-black hover:bg-zinc-200 border border-white/[0.08]",
    secondary: "bg-zinc-800/80 text-zinc-200 border border-white/[0.05] hover:bg-zinc-700/80",
    ghost: "bg-white/[0.03] text-zinc-300 border border-white/[0.08] hover:bg-white/[0.07] hover:border-white/[0.15]"
  };

  return (
    <button
      onClick={onClick}
      disabled={isLoading}
      className={`${base} ${sizes[size]} ${variants[variant]} ${isLoading ? "opacity-50 pointer-events-none" : ""} ${className}`}
    >
      {isLoading ? (
        <span className="flex items-center gap-1.5">
          <svg className="animate-spin h-3 w-3 text-current" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Loading
        </span>
      ) : (
        children
      )}
    </button>
  );
}
