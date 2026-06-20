"use client";

import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import GuildAvatar from "./GuildAvatar";
import {
  type FactionMemberGuild,
  formatCp,
  MY_FACTION,
} from "../factionStubs";

interface MemberGuildsTabProps {
  guilds: FactionMemberGuild[];
  isLoading: boolean;
  onFindGuild: () => void;
}

function formatJoined(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function MemberGuildsTab({
  guilds,
  isLoading,
  onFindGuild,
}: MemberGuildsTabProps) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Card key={i} padding="sm">
            <div className="flex items-center gap-3">
              <Skeleton className="h-11 w-11 rounded-xl" />
              <div className="space-y-2 flex-1">
                <Skeleton className="h-4 w-44" />
                <Skeleton className="h-3 w-60" />
              </div>
            </div>
          </Card>
        ))}
      </div>
    );
  }

  if (guilds.length === 0) {
    return (
      <Card>
        <div className="text-center py-12">
          <div className="mx-auto mb-4 h-12 w-12 rounded-xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center">
            <svg className="h-6 w-6 text-white/35" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
          </div>
          <p className="text-sm text-white/45">No guilds in your faction yet</p>
          <p className="text-xs text-white/30 mt-1 mb-4">
            Invite your first guild to start building {MY_FACTION.name}.
          </p>
          <Button variant="primary" size="sm" onClick={onFindGuild}>
            Find a guild
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-[11px] uppercase tracking-[0.18em] text-white/40 px-1">
        {guilds.length} member {guilds.length === 1 ? "guild" : "guilds"} ·{" "}
        {MY_FACTION.capacity - guilds.length} slots open
      </p>
      {guilds.map((guild) => (
        <Card key={guild.id} padding="sm" hover>
          <div className="flex items-center gap-4 flex-wrap sm:flex-nowrap">
            <GuildAvatar name={guild.name} avatarUrl={guild.avatarUrl} size="md" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-white truncate">{guild.name}</p>
              <div className="flex items-center gap-x-3 gap-y-1 mt-1 flex-wrap text-[11px] text-white/45">
                <span>{guild.memberCount} members</span>
                <span>·</span>
                <span>{formatCp(guild.totalCp)} CP</span>
                <span>·</span>
                <span>{guild.region}</span>
                <span>·</span>
                <span>Led by {guild.leaderName}</span>
              </div>
            </div>
            <span className="shrink-0 text-[11px] text-white/35">
              Joined {formatJoined(guild.joinedAt)}
            </span>
          </div>
        </Card>
      ))}
    </div>
  );
}
