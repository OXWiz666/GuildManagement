"use client";

import { useMemo, useState } from "react";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import { useRoleDisplayNames } from "@/lib/useRoleDisplayNames";

const ROLE_FILTER_VALUES = ["ALL", "GUILD_LEADER", "OFFICER", "CORE_MEMBER", "ELITE_MEMBER", "MEMBER"] as const;
const SORT_VALUES = ["CURRENT_GUILD_POINTS", "ALL_TIME_GUILD_POINTS", "ROLE", "RANK"] as const;

type RankingSort = (typeof SORT_VALUES)[number];
type RankingRow = {
  memberId: string;
  ign: string;
  role: string;
  rankName?: string | null;
  customRole?: { name?: string | null; color?: string | null } | null;
  cp: number;
  dkp: number;
  currentDkp?: number;
  allTimeDkp?: number;
  class: string;
};
type RankingAccounting = {
  memberBalances?: RankingRow[];
} | null;

const ROLE_SORT_ORDER = new Map(
  ["GUILD_LEADER", "FACTION_LEADER", "ADMIN", "OFFICER", "CORE_MEMBER", "ELITE_MEMBER", "MEMBER"].map(
    (role, index) => [role, index],
  ),
);

function currentGuildPoints(row: RankingRow) {
  return row.currentDkp ?? row.dkp;
}

function allTimeGuildPoints(row: RankingRow) {
  return row.allTimeDkp ?? row.dkp;
}

function compareByCurrentGuildPoints(a: RankingRow, b: RankingRow) {
  return currentGuildPoints(b) - currentGuildPoints(a) || b.cp - a.cp || a.ign.localeCompare(b.ign);
}

function compareByAllTimeGuildPoints(a: RankingRow, b: RankingRow) {
  return allTimeGuildPoints(b) - allTimeGuildPoints(a) || b.cp - a.cp || a.ign.localeCompare(b.ign);
}

function compareRankings(a: RankingRow, b: RankingRow, sortBy: RankingSort) {
  if (sortBy === "ROLE") {
    const roleDelta =
      (ROLE_SORT_ORDER.get(a.role) ?? ROLE_SORT_ORDER.size) -
      (ROLE_SORT_ORDER.get(b.role) ?? ROLE_SORT_ORDER.size);
    if (roleDelta !== 0) return roleDelta;
    return compareByCurrentGuildPoints(a, b);
  }

  if (sortBy === "RANK") {
    const aRank = (a.customRole?.name || a.rankName || "").toLowerCase();
    const bRank = (b.customRole?.name || b.rankName || "").toLowerCase();
    return aRank.localeCompare(bRank) || compareByCurrentGuildPoints(a, b);
  }

  if (sortBy === "ALL_TIME_GUILD_POINTS") {
    return compareByAllTimeGuildPoints(a, b);
  }

  return compareByCurrentGuildPoints(a, b);
}

interface RankingsTabProps {
  accounting: RankingAccounting;
  rankingSearch: string;
  onSearchChange: (value: string) => void;
}

const SORT_LABELS: Record<RankingSort, string> = {
  CURRENT_GUILD_POINTS: "Sort: Current Guild Points",
  ALL_TIME_GUILD_POINTS: "Sort: All-Time Guild Points",
  ROLE: "Sort: Role",
  RANK: "Sort: Rank",
};

const MEDALS = ["🥇", "🥈", "🥉"];

// Podium visual tones for ranks 1–3
const PODIUM = [
  {
    ring: "border-[var(--forge-gold)]/35",
    glow: "from-[var(--forge-gold)]/[0.14]",
    accent: "text-[var(--forge-gold-bright)]",
    bar: "bg-[var(--forge-gold)]",
    order: "sm:order-2",
    lift: "sm:-translate-y-3",
  },
  {
    ring: "border-white/15",
    glow: "from-white/[0.08]",
    accent: "text-zinc-200",
    bar: "bg-zinc-300",
    order: "sm:order-1",
    lift: "",
  },
  {
    ring: "border-amber-700/30",
    glow: "from-amber-700/[0.10]",
    accent: "text-amber-500/90",
    bar: "bg-amber-700/80",
    order: "sm:order-3",
    lift: "",
  },
];

