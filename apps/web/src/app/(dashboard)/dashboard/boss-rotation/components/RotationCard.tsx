import { memo, useEffect, useState } from "react";
import type { BossRotationItem, BossCommitmentData } from "@/lib/api";
import { getBossImageUrl } from "@guild/shared";
import { getGuildColor } from "../utils/helpers";
import { getCountdown } from "../utils/viewEntry";
import BossCommitButton from "./BossCommitButton";
import BossAvatar from "./BossAvatar";

const RotationCard = memo(function RotationCard({
  rotation,
  canManage,
  onKilled,
  guildId,
  index = 0,
  commitmentsBatch,
}: {
  rotation: BossRotationItem;
  canManage: boolean;
  onKilled: (rotation: BossRotationItem) => void;
  guildId: string;
  index?: number;
  commitmentsBatch?: Record<string, BossCommitmentData> | null;
}) {
  // Ticks on its own, independent of the page — so opening a modal, typing in
  // a filter, or any other unrelated state change up in BossRotationPage
  // doesn't force every visible boss card (and everything nested inside it,
  // like BossCommitButton) to re-render along with it.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // A cycle boss with no spawnTime has never been taken — there's no real
  // countdown to show yet; the "Taken" action below logs its first kill.
  const tick = rotation.spawnTime
    ? getCountdown(rotation.spawnTime, now)
    : { text: "Not Taken Yet", warning: false, expired: false };
  const currentColor = getGuildColor(rotation.currentGuild?.name || "");
  const nextColor = getGuildColor(rotation.nextGuild?.name || "");
  const canKill = canManage;
  const spawnLabel = rotation.spawnTime
    ? new Date(rotation.spawnTime).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
    : "—";

  // `rotation.queue` is stored in a fixed roster order (e.g. alphabetical),
  // not rotation order — numbering it as-is could show the current holder
  // sitting at "2." with someone else at "1.", which reads as if that guild
  // goes first. Rotate the list so the current holder is always "1." and the
  // rest follow in actual hand-off order.
  const currentQueueIndex = rotation.currentGuild
    ? rotation.queue.findIndex((guild) => guild.id === rotation.currentGuild!.id)
    : -1;
  const displayQueue =
    currentQueueIndex > 0
      ? [...rotation.queue.slice(currentQueueIndex), ...rotation.queue.slice(0, currentQueueIndex)]
      : rotation.queue;

  // With only one guild queued, "Current Holder" / "Up Next" / "Queue" would
  // all repeat the same name — collapse to a single queue block instead of
  // three redundant readouts of the same guild.
  const showHandoff = displayQueue.length > 1;

  return (
    <article
      className={`group relative rounded-2xl border bg-[var(--obsidian-elevated)]/40 flex flex-col transition-colors duration-300 animate-[fadeInUp_0.5s_ease-out_forwards] ${
        tick.expired
          ? "border-emerald-500/25 hover:border-emerald-500/45"
          : tick.warning
            ? "border-[var(--forge-gold)]/20 hover:border-[var(--forge-gold)]/40"
            : "border-[var(--metal-border)] hover:border-white/15"
      }`}
      style={{ animationDelay: `${index * 40}ms` }}
    >
      <div className="p-4 flex flex-col gap-3 flex-1">
        {/* Boss info */}
        <div className="flex items-start gap-3">
          <div className="relative h-11 w-11 shrink-0 rounded-xl overflow-hidden ring-1 ring-white/10">
            <BossAvatar src={rotation.bossImageUrl || getBossImageUrl(rotation.bossName)} name={rotation.bossName} />
          </div>
          <div className="min-w-0 flex-1 pt-0.5">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-white truncate">{rotation.bossName}</h3>
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-white/[0.06] text-white/55 shrink-0">
                Lvl {rotation.level}
              </span>
              {rotation.isLowBoss ? (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/25 text-cyan-300 shrink-0">
                  Low Boss
                </span>
              ) : (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-rose-500/10 border border-rose-500/25 text-rose-300 shrink-0">
                  High Boss
                </span>
              )}
            </div>
            <div className="flex items-center gap-1 text-white/40 mt-1">
              <svg className="h-3 w-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2a8 8 0 00-8 8c0 5.25 8 12 8 12s8-6.75 8-12a8 8 0 00-8-8z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              <span className="text-[11px] truncate">{rotation.location}</span>
            </div>
          </div>
          <span
            className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${
              tick.expired ? "bg-emerald-400 animate-pulse" : tick.warning ? "bg-[var(--forge-gold)]" : "bg-white/15"
            }`}
            aria-hidden="true"
          />
        </div>

        {/* Timer — one flat block, one state color, no nested bezels */}
        <div
          className={`rounded-xl px-3 py-2.5 ${
            tick.expired ? "bg-emerald-500/[0.07]" : tick.warning ? "bg-[var(--forge-gold)]/[0.07]" : "bg-white/[0.025]"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[9px] uppercase tracking-[0.16em] font-bold text-white/30">
              {tick.expired ? "Live now" : tick.warning ? "Spawning soon" : "Next spawn"}
            </span>
            <span className="text-[9px] text-white/30 font-mono">{spawnLabel}</span>
          </div>
          <p
            className={`mt-1 font-mono text-lg font-bold leading-none tracking-wide ${
              tick.expired ? "text-emerald-400" : tick.warning ? "text-[var(--forge-gold-bright)]" : "text-white/85"
            }`}
          >
            {tick.text}
          </p>
        </div>

        {/* Handoff — only shown when there's an actual handoff to show */}
        {showHandoff && (
          <div className="flex items-center gap-2 text-[11px]">
            <span className={`font-semibold truncate ${currentColor.text}`}>{rotation.currentGuild?.name || "Unassigned"}</span>
            <svg className="h-3 w-3 text-white/20 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
            <span className={`font-semibold truncate ${nextColor.text}`}>{rotation.nextGuild?.name || "Unassigned"}</span>
          </div>
        )}

        {/* Queue */}
        <div className="rounded-xl bg-white/[0.02] px-3 py-2.5 flex-1">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[9px] uppercase tracking-[0.16em] font-bold text-white/30">
              {showHandoff ? "Queue" : "Holder"}
            </span>
            {showHandoff && <span className="text-[9px] text-white/30 font-mono">{displayQueue.length} guilds</span>}
          </div>
          {displayQueue.length === 0 ? (
            <p className="text-[10px] text-white/25 italic">No guilds queued</p>
          ) : (
            <div className="flex flex-wrap items-center gap-1.5">
              {displayQueue.map((guild, i) => {
                // Always the guild's own identity color, current holder or
                // not — a guild badge used to flip to a hardcoded gold when
                // it happened to be "current", so the same guild rendered in
                // two different colors depending on the card. "Current" is
                // now a gold ring layered on top of the guild's real color
                // instead of replacing it.
                const color = getGuildColor(guild.name);
                const isCurrent = rotation.currentGuild?.id === guild.id;
                return (
                  <span
                    key={guild.id}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[10px] font-semibold ${color.border} ${color.bg} ${color.text} ${
                      isCurrent ? "ring-1 ring-[var(--forge-gold)]/60" : ""
                    }`}
                  >
                    <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: color.dot }} />
                    {showHandoff && <span className="font-mono text-[9px] opacity-60">{i + 1}</span>}
                    <span className="truncate max-w-[100px]">{guild.name}</span>
                    {isCurrent && (
                      <span className="text-[8px] font-bold uppercase tracking-wider text-[var(--forge-gold-bright)]">
                        ★
                      </span>
                    )}
                  </span>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer — status left; commit headcount + Taken action grouped on the right */}
        <div className="flex items-center justify-between gap-3 border-t border-white/[0.05] pt-3 mt-auto">
          <div className="flex items-center gap-1.5 text-[10px] text-white/40 min-w-0">
            <span
              className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                rotation.activeSchedule || rotation.type === "FIXED_SCHEDULE" ? "bg-emerald-400" : "bg-amber-400"
              }`}
            />
            <span className="truncate">
              {rotation.activeSchedule ? "Active" : rotation.type === "FIXED_SCHEDULE" ? "Fixed schedule" : "Import needed"}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {rotation.activeSchedule && (
              <BossCommitButton
                variant="inline"
                guildId={guildId}
                scheduleId={rotation.activeSchedule.id}
                bossName={rotation.bossName}
                initialData={commitmentsBatch?.[rotation.activeSchedule.id]}
              />
            )}
            {canManage && (
              <button
                type="button"
                onClick={() => onKilled(rotation)}
                disabled={!canKill}
                aria-label={`Mark ${rotation.bossName} taken`}
                title={rotation.activeSchedule ? "Taken" : "Import killed time"}
                className="h-8 px-4 inline-flex items-center gap-1.5 rounded-full border border-emerald-500/35 bg-emerald-500/10 text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-400 hover:bg-emerald-500/20 hover:text-white transition-colors disabled:opacity-35 disabled:cursor-not-allowed cursor-pointer focus-ring"
              >
                <svg className="h-3 w-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
                  <path d="M22 4L12 14.01l-3-3" />
                </svg>
                Taken
              </button>
            )}
          </div>
        </div>
      </div>
    </article>
  );
});

export default RotationCard;
