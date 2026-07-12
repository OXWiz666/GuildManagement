"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { useSocket } from "@/components/providers/socket-provider";
import { guildApi, type GuildMemberData, type JoinRequestData, type MemberCategoryData } from "@/lib/api";
import { hasMinimumRole, type GuildRoleType } from "@guild/shared";
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
import RoleConfirmModal from "./components/RoleConfirmModal";
import StalkProfileModal from "./components/StalkProfileModal";
import CategoryManagerModal from "./components/CategoryManagerModal";

export default function MembersPage() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const { socket } = useSocket();
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("ALL");
  const [sortBy, setSortBy] = useState<"NAME" | "CP" | "JOINED">("NAME");
  const [confirmModal, setConfirmModal] = useState<{
    memberId: string;
    memberName: string;
    currentRole: string;
    newRole: string;
    isTransfer: boolean;
  } | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [expandedMember, setExpandedMember] = useState<string | null>(null);
  const [selectedStalkMember, setSelectedStalkMember] = useState<GuildMemberData | null>(null);
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");

  // New admin flow state variables
  const [activeTab, setActiveTab] = useState<"members" | "applications" | "invites">("members");
  const [isGeneratingInvite, setIsGeneratingInvite] = useState(false);
  const [isReviewingId, setIsReviewingId] = useState<string | null>(null);

  const activeGuild = user?.guilds[0];
  const isGuildLeader = !!activeGuild && hasMinimumRole(activeGuild.role as GuildRoleType, "GUILD_LEADER");
  const isOfficer = !!activeGuild && hasMinimumRole(activeGuild.role as GuildRoleType, "OFFICER");

  // ─── Persistent Queries ────────────────────────────────
  
  // 1. Members Query
  const {
    data: membersRaw,
    isLoading,
  } = useQuery<GuildMemberData[]>(
    activeGuild ? `guild_members:${activeGuild.guildId}` : "guild_members_empty",
    async () => {
      if (!activeGuild) return [];
      const result = await guildApi.getMembers(activeGuild.guildId);
      return result.success && result.data?.members ? result.data.members : [];
    },
    { persist: true, staleTime: 30000 }
  );
  const members = membersRaw || [];

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
    { persist: true, staleTime: 30000 }
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

  // 4. Member Categories Query (customizable roster tags)
  const { data: categoriesRaw } = useQuery<MemberCategoryData[]>(
    activeGuild ? `guild_member_categories:${activeGuild.guildId}` : "guild_member_categories_empty",
    async () => {
      if (!activeGuild) return [];
      const result = await guildApi.getMemberCategories(activeGuild.guildId);
      return result.success && result.data?.categories ? result.data.categories : [];
    },
    { persist: true, staleTime: 30000 }
  );
  const categories = categoriesRaw || [];

  // Listen to real-time events to refresh members list and pending join applications instantly
  useEffect(() => {
    if (!socket || !activeGuild) return;

    const handleRosterUpdate = () => {
      console.log("[Roster Socket]: Guild members updated. Refreshing members list...");
      queryClient.invalidateQueries(`guild_members:${activeGuild.guildId}`);
    };

    const handleApplicationsUpdate = () => {
      console.log("[Applications Socket]: Guild applications changed. Refreshing queues...");
      if (isOfficer) {
        queryClient.invalidateQueries(`guild_applications:${activeGuild.guildId}`);
      }
    };

    const handleInviteUpdate = (payload: { inviteCode: string }) => {
      console.log("[Invite Socket]: Invite code updated.");
      queryClient.invalidateQueries(`guild_invite_code:${activeGuild.guildId}`);
    };

    const handleCategoriesUpdate = () => {
      queryClient.invalidateQueries(`guild_member_categories:${activeGuild.guildId}`);
    };

    socket.on("member_role_updated", handleRosterUpdate);
    socket.on("member_categories_updated", handleCategoriesUpdate);
    socket.on("join_request_created", handleApplicationsUpdate);
    socket.on("join_request_cancelled", handleApplicationsUpdate);
    socket.on("join_request_processed", handleApplicationsUpdate);
    socket.on("join_request_processed", handleRosterUpdate); // accepted applicant joins roster
    socket.on("invite_code_updated", handleInviteUpdate);

    return () => {
      socket.off("member_role_updated", handleRosterUpdate);
      socket.off("member_categories_updated", handleCategoriesUpdate);
      socket.off("join_request_created", handleApplicationsUpdate);
      socket.off("join_request_cancelled", handleApplicationsUpdate);
      socket.off("join_request_processed", handleApplicationsUpdate);
      socket.off("join_request_processed", handleRosterUpdate);
      socket.off("invite_code_updated", handleInviteUpdate);
    };
  }, [socket, activeGuild, isOfficer]);

  // Filter members
  const filteredMembers = members
    .filter((m) => {
      const matchesSearch =
        searchQuery === "" ||
        m.user.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (m.ign && m.ign.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (m.memberCode && m.memberCode.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesRole = roleFilter === "ALL" || m.role === roleFilter;
      const matchesCategory =
        categoryFilter === "ALL" ||
        (categoryFilter === "NONE" ? !m.category : m.category?.id === categoryFilter);
      return matchesSearch && matchesRole && matchesCategory;
    })
    .sort((a, b) => {
      if (sortBy === "CP") return (b.cp ?? 0) - (a.cp ?? 0);
      if (sortBy === "JOINED") return new Date(b.joinedAt).getTime() - new Date(a.joinedAt).getTime();
      return a.user.displayName.localeCompare(b.user.displayName);
    });

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
    if (!confirmModal || !activeGuild) return;
    setIsUpdating(true);

    try {
      const result = await guildApi.updateMemberRole(
        activeGuild.guildId,
        confirmModal.memberId,
        confirmModal.newRole,
      );

      if (result.success) {
        const actionLabel = confirmModal.isTransfer
          ? `Transferred Guild Leader to ${confirmModal.memberName}`
          : `Updated ${confirmModal.memberName}'s role to ${confirmModal.newRole.replace("_", " ")}`;
        addToast("success", actionLabel);
        queryClient.invalidateQueries(`guild_members:${activeGuild.guildId}`);
      } else {
        addToast("error", result.error?.message || "Failed to update role");
      }
    } catch {
      addToast("error", "Failed to update role");
    } finally {
      setIsUpdating(false);
      setConfirmModal(null);
    }
  }

  async function handleAssignCategory(memberId: string, categoryId: string | null) {
    if (!activeGuild || !isGuildLeader) return;
    try {
      const result = await guildApi.assignMemberCategory(activeGuild.guildId, memberId, categoryId);
      if (result.success) {
        addToast("success", categoryId ? "Category assigned" : "Category cleared");
        queryClient.invalidateQueries(`guild_members:${activeGuild.guildId}`);
      } else {
        addToast("error", result.error?.message || "Failed to assign category");
      }
    } catch (err: any) {
      addToast("error", err?.message || "Failed to assign category");
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
        queryClient.invalidateQueries(`guild_members:${activeGuild.guildId}`);
      } else {
        addToast("error", result.error?.message || "Failed to process application");
      }
    } catch (err: any) {
      addToast("error", err?.message || "Failed to process application");
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
    } catch (err: any) {
      addToast("error", err?.message || "Failed to generate invite code");
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

  const tabs: Array<{ value: "members" | "applications" | "invites"; label: string; count?: number }> = [
    { value: "members", label: "Active members", count: members.length },
    { value: "applications", label: "Pending applications", count: applications.length },
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
            </span>
          }
          right={
            isGuildLeader ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowCategoryManager(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/[0.08] text-white/70 hover:text-white hover:border-primary-500/30 hover:bg-white/[0.06] transition-all text-[11px] font-medium uppercase tracking-[0.14em] cursor-pointer"
                >
                  <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z" />
                    <line x1="7" y1="7" x2="7.01" y2="7" />
                  </svg>
                  Customize Categories
                </button>
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/[0.08] text-white/70 text-[11px] font-medium uppercase tracking-[0.18em]">
                  <svg
                    className="h-3 w-3"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M12 15l-2-4h4l-2 4z" />
                    <path d="M5 7l3 4L12 3l4 8 3-4v12H5V7z" />
                  </svg>
                  Role management
                </span>
              </div>
            ) : null
          }
        />

        {/* Tabs */}
        {isOfficer && (
          <Reveal delay={80}>
            <ModuleTabs
              tabs={tabs}
              active={activeTab}
              onChange={(v) => setActiveTab(v)}
            />
          </Reveal>
        )}

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
                  <option value="GUILD_LEADER" className="bg-[#0f0f16] text-white">Guild Leader</option>
                  <option value="OFFICER" className="bg-[#0f0f16] text-white">Officer</option>
                  <option value="CORE_MEMBER" className="bg-[#0f0f16] text-white">Core Member</option>
                  <option value="ELITE_MEMBER" className="bg-[#0f0f16] text-white">Elite Member</option>
                  <option value="MEMBER" className="bg-[#0f0f16] text-white">Member</option>
                </select>

                {/* Category Filter */}
                {categories.length > 0 && (
                  <select
                    id="category-filter"
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    className="px-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm text-white focus:outline-none focus:border-white/25 transition-colors cursor-pointer appearance-none min-w-[160px]"
                    style={{
                      backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
                      backgroundRepeat: "no-repeat",
                      backgroundPosition: "right 12px center",
                    }}
                  >
                    <option value="ALL" className="bg-[#0f0f16] text-white">All Categories</option>
                    <option value="NONE" className="bg-[#0f0f16] text-white">Uncategorized</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id} className="bg-[#0f0f16] text-white">{cat.name}</option>
                    ))}
                  </select>
                )}

                {/* Sort */}
                <select
                  id="member-sort"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as "NAME" | "CP" | "JOINED")}
                  className="px-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm text-white focus:outline-none focus:border-white/25 transition-colors cursor-pointer appearance-none min-w-[160px]"
                  style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
                    backgroundRepeat: "no-repeat",
                    backgroundPosition: "right 12px center",
                  }}
                >
                  <option value="NAME" className="bg-[#0f0f16] text-white">Sort: Name</option>
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
                    isExpanded={expandedMember === member.id}
                    onToggleExpand={() =>
                      setExpandedMember(expandedMember === member.id ? null : member.id)
                    }
                    onRoleChange={(newRole) =>
                      handleRoleChange(member.id, member.user.displayName, member.role, newRole)
                    }
                    onAvatarClick={() => setSelectedStalkMember(member)}
                    categories={categories}
                    onAssignCategory={(categoryId) => handleAssignCategory(member.id, categoryId)}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {/* Applications Tab Content */}
        {activeTab === "applications" && (
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
        />

        {/* DISCORD STYLE STALK PROFILE CARD MODAL */}
        <StalkProfileModal
          selectedStalkMember={selectedStalkMember}
          activeGuildName={activeGuild.guildName}
          onClose={() => setSelectedStalkMember(null)}
        />

        {/* Customize Categories Modal (Guild Leader only) */}
        {showCategoryManager && isGuildLeader && (
          <CategoryManagerModal
            guildId={activeGuild.guildId}
            categories={categories}
            onClose={() => setShowCategoryManager(false)}
          />
        )}
      </div>
    </div>
  );
}
