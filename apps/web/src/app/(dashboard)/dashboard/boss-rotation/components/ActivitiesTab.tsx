"use client";

import { useEffect, useMemo, useState } from "react";
import {
  activityApi,
  guildApi,
  dashboardApi,
  type ActivityInput,
  type GuildActivitiesResponse,
  type GuildActivityData,
  type ActivityPointRulesData,
  type LowBossRotationResponse,
} from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import { useSocket } from "@/components/providers/socket-provider";
import Button from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { Magnetic } from "@/components/dashboard/DashboardHelpers";
import { useQuery, queryClient } from "@/lib/query";
import { buildActivityTypeMeta } from "@/lib/activityTypeMeta";
import ActivityModal from "./ActivityModal";
import ActivityCard from "./ActivityCard";
import WeeklyCalendar, { toDateKey } from "./WeeklyCalendar";
import { buildWeeklyChips, buildGuildOfDayResolver } from "../utils/calendarChips";

type TypeFilter = "ALL" | string;

const EMPTY: GuildActivitiesResponse = { canManage: false, viewerRole: "MEMBER", activities: [] };
const EMPTY_LOW_ROTATION: LowBossRotationResponse = {
  canManage: false,
  viewerRole: "MEMBER",
  mode: "MONTHLY",
  lowBossNames: [],
  weekly: {},
  days: {},
  guilds: [],
  bosses: [],
};

/**
 * Guild Activities, relocated from its own page (/dashboard/boss-schedule)
 * into a Boss Rotation tab. Self-contained like MasterListTab/LowBossSchedule
 * — takes only guildId and fetches everything itself. The calendar here
 * shows activities only (no boss spawns — those already have their own
 * Guild Rotation/Upcoming tabs) plus the Faction Schedule guild-of-day strip,
 * sharing the boss_low_rotation cache key so that costs no extra request.
 */
