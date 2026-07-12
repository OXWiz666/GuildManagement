"use client";

import { useMemo, useState } from "react";
import { factionApi, type FactionMemberData } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Avatar from "@/components/ui/Avatar";
import { Skeleton } from "@/components/ui/Skeleton";
import { useQuery, queryClient } from "@/lib/query";

// ─── Guild color identity ────────────────────────
// A faction mixes members from several guilds into one flat roster — without
// some visual anchor it's hard to tell at a glance who belongs where. Each
// guild gets a stable, distinct accent color (hashed from its id, so it never
// reshuffles as the roster is filtered/sorted) reused for its dot, row
// accent, and filter chip. Same 8-color set as member categories
// (categoryStyles.ts) so color-coding reads as one consistent system
// throughout the app rather than two unrelated palettes.
const GUILD_COLOR_PALETTE = [
  { dot: "bg-slate-400", text: "text-slate-300", border: "border-slate-400/25", bg: "bg-slate-500/10" },
  { dot: "bg-amber-400", text: "text-amber-400", border: "border-amber-500/25", bg: "bg-amber-500/10" },
  { dot: "bg-cyan-400", text: "text-cyan-400", border: "border-cyan-500/25", bg: "bg-cyan-500/10" },
  { dot: "bg-emerald-400", text: "text-emerald-400", border: "border-emerald-500/25", bg: "bg-emerald-500/10" },
  { dot: "bg-violet-400", text: "text-violet-400", border: "border-violet-500/25", bg: "bg-violet-500/10" },
  { dot: "bg-rose-400", text: "text-rose-400", border: "border-rose-500/25", bg: "bg-rose-500/10" },
  { dot: "bg-sky-400", text: "text-sky-400", border: "border-sky-500/25", bg: "bg-sky-500/10" },
  { dot: "bg-orange-400", text: "text-orange-400", border: "border-orange-500/25", bg: "bg-orange-500/10" },
] as const;

function hashToIndex(id: string, length: number): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % length;
}

function guildColor(guildId: string) {
  return GUILD_COLOR_PALETTE[hashToIndex(guildId, GUILD_COLOR_PALETTE.length)]!;
}

const ROLE_ORDER = ["FACTION_LEADER", "ADMIN", "GUILD_LEADER", "OFFICER", "CORE_MEMBER", "ELITE_MEMBER", "MEMBER"];

/**
 * Faction Members — the flat, cross-guild roster. Only Faction Leaders/Admins
 * see this tab. Filterable by guild and role, with each guild carrying a
 * consistent color identity so a mixed roster stays scannable.
 */
