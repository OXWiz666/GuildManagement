"use client";

import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";

export interface InviteTabProps {
  guildInviteCode: string | null;
  isLoadingInvite: boolean;
  isGeneratingInvite: boolean;
  isGuildLeader: boolean;
  activeGuildName: string;
  handleGenerateInvite: () => void;
  addToast: (type: "success" | "error" | "info" | "warning", message: string) => void;
}

export default function InviteTab({
  guildInviteCode,
  isLoadingInvite,
  isGeneratingInvite,
  isGuildLeader,
  activeGuildName,
  handleGenerateInvite,
  addToast,
}: InviteTabProps) {
  if (!isGuildLeader) return null;

  return (
    <Card>
      <h2 className="text-lg font-bold text-white mb-2">Guild Invite Code</h2>
      <p className="text-sm text-white/40 mb-6 leading-relaxed">
        Generate a secure invite code for players to submit applications to join **{activeGuildName}**.
        Sharing this code enables prospective members to find your guild and fill in their character stats.
      </p>

      <div className="max-w-md p-4 rounded-xl bg-white/[0.02] border border-white/[0.05] space-y-4 animate-scale-in">
        <div>
          <p className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-2">
            Current Invite Code
          </p>
          {isLoadingInvite ? (
            <div className="h-10 rounded-lg bg-white/[0.03] animate-pulse" />
          ) : guildInviteCode ? (
            <div className="flex gap-2 items-center flex-wrap sm:flex-nowrap">
              <span className="px-4 py-2.5 rounded-lg bg-white/[0.06] border border-white/[0.12] text-sm text-white font-mono font-bold tracking-wider select-all select-none">
                {guildInviteCode}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  navigator.clipboard.writeText(guildInviteCode);
                  addToast("success", "Invite code copied to clipboard!");
                }}
              >
                Copy Code
              </Button>
            </div>
          ) : (
            <p className="text-sm text-white/35 italic">No invite code generated yet.</p>
          )}
        </div>

        <div className="border-t border-white/[0.05] pt-4">
          <Button
            variant="primary"
            size="sm"
            onClick={handleGenerateInvite}
            isLoading={isGeneratingInvite}
            disabled={isLoadingInvite}
          >
            {guildInviteCode ? "Regenerate Code" : "Generate Invite Code"}
          </Button>
        </div>
      </div>
    </Card>
  );
}
