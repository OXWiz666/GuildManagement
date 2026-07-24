import type { ReactNode } from "react";
import { getGuildColor } from "../utils/helpers";

export default function GuildSection({ guildName, count, children }: { guildName: string; count: number; children: ReactNode }) {
  const color = getGuildColor(guildName === "Unassigned" ? "" : guildName);
  return (
    <section>
      <div className="flex items-center gap-2.5 mb-3.5">
        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg border text-[11px] font-bold ${color.border} ${color.bg} ${color.text}`}>
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color.dot }} />
          {guildName}
        </span>
        <span className="text-[10px] text-white/35 font-mono">{count} boss{count === 1 ? "" : "es"}</span>
        <span className="h-px flex-1 bg-white/[0.06]" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
        {children}
      </div>
    </section>
  );
}
