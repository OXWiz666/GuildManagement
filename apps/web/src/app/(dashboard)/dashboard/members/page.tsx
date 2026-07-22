"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import dynamic from "next/dynamic";
import { useAuth } from "@/lib/auth-context";
import { useSocket } from "@/components/providers/socket-provider";
import { guildApi, dashboardApi, type GuildMemberData, type JoinRequestData, type CustomRoleData } from "@/lib/api";
import { hasMinimumRole, GUILD_ROLES, type GuildRoleType } from "@guild/shared";
import { useRoleDisplayNames } from "@/lib/useRoleDisplayNames";
import { useToast } from "@/components/ui/Toast";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import { Skeleton, SkeletonAvatar } from "@/components/ui/Skeleton";
import DashboardDecor from "@/components/dashboard/DashboardDecor";
import { useQuery, queryClient } from "@/lib/query";
import {
  Reveal,
  ModuleHeader,
  ModuleTabs,
  LiveDot,
} from "@/components/dashboard/DashboardHelpers";

// Imports from co-located components
import MemberRow from "./components/MemberRow";
import ApplicationsTab from "./components/ApplicationsTab";
import InviteTab from "./components/InviteTab";
import type { MemberWithFinance } from "./components/StalkProfileModal";
import MembersStatisticsTab from "./components/MembersStatisticsTab";

const RoleConfirmModal = dynamic(() => import("./components/RoleConfirmModal"));
const StalkProfileModal = dynamic(() => import("./components/StalkProfileModal"));

type SortMode = "NAME" | "RANKING" | "GUILD_POINTS" | "BALANCE" | "CLASS" | "CP" | "JOINED";
type MemberBalanceRow = { memberId: string; balance: number; dkp: number };
type MembersAccountingData = {
  treasury?: { primary?: { currencySymbol?: string | null } };
  memberBalances?: MemberBalanceRow[];
};

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

