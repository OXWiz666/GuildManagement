export const GUILD_PALETTE = [
  { border: "border-amber-500/30", bg: "bg-amber-500/10", text: "text-amber-400", dot: "#f59e0b" },
  { border: "border-emerald-500/30", bg: "bg-emerald-500/10", text: "text-emerald-400", dot: "#10b981" },
  { border: "border-blue-500/30", bg: "bg-blue-500/10", text: "text-blue-400", dot: "#3b82f6" },
  { border: "border-violet-500/30", bg: "bg-violet-500/10", text: "text-violet-400", dot: "#8b5cf6" },
  { border: "border-rose-500/30", bg: "bg-rose-500/10", text: "text-rose-400", dot: "#f43f5e" },
  { border: "border-cyan-500/30", bg: "bg-cyan-500/10", text: "text-cyan-400", dot: "#06b6d4" },
  { border: "border-orange-500/30", bg: "bg-orange-500/10", text: "text-orange-400", dot: "#f97316" },
  { border: "border-pink-500/30", bg: "bg-pink-500/10", text: "text-pink-400", dot: "#ec4899" },
];

export function getGuildColor(guildName: string) {
  if (!guildName) {
    return { border: "border-zinc-850", bg: "bg-zinc-950/60", text: "text-zinc-400", dot: "#a1a1aa" };
  }
  let hash = 0;
  for (const c of guildName.toUpperCase()) {
    hash = (hash * 31 + c.charCodeAt(0)) % GUILD_PALETTE.length;
  }
  return GUILD_PALETTE[hash];
}

export function getRelativeTime(dateStr: string) {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHrs = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHrs / 24);

  if (diffSecs < 60) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHrs < 24) return `${diffHrs}h ago`;
  return `${diffDays}d ago`;
}

export function toDateTimeInputValue(date: Date) {
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 16);
}
