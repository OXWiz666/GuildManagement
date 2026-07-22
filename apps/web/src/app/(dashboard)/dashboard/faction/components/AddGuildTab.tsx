"use client";

import { useState } from "react";
import { factionApi, type FactionJoinRequestData } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import Button from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { useQuery, queryClient } from "@/lib/query";

function InviteCodeCard() {
  const { addToast } = useToast();
  const [regenerating, setRegenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  const { data, isLoading } = useQuery<string>(
    "faction_invite_code",
    async () => {
      const result = await factionApi.getInviteCode();
      return result.success && result.data ? result.data.inviteCode : "";
    },
    { persist: true, staleTime: 30000 },
  );

  async function regenerate() {
    setRegenerating(true);
    try {
      const result = await factionApi.regenerateInviteCode();
      if (result.success && result.data) {
        queryClient.invalidateQueries("faction_invite_code");
        addToast("success", "Invite code regenerated — the old code no longer works");
      } else {
        addToast("error", result.error?.message || "Failed to regenerate invite code");
      }
    } finally {
      setRegenerating(false);
    }
  }

  async function copy() {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(data);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      addToast("error", "Failed to copy code");
    }
  }

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-4 space-y-3">
      <h3 className="text-sm font-semibold text-white">Faction invite code</h3>
      <p className="text-[11px] text-white/45 leading-relaxed">
        Share this code with a Guild Leader — they redeem it to request joining your faction. You approve the request afterward.
      </p>
      {isLoading ? (
        <Skeleton className="h-10 rounded-lg" />
      ) : (
        <div className="flex items-center gap-2">
          <code className="flex-1 px-3 py-2 rounded-lg bg-black/30 border border-white/[0.08] text-sm font-mono text-amber-300 tracking-wider truncate">
            {data || "—"}
          </code>
          <Button variant="ghost" size="sm" onClick={copy} disabled={!data}>
            {copied ? "Copied ✓" : "Copy"}
          </Button>
        </div>
      )}
      <Button variant="ghost" size="sm" onClick={regenerate} isLoading={regenerating}>
        Regenerate code
      </Button>
    </div>
  );
}

function PendingRequestsPanel() {
  const { addToast } = useToast();
  const [respondingId, setRespondingId] = useState<string | null>(null);

  const { data, isLoading } = useQuery<FactionJoinRequestData[]>(
    "faction_join_requests",
    async () => {
      const result = await factionApi.getPendingJoinRequests();
      return result.success && result.data?.requests ? result.data.requests : [];
    },
    { persist: true, staleTime: 15000 },
  );

  const requests = data || [];

  async function respond(request: FactionJoinRequestData, approve: boolean) {
    setRespondingId(request.id);
    try {
      const result = approve
        ? await factionApi.approveJoinRequest(request.id)
        : await factionApi.rejectJoinRequest(request.id);
      if (result.success) {
        addToast("success", approve ? `${request.guildName} joined the faction` : `Request from ${request.guildName} rejected`);
        queryClient.invalidateQueries("faction_join_requests");
        queryClient.invalidateQueries("faction_members");
      } else {
        addToast("error", result.error?.message || "Failed to respond to request");
      }
    } finally {
      setRespondingId(null);
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2].map((i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
      </div>
    );
  }

  if (requests.length === 0) return null;

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-white/80 px-1">Pending join requests</h3>
      {requests.map((request) => (
        <div key={request.id} className="rounded-xl border border-white/[0.06] bg-white/[0.025] px-4 py-3 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-white truncate">{request.guildName || "Guild"}</p>
              <span className="px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider bg-white/[0.06] text-white/45 rounded shrink-0">
                Redeemed code
              </span>
            </div>
            <p className="text-[11px] text-white/40 mt-0.5">Requested {new Date(request.createdAt).toLocaleDateString()}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="ghost" size="sm" onClick={() => respond(request, false)} isLoading={respondingId === request.id} className="hover:text-red-300 hover:border-red-500/35">
              Reject
            </Button>
            <Button variant="primary" size="sm" onClick={() => respond(request, true)} isLoading={respondingId === request.id}>
              Approve
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function AddGuildTab() {
  return (
    <div className="space-y-5">
      <PendingRequestsPanel />

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_1.4fr] gap-5 items-start">
        <InviteCodeCard />
        <aside className="rounded-xl border border-amber-500/15 bg-amber-500/[0.04] p-5 space-y-3">
          <div className="flex items-center gap-2">
            <span className="h-7 w-7 rounded-lg bg-amber-500/15 text-amber-400 flex items-center justify-center">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
            </span>
            <h3 className="text-sm font-semibold text-white">Joining a faction</h3>
          </div>
          <p className="text-[12px] text-white/55 leading-relaxed">
            Guilds join by invite code only — share the code above with a Guild Leader; there is no directory or search to browse guilds into your faction.
          </p>
          <ul className="text-[11px] text-white/45 space-y-1.5 list-disc list-inside">
            <li>Only guilds not already in a faction can redeem a code.</li>
            <li>The request still needs your approval before the guild actually joins.</li>
            <li>A joined guild starts opted out of every boss rotation — add it from the Master List when ready.</li>
          </ul>
        </aside>
      </div>
    </div>
  );
}
