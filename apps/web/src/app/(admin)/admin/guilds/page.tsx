"use client";

import { useState } from "react";
import { adminApi } from "@/lib/api";
import { useQuery, queryClient } from "@/lib/query";
import { useToast } from "@/components/ui/Toast";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";

const STATUS_STYLES: Record<string, string> = {
  active: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  suspended: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  deleted: "bg-white/[0.06] text-white/40 border-white/10",
};
function StatusBadge({ status }: { status: string }) {
  return <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide border ${STATUS_STYLES[status] || STATUS_STYLES.deleted}`}>{status}</span>;
}

export default function AdminGuildsPage() {
  const { addToast } = useToast();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);

  const key = `admin_guilds:${search}:${status}:${page}`;
  const { data, isLoading } = useQuery<any>(
    key,
    async () => {
      const res = await adminApi.listGuilds({ search: search || undefined, status: status || undefined, page });
      return res.success ? res.data : null;
    },
    { staleTime: 10000 },
  );
  const refresh = () => queryClient.invalidateQueries(key);
  const guilds = data?.guilds || [];

  async function act(fn: () => Promise<any>, msg: string) {
    try {
      const res = await fn();
      if (res.success) {
        addToast("success", msg);
        refresh();
      } else addToast("error", res.error?.message || "Action failed");
    } catch (e: any) {
      addToast("error", e?.message || "An error occurred");
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-[var(--forge-gold-bright)]">Platform</p>
        <h1 className="mt-1 text-2xl font-black tracking-tight text-white">Guild Management</h1>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="max-w-xs flex-1 min-w-[200px]">
          <Input placeholder="Search name or slug…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="rounded-lg border border-white/[0.1] bg-black/30 px-3 py-2 text-xs text-white">
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="deleted">Deleted</option>
        </select>
      </div>

      {isLoading && !data ? (
        <Skeleton className="h-64 w-full rounded-2xl animate-pulse" />
      ) : (
        <div className="overflow-auto rounded-2xl border border-white/[0.06] bg-[#0c0d12]/50">
          <table className="w-full min-w-[720px] text-[12px]">
            <thead>
              <tr className="border-b border-white/[0.08] text-left text-[10px] uppercase tracking-wider text-white/45">
                <th className="px-4 py-3">Guild</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Plan</th>
                <th className="px-4 py-3 text-right">Members</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04] text-white/70">
              {guilds.map((g: any) => (
                <tr key={g.id} className="hover:bg-white/[0.02]">
                  <td className="px-4 py-3">
                    <span className="font-semibold text-white">{g.name}</span>
                    <span className="block text-[11px] text-white/40">/{g.slug}</span>
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={g.status} /></td>
                  <td className="px-4 py-3 text-white/50">{g.subscription ? g.subscription.planName : <span className="text-white/25">Free</span>}</td>
                  <td className="px-4 py-3 text-right font-mono">{g.memberCount}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center justify-end gap-1.5">
                      <Button variant="ghost" size="xs" onClick={() => setSelected(g.id)}>Detail</Button>
                      {g.status === "active" ? (
                        <Button variant="ghost" size="xs" className="text-amber-300" onClick={() => act(() => adminApi.moderateGuild(g.id, { action: "suspend" }), "Guild suspended")}>Suspend</Button>
                      ) : g.status === "suspended" ? (
                        <Button variant="ghost" size="xs" className="text-emerald-300" onClick={() => act(() => adminApi.moderateGuild(g.id, { action: "unsuspend" }), "Guild reactivated")}>Unsuspend</Button>
                      ) : null}
                      {g.status !== "deleted" ? (
                        <Button variant="ghost" size="xs" className="text-rose-300" onClick={() => act(() => adminApi.moderateGuild(g.id, { action: "soft_delete" }), "Guild deleted")}>Delete</Button>
                      ) : (
                        <Button variant="ghost" size="xs" className="text-emerald-300" onClick={() => act(() => adminApi.moderateGuild(g.id, { action: "restore" }), "Guild restored")}>Restore</Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {guilds.length === 0 && <tr><td colSpan={5} className="px-4 py-12 text-center text-white/35">No guilds found.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {data?.pagination && data.pagination.totalPages > 1 && (
        <div className="flex items-center justify-end gap-2 text-xs">
          <Button variant="ghost" size="xs" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</Button>
          <span className="text-white/40">{page} / {data.pagination.totalPages}</span>
          <Button variant="ghost" size="xs" disabled={page >= data.pagination.totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>
      )}

      {selected && <GuildDetailModal guildId={selected} onClose={() => setSelected(null)} onRefresh={refresh} />}
    </div>
  );
}

function GuildDetailModal({ guildId, onClose, onRefresh }: { guildId: string; onClose: () => void; onRefresh: () => void }) {
  const { addToast } = useToast();
  const { data, isLoading } = useQuery<any>(
    `admin_guild:${guildId}`,
    async () => {
      const res = await adminApi.getGuild(guildId);
      return res.success ? res.data : null;
    },
    { staleTime: 5000 },
  );

  async function transfer(memberId: string, name: string) {
    if (!window.confirm(`Transfer leadership of this guild to ${name}?`)) return;
    const res = await adminApi.transferGuildOwnership(guildId, memberId);
    if (res.success) {
      addToast("success", "Ownership transferred");
      queryClient.invalidateQueries(`admin_guild:${guildId}`);
      onRefresh();
    } else addToast("error", res.error?.message || "Failed");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={onClose} />
      <div className="relative z-10 w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl border border-white/[0.08] bg-[#0c0d12] p-6">
        {isLoading || !data ? (
          <p className="py-10 text-center text-white/40">Loading…</p>
        ) : (
          <div className="space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-black text-white">{data.name}</h3>
                <p className="text-xs text-white/50">/{data.slug} · owner: {data.owner?.displayName || "—"}</p>
              </div>
              <StatusBadge status={data.status} />
            </div>

            <div className="grid grid-cols-4 gap-2 text-center">
              {[["Members", data.counts.members], ["Bosses", data.counts.bossSchedules], ["Sales", data.counts.lootSales], ["Activities", data.counts.activities]].map(([l, v]) => (
                <div key={l as string} className="rounded-xl border border-white/[0.06] bg-white/[0.02] py-2">
                  <p className="text-lg font-black text-white">{v as number}</p>
                  <p className="text-[10px] uppercase text-white/40">{l as string}</p>
                </div>
              ))}
            </div>

            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-white/40">Members — click to transfer leadership</p>
              <div className="space-y-1 max-h-56 overflow-y-auto">
                {data.members.map((m: any) => (
                  <div key={m.memberId} className="flex items-center justify-between text-[11px]">
                    <span className="text-white/70">{m.displayName} <span className="text-white/35">· {m.role}</span></span>
                    {m.role !== "GUILD_LEADER" && (
                      <Button variant="ghost" size="xs" onClick={() => transfer(m.memberId, m.displayName)}>Make leader</Button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button variant="primary" size="sm" onClick={onClose}>Close</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
