import type { FactionGuildData } from "@/lib/api";
import type { CycleFilter, SortMode, ViewMode } from "../types";
import { CYCLE_FILTERS, SORT_OPTIONS, VIEW_OPTIONS } from "../constants";
import ViewModeIcon from "./ViewModeIcon";

export default function RotationFiltersBar({
  selectedCycle,
  onSelectedCycleChange,
  viewMode,
  onViewModeChange,
  sortMode,
  onSortModeChange,
  selectedTakingGuildId,
  onSelectedTakingGuildIdChange,
  searchQuery,
  onSearchQueryChange,
  takingGuilds,
}: {
  selectedCycle: CycleFilter;
  onSelectedCycleChange: (value: CycleFilter) => void;
  viewMode: ViewMode;
  onViewModeChange: (value: ViewMode) => void;
  sortMode: SortMode;
  onSortModeChange: (value: SortMode) => void;
  selectedTakingGuildId: string;
  onSelectedTakingGuildIdChange: (value: string) => void;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  takingGuilds: FactionGuildData[];
}) {
  return (
    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-[minmax(170px,210px)_minmax(170px,210px)_minmax(180px,240px)_minmax(200px,300px)] gap-2 w-full lg:w-auto">
        <label className="relative block">
          <span className="sr-only">Filter boss cycle</span>
          <select
            value={selectedCycle}
            onChange={(event) => onSelectedCycleChange(event.target.value as CycleFilter)}
            className="w-full h-[42px] px-3.5 rounded-xl bg-[var(--obsidian-elevated)]/50 border border-[var(--metal-border)] text-[13px] text-white/90 focus:outline-none focus:border-[var(--forge-gold)]/35 transition-colors cursor-pointer"
          >
            {CYCLE_FILTERS.map((filter) => (
              <option className="bg-[#0c0d12]" key={filter.id} value={filter.id}>
                {filter.label}
              </option>
            ))}
          </select>
        </label>

        {viewMode === "GRID" && (
          <label className="relative block">
            <span className="sr-only">Sort order</span>
            <select
              value={sortMode}
              onChange={(event) => onSortModeChange(event.target.value as SortMode)}
              className="w-full h-[42px] px-3.5 rounded-xl bg-[var(--obsidian-elevated)]/50 border border-[var(--metal-border)] text-[13px] text-white/90 focus:outline-none focus:border-[var(--forge-gold)]/35 transition-colors cursor-pointer"
            >
              {SORT_OPTIONS.map((option) => (
                <option className="bg-[#0c0d12]" key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="relative block">
          <span className="sr-only">Filter taking guild</span>
          <select
            value={selectedTakingGuildId}
            onChange={(event) => onSelectedTakingGuildIdChange(event.target.value)}
            className="w-full h-[42px] px-3.5 rounded-xl bg-[var(--obsidian-elevated)]/50 border border-[var(--metal-border)] text-[13px] text-white/90 focus:outline-none focus:border-[var(--forge-gold)]/35 transition-colors cursor-pointer"
          >
            <option className="bg-[#0c0d12]" value="ALL">All taking guilds</option>
            <option className="bg-[#0c0d12]" value="UNASSIGNED">Unassigned</option>
            {takingGuilds.map((guild) => (
              <option className="bg-[#0c0d12]" key={guild.id} value={guild.id}>
                {guild.name}
              </option>
            ))}
          </select>
        </label>

        <label className="relative block">
          <span className="sr-only">Search rotations</span>
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            value={searchQuery}
            onChange={(event) => onSearchQueryChange(event.target.value)}
            placeholder="Search boss or guild..."
            className="w-full h-[42px] pl-10 pr-4 rounded-xl bg-[var(--obsidian-elevated)]/50 border border-[var(--metal-border)] text-sm text-white/90 placeholder:text-white/35 focus:outline-none focus:border-[var(--forge-gold)]/35 transition-colors"
          />
        </label>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        <span className="text-[10px] uppercase tracking-[0.16em] text-white/30 font-bold mr-1">View</span>
        <div className="inline-flex items-center bg-[var(--obsidian-elevated)]/40 backdrop-blur-md border border-[var(--metal-border)] rounded-lg p-1 gap-1">
          {VIEW_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => onViewModeChange(option.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold rounded-md transition-all cursor-pointer focus-ring ${
                viewMode === option.id
                  ? "bg-[var(--forge-glow)] border border-[var(--forge-gold)]/25 text-[var(--forge-gold-bright)]"
                  : "text-white/40 hover:text-white/70 border border-transparent hover:bg-white/[0.03]"
              }`}
            >
              <ViewModeIcon mode={option.id} />
              {option.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
