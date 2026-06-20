"use client";

import Button from "@/components/ui/Button";
import GuildAvatar from "./GuildAvatar";
import {
  type DirectoryGuild,
  formatCp,
  MY_FACTION,
} from "../factionStubs";

interface InviteGuildModalProps {
  guild: DirectoryGuild | null;
  isSending: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export default function InviteGuildModal({
  guild,
  isSending,
  onClose,
  onConfirm,
}: InviteGuildModalProps) {
  if (!guild) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={() => !isSending && onClose()}
      />
      <div className="relative border border-white/[0.06] bg-[#0c0d10] rounded-2xl p-6 max-w-md w-full mx-4 shadow-xl z-50 animate-scale-in">
        <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-1">
          Invite guild to faction
        </h3>
        <p className="text-xs text-white/40 mb-5 leading-relaxed">
          Send an invitation for this guild to join{" "}
          <span className="text-white/70 font-medium">{MY_FACTION.name}</span>. The
          guild leader must accept before they join.
        </p>

        {/* Guild summary */}
        <div className="flex items-center gap-3.5 p-4 rounded-xl bg-white/[0.02] border border-white/[0.05] mb-5">
          <GuildAvatar name={guild.name} avatarUrl={guild.avatarUrl} size="lg" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white truncate">{guild.name}</p>
            <div className="flex items-center gap-x-2.5 gap-y-1 mt-1 flex-wrap text-[11px] text-white/45">
              <span>{guild.memberCount} members</span>
              <span>·</span>
              <span>{formatCp(guild.totalCp)} CP</span>
              <span>·</span>
              <span>{guild.region}</span>
            </div>
            <p className="text-[11px] text-white/35 mt-1">
              Led by {guild.leaderName} · code{" "}
              <span className="font-mono text-white/55">{guild.inviteCode}</span>
            </p>
          </div>
        </div>

        {/* Slot impact */}
        <div className="flex items-center gap-2 mb-5 text-[11px] text-white/50">
          <svg className="h-3.5 w-3.5 text-white/35 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4M12 8h.01" />
          </svg>
          This will use 1 of your {MY_FACTION.capacity - MY_FACTION.memberGuildCount}{" "}
          remaining faction slots once accepted.
        </div>

        <div className="flex gap-2 justify-end pt-4 border-t border-white/[0.05]">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={isSending}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={onConfirm} isLoading={isSending}>
            Send invitation
          </Button>
        </div>
      </div>
    </div>
  );
}
