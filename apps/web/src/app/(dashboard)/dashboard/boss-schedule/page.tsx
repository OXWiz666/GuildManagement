"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  activityApi,
  type ActivityInput,
  type ActivityType,
  type GuildActivitiesResponse,
  type GuildActivityData,
} from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import { useSocket } from "@/components/providers/socket-provider";
import Button from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import DashboardDecor from "@/components/dashboard/DashboardDecor";
import { ModuleHeader, Magnetic } from "@/components/dashboard/DashboardHelpers";
import { useQuery, queryClient } from "@/lib/query";
import ActivityModal from "./components/ActivityModal";

type TypeFilter = "ALL" | ActivityType;

const TYPE_META: Record<ActivityType, { label: string; badge: string; dot: string }> = {
  GUILD_BOSS: { label: "Guild Boss", badge: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300", dot: "#34d399" },
  GUILD_WAR: { label: "Guild War", badge: "border-red-500/30 bg-red-500/10 text-red-300", dot: "#f87171" },
  PK_WAR: { label: "PK War", badge: "border-violet-500/30 bg-violet-500/10 text-violet-300", dot: "#a78bfa" },
};

const FILTERS: Array<{ id: TypeFilter; label: string }> = [
  { id: "ALL", label: "All" },
  { id: "GUILD_BOSS", label: "Guild Boss" },
  { id: "GUILD_WAR", label: "Guild War" },
  { id: "PK_WAR", label: "PK War" },
];

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function countdown(iso: string, now: number) {
  const diff = new Date(iso).getTime() - now;
  if (diff <= 0) return { text: "Now", live: true };
  const s = Math.floor(diff / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return { text: `in ${d}d ${h}h`, live: false };
  return { text: `${pad2(h)}:${pad2(m)}:${pad2(sec)}`, live: false };
}

const EMPTY: GuildActivitiesResponse = { canManage: false, viewerRole: "MEMBER", activities: [] };

export default function GuildActivitiesPage() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const { socket } = useSocket();
  const activeGuild = user?.guilds?.[0];

  const [now, setNow] = useState(Date.now());
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("ALL");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<GuildActivityData | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const key = activeGuild ? `guild_activities:${activeGuild.guildId}` : "guild_activities_empty";
  const { data, isLoading } = useQuery<GuildActivitiesResponse>(
    key,
    async () => {
      if (!activeGuild) return EMPTY;
      const res = await activityApi.list(activeGuild.guildId);
      return res.success && res.data ? res.data : EMPTY;
    },
    { persist: true, staleTime: 10000, enabled: !!activeGuild },
  );

  useEffect(() => {
    if (!socket || !activeGuild) return;
    const refresh = () => queryClient.invalidateQueries(`guild_activities:${activeGuild.guildId}`);
    socket.on("guild_activity_updated", refresh);
    return () => {
      socket.off("guild_activity_updated", refresh);
    };
  }, [socket, activeGuild]);

  const canManage = data?.canManage ?? false;
  const activities = useMemo(() => data?.activities ?? [], [data]);

  const filtered = useMemo(
    () => (typeFilter === "ALL" ? activities : activities.filter((a) => a.type === typeFilter)),
    [activities, typeFilter],
  );

  const upcoming = useMemo(
    () =>
      filtered
        .filter((a) => a.status === "UPCOMING")
        .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()),
    [filtered],
  );
  const history = useMemo(
    () =>
      filtered
        .filter((a) => a.status !== "UPCOMING")
        .sort((a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime()),
    [filtered],
  );

  function refresh() {
    if (activeGuild) queryClient.invalidateQueries(`guild_activities:${activeGuild.guildId}`);
  }

  async function submit(payload: ActivityInput) {
    if (!activeGuild) return;
    setSaving(true);
    try {
      const res = editing
        ? await activityApi.update(activeGuild.guildId, editing.id, payload)
        : await activityApi.create(activeGuild.guildId, payload);
      if (res.success) {
        addToast("success", editing ? "Activity updated." : "Activity scheduled.");
        setModalOpen(false);
        setEditing(null);
        refresh();
      } else {
        addToast("error", res.error?.message || "Failed to save activity");
      }
    } catch {
      addToast("error", "Failed to save activity");
    } finally {
      setSaving(false);
    }
  }

  function remove(activity: GuildActivityData) {
    if (!activeGuild) return;
    addToast("warning", `Delete "${activity.title}"? This can't be undone.`, 0, {
      label: "Delete",
      variant: "danger",
      onClick: async () => {
        try {
          const res = await activityApi.remove(activeGuild.guildId, activity.id);
          if (res.success) {
            addToast("success", "Activity deleted.");
            refresh();
          } else {
            addToast("error", res.error?.message || "Failed to delete");
          }
        } catch {
          addToast("error", "Failed to delete activity");
        }
      },
    });
  }

  async function toggleCheckIn(activity: GuildActivityData) {
    if (!activeGuild) return;
    setBusyId(activity.id);
    try {
      const attending = activity.myStatus === "NONE";
      const res = await activityApi.checkIn(activeGuild.guildId, activity.id, attending);
      if (res.success) {
        addToast("success", attending ? "Checked in." : "Check-in cancelled.");
        refresh();
      } else {
        addToast("error", res.error?.message || "Failed");
      }
    } catch {
      addToast("error", "Failed to update check-in");
    } finally {
      setBusyId(null);
    }
  }

  async function confirmAttendee(activity: GuildActivityData, userId: string, confirmed: boolean) {
    if (!activeGuild) return;
    try {
      const res = await activityApi.confirmAttendee(activeGuild.guildId, activity.id, userId, confirmed);
      if (res.success) refresh();
      else addToast("error", res.error?.message || "Failed");
    } catch {
      addToast("error", "Failed to update attendee");
    }
  }

  if (!user || !activeGuild) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-white/40">No active guild selected</p>
      </div>
    );
  }

  return (
    <div className="relative max-w-full xl:max-w-[1400px] mx-auto w-full px-2 md:px-4 lg:px-6">
      <DashboardDecor />
      <div className="relative z-10 space-y-6 text-white/85">
        <ModuleHeader
          eyebrow="Calendar"
          title="Guild Activities"
          description="Schedule and track Guild Boss runs, Guild Wars, and PK Wars — with attendance and results."
          right={
            <div className="flex items-center gap-2">
              {canManage && (
                <Magnetic strength={4}>
                  <Button variant="primary" size="sm" onClick={() => { setEditing(null); setModalOpen(true); }}>
                    <span className="inline-flex items-center gap-1.5">
                      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                      </svg>
                      New Activity
                    </span>
                  </Button>
                </Magnetic>
              )}
              <Button variant="ghost" size="sm" onClick={refresh} isLoading={isLoading}>Refresh</Button>
            </div>
          }
        />

        {/* Type filter */}
        <div className="inline-flex flex-wrap items-center bg-[var(--obsidian-elevated)]/40 backdrop-blur-md border border-[var(--metal-border)] rounded-xl p-1 gap-1">
          {FILTERS.map((f) => {
            const count = f.id === "ALL" ? activities.length : activities.filter((a) => a.type === f.id).length;
            return (
              <button
                key={f.id}
                onClick={() => setTypeFilter(f.id)}
                className={`relative px-4 py-2 text-[13px] font-semibold rounded-lg transition-all cursor-pointer ${
                  typeFilter === f.id
                    ? "bg-[var(--forge-glow)] border border-[var(--forge-gold)]/25 text-[var(--forge-gold-bright)]"
                    : "text-white/45 hover:text-white/75 border border-transparent hover:bg-white/[0.03]"
                }`}
              >
                {f.label}
                <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded-full ${typeFilter === f.id ? "bg-[var(--forge-gold)]/15 text-[var(--forge-gold)]" : "bg-white/5 text-white/45"}`}>{count}</span>
              </button>
            );
          })}
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-44 rounded-xl" />)}
          </div>
        ) : (
          <>
            <Section title="Upcoming" count={upcoming.length}>
              {upcoming.length === 0 ? (
                <EmptyState title="No upcoming activities" body={canManage ? "Create one with the New Activity button." : "Check back later."} />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {upcoming.map((a) => (
                    <ActivityCard
                      key={a.id} activity={a} now={now} canManage={canManage} busy={busyId === a.id}
                      expanded={expandedId === a.id} onToggleExpand={() => setExpandedId((id) => (id === a.id ? null : a.id))}
                      onCheckIn={() => toggleCheckIn(a)} onEdit={() => { setEditing(a); setModalOpen(true); }}
                      onDelete={() => remove(a)} onConfirmAttendee={confirmAttendee}
                    />
                  ))}
                </div>
              )}
            </Section>

            {history.length > 0 && (
              <Section title="History" count={history.length}>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {history.map((a) => (
                    <ActivityCard
                      key={a.id} activity={a} now={now} canManage={canManage} busy={busyId === a.id}
                      expanded={expandedId === a.id} onToggleExpand={() => setExpandedId((id) => (id === a.id ? null : a.id))}
                      onCheckIn={() => toggleCheckIn(a)} onEdit={() => { setEditing(a); setModalOpen(true); }}
                      onDelete={() => remove(a)} onConfirmAttendee={confirmAttendee}
                    />
                  ))}
                </div>
              </Section>
            )}
          </>
        )}
      </div>

      <ActivityModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditing(null); }}
        editing={editing}
        saving={saving}
        onSubmit={submit}
        defaultType={typeFilter === "ALL" ? "GUILD_WAR" : typeFilter}
      />
    </div>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-bold uppercase tracking-[0.14em] text-white/70">{title}</h2>
        <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/5 text-white/45">{count}</span>
      </div>
      {children}
    </div>
  );
}

function ResultBadge({ result }: { result: "WIN" | "LOSS" | "DRAW" }) {
  const map = {
    WIN: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
    LOSS: "border-red-500/30 bg-red-500/10 text-red-300",
    DRAW: "border-white/15 bg-white/5 text-white/60",
  };
  return <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md border ${map[result]}`}>{result}</span>;
}

function ActivityCard({
  activity, now, canManage, busy, expanded, onToggleExpand, onCheckIn, onEdit, onDelete, onConfirmAttendee,
}: {
  activity: GuildActivityData;
  now: number;
  canManage: boolean;
  busy: boolean;
  expanded: boolean;
  onToggleExpand: () => void;
  onCheckIn: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onConfirmAttendee: (a: GuildActivityData, userId: string, confirmed: boolean) => void;
}) {
  const meta = TYPE_META[activity.type];
  const isUpcoming = activity.status === "UPCOMING";
  const cd = countdown(activity.scheduledAt, now);
  const when = new Date(activity.scheduledAt).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

  return (
    <article className="relative rounded-2xl border border-[var(--metal-border)] bg-[var(--obsidian-elevated)]/40 p-4 transition-all hover:border-white/15 hover:shadow-[0_8px_30px_rgb(0,0,0,0.4)]">
      <div className="absolute top-0 left-0 right-0 h-[3px] rounded-t-2xl" style={{ background: `linear-gradient(90deg, transparent, ${meta.dot}, transparent)` }} />

      <div className="flex items-start justify-between gap-2 mb-2">
        <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md border ${meta.badge}`}>{meta.label}</span>
        <div className="flex items-center gap-1.5">
          {activity.status === "CANCELLED" && <span className="text-[10px] font-bold uppercase text-white/40">Cancelled</span>}
          {activity.result && <ResultBadge result={activity.result} />}
        </div>
      </div>

      <h3 className="text-[15px] font-bold text-white truncate">{activity.title}</h3>

      <div className="mt-2 space-y-1.5 text-[12px] text-white/55">
        <div className="flex items-center gap-1.5">
          <svg className="h-3.5 w-3.5 shrink-0 text-white/35" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
          <span>{when}</span>
          {isUpcoming && <span className={`ml-auto font-mono font-bold ${cd.live ? "text-emerald-400" : "text-[var(--forge-gold-bright)]"}`}>{cd.text}</span>}
        </div>
        {activity.location && (
          <div className="flex items-center gap-1.5">
            <svg className="h-3.5 w-3.5 shrink-0 text-white/35" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2a8 8 0 00-8 8c0 5.25 8 12 8 12s8-6.75 8-12a8 8 0 00-8-8z" /><circle cx="12" cy="10" r="3" /></svg>
            <span className="truncate">{activity.location}</span>
          </div>
        )}
        {activity.opponent && (
          <div className="flex items-center gap-1.5">
            <svg className="h-3.5 w-3.5 shrink-0 text-white/35" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14.5 17.5L3 6V3h3l11.5 11.5" /><path d="M13 19l6-6M16 16l4 4M19 21l2-2" /></svg>
            <span className="truncate">vs <span className="text-white/75 font-semibold">{activity.opponent}</span></span>
          </div>
        )}
        {(activity.scoreFor != null || activity.scoreAgainst != null) && (
          <div className="text-[13px] font-bold text-white/80">
            {activity.scoreFor ?? 0} <span className="text-white/30">–</span> {activity.scoreAgainst ?? 0}
          </div>
        )}
      </div>

      {activity.notes && <p className="mt-2 text-[11px] text-white/40 line-clamp-2">{activity.notes}</p>}

      {/* Footer */}
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-white/[0.05] pt-3">
        <button onClick={onToggleExpand} className="inline-flex items-center gap-1.5 text-[11px] text-white/50 hover:text-white/80 cursor-pointer">
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87" /></svg>
          {activity.attendeeCount} in{activity.confirmedCount > 0 ? ` · ${activity.confirmedCount} ✓` : ""}
        </button>

        {isUpcoming && (
          <button
            onClick={onCheckIn}
            disabled={busy}
            className={`h-8 px-3 inline-flex items-center gap-1.5 rounded-lg border text-[11px] font-bold uppercase tracking-wide transition-all cursor-pointer disabled:opacity-50 ${
              activity.myStatus === "NONE"
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
                : "border-white/15 bg-white/5 text-white/60 hover:text-white"
            }`}
          >
            {activity.myStatus === "NONE" ? "Check in" : activity.myStatus === "CONFIRMED" ? "Confirmed ✓" : "Checked in"}
          </button>
        )}
      </div>

      {/* Attendee panel */}
      {expanded && (
        <div className="mt-3 rounded-lg border border-white/[0.07] bg-white/[0.02] p-2.5">
          {activity.attendees.length === 0 ? (
            <p className="text-[11px] text-white/35 text-center py-2">No check-ins yet.</p>
          ) : (
            <ul className="space-y-1 max-h-44 overflow-y-auto">
              {activity.attendees.map((att) => (
                <li key={att.userId} className="flex items-center justify-between gap-2 text-[12px]">
                  <span className="flex items-center gap-2 min-w-0">
                    <span className={`h-1.5 w-1.5 rounded-full ${att.status === "CONFIRMED" ? "bg-emerald-400" : "bg-amber-400"}`} />
                    <span className="truncate text-white/75">{att.displayName}</span>
                  </span>
                  {canManage ? (
                    <button
                      onClick={() => onConfirmAttendee(activity, att.userId, att.status !== "CONFIRMED")}
                      className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded cursor-pointer ${att.status === "CONFIRMED" ? "text-emerald-300 hover:text-white" : "text-white/45 hover:text-emerald-300"}`}
                    >
                      {att.status === "CONFIRMED" ? "Confirmed" : "Confirm"}
                    </button>
                  ) : (
                    <span className="text-[10px] uppercase text-white/35">{att.status.toLowerCase()}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Officer actions */}
      {canManage && (
        <div className="mt-3 flex items-center justify-end gap-1.5">
          <button onClick={onEdit} className="h-7 px-2.5 inline-flex items-center gap-1 rounded-md border border-white/[0.08] bg-white/[0.03] text-[11px] text-white/60 hover:text-white cursor-pointer">Edit</button>
          <button onClick={onDelete} className="h-7 px-2.5 inline-flex items-center gap-1 rounded-md border border-red-500/20 bg-red-500/[0.06] text-[11px] text-red-400/80 hover:text-red-300 cursor-pointer">Delete</button>
        </div>
      )}
    </article>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-48 rounded-xl bg-white/[0.015] border border-white/[0.05] p-8 text-center">
      <svg className="h-9 w-9 text-white/20 mb-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
      <h3 className="text-sm font-semibold text-white/80">{title}</h3>
      <p className="text-xs text-white/45 mt-1 max-w-sm">{body}</p>
    </div>
  );
}
