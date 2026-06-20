"use client";

import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";

export default function PermissionDenied({ currentRole }: { currentRole: string }) {
  return (
    <div className="relative max-w-2xl mx-auto w-full pt-10">
      <Card className="text-center">
        <div className="py-10 px-4">
          <div className="mx-auto mb-5 h-16 w-16 rounded-2xl bg-amber-500/[0.08] border border-amber-500/20 flex items-center justify-center">
            <svg
              className="h-7 w-7 text-amber-300"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <rect x="3" y="11" width="18" height="11" rx="2" />
              <path d="M7 11V7a5 5 0 0110 0v4" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-white tracking-tight">
            Faction leaders only
          </h2>
          <p className="text-sm text-white/50 mt-2 leading-relaxed max-w-md mx-auto">
            The Faction panel — including inviting guilds into your alliance — is
            restricted to{" "}
            <span className="text-white/80 font-medium">Alliance Leaders</span>.
            Ask your faction leader to grant access or transfer the role.
          </p>
          <div className="mt-5 inline-flex items-center gap-2 text-[11px] text-white/40">
            <span className="uppercase tracking-[0.18em]">Your role</span>
            <Badge role={currentRole} size="sm" />
          </div>
        </div>
      </Card>
    </div>
  );
}
