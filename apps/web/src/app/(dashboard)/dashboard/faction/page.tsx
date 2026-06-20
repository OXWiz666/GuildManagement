"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/components/ui/Toast";
import DashboardDecor from "@/components/dashboard/DashboardDecor";
import {
  Reveal,
  ModuleHeader,
  ModuleTabs,
  LiveDot,
} from "@/components/dashboard/DashboardHelpers";

import FindGuildTab from "./components/FindGuildTab";
import MemberGuildsTab from "./components/MemberGuildsTab";
import PendingInvitesTab from "./components/PendingInvitesTab";
import InviteGuildModal from "./components/InviteGuildModal";
import PermissionDenied from "./components/PermissionDenied";
import {
  type DirectoryGuild,
  type FactionMemberGuild,
  type PendingGuildInvite,
  MY_FACTION,
  getFactionMemberGuilds,
  getPendingInvites,
  sendGuildInvite,
  cancelInvite,
} from "./factionStubs";

type TabValue = "guilds" | "find" | "pending";

// Only Alliance Leaders (faction leaders) — and Admins — may manage a faction.
const FACTION_LEADER_ROLES = ["ALLIANCE_LEADER", "ADMIN"];

export default function FactionPage() {
  const { user } = useAuth();
  const { addToast } = useToast();

  const activeGuild = user?.guilds[0];
  const isFactionLeader =
    !!activeGuild && FACTION_LEADER_ROLES.includes(activeGuild.role);

  const [activeTab, setActiveTab] = useState<TabValue>("guilds");

  const [memberGuilds, setMemberGuilds] = useState<FactionMemberGuild[]>([]);
  const [isLoadingGuilds, setIsLoadingGuilds] = useState(true);

  const [pendingInvites, setPendingInvites] = useState<PendingGuildInvite[]>([]);
  const [isLoadingInvites, setIsLoadingInvites] = useState(true);
  const [cancelingId, setCancelingId] = useState<string | null>(null);

  const [inviteTarget, setInviteTarget] = useState<DirectoryGuild | null>(null);
  const [isSendingInvite, setIsSendingInvite] = useState(false);

  const loadGuilds = useCallback(async () => {
    setIsLoadingGuilds(true);
    try {
      setMemberGuilds(await getFactionMemberGuilds());
    } finally {
      setIsLoadingGuilds(false);
    }
  }, []);

  const loadInvites = useCallback(async () => {
    setIsLoadingInvites(true);
    try {
      setPendingInvites(await getPendingInvites());
    } finally {
      setIsLoadingInvites(false);
    }
  }, []);

  useEffect(() => {
    if (!isFactionLeader) return;
    loadGuilds();
    loadInvites();
  }, [isFactionLeader, loadGuilds, loadInvites]);

  async function handleConfirmInvite() {
    if (!inviteTarget) return;
    setIsSendingInvite(true);
    try {
      const { invite } = await sendGuildInvite(inviteTarget);
      setPendingInvites((prev) => [invite, ...prev]);
      addToast("success", `Invitation sent to ${inviteTarget.name}`);
      setInviteTarget(null);
      setActiveTab("pending");
    } catch {
      addToast("error", "Failed to send invitation");
    } finally {
      setIsSendingInvite(false);
    }
  }

  async function handleCancelInvite(invite: PendingGuildInvite) {
    setCancelingId(invite.id);
    try {
      const result = await cancelInvite(invite.id);
      if (result.success) {
        setPendingInvites((prev) => prev.filter((i) => i.id !== invite.id));
        addToast("info", `Invitation to ${invite.guildName} canceled`);
      }
    } catch {
      addToast("error", "Failed to cancel invitation");
    } finally {
      setCancelingId(null);
    }
  }

  if (!user || !activeGuild) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-white/40 text-[13px]">No active guild selected</p>
      </div>
    );
  }

  // Permission-denied state (design brief requires it for leader-only screens).
  if (!isFactionLeader) {
    return (
      <div className="relative max-w-7xl mx-auto w-full">
        <DashboardDecor />
        <div className="relative z-10">
          <PermissionDenied currentRole={activeGuild.role} />
        </div>
      </div>
    );
  }

  const tabs: Array<{ value: TabValue; label: string; count?: number }> = [
    { value: "guilds", label: "Member guilds", count: memberGuilds.length },
    { value: "find", label: "Find & invite" },
    { value: "pending", label: "Pending invites", count: pendingInvites.length },
  ];

  return (
    <div className="relative max-w-7xl mx-auto w-full">
      <DashboardDecor />

      <div className="relative z-10 space-y-6 text-white/85">
        <ModuleHeader
          eyebrow="Faction leader"
          title="Faction"
          description={
            <span className="inline-flex items-center gap-1.5">
              <LiveDot tone="amber" size={5} />
              {MY_FACTION.name} · {MY_FACTION.memberGuildCount}/{MY_FACTION.capacity}{" "}
              guilds
            </span>
          }
          right={
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500/[0.08] border border-amber-500/20 text-amber-300 text-[11px] font-medium uppercase tracking-[0.18em]">
              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 7l3 4L12 3l4 8 3-4v12H5V7z" />
              </svg>
              Alliance leader
            </span>
          }
        />

        <Reveal delay={80}>
          <ModuleTabs tabs={tabs} active={activeTab} onChange={setActiveTab} />
        </Reveal>

        {activeTab === "guilds" && (
          <MemberGuildsTab
            guilds={memberGuilds}
            isLoading={isLoadingGuilds}
            onFindGuild={() => setActiveTab("find")}
          />
        )}

        {activeTab === "find" && <FindGuildTab onInvite={setInviteTarget} />}

        {activeTab === "pending" && (
          <PendingInvitesTab
            invites={pendingInvites}
            isLoading={isLoadingInvites}
            cancelingId={cancelingId}
            onCancel={handleCancelInvite}
            onFindGuild={() => setActiveTab("find")}
          />
        )}

        <InviteGuildModal
          guild={inviteTarget}
          isSending={isSendingInvite}
          onClose={() => !isSendingInvite && setInviteTarget(null)}
          onConfirm={handleConfirmInvite}
        />
      </div>
    </div>
  );
}
