"use client";

import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import GuildAvatar from "./GuildAvatar";
import { type PendingGuildInvite } from "../factionStubs";

interface PendingInvitesTabProps {
  invites: PendingGuildInvite[];
  isLoading: boolean;
  cancelingId: string | null;
  onCancel: (invite: PendingGuildInvite) => void;
  onFindGuild: () => void;
}

function timeLeft(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "Expired";
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  if (days >= 1) return `Expires in ${days}d`;
  const hours = Math.floor(ms / (60 * 60 * 1000));
  return `Expires in ${hours}h`;
}

export default function PendingInvitesTab({
  invites,
  isLoading,
  cancelingId,
  onCancel,
  onFindGuild,
}: PendingInvitesTabProps) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2].map((i) => (
          <Card key={i} padding="sm">
            <div className="flex items-center gap-3">
              <Skeleton className="h-11 w-11 rounded-xl" />
              <div className="space-y-2 flex-1">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-52" />
              </div>
              <Skeleton className="h-8 w-20 rounded-lg" />
            </div>
          </Card>
        ))}
      </div>
    );
  }

  if (invites.length === 0) {
    return (
      <Card>
        <div className="text-center py-12">
          <div className="mx-auto mb-4 h-12 w-12 rounded-xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center">
            <svg className="h-6 w-6 text-white/35" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
            </svg>
          </div>
          <p className="text-sm text-white/45">No pending invitations</p>
          <p className="text-xs text-white/30 mt-1 mb-4">
            Invites you send to guilds will appear here until they respond.
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
        {invites.length} pending {invites.length === 1 ? "invitation" : "invitations"}
      </p>
      {invites.map((invite) => (
        <Card key={invite.id} padding="sm" hover>
          <div className="flex items-center gap-4 flex-wrap sm:flex-nowrap">
            <GuildAvatar name={invite.guildName} avatarUrl={invite.avatarUrl} size="md" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-semibold text-white truncate">
                  {invite.guildName}
                </p>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-500/30 bg-sky-500/15 px-2 py-0.5 text-[10px] font-medium text-sky-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-sky-400 animate-pulse" />
                  Awaiting response
                </span>
              </div>
              <div className="flex items-center gap-x-3 gap-y-1 mt-1 flex-wrap text-[11px] text-white/45">
                <span>{invite.memberCount} members</span>
                <span>·</span>
                <span>Led by {invite.leaderName}</span>
                <span>·</span>
                <span className="text-amber-300/70">{timeLeft(invite.expiresAt)}</span>
              </div>
            </div>
            <div className="shrink-0">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onCancel(invite)}
                isLoading={cancelingId === invite.id}
              >
                Cancel invite
              </Button>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
