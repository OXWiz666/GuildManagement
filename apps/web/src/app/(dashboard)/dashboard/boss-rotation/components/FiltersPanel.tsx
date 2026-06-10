import type { RotationBoss } from "../utils/helpers";

interface FiltersPanelProps {
  selectedBossFilter: string;
  setSelectedBossFilter: (val: string) => void;
  selectedGuildFilter: string;
  setSelectedGuildFilter: (val: string) => void;
  availableOnly: boolean;
  setAvailableOnly: (val: boolean) => void;
  searchQuery: string;
  setSearchQuery: (val: string) => void;
  viewMode: "CARD" | "TIMELINE";
  setViewMode: (val: "CARD" | "TIMELINE") => void;
  bosses: RotationBoss[];
}

export default function FiltersPanel({
  selectedBossFilter,
  setSelectedBossFilter,
  selectedGuildFilter,
  setSelectedGuildFilter,
  availableOnly,
  setAvailableOnly,
  searchQuery,
  setSearchQuery,
  viewMode,
  setViewMode,
  bosses,
}: FiltersPanelProps) {
  // Get all unique guilds from the rotation queues
  const uniqueGuilds = Array.from(
    new Set(bosses.flatMap((b) => b.rotationQueue))
  );

  return (
    <div className="flex flex-col xl:flex-row gap-4 items-stretch xl:items-center justify-between bg-white/[0.015] border border-white/[0.04] p-4 rounded-2xl glass-subtle animate-scale-in">
      <div className="flex flex-wrap items-center gap-3">
        {/* All Bosses Dropdown */}
        <div className="relative">
          <select
            value={selectedBossFilter}
            onChange={(e) => setSelectedBossFilter(e.target.value)}
            className="px-3.5 py-2 rounded-xl bg-[#0a0a0c] border border-white/[0.08] text-[13px] text-zinc-300 font-medium cursor-pointer focus:outline-none focus:border-amber-500/50 min-w-[140px]"
          >
            <option value="ALL">All Bosses</option>
            {bosses.map((b) => (
              <option key={b.id} value={b.name}>
                {b.name}
              </option>
            ))}
          </select>
        </div>

        {/* Guild List Filter Dropdown */}
        <div className="relative">
          <select
            value={selectedGuildFilter}
            onChange={(e) => setSelectedGuildFilter(e.target.value)}
            className="px-3.5 py-2 rounded-xl bg-[#0a0a0c] border border-white/[0.08] text-[13px] text-zinc-300 font-medium cursor-pointer focus:outline-none focus:border-amber-500/50 min-w-[155px] hover:border-white/20 transition-all"
          >
            <option value="ALL">Guild List (All)</option>
            {uniqueGuilds.map((guild) => (
              <option key={guild} value={guild.toUpperCase()}>
                {guild.toUpperCase()}
              </option>
            ))}
          </select>
        </div>

        {/* Available Only Toggle */}
        <button
          onClick={() => setAvailableOnly(!availableOnly)}
          className={`px-4 py-2 rounded-xl text-[13px] font-medium border transition-all cursor-pointer ${
            availableOnly
              ? "bg-amber-500/10 border-amber-500/40 text-amber-400"
              : "bg-white/[0.02] border-white/[0.06] text-white/60 hover:text-white hover:bg-white/[0.04]"
          }`}
        >
          Available Only
        </button>

        {/* Search Input */}
        <div className="relative min-w-[200px]">
          <input
            type="text"
            placeholder="Search boss..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-xl bg-[#0a0a0c] border border-white/[0.08] text-[13px] text-white placeholder:text-white/30 focus:outline-none focus:border-amber-500/40"
          />
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </span>
        </div>
      </div>

      {/* View Mode Toggle */}
      <div className="flex items-center self-end xl:self-auto border border-white/[0.06] rounded-xl bg-white/[0.015] p-1">
        <button
          onClick={() => setViewMode("CARD")}
          className={`px-4 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all cursor-pointer ${
            viewMode === "CARD"
              ? "bg-amber-500/10 text-amber-400 border border-amber-500/25"
              : "text-white/40 hover:text-white/70 border border-transparent"
          }`}
        >
          Card View
        </button>
        <button
          onClick={() => setViewMode("TIMELINE")}
          className={`px-4 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all cursor-pointer ${
            viewMode === "TIMELINE"
              ? "bg-amber-500/10 text-amber-400 border border-amber-500/25"
              : "text-white/40 hover:text-white/70 border border-transparent"
          }`}
        >
          Timeline View
        </button>
      </div>
    </div>
  );
}
