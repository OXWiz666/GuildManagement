export interface RotationBoss {
  id: string;
  name: string;
  level: number;
  location: string;
  status: "AVAILABLE" | "CLAIMED" | "DEAD" | "LOCKED";
  imageUrl: string | null;
  spawnTime: string;
  claimedBy: string; // Guild Name
  rotationQueue: string[]; // List of Guild Names
  cooldownHours: number;
  activeScheduleId: string | null;
}

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

export function getTickingCountdown(spawnTimeStr: string, currentTime: number) {
  const target = new Date(spawnTimeStr).getTime();
  const diff = target - currentTime;
  if (diff <= 0) return { expired: true, text: "00h 00m 00s", warning: false };

  const hrs = Math.floor(diff / (3600 * 1000));
  const mins = Math.floor((diff % (3600 * 1000)) / (60 * 1000));
  const secs = Math.floor((diff % (60 * 1000)) / 1000);

  const hrsStr = hrs > 0 ? `${hrs}h ` : "";
  const minsStr = `${String(mins).padStart(2, "0")}m `;
  const secsStr = `${String(secs).padStart(2, "0")}s`;

  return {
    expired: false,
    text: `${hrsStr}${minsStr}${secsStr}`,
    warning: diff <= 60 * 60 * 1000 // Less than 1 hour remains
  };
}
