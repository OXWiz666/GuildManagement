"use client";

import { useMemo, useState } from "react";
import { SLOT_LABELS } from "@guild/shared";
import { marketApi, type AuditLogEntry, type ItemDistributionData } from "@/lib/api";
import { useQuery } from "@/lib/query";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { RankTierBadge } from "./MarketBadges";

const ACTION_LABELS: Record<string, string> = {
  ITEM_REQUEST_SUBMITTED: "Item requested",
  ITEM_REQUEST_APPROVED: "Request approved",
  ITEM_REQUEST_DECLINED: "Request rejected",
  ITEM_REQUEST_FULFILLED: "Request distributed",
  LEGENDARY_PRIORITY_SUBMITTED: "Legendary priority requested",
  LEGENDARY_PRIORITY_APPROVED: "Legendary priority approved",
  LEGENDARY_PRIORITY_REJECTED: "Legendary priority rejected",
  LEGENDARY_PRIORITY_COMPLETED: "Legendary priority completed",
  ITEM_DISTRIBUTED: "Item distributed",
  DISTRIBUTION_LIMIT_OVERRIDDEN: "Limit override",
  PRIORITY_SEQUENCE_CHANGED: "Priority sequence changed",
  DISTRIBUTION_RULE_UPDATED: "Distribution rules updated",
  WISHLIST_ITEM_DISTRIBUTED: "Wishlist item distributed",
  WISHLIST_LOG_REQUESTED: "Log requested from wishlist",
  MOUNT_CATALOG_UPDATED: "Mount catalog updated",
  MOUNT_DISTRIBUTED: "Mount distributed",
};

const ACTION_COLOR: Record<string, string> = {
  ITEM_DISTRIBUTED: "text-cyan-300",
  WISHLIST_ITEM_DISTRIBUTED: "text-cyan-300",
  MOUNT_DISTRIBUTED: "text-cyan-300",
  DISTRIBUTION_LIMIT_OVERRIDDEN: "text-amber-300",
  ITEM_REQUEST_DECLINED: "text-rose-300",
  LEGENDARY_PRIORITY_REJECTED: "text-rose-300",
};

const ACTION_DOT: Record<string, string> = {
  ITEM_DISTRIBUTED: "bg-cyan-400",
  WISHLIST_ITEM_DISTRIBUTED: "bg-cyan-400",
  MOUNT_DISTRIBUTED: "bg-cyan-400",
  DISTRIBUTION_LIMIT_OVERRIDDEN: "bg-amber-400",
  ITEM_REQUEST_DECLINED: "bg-rose-400",
  LEGENDARY_PRIORITY_REJECTED: "bg-rose-400",
};

/** Groups newest-first log entries into Today / Yesterday / calendar-date buckets, preserving order. */
function groupByDay(logs: AuditLogEntry[]): Array<[string, AuditLogEntry[]]> {
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  const map = new Map<string, AuditLogEntry[]>();
  for (const l of logs) {
    const d = new Date(l.createdAt);
    const label = sameDay(d, today)
      ? "Today"
      : sameDay(d, yesterday)
        ? "Yesterday"
        : d.toLocaleDateString(undefined, {
            month: "long",
            day: "numeric",
            year: d.getFullYear() !== today.getFullYear() ? "numeric" : undefined,
          });
    if (!map.has(label)) map.set(label, []);
    map.get(label)!.push(l);
  }
  return Array.from(map.entries());
}

interface Props {
  guildId: string;
  isOfficer: boolean;
}

