"use client";

import { useState } from "react";
import { factionApi, type FactionJoinRequestData } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import Button from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { useQuery, queryClient } from "@/lib/query";

/**
 * Shown to a Guild Leader (not a Faction Leader/Admin) — redeem another
 * faction's invite code, or accept/reject a direct invite sent to this guild.
 */
export default function JoinFactionTab({ guildId }: { guildId: string }) {
  const { addToast } = useToast();
  const [code, setCode] = useState("");
  const [redeeming, setRedeeming] = useState(false);
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);

  const key = `faction_join_requests_for_guild:${guildId}`;
  const { data, isLoading } = useQuery<FactionJoinRequestData[]>(
    key,
    async () => {
      const result = await factionApi.getPendingJoinRequestsForGuild(guildId);
      return result.success && result.data?.requests ? result.data.requests : [];
    },
    { persist: true, staleTime: 15000, enabled: !!guildId },
  );
  const requests = data || [];

  async function redeem() {
    const trimmed = code.trim();
    if (!trimmed) return;
    setRedeeming(true);
    try {
      const result = await factionApi.redeemInviteCode(trimmed);
      if (result.success && result.data) {
        addToast("success", `Join request sent to ${result.data.factionName} — waiting for their approval`);
        setCode("");
      } else {
        addToast("error", result.error?.message || "Failed to redeem invite code");
      }
    } finally {
      setRedeeming(false);
    }
  }

  async function respond(request: FactionJoinRequestData, approve: boolean) {
    setRespondingId(request.id);
    try {
      const result = approve
        ? await factionApi.approveJoinRequest(request.id)
        : await factionApi.rejectJoinRequest(request.id);
      if (result.success) {
        addToast("success", approve ? "Joined the faction" : "Invitation rejected");
        queryClient.invalidateQueries(key);
      } else {
        addToast("error", result.error?.message || "Failed to respond to invitation");
      }
    } finally {
      setRespondingId(null);
    }
  }

  async function leaveFaction() {
    setLeaving(true);
    try {
      const result = await factionApi.removeGuildFromFaction(guildId);
      if (result.success) {
        addToast("success", "Left the faction");
      } else {
        addToast("error", result.error?.message || "Failed to leave faction");
      }
    } finally {
      setLeaving(false);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5 items-start">
      <div className="space-y-4">
        {isLoading ? (
          <Skeleton className="h-16 rounded-xl" />
        ) : requests.length > 0 ? (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-white/80 px-1">Faction invitations</h3>
            {requests.map((request) => (
              <div key={request.id} className="rounded-xl border border-white/[0.06] bg-white/[0.025] px-4 py-3 flex items-center justify-between gap-4">
                <p className="text-sm text-white/70 min-w-0 truncate">A faction leader invited your guild to join.</p>
                <div className="flex items-center gap-2 shrink-0">
                  <Button variant="ghost" size="sm" onClick={() => respond(request, false)} isLoading={respondingId === request.id} className="hover:text-red-300 hover:border-red-500/35">
                    Reject
                  </Button>
                  <Button variant="primary" size="sm" onClick={() => respond(request, true)} isLoading={respondingId === request.id}>
                    Accept
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-8 text-center">
            <h3 className="text-sm font-semibold text-white/80">No pending invitations</h3>
            <p className="text-xs text-white/45 mt-1">Redeem an invite code from the panel to request joining a faction.</p>
          </div>
        )}
      </div>

      <aside className="rounded-xl border border-amber-500/15 bg-amber-500/[0.04] p-5 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-white mb-2">Redeem an invite code</h3>
          <div className="flex items-center gap-2">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="e.g. KURA-FAC-A1B2C3"
              className="flex-1 px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-amber-500/40 uppercase tracking-wide"
            />
            <Button variant="primary" size="sm" onClick={redeem} isLoading={redeeming} disabled={!code.trim()}>
              Redeem
            </Button>
          </div>
          <p className="text-[11px] text-white/45 mt-2 leading-relaxed">
            Ask a Faction Leader for their code. Redeeming creates a join request they must approve.
          </p>
        </div>
        <div className="pt-3 border-t border-white/[0.06]">
          <Button variant="ghost" size="sm" onClick={leaveFaction} isLoading={leaving} className="hover:text-red-300 hover:border-red-500/35">
            Leave current faction
          </Button>
          <p className="text-[11px] text-white/35 mt-2">Only works if your guild currently belongs to a faction.</p>
        </div>
      </aside>
    </div>
  );
}
