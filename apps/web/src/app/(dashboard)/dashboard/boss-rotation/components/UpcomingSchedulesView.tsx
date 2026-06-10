import { getBossImageUrl } from "@guild/shared";
import type { BossScheduleData } from "@/lib/api";
import { getGuildColor, getTickingCountdown } from "../utils/helpers";

interface UpcomingSchedulesViewProps {
  schedules: BossScheduleData[];
  currentTime: number;
}

export default function UpcomingSchedulesView({
  schedules,
  currentTime,
}: UpcomingSchedulesViewProps) {
  const upcomingSchedules = schedules
    .filter((s) => s.status !== "KILLED")
    .sort((a, b) => new Date(a.spawnTime).getTime() - new Date(b.spawnTime).getTime());

  if (upcomingSchedules.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 rounded-2xl bg-white/[0.01] border border-white/[0.04] p-10 text-center animate-scale-in">
        <p className="text-sm text-white/45">No future boss schedule events are currently planned.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-scale-in">
      {upcomingSchedules.map((sched) => {
        const tick = getTickingCountdown(sched.spawnTime, currentTime);
        const guildColor = getGuildColor(sched.guildTurn || "");
        return (
          <div
            key={sched.id}
            className="relative flex flex-col md:flex-row md:items-center justify-between gap-5 p-5 rounded-2xl border border-white/[0.04] bg-white/[0.02] backdrop-blur-md hover:border-amber-500/15 hover:bg-white/[0.03] hover:shadow-[0_8px_25px_rgba(0,0,0,0.3)] transition-all duration-300"
          >
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-xl border border-white/10 overflow-hidden shrink-0 bg-zinc-950 select-none">
                <img
                  src={getBossImageUrl(sched.bossName)}
                  alt={sched.bossName}
                  className="h-full w-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src =
                      "https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?w=100";
                  }}
                />
              </div>
              <div>
                <h4 className="font-bold text-white text-base leading-tight">
                  {sched.bossName}
                </h4>
                <div className="flex items-center gap-2 text-xs text-zinc-550 mt-1 font-medium">
                  <span className="text-zinc-400">{sched.location}</span>
                  <span>•</span>
                  <span>
                    {new Date(sched.spawnTime).toLocaleDateString("en-US", {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    })}{" "}
                    at{" "}
                    {new Date(sched.spawnTime).toLocaleTimeString("en-US", {
                      hour12: false,
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-6">
              <div className="flex flex-col">
                <span className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1 select-none font-sans font-bold">
                  Assigned Guild
                </span>
                <span
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-xl border text-[11px] font-bold ${guildColor.border} ${guildColor.bg} ${guildColor.text}`}
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: guildColor.dot }}
                  />
                  {sched.guildTurn ? sched.guildTurn.toUpperCase() : "FREE CLAIM"}
                </span>
              </div>

              <div className="flex flex-col min-w-[120px]">
                <span className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1 select-none font-sans font-bold">
                  Countdown
                </span>
                <span
                  className={`font-mono text-sm font-bold ${
                    tick.warning ? "text-amber-400 animate-pulse" : "text-emerald-400"
                  }`}
                >
                  {sched.status === "SPAWNED" ? "ALIVE / READY" : tick.text}
                </span>
              </div>

              <div className="flex flex-col select-none">
                <span className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1 select-none font-sans font-bold">
                  State
                </span>
                <span
                  className={`text-xs font-semibold uppercase tracking-wider ${
                    sched.status === "SPAWNED" ? "text-emerald-400" : "text-amber-500"
                  }`}
                >
                  {sched.status}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