export default function DistributionHistoryTab({ guildId, isOfficer }: Props) {
  if (isOfficer) return <AuditLogView guildId={guildId} />;
  return <MyDistributionsView guildId={guildId} />;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function summarizeDetail(detail: Record<string, unknown> | null): string {
  if (!detail) return "";
  const parts: string[] = [];
  if (detail.ign) parts.push(String(detail.ign));
  if (detail.itemType) parts.push(String(detail.itemType));
  if (detail.category) parts.push(String(detail.category));
  if (detail.quantity != null) parts.push(`×${detail.quantity}`);
  if (detail.tier) parts.push(String(detail.tier));
  if (detail.reason) parts.push(`— ${detail.reason}`);
  return parts.join(" · ");
}

function AuditLogView({ guildId }: { guildId: string }) {
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("ALL");
  const [page, setPage] = useState(1);

  function onFilterChange(v: string) {
    setActionFilter(v);
    setPage(1);
  }

  const { data, isLoading } = useQuery(
    `market_audit:${guildId}:${actionFilter}:${page}`,
    async () => {
      const res = await marketApi.getAuditLogs(guildId, {
        action: actionFilter !== "ALL" ? actionFilter : undefined,
        page,
      });
      return res.success && res.data
        ? res.data
        : { logs: [] as AuditLogEntry[], pagination: { page: 1, limit: 30, total: 0, totalPages: 1 } };
    },
    { staleTime: 15000 },
  );
  const logs = useMemo(() => (data?.logs || []) as AuditLogEntry[], [data]);
  const pagination = data?.pagination;
  const totalPages = Math.max(1, pagination?.totalPages ?? 1);

  const filtered = useMemo(() => {
    if (!search.trim()) return logs;
    const s = search.toLowerCase();
    return logs.filter(
      (l) =>
        (ACTION_LABELS[l.action] || l.action).toLowerCase().includes(s) ||
        l.actor.displayName.toLowerCase().includes(s) ||
        summarizeDetail(l.detail).toLowerCase().includes(s),
    );
  }, [logs, search]);

  const groups = useMemo(() => groupByDay(filtered), [filtered]);

  if (isLoading && logs.length === 0) return <Skeleton className="h-64 w-full rounded-2xl animate-pulse" />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={actionFilter}
          onChange={(e) => onFilterChange(e.target.value)}
          className="rounded-lg border border-white/[0.1] bg-black/30 px-2.5 py-1.5 text-[11px] text-white focus:border-cyan-500/50 focus:outline-none cursor-pointer"
        >
          <option value="ALL">All actions</option>
          {Object.entries(ACTION_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <div className="max-w-sm flex-1 min-w-[160px]">
          <Input placeholder="Search this page…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-sm text-white/35 border border-dashed border-white/[0.06] rounded-2xl">
          <p className="text-3xl mb-2">📜</p>No market activity recorded yet.
        </div>
      ) : (
        <div className="space-y-5">
          {groups.map(([label, entries]) => (
            <div key={label}>
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/35 mb-2 pl-2">{label}</p>
              <ol className="relative border-l border-white/[0.08] ml-2 space-y-1">
                {entries.map((l) => (
                  <li key={l.id} className="ml-4 py-2.5">
                    <span className={`absolute -left-[5px] mt-1.5 h-2 w-2 rounded-full ${ACTION_DOT[l.action] || "bg-[var(--forge-gold)]/70"}`} />
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <span className={`text-xs font-bold ${ACTION_COLOR[l.action] || "text-white/85"}`}>
                        {ACTION_LABELS[l.action] || l.action}
                      </span>
                      <span className="text-[11px] text-white/45">{summarizeDetail(l.detail)}</span>
                    </div>
                    <p className="text-[10px] text-white/35 mt-0.5">
                      {l.actor.displayName} · {fmtTime(l.createdAt)}
                    </p>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      )}

      {pagination && pagination.total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] pt-3">
          <p className="text-[11px] text-zinc-500">
            Page {pagination.page} of {totalPages} <span className="text-white/25">/ {pagination.total.toLocaleString()} total</span>
          </p>
          <div className="flex items-center gap-1.5">
            <Button variant="ghost" size="xs" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="border border-white/[0.05]">
              Prev
            </Button>
            <Button variant="ghost" size="xs" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="border border-white/[0.05]">
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function MyDistributionsView({ guildId }: { guildId: string }) {
  const { data, isLoading } = useQuery(
    `market_distributions_mine:${guildId}`,
    async () => {
      const res = await marketApi.getDistributions(guildId, { mine: true });
      return res.success && res.data ? res.data.distributions : [];
    },
    { staleTime: 15000 },
  );
  const distributions = (data || []) as ItemDistributionData[];

  if (isLoading && distributions.length === 0) return <Skeleton className="h-64 w-full rounded-2xl animate-pulse" />;

  if (distributions.length === 0) {
    return (
      <div className="text-center py-16 text-sm text-white/35 border border-dashed border-white/[0.06] rounded-2xl">
        <p className="text-3xl mb-2">🎁</p>You haven't received any distributions yet.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {distributions.map((d) => {
        const entries = Object.entries(d.items || {}).filter(([, v]) => (typeof v === "number" ? v > 0 : v));
        return (
          <div key={d.id} className="rounded-xl border border-white/[0.06] bg-[#0c0d12]/40 backdrop-blur p-4">
            <div className="flex items-center justify-between gap-2 mb-2">
              <RankTierBadge tier={d.rankTier} />
              <span className="text-[10px] text-white/40">{fmtDate(d.distributedAt)}</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {entries.map(([slot, v]) => (
                <span key={slot} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] bg-white/[0.04] text-white/70 border border-white/[0.06]">
                  {SLOT_LABELS[slot] || slot}
                  {typeof v === "number" && v > 1 && <span className="font-mono text-white/50">×{v}</span>}
                </span>
              ))}
            </div>
            {d.note && <p className="text-[11px] text-white/40 mt-2">{d.note}</p>}
            {d.overridden && <p className="text-[10px] text-amber-300/70 mt-1">Override: {d.overrideReason}</p>}
          </div>
        );
      })}
    </div>
  );
}
