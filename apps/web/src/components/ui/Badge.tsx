interface BadgeProps {
  role: string;
  size?: "sm" | "md";
  className?: string;
}

const roleStyles: Record<string, string> = {
  ADMIN: "bg-red-500/10 text-red-400 border-red-500/25",
  ALLIANCE_LEADER: "bg-[var(--forge-gold)]/10 text-[var(--forge-gold-bright)] border-[var(--forge-gold)]/25",
  GUILD_LEADER: "bg-purple-500/10 text-purple-400 border-purple-500/25",
  OFFICER: "bg-blue-500/10 text-blue-400 border-blue-500/25",
  CORE_MEMBER: "bg-cyan-500/10 text-cyan-400 border-cyan-500/25",
  ELITE_MEMBER: "bg-emerald-500/10 text-emerald-400 border-emerald-500/25",
  MEMBER: "bg-white/[0.06] text-zinc-400 border-white/[0.10]",
};

const roleLabels: Record<string, string> = {
  ADMIN: "Admin",
  ALLIANCE_LEADER: "Alliance Leader",
  GUILD_LEADER: "Guild Leader",
  OFFICER: "Officer",
  CORE_MEMBER: "Core Member",
  ELITE_MEMBER: "Elite Member",
  MEMBER: "Member",
};

// Inline SVG icons for role badges — compact 12x12
function RoleIcon({ role, className }: { role: string; className?: string }) {
  const cls = className || "h-3 w-3";
  switch (role) {
    case "ADMIN":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          <path d="M12 8v4M12 16h.01" />
        </svg>
      );
    case "ALLIANCE_LEADER":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      );
    case "GUILD_LEADER":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7z" />
          <path d="M3 20h18" />
        </svg>
      );
    case "OFFICER":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
      );
    default:
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      );
  }
}

export default function Badge({ role, size = "sm", className = "" }: BadgeProps) {
  const styles = roleStyles[role] || roleStyles["MEMBER"]!;
  const label = roleLabels[role] || role;

  return (
    <span
      className={`
        inline-flex items-center gap-1 rounded-full border font-medium
        ${styles}
        ${size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-3 py-1 text-xs"}
        ${className}
      `}
    >
      <RoleIcon role={role} className={size === "sm" ? "h-2.5 w-2.5" : "h-3 w-3"} />
      {label}
    </span>
  );
}