export default function RankingsTab({
  accounting,
  rankingSearch,
  onSearchChange,
}: RankingsTabProps) {
  const [roleFilter, setRoleFilter] = useState("ALL");
  const [sortBy, setSortBy] = useState<RankingSort>("CURRENT_GUILD_POINTS");
  const { resolveRoleName } = useRoleDisplayNames();

  // Full sorted ladder (unfiltered) — drives ranks, podium and bar scale
  const sortedAll = useMemo(() => {
    if (!accounting?.memberBalances) return [] as RankingRow[];
    return [...accounting.memberBalances].sort((a: RankingRow, b: RankingRow) => compareByCurrentGuildPoints(a, b));
  }, [accounting]);

  const rankMap = useMemo(() => {
    const m = new Map<string, number>();
    sortedAll.forEach((row, i) => m.set(row.memberId, i + 1));
    return m;
  }, [sortedAll]);

  const maxCurrentDkp = currentGuildPoints(sortedAll[0] ?? ({ dkp: 0 } as RankingRow)) || 1;

  const filtered = useMemo(() => {
    const byRole = roleFilter === "ALL" ? sortedAll : sortedAll.filter((m) => m.role === roleFilter);
    const searched = (() => {
      if (!rankingSearch.trim()) return byRole;
      const s = rankingSearch.toLowerCase();
      return byRole.filter((m) => {
        const rankName = (m.customRole?.name || m.rankName || "").toLowerCase();
        const roleName = resolveRoleName(m.role).toLowerCase();

        return (
          m.ign.toLowerCase().includes(s) ||
          m.class.toLowerCase().includes(s) ||
          m.role.toLowerCase().includes(s) ||
          roleName.includes(s) ||
          rankName.includes(s)
        );
      });
    })();

    return [...searched].sort((a, b) => compareRankings(a, b, sortBy));
  }, [sortedAll, rankingSearch, roleFilter, sortBy, resolveRoleName]);

  const showPodium = !rankingSearch.trim() && roleFilter === "ALL" && sortBy === "CURRENT_GUILD_POINTS" && sortedAll.length >= 3;
  const podium = sortedAll.slice(0, 3);

  return (
    <div className="space-y-5">
      {/* ─── Podium: top 3 ─── */}
      {showPodium && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {podium.map((row, i) => {
            const p = PODIUM[i]!;
            return (
              <div
                key={row.memberId}
                className={`group relative overflow-hidden rounded-2xl border ${p.ring} bg-[#0c0d12]/60 backdrop-blur p-5 transition-transform duration-500 ${p.order} ${p.lift} hover:-translate-y-1`}
                style={{ animation: `slide-up 0.6s cubic-bezier(0.16,1,0.3,1) ${i * 90}ms both` }}
              >
                <div
                  aria-hidden
                  className={`pointer-events-none absolute -top-8 -right-8 h-24 w-24 rounded-full bg-gradient-to-br ${p.glow} to-transparent blur-2xl`}
                />
                <div className="relative z-10 flex items-center gap-3">
                  <span className="text-3xl leading-none drop-shadow">{MEDALS[i]}</span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-white">{row.ign}</p>
                    <p className="text-[10px] uppercase tracking-wider text-white/40">
                      #{i + 1} · {row.class}
                    </p>
                  </div>
                </div>
                <div className="relative z-10 mt-4 flex items-end justify-between gap-2">
                  <div>
                    <p className="text-[9px] uppercase tracking-[0.18em] text-white/40 font-bold">
                      Current Guild Points
                    </p>
                    <p className={`font-mono text-2xl font-bold ${p.accent}`}>
                      {currentGuildPoints(row).toLocaleString()}
                    </p>
                    <p className="mt-0.5 text-[10px] font-mono text-white/35">
                      All-time {allTimeGuildPoints(row).toLocaleString()}
                    </p>
                  </div>
                  <p className="font-mono text-[11px] text-cyan-400/90">
                    CP {row.cp.toLocaleString()}
                  </p>
                </div>
                <div className="relative z-10 mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.05]">
                  <div
                    className={`bar-grow h-full rounded-full ${p.bar}`}
                    style={{
                      width: `${Math.max((currentGuildPoints(row) / maxCurrentDkp) * 100, 4)}%`,
                      animationDelay: `${i * 90 + 200}ms`,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ─── Full ladder ─── */}
      <Card className="p-6 border border-white/[0.05] bg-[#0c0d12]/40 backdrop-blur rounded-3xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/[0.06] pb-4 mb-4">
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <span aria-hidden>🏆</span> Current Guild Points Leaderboard
            </h3>
            <p className="text-[10px] text-white/40 mt-1">
              Current Guild Points follow your reset cycle. All-Time Guild Points stay visible for lifetime totals.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="h-8 px-2.5 rounded-lg bg-white/[0.03] border border-white/[0.06] text-xs text-white focus:outline-none focus:border-white/20 transition-colors cursor-pointer"
            >
              {ROLE_FILTER_VALUES.map((value) => (
                <option key={value} value={value}>{value === "ALL" ? "All roles" : resolveRoleName(value)}</option>
              ))}
            </select>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as RankingSort)}
              className="h-8 px-2.5 rounded-lg bg-white/[0.03] border border-white/[0.06] text-xs text-white focus:outline-none focus:border-white/20 transition-colors cursor-pointer"
            >
              {SORT_VALUES.map((value) => (
                <option key={value} value={value}>{SORT_LABELS[value]}</option>
              ))}
            </select>
            <div className="relative min-w-[210px] max-w-xs flex-1 sm:w-64 sm:flex-none">
              <input
                type="text"
                placeholder="Search by IGN, class, or rank..."
                value={rankingSearch}
                onChange={(e) => onSearchChange(e.target.value)}
                className="h-8 w-full px-3 pl-8 rounded-lg bg-white/[0.03] border border-white/[0.06] text-xs text-white placeholder:text-white/20 focus:outline-none focus:border-white/20 transition-colors"
              />
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/25 text-xs">🔍</span>
            </div>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="py-16 text-center text-xs text-white/35 italic">
            No member rankings found. Members earn Guild Points by checking in at attendance portals.
          </div>
        ) : (
          <div className="overflow-auto scroll-fade-x max-h-[560px] rounded-xl">
            <table className="w-full border-collapse text-left text-[12px]">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-white/[0.08] bg-[#0d0e13] text-[10px] text-white/45 font-bold uppercase tracking-wider">
                  <th className="px-4 py-3 text-center w-14">Rank</th>
                  <th className="px-4 py-3">In-Game Name</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Class</th>
                  <th className="px-4 py-3 text-center">Combat Power</th>
                  <th className="px-4 py-3 min-w-[180px]">Current Guild Points</th>
                  <th className="px-4 py-3 text-right min-w-[140px]">All-Time Guild Points</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {filtered.map((row, index) => {
                  const rank = rankMap.get(row.memberId) ?? index + 1;
                  const pct = Math.max((currentGuildPoints(row) / maxCurrentDkp) * 100, 3);
                  const isTop3 = rank <= 3;
                  return (
                    <tr
                      key={row.memberId}
                      className="market-row hover:bg-white/[0.02] transition-colors"
                      style={{ animationDelay: `${Math.min(index, 16) * 35}ms` }}
                    >
                      <td className="px-4 py-3 text-center font-bold font-mono">
                        {isTop3 ? (
                          <span className="text-base">{MEDALS[rank - 1]}</span>
                        ) : (
                          <span className="text-white/50">{rank}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-semibold text-white">{row.ign}</td>
                      <td className="px-4 py-3">
                        <Badge role={row.role} customName={row.customRole?.name} customColor={row.customRole?.color} />
                      </td>
                      <td className="px-4 py-3 text-white/60">{row.class}</td>
                      <td className="px-4 py-3 text-center font-mono text-cyan-400">
                        {row.cp.toLocaleString()}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.05]">
                            <div
                              className={`bar-grow h-full rounded-full ${
                                isTop3 ? "bg-[var(--forge-gold)]" : "bg-amber-400/60"
                              }`}
                              style={{
                                width: `${pct}%`,
                                animationDelay: `${Math.min(index, 16) * 35 + 120}ms`,
                              }}
                            />
                          </div>
                          <span className="w-12 shrink-0 text-right font-mono font-bold text-amber-400">
                            {currentGuildPoints(row).toLocaleString()}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-white/65">
                        {allTimeGuildPoints(row).toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
