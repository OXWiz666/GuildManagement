"use client";

import { useState } from "react";
import { factionApi, type FactionAuditLogEntry } from "@/lib/api";
import Avatar from "@/components/ui/Avatar";
import { Skeleton } from "@/components/ui/Skeleton";
import { useQuery } from "@/lib/query";

const ACTION_LABELS: Record<string, string> = {
  FACTION_PROFILE_UPDATED: "Profile updated",
  FACTION_STATUS_CHANGED: "Status changed",
  FACTION_GUILD_MEMBERSHIP_UPDATED: "Guild membership updated",
  FACTION_ROLE_GRANTED: "Role granted",
  FACTION_ROLE_REVOKED: "Role revoked",
  GUILD_ADDED: "Guild added",
  GUILD_REMOVED: "Guild removed",
  GUILD_LEFT: "Guild left",
};

/**
 * Faction Audit Log — read-only, append-only trail. No edit/delete affordance
 * anywhere in this UI, matching the append-only guarantee on the backend.
 */
export default function FactionAuditLogTab({ canView }: { canView: boolean }) {
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const { data, isLoading } = useQuery<{ logs: FactionAuditLogEntry[]; total: number }>(
    canView ? `faction_audit_logs_${page}` : "faction_audit_logs_locked",
    async () => {
      if (!canView) return { logs: [], total: 0 };
      const result = await factionApi.getAuditLogs({ page, pageSize });
      return result.success && result.data ? { logs: result.data.logs, total: result.data.total } : { logs: [], total: 0 };
    },
    { staleTime: 15000 },
  );
  const logs = data?.logs || [];
  const total = data?.total || 0;
  const hasMore = page * pageSize < total;

  if (!canView) {
    return (
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-8 text-center">
        <h3 className="text-sm font-semibold text-white/80">Audit log is restricted</h3>
        <p className="text-xs text-white/45 mt-1">Only Faction Leaders, Admins, and Faction Officers can view this log.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {logs.length === 0 ? (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-8 text-center">
          <h3 className="text-sm font-semibold text-white/80">No audit entries yet</h3>
          <p className="text-xs text-white/45 mt-1">Actions taken across the faction will appear here.</p>
        </div>
      ) : (
        logs.map((log) => (
          <div key={log.id} className="rounded-xl border border-white/[0.06] bg-white/[0.025] px-4 py-3 flex items-start gap-3.5">
            <Avatar name={log.actor.displayName} src={log.actor.avatarUrl} size="sm" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-semibold text-white">{log.actor.displayName}</p>
                <span className="text-[11px] text-white/35">{ACTION_LABELS[log.action] || log.action.replaceAll("_", " ")}</span>
              </div>
              {log.reason && <p className="text-xs text-white/50 mt-1">{log.reason}</p>}
              <p className="text-[11px] text-white/30 mt-1">{new Date(log.createdAt).toLocaleString()}</p>
            </div>
          </div>
        ))
      )}

      {(page > 1 || hasMore) && (
        <div className="flex items-center justify-between pt-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="text-[12px] text-white/50 hover:text-white/85 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
          >
            Previous
          </button>
          <span className="text-[11px] text-white/35">Page {page}</span>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={!hasMore}
            className="text-[12px] text-white/50 hover:text-white/85 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
