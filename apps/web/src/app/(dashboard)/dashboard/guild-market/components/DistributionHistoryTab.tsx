"use client";

import { useState } from "react";
import { SLOT_LABELS } from "@guild/shared";
import { marketApi, type AuditLogEntry, type ItemDistributionData } from "@/lib/api";
import { useQuery } from "@/lib/query";
import Input from "@/components/ui/Input";
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
};

const ACTION_COLOR: Record<string, string> = {
  ITEM_DISTRIBUTED: "text-cyan-300",
  DISTRIBUTION_LIMIT_OVERRIDDEN: "text-amber-300",
  ITEM_REQUEST_DECLINED: "text-rose-300",
  LEGENDARY_PRIORITY_REJECTED: "text-rose-300",
};

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
  const { data, isLoading } = useQuery(
    `market_audit:${guildId}`,
    async () => {
      const res = await marketApi.getAuditLogs(guildId);
      return res.success && res.data ? res.data.logs : [];
    },
    { staleTime: 15000 },
  );
  const logs = (data || []) as AuditLogEntry[];
  const filtered = logs.filter((l) => {
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    return (
      (ACTION_LABELS[l.action] || l.action).toLowerCase().includes(s) ||
      l.actor.displayName.toLowerCase().includes(s) ||
      summarizeDetail(l.detail).toLowerCase().includes(s)
    );
  });

  if (isLoading && logs.length === 0) return <Skeleton className="h-64 w-full rounded-2xl animate-pulse" />;

  return (
    <div className="space-y-4">
      <div className="max-w-sm">
        <Input placeholder="Search audit log…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-sm text-white/35 border border-dashed border-white/[0.06] rounded-2xl">
          <p className="text-3xl mb-2">📜</p>No market activity recorded yet.
        </div>
      ) : (
        <ol className="relative border-l border-white/[0.08] ml-2 space-y-1">
          {filtered.map((l) => (
            <li key={l.id} className="ml-4 py-2.5">
              <span className="absolute -left-[5px] mt-1.5 h-2 w-2 rounded-full bg-[var(--forge-gold)]/70" />
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className={`text-xs font-bold ${ACTION_COLOR[l.action] || "text-white/85"}`}>
                  {ACTION_LABELS[l.action] || l.action}
                </span>
                <span className="text-[11px] text-white/45">{summarizeDetail(l.detail)}</span>
              </div>
              <p className="text-[10px] text-white/35 mt-0.5">
                {l.actor.displayName} · {fmtDate(l.createdAt)}
              </p>
            </li>
          ))}
        </ol>
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
