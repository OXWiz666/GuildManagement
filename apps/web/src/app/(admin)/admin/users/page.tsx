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
  banned: "bg-rose-500/15 text-rose-300 border-rose-500/30",
  suspended: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  deleted: "bg-white/[0.06] text-white/40 border-white/10",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide border ${STATUS_STYLES[status] || STATUS_STYLES.deleted}`}>
      {status}
    </span>
  );
}

export default function AdminUsersPage() {
  const { addToast } = useToast();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);

  const key = `admin_users:${search}:${status}:${page}`;
  const { data, isLoading } = useQuery<any>(
    key,
    async () => {
      const res = await adminApi.listUsers({ search: search || undefined, status: status || undefined, page });
      return res.success ? res.data : null;
    },
    { staleTime: 10000 },
  );

  const refresh = () => queryClient.invalidateQueries(key);
  const users = data?.users || [];

  async function act(id: string, fn: () => Promise<any>, successMsg: string) {
    try {
      const res = await fn();
      if (res.success) {
        addToast("success", successMsg);
        refresh();
        return res;
      }
      addToast("error", res.error?.message || "Action failed");
    } catch (e: any) {
      addToast("error", e?.message || "An error occurred");
    }
  }

  async function moderate(id: string, action: string) {
    let days: number | undefined;
    if (action === "suspend") {
      const input = window.prompt("Suspend for how many days?", "7");
      if (input == null) return;
      days = parseInt(input, 10) || 7;
    }
    await act(id, () => adminApi.moderateUser(id, { action, days }), `User ${action.replace("_", " ")}d`);
  }

  return (
    <div className="animate-fade-in space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="max-w-xs flex-1 min-w-[200px]">
          <Input
            placeholder="Search email, name, IGN…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-white/[0.1] bg-black/30 px-3 py-2 text-xs text-white"
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="banned">Banned</option>
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
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Guilds</th>
                <th className="px-4 py-3">Joined</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04] text-white/70">
              {users.map((u: any) => (
                <tr key={u.id} className="hover:bg-white/[0.02]">
                  <td className="px-4 py-3">
                    <span className="font-semibold text-white">{u.displayName}</span>
                    <span className="block text-[11px] text-white/40">{u.email}{u.emailVerified ? "" : " · unverified"}</span>
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={u.status} /></td>
                  <td className="px-4 py-3 text-right font-mono">{u.guildCount}</td>
                  <td className="px-4 py-3 text-white/50">{new Date(u.createdAt).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center justify-end gap-1.5">
                      <Button variant="ghost" size="xs" onClick={() => setSelected(u.id)}>Detail</Button>
                      {u.status !== "banned" ? (
                        <Button variant="ghost" size="xs" className="text-rose-300" onClick={() => moderate(u.id, "ban")}>Ban</Button>
                      ) : (
                        <Button variant="ghost" size="xs" className="text-emerald-300" onClick={() => moderate(u.id, "unban")}>Unban</Button>
                      )}
                      {u.status !== "suspended" ? (
                        <Button variant="ghost" size="xs" className="text-amber-300" onClick={() => moderate(u.id, "suspend")}>Suspend</Button>
                      ) : (
                        <Button variant="ghost" size="xs" onClick={() => moderate(u.id, "unsuspend")}>Unsuspend</Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-12 text-center text-white/35">No users found.</td></tr>
              )}
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

      {selected && (
        <UserDetailModal
          userId={selected}
          onClose={() => setSelected(null)}
          onAction={(fn, msg) => act(selected, fn, msg)}
        />
      )}
    </div>
  );
}

function UserDetailModal({
  userId,
  onClose,
  onAction,
}: {
  userId: string;
  onClose: () => void;
  onAction: (fn: () => Promise<any>, msg: string) => Promise<any>;
}) {
  const { addToast } = useToast();
  const { data, isLoading } = useQuery<any>(
    `admin_user:${userId}`,
    async () => {
      const res = await adminApi.getUser(userId);
      return res.success ? res.data : null;
    },
    { staleTime: 5000 },
  );

  async function resetPw() {
    const res = await adminApi.resetUserPassword(userId);
    if (res.success && res.data?.tempPassword) {
      window.prompt("Temporary password (copy it now — shown once):", res.data.tempPassword);
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
                <h3 className="text-lg font-black text-white">{data.displayName}</h3>
                <p className="text-xs text-white/50">{data.email}</p>
              </div>
              <StatusBadge status={data.status} />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" size="xs" onClick={() => onAction(() => adminApi.forceLogoutUser(userId), "Sessions cleared")}>Force logout</Button>
              <Button variant="ghost" size="xs" onClick={resetPw}>Reset password</Button>
              {!data.emailVerified && (
                <Button variant="ghost" size="xs" onClick={() => onAction(() => adminApi.moderateUser(userId, { action: "verify_email" }), "Email verified")}>Verify email</Button>
              )}
              {data.status === "deleted" ? (
                <Button variant="ghost" size="xs" className="text-emerald-300" onClick={() => onAction(() => adminApi.moderateUser(userId, { action: "restore" }), "Restored")}>Restore</Button>
              ) : (
                <Button variant="ghost" size="xs" className="text-rose-300" onClick={() => onAction(() => adminApi.moderateUser(userId, { action: "soft_delete" }), "Soft-deleted")}>Soft delete</Button>
              )}
            </div>

            <Section title={`Guild memberships (${data.guilds.length})`}>
              {data.guilds.length === 0 ? <Empty /> : data.guilds.map((g: any) => (
                <Row key={g.guildId} left={g.guildName} right={`${g.role}`} />
              ))}
            </Section>

            <Section title={`Recent sessions (${data.sessions.length})`}>
              {data.sessions.length === 0 ? <Empty /> : data.sessions.map((s: any) => (
                <Row key={s.id} left={s.ipAddress || "unknown IP"} right={new Date(s.lastActive).toLocaleString()} />
              ))}
            </Section>

            <Section title={`Login history (${data.loginEvents.length})`}>
              {data.loginEvents.length === 0 ? <Empty /> : data.loginEvents.map((e: any) => (
                <Row key={e.id} left={`${e.success ? "✓" : "✗"} ${e.ipAddress || "?"}`} right={new Date(e.createdAt).toLocaleString()} />
              ))}
            </Section>

            <div className="flex justify-end pt-2">
              <Button variant="primary" size="sm" onClick={onClose}>Close</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
      <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-white/40">{title}</p>
      <div className="space-y-1">{children}</div>
    </div>
  );
}
function Row({ left, right }: { left: string; right: string }) {
  return (
    <div className="flex items-center justify-between text-[11px]">
      <span className="text-white/70">{left}</span>
      <span className="text-white/40">{right}</span>
    </div>
  );
}
function Empty() {
  return <p className="text-[11px] text-white/30">None.</p>;
}