export default function MembersPage() {
  const { user, refreshUser } = useAuth();
  const { addToast } = useToast();
  const { socket, onlineUserIds } = useSocket();
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("ALL");
  const [sortBy, setSortBy] = useState<SortMode>("RANKING");
  const [confirmModal, setConfirmModal] = useState<{
    memberId: string;
    memberName: string;
    currentRole: string;
    newRole: string;
    isTransfer: boolean;
  } | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [selectedStalkMemberId, setSelectedStalkMemberId] = useState<string | null>(null);

  // New admin flow state variables
  const [activeTab, setActiveTab] = useState<"members" | "statistics" | "applications" | "invites">("members");
  const [isGeneratingInvite, setIsGeneratingInvite] = useState(false);
  const [isReviewingId, setIsReviewingId] = useState<string | null>(null);

  const activeGuild = user?.guilds[0];
  const isGuildLeader = !!activeGuild && hasMinimumRole(activeGuild.role as GuildRoleType, "GUILD_LEADER");
  const isOfficer = !!activeGuild && hasMinimumRole(activeGuild.role as GuildRoleType, "OFFICER");
  const { resolveRoleName } = useRoleDisplayNames();

  // ─── Persistent Queries ────────────────────────────────
  
  // 1. Members Query
  const {
    data: membersRaw,
    isLoading,
    error: membersError,
  } = useQuery<GuildMemberData[]>(
    activeGuild ? `guild_members:${activeGuild.guildId}` : "guild_members_empty",
    async () => {
      if (!activeGuild) return [];
      const result = await guildApi.getMembers(activeGuild.guildId);
      if (!result.success) {
        throw new Error(result.error?.message || "Failed to fetch guild members");
      }
      return result.data?.members ?? [];
    },
    { persist: true, staleTime: 5000 }
  );
  const members = membersRaw || [];
  const membersErrorMessage =
    membersError instanceof Error ? membersError.message : membersError ? "Failed to fetch guild members" : null;

  // 1b. Accounting Query — sources Balance + Guild Points for the roster.
  // Member enrichment only needs balances, so it requests one ledger row and
  // keeps its query key separate from Guild Market's paginated ledger pages.
  const { data: accounting } = useQuery<MembersAccountingData | null>(
    activeGuild ? `accounting_dashboard:${activeGuild.guildId}:1:1` : "accounting_dashboard_empty",
    async () => {
      if (!activeGuild) return null;
      const result = await dashboardApi.getAccountingDashboard(activeGuild.guildId, 1, 1);
      return result.success && result.data ? result.data : null;
    },
    { persist: true, staleTime: 5000, enabled: !!activeGuild }
  );

  const currencySymbol = accounting?.treasury?.primary?.currencySymbol || "₱";
  const enrichedMembers: MemberWithFinance[] = useMemo(() => {
    const balancesByMemberId = new Map<string, { balance: number; dkp: number }>(
      (accounting?.memberBalances || []).map((b) => [b.memberId, { balance: b.balance, dkp: b.dkp }]),
    );
    return (membersRaw || []).map((m) => {
      const fin = balancesByMemberId.get(m.id);
      return { ...m, balance: fin?.balance ?? 0, guildPoints: fin?.dkp ?? 0, currencySymbol };
    });
  }, [membersRaw, accounting, currencySymbol]);

  // Derived (not a snapshot) so edits made inside the card — avatar, banner,
  // IGN, etc. — appear immediately once the roster query refetches, without
  // needing to close and reopen the modal.
  const selectedStalkMember: MemberWithFinance | null = selectedStalkMemberId
    ? (enrichedMembers.find((m) => m.id === selectedStalkMemberId) ?? null)
    : null;

  // 2. Applications Query
  const {
    data: applicationsRaw,
    isLoading: isLoadingApps,
    refetch: refetchApplications,
  } = useQuery<JoinRequestData[]>(
    activeGuild ? `guild_applications:${activeGuild.guildId}` : "guild_applications_empty",
    async () => {
      if (!activeGuild || !isOfficer) return [];
      const result = await guildApi.getGuildApplications(activeGuild.guildId);
      return result.success && result.data?.applications ? result.data.applications : [];
    },
    { persist: true, staleTime: 5000, enabled: !!activeGuild && isOfficer }
  );
  const applications = applicationsRaw || [];

  // 3. Invite Code Query
  const {
    data: guildInviteCode,
    isLoading: isLoadingInvite,
  } = useQuery<string | null>(
    activeGuild ? `guild_invite_code:${activeGuild.guildId}` : "guild_invite_code_empty",
    async () => {
      if (!activeGuild || !isGuildLeader) return null;
      const result = await guildApi.getInviteCode(activeGuild.guildId);
      return result.success ? result.data?.inviteCode || null : null;
    },
    { persist: true, staleTime: 60000 }
  );

  // 4. Custom Roles Query (guild-defined ranks that inherit a band's permissions)
  const { data: customRolesRaw } = useQuery<CustomRoleData[]>(
    activeGuild ? `guild_custom_roles:${activeGuild.guildId}` : "guild_custom_roles_empty",
    async () => {
      if (!activeGuild) return [];
      const result = await guildApi.listCustomRoles(activeGuild.guildId);
      return result.success && result.data?.roles ? result.data.roles : [];
    },
    { persist: true, staleTime: 30000 }
  );
  const customRoles = customRolesRaw || [];

  const invalidateRoster = useCallback(() => {
    if (!activeGuild) return;
    queryClient.invalidateQueries(`guild_members:${activeGuild.guildId}`);
    queryClient.invalidateQueries(`accounting_dashboard:${activeGuild.guildId}`);
    queryClient.invalidateQueries(`member_stats_board:${activeGuild.guildId}`);
    queryClient.invalidateQueries(`guild_stats_summary:${activeGuild.guildId}`);
  }, [activeGuild]);

  const applyAcceptedMemberOptimistically = useCallback((payload: unknown) => {
    if (!activeGuild || typeof payload !== "object" || payload === null) return;
    const joined = (payload as { member?: GuildMemberData }).member;
    if (!joined) return;
    queryClient.setQueryData<GuildMemberData[]>(`guild_members:${activeGuild.guildId}`, (old) => {
      const current = old ?? [];
      const withoutDuplicate = current.filter((member) => member.id !== joined.id && member.userId !== joined.userId);
      return [joined, ...withoutDuplicate];
    });
  }, [activeGuild]);

  // Listen to real-time events to refresh members list and pending join applications instantly
  useEffect(() => {
    if (!socket || !activeGuild) return;

    const handleRosterUpdate = (payload?: unknown) => {
      console.log("[Roster Socket]: Guild members updated. Refreshing members list...");
      applyAcceptedMemberOptimistically(payload);
      invalidateRoster();
    };

    const handleApplicationsUpdate = () => {
      console.log("[Applications Socket]: Guild applications changed. Refreshing queues...");
      if (isOfficer) {
        queryClient.invalidateQueries(`guild_applications:${activeGuild.guildId}`);
      }
    };

    const handleInviteUpdate = () => {
      console.log("[Invite Socket]: Invite code updated.");
      queryClient.invalidateQueries(`guild_invite_code:${activeGuild.guildId}`);
    };

    const handleCustomRolesUpdate = () => {
      queryClient.invalidateQueries(`guild_custom_roles:${activeGuild.guildId}`);
    };

    socket.on("member_role_updated", handleRosterUpdate);
    socket.on("member_profile_updated", handleRosterUpdate);
    socket.on("custom_roles_updated", handleCustomRolesUpdate);
    socket.on("join_request_created", handleApplicationsUpdate);
    socket.on("join_request_cancelled", handleApplicationsUpdate);
    socket.on("join_request_processed", handleApplicationsUpdate);
    socket.on("join_request_processed", handleRosterUpdate); // accepted applicant joins roster
    socket.on("invite_code_updated", handleInviteUpdate);

    return () => {
      socket.off("member_role_updated", handleRosterUpdate);
      socket.off("member_profile_updated", handleRosterUpdate);
      socket.off("custom_roles_updated", handleCustomRolesUpdate);
      socket.off("join_request_created", handleApplicationsUpdate);
      socket.off("join_request_cancelled", handleApplicationsUpdate);
      socket.off("join_request_processed", handleApplicationsUpdate);
      socket.off("join_request_processed", handleRosterUpdate);
      socket.off("invite_code_updated", handleInviteUpdate);
    };
  }, [socket, activeGuild, isOfficer, applyAcceptedMemberOptimistically, invalidateRoster]);

  // Filter & sort members
  const filteredMembers = useMemo(() => {
    return enrichedMembers
      .filter((m) => {
        const matchesSearch =
          searchQuery === "" ||
          m.user.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (m.ign && m.ign.toLowerCase().includes(searchQuery.toLowerCase())) ||
          (m.memberCode && m.memberCode.toLowerCase().includes(searchQuery.toLowerCase()));
        const matchesRole = roleFilter === "ALL" || m.role === roleFilter;
        return matchesSearch && matchesRole;
      })
      .sort((a, b) => {
        if (sortBy === "RANKING") {
          return GUILD_ROLES.indexOf(b.role as GuildRoleType) - GUILD_ROLES.indexOf(a.role as GuildRoleType);
        }
        if (sortBy === "GUILD_POINTS") return b.guildPoints - a.guildPoints;
        if (sortBy === "BALANCE") return b.balance - a.balance;
        if (sortBy === "CLASS") return (a.class || "").localeCompare(b.class || "");
        if (sortBy === "CP") return (b.cp ?? 0) - (a.cp ?? 0);
        if (sortBy === "JOINED") return new Date(b.joinedAt).getTime() - new Date(a.joinedAt).getTime();
        return (a.ign || a.user.displayName).localeCompare(b.ign || b.user.displayName);
      });
  }, [enrichedMembers, searchQuery, roleFilter, sortBy]);

  async function handleRoleChange(
    memberId: string,
    memberName: string,
    currentRole: string,
    newRole: string,
  ) {
    const isTransfer = newRole === "GUILD_LEADER";
    setConfirmModal({ memberId, memberName, currentRole, newRole, isTransfer });
  }

  async function confirmRoleChange() {
    if (!confirmModal || !activeGuild || isUpdating) return;
    setIsUpdating(true);

    try {
      const result = await guildApi.updateMemberRole(
        activeGuild.guildId,
        confirmModal.memberId,
        { role: confirmModal.newRole },
      );

      if (result.success) {
        const actionLabel = confirmModal.isTransfer
          ? `Transferred Guild Leader to ${confirmModal.memberName}`
          : `Updated ${confirmModal.memberName}'s role to ${confirmModal.newRole.replace("_", " ")}`;
        addToast("success", actionLabel);
        queryClient.invalidateQueries(`guild_members:${activeGuild.guildId}`);
        if (confirmModal.isTransfer) {
          await refreshUser();
        }
      } else {
        addToast("error", result.error?.message || "Failed to update role");
      }
    } catch (err: unknown) {
      addToast("error", errorMessage(err, "Failed to update role"));
    } finally {
      setIsUpdating(false);
      setConfirmModal(null);
    }
  }

  async function handleAssignCustomRole(memberId: string, customRoleId: string) {
    if (!activeGuild || !isGuildLeader) return;
    try {
      const result = await guildApi.updateMemberRole(activeGuild.guildId, memberId, { customRoleId });
      if (result.success) {
        addToast("success", "Custom role assigned");
        queryClient.invalidateQueries(`guild_members:${activeGuild.guildId}`);
      } else {
        addToast("error", result.error?.message || "Failed to assign custom role");
      }
    } catch (err: unknown) {
      addToast("error", errorMessage(err, "Failed to assign custom role"));
    }
  }

  async function handleReviewApplication(requestId: string, action: "ACCEPT" | "DECLINE") {
    if (!activeGuild || !isOfficer) return;
    setIsReviewingId(requestId);
    try {
      const result = await guildApi.reviewApplication(activeGuild.guildId, requestId, action);
      if (result.success) {
        if (action === "ACCEPT") {
          addToast("success", `Application accepted! Member Code: ${result.data?.memberCode || "Generated"}`);
        } else {
          addToast("info", "Application declined");
        }
        queryClient.invalidateQueries(`guild_applications:${activeGuild.guildId}`);
        if (result.data?.member) {
          queryClient.setQueryData<GuildMemberData[]>(`guild_members:${activeGuild.guildId}`, (old) => {
            const current = old ?? [];
            const withoutDuplicate = current.filter((member) => member.id !== result.data!.member!.id && member.userId !== result.data!.member!.userId);
            return [result.data!.member!, ...withoutDuplicate];
          });
        }
        invalidateRoster();
      } else {
        addToast("error", result.error?.message || "Failed to process application");
      }
    } catch (err: unknown) {
      addToast("error", errorMessage(err, "Failed to process application"));
    } finally {
      setIsReviewingId(null);
    }
  }

  async function handleGenerateInvite() {
    if (!activeGuild || !isGuildLeader) return;
    setIsGeneratingInvite(true);
    try {
      const result = await guildApi.generateInviteCode(activeGuild.guildId);
      if (result.success && result.data?.inviteCode) {
        queryClient.invalidateQueries(`guild_invite_code:${activeGuild.guildId}`);
        addToast("success", "New Guild Invite Code generated!");
      } else {
        addToast("error", "Failed to generate invite code");
      }
    } catch (err: unknown) {
      addToast("error", errorMessage(err, "Failed to generate invite code"));
    } finally {
      setIsGeneratingInvite(false);
    }
  }

  if (!user || !activeGuild) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-white/40 text-[13px]">No active guild selected</p>
      </div>
    );
  }

  const tabs: Array<{ value: "members" | "statistics" | "applications" | "invites"; label: string; count?: number }> = [
    { value: "members", label: "Active members", count: members.length },
    { value: "statistics", label: "Member Statistics" },
    ...(isOfficer
      ? [{ value: "applications" as const, label: "Pending applications", count: applications.length }]
      : []),
    ...(isGuildLeader
      ? [{ value: "invites" as const, label: "Invite code" }]
      : []),
  ];

  return (
    <div className="relative max-w-7xl mx-auto w-full">
      <DashboardDecor />

      <div className="relative z-10 space-y-6 text-white/85">
        <ModuleHeader
          eyebrow="Roster"
          title="Members"
          description={
            <span className="inline-flex items-center gap-1.5">
              <LiveDot tone="emerald" size={5} />
              {members.length} members in {activeGuild.guildName}
              <span className="text-white/25">·</span>
              <span className="text-emerald-400/90">
                {members.filter((m) => onlineUserIds.has(m.userId)).length} online
              </span>
            </span>
          }
        />

        {/* Tabs */}
        <Reveal delay={80}>
          <ModuleTabs
            tabs={tabs}
            active={activeTab}
            onChange={(v) => setActiveTab(v)}
          />
        </Reveal>

        {/* Members Tab Content */}
        {activeTab === "members" && (
          <>
            {/* Search & Filters */}
            <Card padding="sm">
              <div className="flex flex-col sm:flex-row gap-3">
                {/* Search */}
                <div className="relative flex-1">
                  <svg
                    className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <circle cx="11" cy="11" r="8" />
                    <path d="M21 21l-4.35-4.35" />
                  </svg>
                  <input
                    id="member-search"
                    type="text"
                    placeholder="Search by name, IGN, or member code..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm text-white placeholder:text-white/35 focus:outline-none focus:border-white/25 focus:bg-white/[0.05] transition-colors"
                  />
                </div>

                {/* Role Filter */}
                <select
                  id="role-filter"
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                  className="px-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm text-white focus:outline-none focus:border-white/25 transition-colors cursor-pointer appearance-none min-w-[160px]"
                  style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
                    backgroundRepeat: "no-repeat",
                    backgroundPosition: "right 12px center",
                  }}
                >
                  <option value="ALL" className="bg-[#0f0f16] text-white">All Roles</option>
                  <option value="GUILD_LEADER" className="bg-[#0f0f16] text-white">{resolveRoleName("GUILD_LEADER")}</option>
                  <option value="OFFICER" className="bg-[#0f0f16] text-white">{resolveRoleName("OFFICER")}</option>
                  <option value="CORE_MEMBER" className="bg-[#0f0f16] text-white">{resolveRoleName("CORE_MEMBER")}</option>
                  <option value="ELITE_MEMBER" className="bg-[#0f0f16] text-white">{resolveRoleName("ELITE_MEMBER")}</option>
                  <option value="MEMBER" className="bg-[#0f0f16] text-white">{resolveRoleName("MEMBER")}</option>
                </select>

                {/* Sort */}
                <select
                  id="member-sort"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortMode)}
                  className="px-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm text-white focus:outline-none focus:border-white/25 transition-colors cursor-pointer appearance-none min-w-[160px]"
                  style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
                    backgroundRepeat: "no-repeat",
                    backgroundPosition: "right 12px center",
                  }}
                >
                  <option value="NAME" className="bg-[#0f0f16] text-white">Sort: Name</option>
                  <option value="RANKING" className="bg-[#0f0f16] text-white">Sort: Ranking</option>
                  <option value="GUILD_POINTS" className="bg-[#0f0f16] text-white">Sort: Guild Points</option>
                  <option value="BALANCE" className="bg-[#0f0f16] text-white">Sort: Balance</option>
                  <option value="CLASS" className="bg-[#0f0f16] text-white">Sort: Class</option>
                  <option value="CP" className="bg-[#0f0f16] text-white">Sort: CP</option>
                  <option value="JOINED" className="bg-[#0f0f16] text-white">Sort: Join date</option>
                </select>
              </div>
            </Card>

            {/* Members List */}
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="p-4 rounded-xl bg-[#111116]/40 border border-white/[0.04] flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <SkeletonAvatar size="md" />
                      <div className="space-y-2">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-3 w-44" />
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-6 w-16 rounded-md" />
                      <Skeleton className="h-6 w-20 rounded-md" />
                    </div>
                  </div>
                ))}
              </div>
            ) : membersErrorMessage ? (
              <Card>
                <div className="text-center py-12">
                  <svg className="h-12 w-12 text-rose-300/70 mx-auto mb-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 8v5" />
                    <path d="M12 16h.01" />
                  </svg>
                  <p className="text-white/70 text-sm font-semibold">Members could not be loaded</p>
                  <p className="mt-1 text-white/40 text-xs">{membersErrorMessage}</p>
                  <Button
                    className="mt-4"
                    size="sm"
                    variant="secondary"
                    onClick={() => queryClient.invalidateQueries(`guild_members:${activeGuild.guildId}`)}
                  >
                    Retry
                  </Button>
                </div>
              </Card>
            ) : filteredMembers.length === 0 ? (
              <Card>
                <div className="text-center py-12">
                  <svg className="h-12 w-12 text-white/35 mx-auto mb-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
                  </svg>
                  <p className="text-white/40 text-sm">No members found</p>
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery("")}
                      className="mt-2 text-white text-xs hover:text-white/85 transition-colors cursor-pointer"
                    >
                      Clear search
                    </button>
                  )}
                </div>
              </Card>
            ) : (
              <div className="space-y-2">
                {filteredMembers.map((member, index) => (
                  <MemberRow
                    key={member.id}
                    member={member}
                    index={index}
                    isGuildLeader={isGuildLeader}
                    currentUserId={user.id}
                    isOnline={onlineUserIds.has(member.userId)}
                    onSelect={() => setSelectedStalkMemberId(member.id)}
                    onRoleChange={(newRole) =>
                      handleRoleChange(member.id, member.user.displayName, member.role, newRole)
                    }
                    customRoles={customRoles}
                    onAssignCustomRole={(customRoleId) => handleAssignCustomRole(member.id, customRoleId)}
                    showDualLeaderBadge={!enrichedMembers.some((m) => m.role === "GUILD_LEADER")}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {/* Member Statistics Tab Content */}
        {activeTab === "statistics" && <MembersStatisticsTab guildId={activeGuild.guildId} />}

        {/* Applications Tab Content */}
        {activeTab === "applications" && isOfficer && (
          <ApplicationsTab
            applications={applications}
            isLoadingApps={isLoadingApps}
            isReviewingId={isReviewingId}
            isOfficer={isOfficer}
            loadApplications={refetchApplications}
            handleReviewApplication={handleReviewApplication}
          />
        )}

        {/* Invite Codes Tab Content */}
        {activeTab === "invites" && isGuildLeader && (
          <InviteTab
            guildInviteCode={guildInviteCode}
            isLoadingInvite={isLoadingInvite}
            isGeneratingInvite={isGeneratingInvite}
            isGuildLeader={isGuildLeader}
            activeGuildName={activeGuild.guildName}
            handleGenerateInvite={handleGenerateInvite}
            addToast={addToast}
          />
        )}

        {/* Role Change Confirmation Modal */}
        <RoleConfirmModal
          confirmModal={confirmModal}
          isUpdating={isUpdating}
          onClose={() => setConfirmModal(null)}
          onConfirm={confirmRoleChange}
          actorStepsDown={activeGuild.role === "GUILD_LEADER"}
        />

        {/* DISCORD STYLE STALK PROFILE CARD MODAL */}
        <StalkProfileModal
          selectedStalkMember={selectedStalkMember}
          activeGuildName={activeGuild.guildName}
          guildId={activeGuild.guildId}
          currentUserId={user.id}
          isOnline={!!selectedStalkMember && onlineUserIds.has(selectedStalkMember.userId)}
          onClose={() => setSelectedStalkMemberId(null)}
        />

      </div>
    </div>
  );
}
