"use client";

import { useEffect, useRef, useState } from "react";
import { type AttendanceSessionData, type AttendanceSessionSummary, type BossScheduleData } from "@/lib/api";
import { Skeleton } from "@/components/ui/Skeleton";
import { getBossImageUrl } from "@guild/shared";

const SCHEDULE_DATE_TIME_ZONE = "Asia/Singapore";
const scheduleDateParts = new Intl.DateTimeFormat("en-US", {
  timeZone: SCHEDULE_DATE_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export interface AttendanceCoverflowProps {
  sessions: AttendanceSessionSummary[];
  schedules?: BossScheduleData[];
  isLoading: boolean;
  myGuildId?: string;
  userId?: string;
  checkingInId?: string | null;
  onCheckIn?: (schedule: BossScheduleData) => void;
  onSelect: (session: AttendanceSessionSummary) => void;
}

function sessionStatus(session: AttendanceSessionSummary, now: number) {
  const expired = new Date(session.expiresAt).getTime() <= now;
  if (session.isActive && !expired) {
    return { label: "Open", color: "text-violet-300 bg-violet-500/10 border-violet-500/25", pulse: true };
  }
  if (session.confirmedCount > 0) {
    return { label: "Completed", color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/25", pulse: false };
  }
  return { label: "Closed", color: "text-white/50 bg-white/[0.04] border-white/[0.1]", pulse: false };
}

function formatRemaining(expiresAt: string, now: number) {
  const diff = new Date(expiresAt).getTime() - now;
  if (diff <= 0) return "Closed";
  const hours = Math.floor(diff / (60 * 60 * 1000));
  const minutes = Math.floor((diff % (60 * 60 * 1000)) / (60 * 1000));
  const seconds = Math.floor((diff % (60 * 1000)) / 1000);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function activeScheduleSession(schedule: BossScheduleData, now: number) {
  return schedule.attendanceSessions?.find(
    (session) => session.isActive && new Date(session.expiresAt).getTime() > now,
  ) ?? null;
}

function userScheduleRecord(schedule: BossScheduleData, userId?: string) {
  if (!userId) return null;
  return schedule.attendanceSessions
    ?.flatMap((session) => session.records ?? [])
    .find((record) => record.userId === userId) ?? null;
}

function scheduleRecordCounts(session?: AttendanceSessionData | null) {
  const records = session?.records ?? [];
  return {
    confirmedCount: records.filter((record) => record.status === "CONFIRMED").length,
    pendingCount: records.filter((record) => record.status === "PENDING").length,
  };
}

function scheduleSessionSummary(
  schedule: BossScheduleData,
  session: AttendanceSessionData,
  now: number,
): AttendanceSessionSummary {
  const counts = scheduleRecordCounts(session);
  return {
    id: session.id,
    title: session.title,
    type: session.type,
    isActive: session.isActive && new Date(session.expiresAt).getTime() > now,
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
    ...counts,
  };
}

function scheduleDayLabel(spawnTime: string) {
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const key = (value: Date) => {
    const parts = scheduleDateParts.formatToParts(value);
    const year = parts.find((part) => part.type === "year")?.value ?? "0000";
    const month = parts.find((part) => part.type === "month")?.value ?? "00";
    const day = parts.find((part) => part.type === "day")?.value ?? "00";
    return `${year}-${month}-${day}`;
  };
  const spawn = new Date(spawnTime);
  if (key(spawn) === key(today)) return "Today";
  if (key(spawn) === key(tomorrow)) return "Tomorrow";
  return spawn.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: SCHEDULE_DATE_TIME_ZONE });
}

function scheduleStatus(schedule: BossScheduleData, userId: string | undefined, now: number) {
  const record = userScheduleRecord(schedule, userId);
  if (record?.status === "CONFIRMED") {
    return { label: "Confirmed", color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/25", pulse: false };
  }
  if (record?.status === "PENDING") {
    return { label: "Pending", color: "text-amber-400 bg-amber-500/10 border-amber-500/25", pulse: false };
  }
  if (activeScheduleSession(schedule, now)) {
    return { label: "Open", color: "text-violet-300 bg-violet-500/10 border-violet-500/25", pulse: true };
  }
  if (schedule.status === "SPAWNED") {
    return { label: "Spawned", color: "text-amber-300 bg-amber-500/10 border-amber-500/25", pulse: true };
  }
  return { label: scheduleDayLabel(schedule.spawnTime), color: "text-cyan-300 bg-cyan-500/10 border-cyan-500/20", pulse: false };
}

/**
 * Netflix-row / coverflow-style browse of every boss attendance window, open
 * or closed — cards peek past the edge of the container and scroll/snap
 * horizontally. Tapping a card opens AttendanceSessionModal for the full
 * picture (your status, and for officers: roster + verification + reopen).
 */
export default function AttendanceCoverflow({
  sessions,
  schedules = [],
  isLoading,
  myGuildId,
  userId,
  checkingInId,
  onCheckIn,
  onSelect,
}: AttendanceCoverflowProps) {
  const trackRef = useRef<HTMLDivElement>(null);

  // Ticks on its own — this used to come from the page's shared per-second
  // ticker, which meant the entire attendance page (stats cards, header,
  // etc.) re-rendered every second just so this row's session badges could
  // flip from "Open" to "Closed" the moment a window expires.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const visibleSessions = sessions.filter(
    (session) => session.isActive && new Date(session.expiresAt).getTime() > now,
  );
  const visibleSessionScheduleIds = new Set(
    visibleSessions
      .map((session) => session.bossScheduleId)
      .filter((id): id is string => Boolean(id)),
  );
  const visibleSchedules = schedules
    .filter((schedule) => {
      if (visibleSessionScheduleIds.has(schedule.id)) return false;
      return schedule.status !== "KILLED" || Boolean(activeScheduleSession(schedule, now));
    })
    .sort((a, b) => new Date(a.spawnTime).getTime() - new Date(b.spawnTime).getTime());
  const visibleCount = visibleSessions.length + visibleSchedules.length;

  function scrollBy(delta: number) {
    trackRef.current?.scrollBy({ left: delta });
  }

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.01] p-5">
      <div className="flex items-center justify-between border-b border-white/[0.06] pb-3.5 mb-4">
        <div>
          <h3 className="text-xs font-bold text-white uppercase tracking-wider">Boss Attendance</h3>
          <p className="text-xs text-white/40 mt-0.5">
            Today and tomorrow boss windows - view upcoming spawns, check in early, or review open attendance.
          </p>
        </div>
        <span className="text-[10px] font-mono font-bold bg-white/[0.04] border border-white/[0.06] px-2 py-0.5 rounded text-white/55 shrink-0">
          {visibleCount}
        </span>
      </div>

      {isLoading ? (
        <div className="flex gap-3">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-[188px] w-[160px] rounded-2xl shrink-0" />)}
        </div>
      ) : visibleCount === 0 ? (
        <div className="text-center py-12 text-xs text-zinc-650 italic">
          No boss spawns or open attendance windows for today or tomorrow.
        </div>
      ) : (
        <div className="relative">
          <button
            type="button"
            onClick={() => scrollBy(-340)}
            aria-label="Scroll left"
            className="hidden sm:flex absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 z-20 h-9 w-9 rounded-full border border-white/[0.1] bg-black/60 backdrop-blur text-white/60 hover:text-white hover:border-white/25 items-center justify-center cursor-pointer transition-colors"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M15 18l-6-6 6-6" /></svg>
          </button>

          <div
            ref={trackRef}
            className="flex gap-3 overflow-x-auto pb-2 pt-1 px-1 snap-x snap-mandatory custom-scrollbar"
          >
            {visibleSessions.map((session) => {
              const boss = session.bossSchedule;
              const bossName = boss?.bossName || session.title;
              const imageSrc = boss?.bossImageUrl || getBossImageUrl(bossName);
              const dateSrc = boss?.spawnTime || session.createdAt;
              const status = sessionStatus(session, now);
              const remaining = formatRemaining(session.expiresAt, now);

              return (
                <button
                  type="button"
                  key={session.id}
                  onClick={() => onSelect(session)}
                  className="group relative shrink-0 w-[160px] snap-center rounded-2xl border border-white/[0.08] bg-[#0c0d12] overflow-hidden text-left cursor-pointer shadow-lg shadow-black/40 hover:border-[var(--forge-gold)]/40 focus-ring"
                >
                  <div className="relative h-[100px] w-full bg-zinc-950 border-b border-white/[0.06]">
                    <img src={imageSrc} alt={bossName} className="h-full w-full object-cover" loading="lazy" />
                    <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-black/80 to-transparent" />
                    <p className="absolute bottom-1.5 left-2 right-2 text-[12px] font-bold text-white truncate">{bossName}</p>
                    {status.pulse && (
                      <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-violet-400 shadow-[0_0_8px_rgba(167,139,250,0.9)]" />
                    )}
                  </div>

                  <div className="p-2.5 space-y-1.5">
                    <p className="text-[10px] text-white/60 font-semibold">
                      {new Date(dateSrc).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </p>
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md border text-[9px] font-bold uppercase tracking-wider ${status.color}`}>
                      {status.label}
                    </span>
                    <span className="inline-flex items-center rounded-md border border-[var(--forge-gold)]/20 bg-[var(--forge-gold)]/[0.08] px-1.5 py-0.5 font-mono text-[9px] font-bold text-[var(--forge-gold)]">
                      {remaining}
                    </span>
                    <div className="flex items-center gap-2 text-[10px] font-mono pt-0.5">
                      <span className="text-emerald-400">{session.confirmedCount}✓</span>
                      {session.pendingCount > 0 && <span className="text-amber-400">{session.pendingCount}⏳</span>}
                    </div>
                    {boss?.location && <p className="text-[9px] text-white/35 truncate">📍 {boss.location}</p>}
                  </div>
                </button>
              );
            })}

            {visibleSchedules.map((schedule) => {
              const imageSrc = schedule.bossImageUrl || getBossImageUrl(schedule.bossName);
              const status = scheduleStatus(schedule, userId, now);
              const session = activeScheduleSession(schedule, now);
              const sessionForModal = session ?? schedule.attendanceSessions?.[0] ?? null;
              const record = userScheduleRecord(schedule, userId);
              const remaining = session ? formatRemaining(session.expiresAt, now) : null;
              const canCheckIn =
                Boolean(onCheckIn) &&
                Boolean(myGuildId) &&
                schedule.guildTurnGuildId === myGuildId &&
                schedule.status !== "KILLED" &&
                !record;
              const openSession = () => {
                if (!sessionForModal) return;
                onSelect(scheduleSessionSummary(schedule, sessionForModal, now));
              };

              return (
                <div
                  key={`schedule-${schedule.id}`}
                  role={sessionForModal ? "button" : undefined}
                  tabIndex={sessionForModal ? 0 : undefined}
                  onClick={openSession}
                  onKeyDown={(event) => {
                    if (!sessionForModal) return;
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openSession();
                    }
                  }}
                  className={`group relative shrink-0 w-[160px] snap-center rounded-2xl border border-white/[0.08] bg-[#0c0d12] overflow-hidden text-left shadow-lg shadow-black/40 hover:border-cyan-300/35 ${
                    sessionForModal ? "cursor-pointer focus-ring" : ""
                  }`}
                >
                  <div className="relative h-[100px] w-full bg-zinc-950 border-b border-white/[0.06]">
                    <img src={imageSrc} alt={schedule.bossName} className="h-full w-full object-cover" loading="lazy" />
                    <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-black/80 to-transparent" />
                    <p className="absolute bottom-1.5 left-2 right-2 text-[12px] font-bold text-white truncate">{schedule.bossName}</p>
                    {status.pulse && (
                      <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-violet-400 shadow-[0_0_8px_rgba(167,139,250,0.9)]" />
                    )}
                  </div>

                  <div className="p-2.5 space-y-1.5">
                    <p className="text-[10px] text-white/60 font-semibold">
                      {scheduleDayLabel(schedule.spawnTime)} / {new Date(schedule.spawnTime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                    </p>
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md border text-[9px] font-bold uppercase tracking-wider ${status.color}`}>
                      {status.label}
                    </span>
                    {remaining && (
                      <span className="inline-flex items-center rounded-md border border-[var(--forge-gold)]/20 bg-[var(--forge-gold)]/[0.08] px-1.5 py-0.5 font-mono text-[9px] font-bold text-[var(--forge-gold)]">
                        {remaining}
                      </span>
                    )}
                    {schedule.guildTurnGuildName && (
                      <p className="text-[9px] text-white/35 truncate">Turn: {schedule.guildTurnGuildName}</p>
                    )}
                    <p className="text-[9px] text-white/35 truncate">Location: {schedule.location}</p>
                    {record ? (
                      <p className="pt-1 text-[9px] font-bold uppercase tracking-wider text-white/45">
                        {record.status === "CONFIRMED" ? "Attendance verified" : "Awaiting officer"}
                      </p>
                    ) : canCheckIn ? (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onCheckIn?.(schedule);
                        }}
                        disabled={checkingInId === schedule.id}
                        className="mt-1 w-full rounded-md bg-violet-600 px-2 py-1.5 text-[10px] font-bold text-white hover:bg-violet-700 disabled:opacity-50 cursor-pointer"
                      >
                        {checkingInId === schedule.id ? "Checking..." : "Check In Early"}
                      </button>
                    ) : (
                      <p className="pt-1 text-[9px] text-white/30">Viewable schedule</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => scrollBy(340)}
            aria-label="Scroll right"
            className="hidden sm:flex absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 z-20 h-9 w-9 rounded-full border border-white/[0.1] bg-black/60 backdrop-blur text-white/60 hover:text-white hover:border-white/25 items-center justify-center cursor-pointer transition-colors"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M9 18l6-6-6-6" /></svg>
          </button>
        </div>
      )}
    </div>
  );
}
