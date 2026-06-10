"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { guildApi, type GuildMemberData } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import DashboardDecor from "@/components/dashboard/DashboardDecor";
import { ModuleHeader } from "@/components/dashboard/DashboardHelpers";
import { useQuery } from "@/lib/query";

type AuditTab = "all" | "items" | "member-items" | "currency";

interface AuditLogEntry {
  id: string;
  action: string;
  target: string | null;
  targetId: string | null;
  detail: any;
  createdAt: string;
  actor: {
    id: string;
    displayName: string;
    avatarUrl: string | null;
  };
}

export default function AuditLogPage() {
  const { user } = useAuth();
  const { addToast } = useToast();

  const [activeTab, setActiveTab] = useState<AuditTab>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedMemberId, setSelectedMemberId] = useState<string>("");

  const activeGuild = user?.guilds?.[0];
  const itemsPerPage = 15;

  // 1. Fetch guild members (for member receipt dropdown list) using cache
  const {
    data: membersRaw,
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

  // Auto-select current member or first member when member list loads
  useEffect(() => {
    if (members.length > 0 && !selectedMemberId) {
      const currentMember = members.find((m) => m.userId === user?.id);
      setSelectedMemberId(currentMember ? currentMember.id : members[0].id);
    }
  }, [members, user, selectedMemberId]);

  // 2. Main query for audit logs
  const {
    data: auditData,
    isLoading,
  } = useQuery<{ logs: AuditLogEntry[]; total: number; totalPages: number } | null>(
    activeGuild ? `audit_logs:${activeGuild.guildId}:${activeTab}:${currentPage}:${activeTab === "member-items" ? selectedMemberId : "all"}` : "audit_logs_empty",
    async () => {
      if (!activeGuild) return null;
      if (activeTab === "member-items" && !selectedMemberId) return null;

      let queryParams: any = {
        filter: activeTab,
        page: currentPage,
        limit: itemsPerPage,
      };

      if (activeTab === "member-items" && selectedMemberId) {
        queryParams.memberId = selectedMemberId;
      }

      const params = new URLSearchParams();
      Object.keys(queryParams).forEach((k) =>
        params.set(k, String(queryParams[k]))
      );

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api"}/guilds/${activeGuild.guildId}/audit-logs?${params.toString()}`,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("accessToken") || ""}`, // Fallback token getter
            "Content-Type": "application/json",
          },
        }
      );

      const result = await response.json();
      return result.success && result.data ? result.data : null;
    },
    { persist: true, staleTime: 30000 }
  );

  const logs = auditData?.logs || [];
  const totalLogs = auditData?.total || 0;
  const totalPages = auditData?.totalPages || 1;

  // Handle Tab Switch (reset page to 1)
  function handleTabChange(tab: AuditTab) {
    setActiveTab(tab);
    setCurrentPage(1);
  }

  if (!user || !activeGuild) {
    return (
      <div className="flex items-center justify-center h-64 animate-fade-in">
        <p className="text-white/40">No active guild selected</p>
      </div>
    );
  }

  return (
    <div className="relative max-w-full xl:max-w-[1600px] mx-auto w-full px-2 md:px-4 lg:px-6">
      <DashboardDecor />

      <div className="relative z-10 space-y-6 text-white/85">
        {/* Eyebrow & Title */}
        <ModuleHeader
          eyebrow="Historical Ledger"
          title="Guild History & Event Log"
          description="Comprehensive chronological operational logs. Track distributed items, specific member receipts, and financial treasury allocations."
        />

        {/* Tab Selection Row & Optional Filters */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/[0.06] pb-4">
          <div className="flex flex-wrap gap-2.5">
            <TabButton
              active={activeTab === "all"}
              onClick={() => handleTabChange("all")}
              label="All Actions"
            />
            <TabButton
              active={activeTab === "items"}
              onClick={() => handleTabChange("items")}
              label="Distributed Items"
            />
            <TabButton
              active={activeTab === "member-items"}
              onClick={() => handleTabChange("member-items")}
              label="Member Receipts"
            />
            <TabButton
              active={activeTab === "currency"}
              onClick={() => handleTabChange("currency")}
              label="PHP / Diamond Splits"
            />
          </div>

          {/* Member selector visible ONLY on member-items tab */}
          {activeTab === "member-items" && (
            <div className="flex items-center gap-2 max-w-xs w-full">
              <span className="text-[11px] text-zinc-400 font-mono shrink-0 uppercase tracking-wider">
                Select Member:
              </span>
              <select
                value={selectedMemberId}
                onChange={(e) => {
                  setSelectedMemberId(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full px-3 py-2 rounded-lg bg-zinc-950/80 border border-white/[0.08] text-[12px] text-white focus:outline-none focus:border-amber-500 transition-colors font-mono cursor-pointer"
              >
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.ign ? `${m.ign} (${m.user.displayName})` : m.user.displayName}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Dynamic Log Table view */}
        <Card className="p-4 sm:p-6 overflow-hidden">
          <div className="overflow-x-auto">
            {isLoading ? (
              /* Shimmer Loading State */
              <div className="space-y-4 py-4">
                <Skeleton className="h-6 w-full rounded animate-pulse" />
                <Skeleton className="h-10 w-full rounded animate-pulse" />
                <Skeleton className="h-10 w-full rounded animate-pulse" />
                <Skeleton className="h-10 w-full rounded animate-pulse" />
                <Skeleton className="h-10 w-full rounded animate-pulse" />
              </div>
            ) : logs.length === 0 ? (
              /* Empty State view */
              <div className="py-12 text-center">
                <p className="text-[13px] text-zinc-500 italic font-mono">
                  No historical records match the selected filter parameters.
                </p>
              </div>
            ) : (
              /* Data Table view */
              <table className="w-full text-left font-mono text-[12px]">
                <thead>
                  <tr className="text-zinc-500 border-b border-white/[0.05] pb-2">
                    {activeTab === "all" && (
                      <>
                        <th className="py-3 pl-2">Event Action</th>
                        <th className="py-3">Log Details</th>
                        <th className="py-3">Initiated By</th>
                        <th className="py-3 text-right pr-2">Event Timestamp</th>
                      </>
                    )}
                    {activeTab === "items" && (
                      <>
                        <th className="py-3 pl-2">Distributed Item</th>
                        <th className="py-3">Category</th>
                        <th className="py-3">Claimed By</th>
                        <th className="py-3">Method / Bid</th>
                        <th className="py-3 text-right pr-2">Date Received</th>
                      </>
                    )}
                    {activeTab === "member-items" && (
                      <>
                        <th className="py-3 pl-2">Claimed Item</th>
                        <th className="py-3">Category</th>
                        <th className="py-3">Distributed By</th>
                        <th className="py-3">Method / Cost</th>
                        <th className="py-3 text-right pr-2">Date Received</th>
                      </>
                    )}
                    {activeTab === "currency" && (
                      <>
                        <th className="py-3 pl-2">Distribution Type</th>
                        <th className="py-3">Allocated Amount</th>
                        <th className="py-3">Reference / Description</th>
                        <th className="py-3">Recipient Member</th>
                        <th className="py-3 text-right pr-2">Date Logged</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.02] text-zinc-300">
                  {logs.map((log) => {
                    const formattedDate = new Date(log.createdAt).toLocaleString(
                      "en-US",
                      {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      }
                    );

                    return (
                      <tr
                        key={log.id}
                        className="hover:bg-white/[0.01] transition-colors"
                      >
                        {/* ─── TAB 1: ALL ACTIONS ─── */}
                        {activeTab === "all" && (
                          <>
                            <td className="py-3.5 pl-2 font-bold text-white">
                              <span
                                className={`inline-block h-1.5 w-1.5 rounded-full mr-2 ${
                                  log.action.includes("DELETE") ||
                                  log.action.includes("REVOKE")
                                    ? "bg-red-400"
                                    : log.action.includes("CREATE") ||
                                      log.action.includes("CONFIRM")
                                      ? "bg-emerald-400"
                                      : "bg-amber-400"
                                }`}
                              />
                              {log.action.replace(/_/g, " ")}
                            </td>
                            <td className="py-3.5 text-zinc-400">
                              {log.detail
                                ? Object.entries(log.detail)
                                    .slice(0, 3)
                                    .map(([k, v]) => `${k}: ${v}`)
                                    .join(" · ")
                                : "No details logged"}
                            </td>
                            <td className="py-3.5 text-zinc-400">
                              {log.actor.displayName}
                            </td>
                            <td className="py-3.5 text-right text-zinc-500 pr-2">
                              {formattedDate}
                            </td>
                          </>
                        )}

                        {/* ─── TAB 2: DISTRIBUTED ITEMS ─── */}
                        {activeTab === "items" && (
                          <>
                            <td className="py-3.5 pl-2 font-bold text-white">
                              📦 {log.detail?.itemName || "Unknown Item"}
                            </td>
                            <td className="py-3.5 text-zinc-400">
                              <span className="px-1.5 py-0.5 rounded bg-zinc-950 border border-white/[0.04] text-[10px] font-semibold text-zinc-400">
                                {log.detail?.category || "OTHER"}
                              </span>
                            </td>
                            <td className="py-3.5 text-zinc-400">
                              👤 {log.detail?.recipientName}
                            </td>
                            <td className="py-3.5 text-zinc-400">
                              {log.detail?.bidAmount !== undefined ? (
                                <span className="text-amber-400 font-semibold">
                                  💎 {log.detail.bidAmount} Guild Points Bid
                                </span>
                              ) : (
                                <span className="text-emerald-400">
                                  ✓ Item Request ({log.detail?.quantity || 1} qty)
                                </span>
                              )}
                            </td>
                            <td className="py-3.5 text-right text-zinc-500 pr-2">
                              {formattedDate}
                            </td>
                          </>
                        )}

                        {/* ─── TAB 3: MEMBER RECEIVED ─── */}
                        {activeTab === "member-items" && (
                          <>
                            <td className="py-3.5 pl-2 font-bold text-white">
                              📦 {log.detail?.itemName || "Unknown Item"}
                            </td>
                            <td className="py-3.5 text-zinc-400">
                              <span className="px-1.5 py-0.5 rounded bg-zinc-950 border border-white/[0.04] text-[10px] font-semibold text-zinc-400">
                                {log.detail?.category || "OTHER"}
                              </span>
                            </td>
                            <td className="py-3.5 text-zinc-400">
                              🛡️ {log.actor.displayName || "Officer"}
                            </td>
                            <td className="py-3.5 text-zinc-400">
                              {log.detail?.bidAmount !== undefined ? (
                                <span className="text-amber-400 font-semibold">
                                  💎 {log.detail.bidAmount} Guild Points Bid
                                </span>
                              ) : (
                                <span className="text-emerald-400">
                                  ✓ Item Request ({log.detail?.quantity || 1} qty)
                                </span>
                              )}
                            </td>
                            <td className="py-3.5 text-right text-zinc-500 pr-2">
                              {formattedDate}
                            </td>
                          </>
                        )}

                        {/* ─── TAB 4: PHP / DIAMOND SPLITS ─── */}
                        {activeTab === "currency" && (
                          <>
                            <td className="py-3.5 pl-2 font-bold text-white">
                              <span
                                className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                  log.action === "CURRENCY_DISTRIBUTION"
                                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                    : "bg-red-500/10 text-red-400 border border-red-500/20"
                                }`}
                              >
                                {log.action === "CURRENCY_DISTRIBUTION"
                                  ? "CREDIT SPLIT"
                                  : "PAYOUT / DEBIT"}
                              </span>
                            </td>
                            <td className="py-3.5">
                              <span
                                className={`font-bold ${
                                  log.detail?.entryType === "CREDIT"
                                    ? "text-emerald-400"
                                    : "text-red-400"
                                }`}
                              >
                                {log.detail?.entryType === "CREDIT" ? "+" : "-"}
                                {log.detail?.currency === "PHP" ? "₱" : "💎"}{" "}
                                {Number(log.detail?.amount || 0).toLocaleString(
                                  "en-US",
                                  {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                  }
                                )}
                              </span>
                            </td>
                            <td className="py-3.5 text-zinc-400 max-w-[200px] truncate">
                              {log.detail?.description ||
                                `${log.detail?.referenceType} distribution`}
                            </td>
                            <td className="py-3.5 text-zinc-400">
                              👤 {log.detail?.recipientName}
                            </td>
                            <td className="py-3.5 text-right text-zinc-500 pr-2">
                              {formattedDate}
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Simple Premium Paginator Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-white/[0.04] pt-4 mt-4 font-mono text-[11px] text-zinc-500">
              <span>
                Showing page <strong className="text-white">{currentPage}</strong>{" "}
                of <strong className="text-white">{totalPages}</strong> (
                {totalLogs} operations logged)
              </span>

              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="xs"
                  disabled={currentPage === 1 || isLoading}
                  onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                  className="border border-white/[0.08]"
                >
                  ◀ Prev
                </Button>
                <Button
                  variant="secondary"
                  size="xs"
                  disabled={currentPage === totalPages || isLoading}
                  onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
                  className="border border-white/[0.08]"
                >
                  Next ▶
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

/* Custom Mini Tab Button subcomponent */
function TabButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative px-4 py-2.5 rounded-xl text-[12px] font-medium font-mono tracking-wider transition-all duration-200 cursor-pointer ${
        active
          ? "text-white bg-white/[0.06] border border-white/[0.08] shadow-[0_0_8px_rgba(255,255,255,0.03)]"
          : "text-white/50 hover:text-white/80 hover:bg-white/[0.02]"
      }`}
    >
      {active && (
        <span className="absolute bottom-0 inset-x-6 h-[2px] rounded-full bg-amber-400 shadow-[0_0_6px_1px_rgba(245,158,11,0.55)]" />
      )}
      {label}
    </button>
  );
}
