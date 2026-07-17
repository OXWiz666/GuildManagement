"use client";

import { useEffect, useState, memo } from "react";
import type { GuildActivityData } from "@/lib/api";
import { resolveActivityTypeMeta, type ActivityTypeMeta } from "@/lib/activityTypeMeta";

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

function ResultBadge({ result }: { result: "WIN" | "LOSS" | "DRAW" }) {
  const map = {
    WIN: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
    LOSS: "border-red-500/30 bg-red-500/10 text-red-300",
    DRAW: "border-white/15 bg-white/5 text-white/60",
  };
  return <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md border ${map[result]}`}>{result}</span>;
}

const ActivityCard = memo(function ActivityCard({
  activity, canManage, busy, typeMeta, expanded, onToggleExpand, onCheckIn, onEdit, onDelete, onConfirmAttendee,
}: {
  activity: GuildActivityData;
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
  // Ticks on its own so unrelated state changes on the page (filters,
  // opening the add/edit modal, expanding a different card) don't force
  // every visible activity card to re-render every second along with it.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

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
});

export default ActivityCard;
