interface BadgeProps {
  role: string;
  size?: "sm" | "md";
  className?: string;
}

const roleStyles: Record<string, string> = {
  ADMIN: "bg-red-500/15 text-red-400 border-red-500/30",
  ALLIANCE_LEADER: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  GUILD_LEADER: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  OFFICER: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  CORE_MEMBER: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
  ELITE_MEMBER: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  MEMBER: "bg-gray-500/15 text-gray-400 border-gray-500/30",
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

export default function Badge({ role, size = "sm", className = "" }: BadgeProps) {
  const styles = roleStyles[role] || roleStyles["MEMBER"]!;
  const label = roleLabels[role] || role;

  return (
    <span
      className={`
        inline-flex items-center rounded-full border font-medium
        ${styles}
        ${size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-3 py-1 text-xs"}
        ${className}
      `}
    >
      {label}
    </span>
  );
}