export default function FactionMembersTab({ canManage }: { canManage: boolean }) {
  const { addToast } = useToast();
  const [search, setSearch] = useState("");
  const [guildFilter, setGuildFilter] = useState<string>("ALL");
  const [roleFilter, setRoleFilter] = useState<string>("ALL");
  const [removingGuildId, setRemovingGuildId] = useState<string | null>(null);

  const { data: membersRaw, isLoading } = useQuery<FactionMemberData[]>(
    canManage ? "faction_members" : "faction_members_locked",
    async () => {
      if (!canManage) return [];
      const result = await factionApi.getMembers();
      return result.success && result.data?.members ? result.data.members : [];
    },
    { persist: true, staleTime: 30000 },
  );
  const members = membersRaw || [];

  const guilds = useMemo(() => {
    const map = new Map<string, { id: string; name: string; count: number }>();
    for (const m of members) {
      const guildId = m.guild?.id;
      if (!guildId) continue;
      const existing = map.get(guildId);
      if (existing) existing.count += 1;
      else map.set(guildId, { id: guildId, name: m.guild?.name || "Guild", count: 1 });
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [members]);

  const rolesPresent = useMemo(() => {
    const present = new Set(members.map((m) => m.role));
    return ROLE_ORDER.filter((r) => present.has(r));
  }, [members]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return members.filter((m) => {
      if (guildFilter !== "ALL" && m.guild?.id !== guildFilter) return false;
      if (roleFilter !== "ALL" && m.role !== roleFilter) return false;
      if (!q) return true;
      return (
        (m.ign || "").toLowerCase().includes(q) ||
        m.user.displayName.toLowerCase().includes(q) ||
        (m.guild?.name || "").toLowerCase().includes(q)
      );
    });
  }, [members, search, guildFilter, roleFilter]);

  async function removeGuild(guildId: string, name: string) {
    if (!confirm(`Remove ${name} from the faction? This clears it from every boss rotation queue.`)) return;
    setRemovingGuildId(guildId);
    try {
      const result = await factionApi.removeGuildFromFaction(guildId);
      if (result.success) {
        addToast("success", `${name} removed from the faction`);
        if (guildFilter === guildId) setGuildFilter("ALL");
        queryClient.invalidateQueries("faction_members");
        queryClient.invalidateQueries("faction_overview");
      } else {
        addToast("error", result.error?.message || "Failed to remove guild");
      }
    } finally {
      setRemovingGuildId(null);
    }
  }

  const hasActiveFilters = search.trim() !== "" || guildFilter !== "ALL" || roleFilter !== "ALL";

  if (!canManage) {
    return (
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-8 text-center">
        <h3 className="text-sm font-semibold text-white/80">Faction roster is restricted</h3>
        <p className="text-xs text-white/45 mt-1">Only Faction Leaders and Admins can view members across all guilds.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Guild legend / quick filter chips — teaches the color mapping and
          doubles as a one-click guild filter. */}
      {guilds.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setGuildFilter("ALL")}
            className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors cursor-pointer ${
              guildFilter === "ALL"
                ? "border-white/25 bg-white/[0.08] text-white"
                : "border-white/[0.08] bg-white/[0.02] text-white/45 hover:text-white/75"
            }`}
          >
            All guilds
          </button>
          {guilds.map((guild) => {
            const color = guildColor(guild.id);
            const active = guildFilter === guild.id;
            return (
              <button
                key={guild.id}
                type="button"
                onClick={() => setGuildFilter(active ? "ALL" : guild.id)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors cursor-pointer ${
                  active ? `${color.border} ${color.bg} ${color.text}` : "border-white/[0.08] bg-white/[0.02] text-white/45 hover:text-white/75"
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${color.dot}`} />
                {guild.name}
                <span className="text-[9px] opacity-60">{guild.count}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Filter toolbar */}
      <div className="flex flex-col sm:flex-row gap-2.5">
        <div className="relative flex-1 min-w-0">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by IGN, name, or guild…"
            className="w-full h-10 pl-10 pr-3 rounded-xl bg-white/[0.03] border border-white/[0.08] text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-amber-500/35 transition-colors"
          />
        </div>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="h-10 px-3 rounded-xl bg-white/[0.03] border border-white/[0.08] text-sm text-white focus:outline-none focus:border-amber-500/35 cursor-pointer"
        >
          <option className="bg-[#101014]" value="ALL">All roles</option>
          {rolesPresent.map((role) => (
            <option key={role} className="bg-[#101014]" value={role}>
              {role.replaceAll("_", " ")}
            </option>
          ))}
        </select>
        {hasActiveFilters && (
          <button
            type="button"
            onClick={() => { setSearch(""); setGuildFilter("ALL"); setRoleFilter("ALL"); }}
            className="h-10 px-3.5 rounded-xl border border-white/[0.08] text-[12px] font-semibold text-white/50 hover:text-white/85 hover:border-white/20 transition-colors cursor-pointer shrink-0"
          >
            Clear filters
          </button>
        )}
      </div>

      <p className="text-[11px] text-white/35 px-1">
        {filtered.length} of {members.length} member{members.length === 1 ? "" : "s"}
      </p>

      {/* Roster */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-8 text-center">
          <h3 className="text-sm font-semibold text-white/80">No members match your filters</h3>
          <p className="text-xs text-white/45 mt-1">Try clearing the search or filters above.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((member) => {
            const color = member.guild?.id ? guildColor(member.guild.id) : null;
            return (
              <div
                key={member.id}
                className={`relative rounded-xl border border-white/[0.06] bg-white/[0.025] pl-4 pr-4 py-3 flex items-center gap-3.5 overflow-hidden`}
              >
                {color && <span className={`absolute left-0 top-0 bottom-0 w-[3px] ${color.dot}`} aria-hidden />}
                <Avatar name={member.ign || member.user.displayName} src={member.user.avatarUrl} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-white truncate">{member.ign || member.user.displayName}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {color && <span className={`h-1.5 w-1.5 rounded-full ${color.dot} shrink-0`} />}
                    <p className={`text-[11px] truncate ${color?.text || "text-white/40"}`}>{member.guild?.name || "Guild"}</p>
                  </div>
                </div>
                <Badge role={member.role} size="sm" className="shrink-0" />
                <p className="text-[11px] text-white/35 shrink-0 w-16 text-right">CP {(member.cp || 0).toLocaleString()}</p>
              </div>
            );
          })}
        </div>
      )}

      {/* Manage guilds — remove a guild from the faction */}
      {guilds.length > 0 && (
        <section className="space-y-2 pt-2 border-t border-white/[0.06]">
          <h3 className="text-sm font-semibold text-white/80 px-1">Manage guilds</h3>
          {guilds.map((guild) => {
            const color = guildColor(guild.id);
            return (
              <div key={guild.id} className="rounded-xl border border-white/[0.06] bg-white/[0.025] px-4 py-3 flex items-center justify-between gap-4">
                <div className="min-w-0 flex items-center gap-2.5">
                  <span className={`h-2 w-2 rounded-full ${color.dot} shrink-0`} />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{guild.name}</p>
                    <p className="text-[11px] text-white/40">{guild.count} member{guild.count === 1 ? "" : "s"}</p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeGuild(guild.id, guild.name)}
                  isLoading={removingGuildId === guild.id}
                  className="shrink-0 hover:text-red-300 hover:border-red-500/35"
                >
                  Remove
                </Button>
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
}
