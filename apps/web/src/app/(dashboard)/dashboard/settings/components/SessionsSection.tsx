"use client";

import React from "react";
import SettingsCard from "./SettingsCard";
import Button from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { StaggerReveal, LiveDot, Magnetic } from "@/components/dashboard/DashboardHelpers";

export interface SessionData {
  id: string;
  deviceInfo: string | null;
  ipAddress: string | null;
  lastActive: string;
  createdAt: string;
  isCurrent: boolean;
}

export interface SessionsSectionProps {
  sessions: SessionData[];
  isLoadingSessions: boolean;
  handleRevokeSession: (sessionId: string) => void;
  handleLogoutAll: () => void;
}

export default function SessionsSection({
  sessions,
  isLoadingSessions,
  handleRevokeSession,
  handleLogoutAll,
}: SessionsSectionProps) {
  return (
    <SettingsCard
      eyebrow="Devices"
      title="Active sessions"
      description="Where you're currently signed in. Revoke any you don't recognize."
      right={
        <Magnetic strength={4}>
          <Button variant="danger" size="xs" onClick={handleLogoutAll}>
            Sign out everywhere
          </Button>
        </Magnetic>
      }
    >
      {isLoadingSessions ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-16 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : sessions.length === 0 ? (
        <p className="text-white/40 text-center py-6 text-[13px]">
          No active sessions
        </p>
      ) : (
        <StaggerReveal baseDelay={60} stagger={70} className="space-y-2">
          {sessions.map((session) => (
            <div
              key={session.id}
              className="group flex items-center gap-4 p-4 rounded-xl bg-white/[0.02] border border-white/[0.05] hover:bg-white/[0.04] hover:border-white/[0.12] transition-all duration-300"
            >
              <div className="h-10 w-10 rounded-lg bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-white/60 shrink-0 transition-transform duration-300 group-hover:scale-[1.04]">
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                >
                  <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                  <line x1="8" y1="21" x2="16" y2="21" />
                  <line x1="12" y1="17" x2="12" y2="21" />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-[13px] font-medium text-white truncate">
                    {session.deviceInfo || "Unknown device"}
                  </p>
                  {session.isCurrent && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-medium bg-emerald-500/[0.10] text-emerald-300 rounded border border-emerald-500/20">
                      <LiveDot tone="emerald" size={5} />
                      Current
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-white/40 mt-0.5 font-mono">
                  {session.ipAddress || "Unknown IP"} · Last active{" "}
                  {new Date(session.lastActive).toLocaleString()}
                </p>
              </div>
              {!session.isCurrent && (
                <Magnetic strength={3}>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRevokeSession(session.id)}
                    className="text-red-400/80 hover:text-red-300 border border-red-500/[0.15] hover:border-red-500/30 hover:bg-red-500/[0.04]"
                  >
                    Revoke
                  </Button>
                </Magnetic>
              )}
            </div>
          ))}
        </StaggerReveal>
      )}
    </SettingsCard>
  );
}
