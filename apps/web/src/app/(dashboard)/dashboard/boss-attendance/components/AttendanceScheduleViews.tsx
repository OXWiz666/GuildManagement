"use client";

import { useEffect, useMemo, useState } from "react";
import { getBossImageUrl } from "@guild/shared";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  type AttendanceSessionData,
  type AttendanceSessionSummary,
  type BossScheduleData,
} from "@/lib/api";

type AttendanceBossEvent = {
  id: string;
  bossName: string;
  imageUrl: string;
  location: string;
  spawnTime: string;
  status: BossScheduleData["status"] | "SESSION";
  guildTurn: string | null;
  guildTurnGuildId: string | null;
  session: AttendanceSessionSummary | null;
  schedule: BossScheduleData | null;
  confirmedCount: number;
  pendingCount: number;
};

export interface AttendanceScheduleViewProps {
  schedules: BossScheduleData[];
  sessions: AttendanceSessionSummary[];
  isLoading: boolean;
  myGuildId: string;
  checkingInId: string | null;
  onCheckIn: (item: BossScheduleData) => void;
  onSelectSession: (session: AttendanceSessionSummary) => void;
}

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function startOfWeek(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function countRecords(session?: AttendanceSessionData) {
  const records = session?.records ?? [];
  return {
    confirmed: records.filter((record) => record.status === "CONFIRMED").length,
    pending: records.filter((record) => record.status === "PENDING").length,
  };
}

function summaryFromScheduleSession(
  schedule: BossScheduleData,
  session: AttendanceSessionData,
): AttendanceSessionSummary {
  const counts = countRecords(session);
  return {
    id: session.id,
    title: session.title,
    type: session.type,
    isActive: session.isActive && new Date(session.expiresAt).getTime() > Date.now(),
    expiresAt: session.expiresAt,
    createdAt: session.createdAt,
    bossScheduleId: schedule.id,
    bossSchedule: {
      bossName: schedule.bossName,
      bossImageUrl: schedule.bossImageUrl || getBossImageUrl(schedule.bossName),
      location: schedule.location,
      spawnTime: schedule.spawnTime,
      status: schedule.status,
      killedAt: schedule.killedAt,
    },
    confirmedCount: counts.confirmed,
    pendingCount: counts.pending,
  };
}

function scheduleViewSessionPriority(session: AttendanceSessionSummary) {
  return (
    session.confirmedCount * 100_000_000 +
    session.pendingCount * 1_000_000 +
    new Date(session.createdAt).getTime()
  );
}

function buildEvents(schedules: BossScheduleData[], sessions: AttendanceSessionSummary[]) {
  const sessionsBySchedule = new Map<string, AttendanceSessionSummary[]>();
  const usedSessionIds = new Set<string>();
  const standaloneKeys = new Set<string>();

  for (const session of sessions) {
    if (!session.bossScheduleId) continue;
    const bucket = sessionsBySchedule.get(session.bossScheduleId) ?? [];
    bucket.push(session);
    sessionsBySchedule.set(session.bossScheduleId, bucket);
  }

  const events: AttendanceBossEvent[] = schedules.map((schedule) => {
    const scheduleSessions = sessionsBySchedule.get(schedule.id) ?? [];
    const session = scheduleSessions.reduce<AttendanceSessionSummary | null>(
      (best, candidate) =>
        !best || scheduleViewSessionPriority(candidate) > scheduleViewSessionPriority(best)
          ? candidate
          : best,
      null,
    );
    for (const scheduleSession of scheduleSessions) usedSessionIds.add(scheduleSession.id);

    const fallbackSession = schedule.attendanceSessions?.[0];
    const fallbackCounts = countRecords(fallbackSession);

    return {
      id: schedule.id,
      bossName: schedule.bossName,
      imageUrl: schedule.bossImageUrl || getBossImageUrl(schedule.bossName),
      location: schedule.location,
      spawnTime: schedule.spawnTime,
      status: schedule.status,
      guildTurn: schedule.guildTurnGuildName || schedule.guildTurn || null,
      guildTurnGuildId: schedule.guildTurnGuildId ?? null,
      session: session ?? (fallbackSession ? summaryFromScheduleSession(schedule, fallbackSession) : null),
      schedule,
      confirmedCount: session?.confirmedCount ?? fallbackCounts.confirmed,
      pendingCount: session?.pendingCount ?? fallbackCounts.pending,
    };
  });

  for (const session of sessions) {
    if (usedSessionIds.has(session.id)) continue;
    const boss = session.bossSchedule;
    const bossName = boss?.bossName || session.title;
    const standaloneKey = `${bossName}:${boss?.spawnTime || session.createdAt}`;
    if (standaloneKeys.has(standaloneKey)) continue;
    standaloneKeys.add(standaloneKey);

    events.push({
      id: session.id,
      bossName,
      imageUrl: boss?.bossImageUrl || getBossImageUrl(bossName),
      location: boss?.location || "Guild attendance",
      spawnTime: boss?.spawnTime || session.createdAt,
      status: "SESSION",
      guildTurn: null,
      guildTurnGuildId: null,
      session,
      schedule: null,
      confirmedCount: session.confirmedCount,
      pendingCount: session.pendingCount,
    });
  }

  return events.sort((a, b) => new Date(a.spawnTime).getTime() - new Date(b.spawnTime).getTime());
}

function isCurrentOrFutureEvent(event: AttendanceBossEvent, now: number) {
  const spawnTime = new Date(event.spawnTime).getTime();
  const sessionOpen = event.session?.isActive && new Date(event.session.expiresAt).getTime() > now;
  return spawnTime >= now || event.status === "SPAWNED" || Boolean(sessionOpen);
}

function sortTimelineEvents(events: AttendanceBossEvent[], now: number) {
  return [...events].sort((a, b) => {
    const aUpcoming = isCurrentOrFutureEvent(a, now);
    const bUpcoming = isCurrentOrFutureEvent(b, now);
    const aTime = new Date(a.spawnTime).getTime();
    const bTime = new Date(b.spawnTime).getTime();

    if (aUpcoming !== bUpcoming) return aUpcoming ? -1 : 1;
    return aUpcoming ? aTime - bTime : bTime - aTime;
  });
}

function statusStyle(event: AttendanceBossEvent, now: number) {
  const sessionOpen =
    event.session?.isActive && new Date(event.session.expiresAt).getTime() > now;

  if (sessionOpen) {
    return {
      label: "Open",
      dot: "bg-violet-300",
      pill: "border-violet-400/25 bg-violet-500/10 text-violet-200",
    };
  }

  if (event.confirmedCount > 0) {
    return {
      label: "Verified",
      dot: "bg-emerald-300",
      pill: "border-emerald-400/25 bg-emerald-500/10 text-emerald-300",
    };
  }

  if (event.status === "KILLED") {
    return {
      label: "Killed",
      dot: "bg-rose-300",
      pill: "border-rose-400/20 bg-rose-500/10 text-rose-300",
    };
  }

  if (event.status === "SPAWNED") {
    return {
      label: "Spawned",
      dot: "bg-amber-300",
      pill: "border-amber-400/25 bg-amber-500/10 text-amber-300",
    };
  }

  return {
    label: event.status === "SESSION" ? "Session" : "Upcoming",
    dot: "bg-white/35",
    pill: "border-white/[0.08] bg-white/[0.035] text-white/55",
  };
}

function EventCard({
  event,
  compact = false,
  myGuildId,
  checkingInId,
  onCheckIn,
  onSelectSession,
  now,
}: {
  event: AttendanceBossEvent;
  compact?: boolean;
  myGuildId: string;
  checkingInId: string | null;
  onCheckIn: (item: BossScheduleData) => void;
  onSelectSession: (session: AttendanceSessionSummary) => void;
  now: number;
}) {
  const style = statusStyle(event, now);
  const canAdvanceCheckIn =
    event.schedule &&
    event.status !== "KILLED" &&
    event.guildTurnGuildId === myGuildId &&
    !event.session &&
    (!event.schedule.attendanceSessions || event.schedule.attendanceSessions.length === 0);

  const content = (
    <>
      <div className={`relative shrink-0 overflow-hidden rounded-lg border border-white/[0.06] bg-black/30 ${compact ? "h-16 w-full" : "h-16 w-24"}`}>
        <img src={event.imageUrl} alt={event.bossName} className="h-full w-full object-cover" loading="lazy" />
        <div className="absolute inset-x-0 bottom-0 h-7 bg-gradient-to-t from-black/80 to-transparent" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-[13px] font-bold text-white">{event.bossName}</p>
            <p className="mt-0.5 truncate text-[10px] text-white/40">{event.location}</p>
          </div>
          <span className={`inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${style.pill}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
            {style.label}
          </span>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px]">
          <span className="font-mono text-white/70">{formatTime(event.spawnTime)}</span>
          {event.guildTurn && <span className="truncate text-white/35">Turn: {event.guildTurn}</span>}
          {event.session && (
            <span className="font-mono text-white/45">
              <span className="text-emerald-300">{event.confirmedCount}</span> /{" "}
              <span className="text-amber-300">{event.pendingCount}</span>
            </span>
          )}
        </div>
      </div>
    </>
  );

  if (event.session) {
    return (
      <button
        type="button"
        onClick={() => onSelectSession(event.session!)}
        className={`group flex w-full min-w-0 rounded-xl border border-white/[0.06] bg-white/[0.025] p-2.5 text-left hover:border-[var(--forge-gold)]/35 hover:bg-[var(--forge-gold)]/[0.04] cursor-pointer focus-ring ${
          compact ? "flex-col items-stretch gap-2" : "items-center gap-3"
        }`}
      >
        {content}
      </button>
    );
  }

  return (
    <div
      className={`flex w-full min-w-0 rounded-xl border border-white/[0.05] bg-white/[0.015] p-2.5 ${
        compact ? "flex-col items-stretch gap-2" : "items-center gap-3"
      }`}
    >
      {content}
      {canAdvanceCheckIn && (
        <button
          type="button"
          onClick={() => onCheckIn(event.schedule!)}
          disabled={checkingInId === event.schedule!.id}
          className={`shrink-0 rounded-lg border border-violet-400/20 bg-violet-500/10 px-2.5 py-1.5 text-[10px] font-bold text-violet-200 transition-colors hover:bg-violet-500/20 disabled:opacity-50 cursor-pointer ${
            compact ? "w-full" : ""
          }`}
        >
          {checkingInId === event.schedule!.id ? "Checking..." : "Turn In"}
        </button>
      )}
    </div>
  );
}

export function AttendanceCalendarView({
  schedules,
  sessions,
  isLoading,
  myGuildId,
  checkingInId,
  onCheckIn,
  onSelectSession,
}: AttendanceScheduleViewProps) {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60 * 1000);
    return () => clearInterval(timer);
  }, []);

  const events = useMemo(() => buildEvents(schedules, sessions), [schedules, sessions]);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)), [weekStart]);
  const weekEnd = weekDays[6]!;
  const eventsByDay = useMemo(() => {
    const grouped = new Map<string, AttendanceBossEvent[]>();
    for (const day of weekDays) grouped.set(dateKey(day), []);
    for (const event of events) {
      const key = dateKey(new Date(event.spawnTime));
      const bucket = grouped.get(key);
      if (bucket) bucket.push(event);
    }
    return grouped;
  }, [events, weekDays]);

  return (
    <section className="rounded-2xl border border-white/[0.06] bg-[#08090d]/80 p-4 md:p-5">
      <div className="flex flex-col gap-4 border-b border-white/[0.06] pb-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-[var(--forge-gold)]">Weekly Calendar</p>
          <h3 className="mt-1 text-lg font-bold text-white">Boss attendance schedule</h3>
          <p className="mt-1 max-w-2xl text-[12px] leading-relaxed text-white/45">
            Review this week&apos;s boss spawns, open check-in windows, and completed attendance records in one pass.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setWeekStart(addDays(weekStart, -7))} className="h-8 w-8 rounded-lg border border-white/[0.08] bg-white/[0.03] text-white/65 hover:text-white hover:bg-white/[0.06] cursor-pointer">
            &lt;
          </button>
          <button type="button" onClick={() => setWeekStart(startOfWeek(new Date()))} className="h-8 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 text-[11px] font-bold text-white/70 hover:text-white hover:bg-white/[0.06] cursor-pointer">
            This Week
          </button>
          <button type="button" onClick={() => setWeekStart(addDays(weekStart, 7))} className="h-8 w-8 rounded-lg border border-white/[0.08] bg-white/[0.03] text-white/65 hover:text-white hover:bg-white/[0.06] cursor-pointer">
            &gt;
          </button>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-[12px] font-semibold text-white/70">
          {weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })} -{" "}
          {weekEnd.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
        </p>
        <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[10px] font-mono text-white/45">
          {weekDays.reduce((total, day) => total + (eventsByDay.get(dateKey(day))?.length ?? 0), 0)} bosses
        </span>
      </div>

      {isLoading ? (
        <div className="mt-4 grid gap-3 lg:grid-cols-7">
          {weekDays.map((day) => <Skeleton key={dateKey(day)} className="h-52 rounded-xl" />)}
        </div>
      ) : (
        <div className="mt-4 grid gap-3 lg:grid-cols-7">
          {weekDays.map((day) => {
            const key = dateKey(day);
            const dayEvents = eventsByDay.get(key) ?? [];
            const isToday = key === dateKey(new Date());

            return (
              <div
                key={key}
                className={`min-h-[220px] rounded-xl border p-3 ${
                  isToday
                    ? "border-[var(--forge-gold)]/35 bg-[var(--forge-gold)]/[0.045]"
                    : "border-white/[0.06] bg-white/[0.018]"
                }`}
              >
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-white/70">
                      {day.toLocaleDateString("en-US", { weekday: "short" })}
                    </p>
                    <p className="text-[10px] text-white/35">
                      {day.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </p>
                  </div>
                  <span className="font-mono text-[10px] text-white/35">{dayEvents.length}</span>
                </div>

                {dayEvents.length === 0 ? (
                  <div className="grid h-36 place-items-center rounded-lg border border-dashed border-white/[0.06] text-center text-[11px] italic text-white/25">
                    No bosses
                  </div>
                ) : (
                  <div className="space-y-2">
                    {dayEvents.map((event) => (
                      <EventCard
                        key={event.id}
                        event={event}
                        compact
                        myGuildId={myGuildId}
                        checkingInId={checkingInId}
                        onCheckIn={onCheckIn}
                        onSelectSession={onSelectSession}
                        now={now}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

export function AttendanceTimelineView({
  schedules,
  sessions,
  isLoading,
  myGuildId,
  checkingInId,
  onCheckIn,
  onSelectSession,
}: AttendanceScheduleViewProps) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60 * 1000);
    return () => clearInterval(timer);
  }, []);
  const events = useMemo(() => buildEvents(schedules, sessions), [schedules, sessions]);
  const timelineEvents = useMemo(() => sortTimelineEvents(events, now), [events, now]);

  const groups = useMemo(() => {
    const grouped = new Map<string, AttendanceBossEvent[]>();
    for (const event of timelineEvents) {
      const key = dateKey(new Date(event.spawnTime));
      const bucket = grouped.get(key);
      if (bucket) bucket.push(event);
      else grouped.set(key, [event]);
    }
    return Array.from(grouped.entries()).map(([key, items]) => ({ key, items }));
  }, [timelineEvents]);

  return (
    <section className="rounded-2xl border border-white/[0.06] bg-[#08090d]/80 p-4 md:p-5">
      <div className="flex flex-col gap-3 border-b border-white/[0.06] pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-cyan-300">Timeline</p>
          <h3 className="mt-1 text-lg font-bold text-white">Boss details by time</h3>
          <p className="mt-1 max-w-2xl text-[12px] leading-relaxed text-white/45">
            A chronological view of boss spawns, guild turns, attendance sessions, and verification counts.
          </p>
        </div>
        <span className="w-fit rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[10px] font-mono text-white/45">
          {events.length} entries
        </span>
      </div>

      {isLoading ? (
        <div className="mt-5 space-y-3">
          {[1, 2, 3, 4].map((item) => <Skeleton key={item} className="h-24 rounded-xl" />)}
        </div>
      ) : events.length === 0 ? (
        <p className="py-12 text-center text-[12px] italic text-white/35">
          No boss attendance data yet.
        </p>
      ) : (
        <div className="mt-5 max-h-[720px] overflow-y-auto pr-1 custom-scrollbar">
          <div className="space-y-7">
            {groups.map((group) => {
              const first = group.items[0]!;
              return (
                <section key={group.key} className="grid gap-4 md:grid-cols-[160px_minmax(0,1fr)]">
                  <div className="md:sticky md:top-0 md:self-start">
                    <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-white/55">
                      {formatDate(first.spawnTime)}
                    </p>
                    <p className="mt-1 font-mono text-[10px] text-cyan-300/65">
                      {group.items.length} boss{group.items.length === 1 ? "" : "es"}
                    </p>
                  </div>

                  <div className="relative space-y-3 border-l border-cyan-300/15 pl-5">
                    {group.items.map((event, index) => (
                      <div key={event.id} className="relative">
                        <span className={`absolute -left-[25px] top-6 h-2.5 w-2.5 rounded-full border border-cyan-100/35 bg-cyan-300 ${index === 0 ? "shadow-[0_0_16px_rgba(103,232,249,0.45)]" : ""}`} />
                        <EventCard
                          event={event}
                          myGuildId={myGuildId}
                          checkingInId={checkingInId}
                          onCheckIn={onCheckIn}
                          onSelectSession={onSelectSession}
                          now={now}
                        />
                      </div>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