export default function ActivitiesTab({ guildId }: { guildId: string }) {
  const { addToast } = useToast();
  const { socket } = useSocket();

  const [typeFilter, setTypeFilter] = useState<TypeFilter>("ALL");
  const [filterOpen, setFilterOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<GuildActivityData | null>(null);
  const [modalDefaultDate, setModalDefaultDate] = useState<string | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const key = `guild_activities:${guildId}`;
  const { data, isLoading } = useQuery<GuildActivitiesResponse>(
    key,
    async () => {
      const res = await activityApi.list(guildId);
      return res.success && res.data ? res.data : EMPTY;
    },
    { persist: true, staleTime: 10000, enabled: !!guildId },
  );

  const rulesKey = `activity_rules:${guildId}`;
  const { data: rulesData } = useQuery<ActivityPointRulesData>(
    rulesKey,
    async () => {
      const res = await guildApi.getActivityRules(guildId);
      if (!res.success || !res.data) {
        throw new Error(res.error?.message || "Failed to load activity types");
      }
      return res.data.rules;
    },
    { persist: true, staleTime: 300000, enabled: !!guildId },
  );
  const registeredActivities = useMemo(() => rulesData?.activities ?? [], [rulesData]);
  const typeMeta = useMemo(() => buildActivityTypeMeta(registeredActivities), [registeredActivities]);

  // Same cache key the Faction Schedule tab uses — shares the cache instead
  // of double-fetching, and is all the calendar needs for its guild-of-day
  // overlay without prop-drilling.
  const { data: lowRotationRaw } = useQuery<LowBossRotationResponse>(
    `boss_low_rotation:${guildId}`,
    async () => {
      const res = await dashboardApi.getLowBossRotation(guildId);
      return res.success && res.data ? res.data : EMPTY_LOW_ROTATION;
    },
    { persist: true, staleTime: 15000, enabled: !!guildId },
  );

  useEffect(() => {
    if (!socket || !guildId) return;
    const refresh = () => queryClient.invalidateQueries(`guild_activities:${guildId}`);
    const refreshRules = () => queryClient.invalidateQueries(`activity_rules:${guildId}`);
    socket.on("guild_activity_updated", refresh);
    socket.on("activity_point_rules_updated", refreshRules);
    return () => {
      socket.off("guild_activity_updated", refresh);
      socket.off("activity_point_rules_updated", refreshRules);
    };
  }, [socket, guildId]);

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

  const upcoming = useMemo(
    () => [...filtered].sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()),
    [filtered],
  );

  function openCreate(defaultDate?: string) {
    setEditing(null);
    setModalDefaultDate(defaultDate);
    setModalOpen(true);
  }

  const chipsByDate = useMemo(
    () =>
      buildWeeklyChips({
        activities: filtered,
        typeMeta,
        onActivityClick: (a) => {
          setEditing(a);
          setModalDefaultDate(undefined);
          setModalOpen(true);
        },
      }),
    [filtered, typeMeta],
  );

  const guildOfDay = useMemo(() => buildGuildOfDayResolver(lowRotationRaw), [lowRotationRaw]);

  function refresh() {
    queryClient.invalidateQueries(`guild_activities:${guildId}`);
  }

  async function submit(payload: ActivityInput) {
    setSaving(true);
    try {
      const res = editing
        ? await activityApi.update(guildId, editing.id, payload)
        : await activityApi.create(guildId, payload);
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
    addToast("warning", `Delete "${activity.title}"? This can't be undone.`, 0, {
      label: "Delete",
      variant: "danger",
      onClick: async () => {
        try {
          const res = await activityApi.remove(guildId, activity.id);
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
    setBusyId(activity.id);
    try {
      const attending = activity.myStatus === "NONE";
      const res = await activityApi.checkIn(guildId, activity.id, attending);
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
    try {
      const res = await activityApi.confirmAttendee(guildId, activity.id, userId, confirmed);
      if (res.success) refresh();
      else addToast("error", res.error?.message || "Failed");
    } catch {
      addToast("error", "Failed to update attendee");
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-96 rounded-2xl" />
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-48 rounded-2xl" />)}
        </div>
      </div>
    );
  }

  const activeFilterLabel = typeFilter === "ALL" ? "All" : registeredActivities.find((r) => r.key === typeFilter)?.label ?? typeFilter;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="relative">
          <button
            onClick={() => setFilterOpen((o) => !o)}
            className="inline-flex items-center gap-2 px-3.5 h-[42px] rounded-xl bg-[var(--obsidian-elevated)]/40 backdrop-blur-md border border-[var(--metal-border)] text-[13px] font-semibold text-white/75 hover:text-white hover:border-white/20 transition-all cursor-pointer"
          >
            <svg className="h-4 w-4 text-white/40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" /></svg>
            Filter
            <span className="text-[12px] font-semibold text-[var(--forge-gold-bright)]">{activeFilterLabel}</span>
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

        <div className="flex items-center gap-2 w-full lg:w-auto">
          <label className="relative block flex-1 lg:w-64">
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
          {canManage && (
            <Magnetic strength={4}>
              <Button variant="primary" size="sm" onClick={() => openCreate()}>
                <span className="inline-flex items-center gap-1.5">
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  New Activity
                </span>
              </Button>
            </Magnetic>
          )}
        </div>
      </div>

      <WeeklyCalendar
        chipsByDate={chipsByDate}
        guildOfDay={guildOfDay}
        onDayAdd={canManage ? (dateKey) => openCreate(dateKey) : undefined}
        addLabel="New activity"
      />

      <div>
        <h2 className="text-sm font-bold text-white/80 mb-3">
          All activities{typeFilter !== "ALL" ? ` · ${activeFilterLabel}` : ""}
        </h2>
        {upcoming.length === 0 ? (
          <EmptyState title="No activities" body={canManage ? "Schedule one with the button above." : "Nothing scheduled yet."} />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {upcoming.map((a) => (
              <ActivityCard
                key={a.id} activity={a} canManage={canManage} busy={busyId === a.id}
                typeMeta={typeMeta}
                expanded={expandedId === a.id} onToggleExpand={() => setExpandedId((id) => (id === a.id ? null : a.id))}
                onCheckIn={() => toggleCheckIn(a)} onEdit={() => { setEditing(a); setModalDefaultDate(undefined); setModalOpen(true); }}
                onDelete={() => remove(a)} onConfirmAttendee={confirmAttendee}
              />
            ))}
          </div>
        )}
      </div>

      <ActivityModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditing(null); setModalDefaultDate(undefined); }}
        editing={editing}
        saving={saving}
        onSubmit={submit}
        activityTypes={registeredActivities.map((r) => ({ key: r.key, label: r.label }))}
        defaultType={typeFilter === "ALL" ? undefined : typeFilter}
        defaultDate={modalDefaultDate ?? toDateKey(new Date())}
      />
    </div>
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
