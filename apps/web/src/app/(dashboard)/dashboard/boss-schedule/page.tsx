"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  activityApi,
  guildApi,
  type ActivityInput,
  type GuildActivitiesResponse,
  type GuildActivityData,
  type ActivityPointRulesData,
} from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import { useSocket } from "@/components/providers/socket-provider";
import Button from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import DashboardDecor from "@/components/dashboard/DashboardDecor";
import { ModuleHeader, Magnetic } from "@/components/dashboard/DashboardHelpers";
import { useQuery, queryClient } from "@/lib/query";
import { buildActivityTypeMeta, resolveActivityTypeMeta, type ActivityTypeMeta } from "@/lib/activityTypeMeta";
import ActivityModal from "./components/ActivityModal";
import ActivityCalendar from "./components/ActivityCalendar";

type TypeFilter = "ALL" | string;

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function toDateKey(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
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
const EMPTY_RULES: ActivityPointRulesData = { activities: [] };

export default function GuildActivitiesPage() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const { socket } = useSocket();
  const activeGuild = user?.guilds?.[0];

  const [now, setNow] = useState(Date.now());
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("ALL");
  const [filterOpen, setFilterOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedDate, setSelectedDate] = useState(() => toDateKey(new Date()));
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

  // Registered activities (Guild Settings → Activities Multiplier / Register Activity) —
  // this is the source of truth for schedulable activity types, kept in sync live below.
  const rulesKey = activeGuild ? `activity_rules:${activeGuild.guildId}` : "activity_rules_empty";
  const { data: rulesData } = useQuery<ActivityPointRulesData>(
    rulesKey,
    async () => {
      if (!activeGuild) return EMPTY_RULES;
      const res = await guildApi.getActivityRules(activeGuild.guildId);
      if (!res.success || !res.data) {
        // Throw instead of falling back to EMPTY_RULES: this query persists to
        // localStorage, so silently returning "zero activities" on a transient
        // failure would get cached as truth for the full 5-minute staleTime,
        // making the registered activity types disappear from this modal even
        // though Guild Settings still shows them (its state never gets
        // overwritten on a failed fetch).
        throw new Error(res.error?.message || "Failed to load activity types");
      }
      return res.data.rules;
    },
    { persist: true, staleTime: 300000, enabled: !!activeGuild },
  );
  const registeredActivities = useMemo(() => rulesData?.activities ?? [], [rulesData]);
  const typeMeta = useMemo(() => buildActivityTypeMeta(registeredActivities), [registeredActivities]);

  useEffect(() => {
    if (!socket || !activeGuild) return;
    const refresh = () => queryClient.invalidateQueries(`guild_activities:${activeGuild.guildId}`);
    const refreshRules = () => queryClient.invalidateQueries(`activity_rules:${activeGuild.guildId}`);
    socket.on("guild_activity_updated", refresh);
    socket.on("activity_point_rules_updated", refreshRules);
    return () => {
      socket.off("guild_activity_updated", refresh);
      socket.off("activity_point_rules_updated", refreshRules);
    };
  }, [socket, activeGuild]);

  const canManage = data?.canManage ?? false;
  const activities = useMemo(() => data?.activities ?? [], [data]);

  const filtered = useMemo(() => {
    const byType = typeFilter === "ALL" ? activities : activities.filter((a) => a.type === typeFilter);
    const needle = search.trim().toLowerCase();
    if (!needle) return byType;
    return byType.filter(
      (a) =>
        a.title.toLowerCase().includes(needle) ||
        (a.opponent || "").toLowerCase().includes(needle) ||
        (a.location || "").toLowerCase().includes(needle),
    );
  }, [activities, typeFilter, search]);

  const dayActivities = useMemo(
    () =>
      filtered
        .filter((a) => toDateKey(new Date(a.scheduledAt)) === selectedDate)
        .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()),
    [filtered, selectedDate],
  );

  function refresh() {
    if (activeGuild) queryClient.invalidateQueries(`guild_activities:${activeGuild.guildId}`);
  }

  function handleSelectDate(date: string) {
    setSelectedDate(date);
    if (canManage) {
      setEditing(null);
      setModalOpen(true);
    }
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

  const dayLabel = new Date(`${selectedDate}T00:00:00`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="relative max-w-full xl:max-w-[1400px] mx-auto w-full px-2 md:px-4 lg:px-6">
      <DashboardDecor />
      <div className="relative z-10 space-y-6 text-white/85">
        <ModuleHeader
          eyebrow="Calendar"
          title="Guild Activities"
          description="Schedule and track Guild Boss runs, Guild Wars, PK Wars, and any custom activity your guild has registered — with attendance and results."
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

        {/* Type filter + search */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="relative">
            <button
              onClick={() => setFilterOpen((o) => !o)}
              className="inline-flex items-center gap-2 px-3.5 h-[42px] rounded-xl bg-[var(--obsidian-elevated)]/40 backdrop-blur-md border border-[var(--metal-border)] text-[13px] font-semibold text-white/75 hover:text-white hover:border-white/20 transition-all cursor-pointer"
            >
              <svg className="h-4 w-4 text-white/40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" /></svg>
              Filter
              <span className="text-[12px] font-semibold text-[var(--forge-gold-bright)]">
                {typeFilter === "ALL" ? "All" : registeredActivities.find((r) => r.key === typeFilter)?.label ?? typeFilter}
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/5 text-white/45">
                {typeFilter === "ALL" ? activities.length : activities.filter((a) => a.type === typeFilter).length}
              </span>
              <svg className={`h-3.5 w-3.5 text-white/40 transition-transform ${filterOpen ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6" /></svg>
            </button>

            {filterOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setFilterOpen(false)} />
                <div className="absolute left-0 top-full mt-2 z-20 min-w-[240px] max-h-[320px] overflow-y-auto rounded-xl border border-[var(--metal-border)] bg-[var(--obsidian-elevated)] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.6)] p-1.5">
                  <button
                    onClick={() => { setTypeFilter("ALL"); setFilterOpen(false); }}
                    className={`w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg text-[13px] font-semibold transition-all cursor-pointer ${
                      typeFilter === "ALL" ? "bg-[var(--forge-glow)] text-[var(--forge-gold-bright)]" : "text-white/60 hover:text-white hover:bg-white/[0.04]"
                    }`}
                  >
                    All
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/5 text-white/45">{activities.length}</span>
                  </button>
                  {registeredActivities.map((rule) => {
                    const count = activities.filter((a) => a.type === rule.key).length;
                    const active = typeFilter === rule.key;
                    return (
                      <button
                        key={rule.key}
                        onClick={() => { setTypeFilter(rule.key); setFilterOpen(false); }}
                        className={`w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg text-[13px] font-semibold transition-all cursor-pointer ${
                          active ? "bg-[var(--forge-glow)] text-[var(--forge-gold-bright)]" : "text-white/60 hover:text-white hover:bg-white/[0.04]"
                        }`}
                      >
                        {rule.label}
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/5 text-white/45">{count}</span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          <label className="relative block w-full lg:w-64">
            <span className="sr-only">Search activities</span>
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search title, opponent, location..."
              className="w-full h-[42px] pl-10 pr-4 rounded-xl bg-[var(--obsidian-elevated)]/50 border border-[var(--metal-border)] text-sm text-white/90 placeholder:text-white/35 focus:outline-none focus:border-[var(--forge-gold)]/35 transition-colors"
            />
          </label>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Skeleton className="h-96 rounded-2xl lg:col-span-2" />
            <Skeleton className="h-96 rounded-2xl" />
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
            <div className="lg:col-span-2">
              <ActivityCalendar
                activities={filtered}
                typeMeta={typeMeta}
                now={now}
                selectedDate={selectedDate}
                onSelectDate={handleSelectDate}
              />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-bold text-white/80">{dayLabel}</h2>
                {canManage && (
                  <button
                    onClick={() => { setEditing(null); setModalOpen(true); }}
                    className="h-7 px-2.5 inline-flex items-center gap-1 rounded-md border border-white/[0.08] bg-white/[0.03] text-[11px] text-white/60 hover:text-white cursor-pointer"
                  >
                    + Add
                  </button>
                )}
              </div>

              {dayActivities.length === 0 ? (
                <EmptyState title="No activities" body={canManage ? "Add one for this day with the button above." : "Nothing scheduled for this day."} />
              ) : (
                <div className="space-y-3">
                  {dayActivities.map((a) => (
                    <ActivityCard
                      key={a.id} activity={a} now={now} canManage={canManage} busy={busyId === a.id}
                      typeMeta={typeMeta}
                      expanded={expandedId === a.id} onToggleExpand={() => setExpandedId((id) => (id === a.id ? null : a.id))}
                      onCheckIn={() => toggleCheckIn(a)} onEdit={() => { setEditing(a); setModalOpen(true); }}
                      onDelete={() => remove(a)} onConfirmAttendee={confirmAttendee}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <ActivityModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditing(null); }}
        editing={editing}
        saving={saving}
        onSubmit={submit}
        activityTypes={registeredActivities.map((r) => ({ key: r.key, label: r.label }))}
        defaultType={typeFilter === "ALL" ? undefined : typeFilter}
        defaultDate={selectedDate}
      />
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
  activity, now, canManage, busy, typeMeta, expanded, onToggleExpand, onCheckIn, onEdit, onDelete, onConfirmAttendee,
}: {
  activity: GuildActivityData;
  now: number;
  canManage: boolean;
  busy: boolean;
  typeMeta: Record<string, ActivityTypeMeta>;
  expanded: boolean;
  onToggleExpand: () => void;
  onCheckIn: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onConfirmAttendee: (a: GuildActivityData, userId: string, confirmed: boolean) => void;
}) {
  const meta = resolveActivityTypeMeta(typeMeta, activity.type);
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
