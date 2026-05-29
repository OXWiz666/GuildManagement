"use client";

import Link from "next/link";

const QUICK_LINKS = [
  {
    href: "/dashboard/boss-schedule",
    label: "Boss Scheduling",
    description: "Schedule & edit spawns",
    color: "indigo",
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </svg>
    ),
  },
  {
    href: "/dashboard/boss-attendance",
    label: "Raid Attendance",
    description: "Launch check-in codes",
    color: "emerald",
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 11l3 3L22 4" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
      </svg>
    ),
  },
  {
    href: "/dashboard/guild-market",
    label: "Guild Market",
    description: "Record drop sales & splits",
    color: "amber",
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
      </svg>
    ),
  },
] as const;

const colorMap: Record<string, { bg: string; border: string; text: string; hover: string }> = {
  indigo: {
    bg: "bg-indigo-500/10",
    border: "border-indigo-500/25",
    text: "text-indigo-400",
    hover: "group-hover:text-indigo-300",
  },
  emerald: {
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/25",
    text: "text-emerald-400",
    hover: "group-hover:text-emerald-300",
  },
  amber: {
    bg: "bg-amber-500/10",
    border: "border-amber-500/25",
    text: "text-amber-400",
    hover: "group-hover:text-amber-300",
  },
};

export default function OfficerQuickLinks() {
  return (
    <div className="relative glass rounded-2xl p-6 border border-white/[0.06] overflow-hidden bg-white/[0.01]">
      <h3 className="text-xs font-bold text-white/50 uppercase tracking-widest mb-4">
        ⚡ Officer Operations Hub
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {QUICK_LINKS.map((link) => {
          const colors = colorMap[link.color];
          return (
            <Link key={link.href} href={link.href} className="group">
              <div className="p-4 rounded-xl border border-white/[0.05] bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/20 transition-all duration-300 flex items-center gap-3">
                <div
                  className={`h-10 w-10 rounded-lg ${colors.bg} border ${colors.border} flex items-center justify-center ${colors.text} group-hover:scale-110 transition-transform`}
                >
                  {link.icon}
                </div>
                <div>
                  <h4 className={`text-sm font-bold text-white ${colors.hover} transition-colors`}>
                    {link.label}
                  </h4>
                  <p className="text-[11px] text-white/40">{link.description}</p>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
