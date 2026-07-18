"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  factionApi,
  type FactionOverviewData,
  type FactionOverviewGuild,
  type FactionMemberData,
} from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import Button from "@/components/ui/Button";
import Avatar from "@/components/ui/Avatar";
import { Skeleton } from "@/components/ui/Skeleton";
import { useQuery, queryClient } from "@/lib/query";
import AddGuildTab from "./AddGuildTab";

/**
 * Faction Overview — a one-stop snapshot of the faction the active guild
 * belongs to. Available to every faction member; Faction Leaders/Admins also
 * get the invite-code + invite-guild controls and can expand each guild to
 * see its members.
 */
export default function FactionOverviewTab({
  canManage,
  canLeaveFaction,
}: {
  canManage: boolean;
  canLeaveFaction: boolean;
}) {
  const { refreshUser } = useAuth();
  const { data, isLoading } = useQuery<FactionOverviewData | null>(
    "faction_overview",
    async () => {
      const result = await factionApi.getOverview();
      return result.success && result.data ? result.data : null;
    },
    { persist: true, staleTime: 30000 },
  );

  // Managers can drill into per-guild rosters — the full member list is
  // manager-only, so only fetch it when allowed.
  const { data: membersRaw } = useQuery<FactionMemberData[]>(
    canManage ? "faction_members" : "faction_members_locked",
    async () => {
      if (!canManage) return [];
      const result = await factionApi.getMembers();
      return result.success && result.data?.members ? result.data.members : [];
    },
    { persist: true, staleTime: 30000 },
  );
  const members = membersRaw || [];

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 rounded-2xl" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[1, 2].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      </div>
    );
  }

  if (!data || !data.faction) {
    return (
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-8 text-center">
        <h3 className="text-sm font-semibold text-white/80">Your guild isn&apos;t in a faction yet</h3>
        <p className="text-xs text-white/45 mt-1 max-w-md mx-auto">
          Guild Leaders can redeem a faction invite code from the “Join a Faction” tab, or ask a Faction Leader to invite your guild directly.
        </p>
      </div>
    );
  }

  const { faction, guilds, totalGuilds, totalMembers } = data;

  return (
    <div className="space-y-6">
      {/* Faction identity + stats */}
      <div className="rounded-2xl border border-amber-500/15 bg-gradient-to-br from-amber-500/[0.06] to-transparent p-5 sm:p-6">
        <div className="flex items-start gap-4">
          <Avatar name={faction.name} src={faction.avatarUrl} size="lg" />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-[0.18em] text-amber-400/80 font-semibold">Faction</p>
            <h2 className="text-lg sm:text-xl font-bold text-white truncate">{faction.name}</h2>
            {faction.description && (
              <p className="text-[13px] text-white/55 leading-relaxed mt-1 line-clamp-2">{faction.description}</p>
            )}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3 mt-5">
          <StatTile label="Guilds" value={totalGuilds} />
          <StatTile label="Members" value={totalMembers} />
          <StatTile label="Since" value={new Date(faction.createdAt).getFullYear().toString()} />
        </div>
      </div>

      {/* Guilds in the faction */}
      <section className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-sm font-semibold text-white/80">Guilds in this faction</h3>
          <span className="text-[11px] text-white/35">{totalGuilds} guild{totalGuilds === 1 ? "" : "s"}</span>
        </div>
        <div className="space-y-2">
          {guilds.map((guild) => (
            <GuildCard
              key={guild.id}
              guild={guild}
              canManage={canManage}
              canLeaveFaction={canLeaveFaction}
              members={members.filter((m) => m.guild?.id === guild.id)}
              onOwnGuildLeft={refreshUser}
            />
          ))}
        </div>
      </section>

      {/* Manager-only: invite code + invite guild + pending requests */}
      {canManage && (
        <section className="space-y-3">
          <div className="px-1">
            <h3 className="text-sm font-semibold text-white/80">Grow the faction</h3>
            <p className="text-[11px] text-white/40 mt-0.5">
              Invite an unaffiliated guild directly, or share your faction code for a Guild Leader to redeem.
            </p>
          </div>
          <AddGuildTab />
        </section>
      )}
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-black/20 px-3 py-3 text-center">
      <p className="text-xl font-bold text-white">{value}</p>
      <p className="text-[10px] uppercase tracking-[0.14em] text-white/40 mt-0.5">{label}</p>
    </div>
  );
}

