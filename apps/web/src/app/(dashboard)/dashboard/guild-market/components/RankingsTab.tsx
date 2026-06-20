"use client";

import { useMemo } from "react";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";

interface RankingsTabProps {
  accounting: any;
  rankingSearch: string;
  onSearchChange: (value: string) => void;
}

export default function RankingsTab({
  accounting,
  rankingSearch,
  onSearchChange,
}: RankingsTabProps) {
  // Sort members by accumulated Guild Points (DKP), descending
  const ranked = useMemo(() => {
    if (!accounting?.memberBalances) return [];
    const sorted = [...accounting.memberBalances].sort((a, b) => b.dkp - a.dkp);
    if (!rankingSearch.trim()) return sorted;
    const s = rankingSearch.toLowerCase();
    return sorted.filter(
      (m: any) =>
        m.ign.toLowerCase().includes(s) ||
        m.class.toLowerCase().includes(s) ||
        m.role.toLowerCase().includes(s),
    );
  }, [accounting, rankingSearch]);

  return (
    <Card className="p-6 border border-white/[0.05] bg-[#0c0d12]/40 backdrop-blur rounded-3xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/[0.06] pb-4 mb-4">
        <div>
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">🏆 Guild Points Leaderboard</h3>
          <p className="text-[10px] text-white/40 mt-1">
            Dynamic ranking of accumulated Guild Points from attendance and boss kills — the basis for bidding splits.
          </p>
        </div>
        <div className="relative max-w-xs w-full">
          <input
            type="text"
            placeholder="Search by IGN, class, or rank..."
            value={rankingSearch}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full px-3 py-1.5 pl-8 rounded-lg bg-white/[0.03] border border-white/[0.06] text-xs text-white placeholder:text-white/20 focus:outline-none focus:border-white/20 transition-colors"
          />
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/25 text-xs">🔍</span>
        </div>
      </div>

      {ranked.length === 0 ? (
        <div className="py-16 text-center text-xs text-white/35 italic">
          No member rankings found. Members earn Guild Points by checking in at attendance portals.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-[12px]">
            <thead>
              <tr className="border-b border-white/[0.06] bg-white/[0.02] text-[10px] text-white/40 font-bold uppercase tracking-wider">
                <th className="px-4 py-3 text-center w-12">Rank</th>
                <th className="px-4 py-3">In-Game Name</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Class</th>
                <th className="px-4 py-3 text-center">Combat Power</th>
                <th className="px-4 py-3 text-right">Guild Points</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {ranked.map((row: any, index: number) => (
                <tr key={row.memberId} className="hover:bg-white/[0.015] transition-colors">
                  <td className="px-4 py-3 text-center font-bold font-mono">
                    {index + 1 === 1 ? "🥇" : index + 1 === 2 ? "🥈" : index + 1 === 3 ? "🥉" : `${index + 1}`}
                  </td>
                  <td className="px-4 py-3 font-semibold text-white">{row.ign}</td>
                  <td className="px-4 py-3">
                    <Badge role={row.role} />
                  </td>
                  <td className="px-4 py-3 text-white/60">{row.class}</td>
                  <td className="px-4 py-3 text-center font-mono text-cyan-400">
                    {row.cp.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right font-bold font-mono text-amber-400">{row.dkp}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