function GuildCard({
  guild,
  canManage,
  canLeaveFaction,
  members,
  onOwnGuildLeft,
}: {
  guild: FactionOverviewGuild;
  canManage: boolean;
  canLeaveFaction: boolean;
  members: FactionMemberData[];
  onOwnGuildLeft: () => Promise<unknown>;
}) {
  const { addToast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [removing, setRemoving] = useState(false);

  async function remove() {
    const action = guild.isOwnGuild ? "leave" : "remove";
    const message = guild.isOwnGuild
      ? `Leave the faction with ${guild.name}? This clears your guild from every boss rotation queue.`
      : `Remove ${guild.name} from the faction? This clears it from every boss rotation queue.`;
    if (!confirm(message)) return;
    setRemoving(true);
    try {
      const result = await factionApi.removeGuildFromFaction(guild.id);
      if (result.success) {
        addToast("success", guild.isOwnGuild ? `${guild.name} left the faction` : `${guild.name} removed from the faction`);
        queryClient.invalidateQueries("faction_overview");
        queryClient.invalidateQueries("faction_members");
        if (guild.isOwnGuild) {
          await onOwnGuildLeft();
        }
      } else {
        addToast("error", result.error?.message || `Failed to ${action} faction`);
      }
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] overflow-hidden">
      <div className="px-4 py-3 flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={() => canManage && setExpanded((v) => !v)}
          className={`flex items-center gap-3 min-w-0 text-left ${canManage ? "cursor-pointer" : "cursor-default"}`}
        >
          <Avatar name={guild.name} src={guild.avatarUrl} size="md" />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-semibold text-white truncate">{guild.name}</p>
              {guild.isOwnGuild && (
                <span className="px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider bg-amber-500/15 text-amber-400 rounded">
                  Your guild
                </span>
              )}
            </div>
            <p className="text-[11px] text-white/40 truncate">
              {guild.memberCount} member{guild.memberCount === 1 ? "" : "s"}
              {guild.leaderName ? ` · Led by ${guild.leaderName}` : ""}
            </p>
          </div>
        </button>
        <div className="flex items-center gap-2 shrink-0">
          {canManage && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="text-[11px] text-white/45 hover:text-white/75 cursor-pointer px-2 py-1"
            >
              {expanded ? "Hide" : "View members"}
            </button>
          )}
          {guild.isOwnGuild && canLeaveFaction && (
            <Button
              variant="danger"
              size="sm"
              onClick={remove}
              isLoading={removing}
            >
              Leave Faction
            </Button>
          )}
          {canManage && !guild.isOwnGuild && (
            <Button
              variant="ghost"
              size="sm"
              onClick={remove}
              isLoading={removing}
              className="hover:text-red-300 hover:border-red-500/35"
            >
              Remove
            </Button>
          )}
        </div>
      </div>

      {canManage && expanded && (
        <div className="border-t border-white/[0.06] bg-black/15 px-4 py-3 space-y-1.5">
          {members.length === 0 ? (
            <p className="text-[11px] text-white/35">No active members.</p>
          ) : (
            members.map((member) => (
              <div key={member.id} className="flex items-center justify-between gap-4 py-1">
                <div className="min-w-0">
                  <p className="text-[13px] text-white/80 truncate">{member.ign || member.user.displayName}</p>
                  <p className="text-[10px] text-white/35 truncate">{member.role.replaceAll("_", " ")}</p>
                </div>
                <p className="text-[10px] text-white/35 shrink-0">CP {member.cp || 0}</p>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
