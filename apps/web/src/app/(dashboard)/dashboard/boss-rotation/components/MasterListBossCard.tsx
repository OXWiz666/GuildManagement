"use client";

import { memo, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { BossMasterListEntry, FactionGuildData } from "@/lib/api";
import { getBossImageUrl } from "@guild/shared";
import { getGuildColor } from "../utils/helpers";

/**
 * One boss's participant/turn-order editor. Memoized so dragging or toggling
 * one boss's queue doesn't re-render every other boss card in the list —
 * `selected` only changes reference for the boss actually being edited (see
 * MasterListTab's setDraft, which spreads a single key), so this component's
 * shallow prop comparison skips the other ~40 cards on every interaction.
 */
function MasterListBossCard({
  boss,
  guilds,
  selected,
  canManage,
  onToggle,
  onSwap,
  onSetAll,
  onOpenSchedule,
}: {
  boss: BossMasterListEntry;
  guilds: FactionGuildData[];
  selected: string[];
  canManage: boolean;
  onToggle: (bossName: string, guildId: string) => void;
  onSwap: (bossName: string, guildIdA: string, guildIdB: string) => void;
  onSetAll: (bossName: string, all: boolean) => void;
  onOpenSchedule: () => void;
}) {
  if (boss.isLowBoss) {
    return (
      <div className="rounded-xl border border-[var(--metal-border)] bg-[var(--obsidian-elevated)]/40 p-3.5">
        <div className="flex items-start gap-3 mb-3">
          <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-white/[0.08] bg-zinc-950">
            <img src={getBossImageUrl(boss.bossName)} alt={boss.bossName} className="h-full w-full object-cover" loading="lazy" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-white truncate">{boss.bossName}</h3>
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-[var(--forge-glow)] border border-[var(--forge-gold)]/25 text-[var(--forge-gold-bright)] shrink-0">
                Lvl {boss.level}
              </span>
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/25 text-cyan-300 shrink-0">
                Low Boss
              </span>
            </div>
            <p className="text-[11px] text-white/40 mt-0.5 truncate">{boss.location}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onOpenSchedule}
          className="w-full rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-left text-[11px] leading-relaxed text-white/50 hover:border-cyan-500/25 hover:text-white/75 cursor-pointer transition-all"
        >
          Follows the day-based Faction Schedule, not a per-boss queue — open the <span className="text-cyan-300 font-semibold">Schedule</span> tab to see or edit who takes it each day.
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[var(--metal-border)] bg-[var(--obsidian-elevated)]/40 p-3.5">
      <div className="flex items-start gap-3 mb-3">
        <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-white/[0.08] bg-zinc-950">
          <img src={getBossImageUrl(boss.bossName)} alt={boss.bossName} className="h-full w-full object-cover" loading="lazy" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-white truncate">{boss.bossName}</h3>
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-[var(--forge-glow)] border border-[var(--forge-gold)]/25 text-[var(--forge-gold-bright)] shrink-0">
              Lvl {boss.level}
            </span>
          </div>
          <p className="text-[11px] text-white/40 mt-0.5 truncate">{boss.location}</p>
        </div>
        <div className="text-right shrink-0">
          <span className="text-[11px] font-mono text-white/50">{selected.length}/{guilds.length}</span>
          {canManage && (
            <div className="mt-1 flex items-center gap-1 justify-end">
              <button onClick={() => onSetAll(boss.bossName, true)} className="text-[9px] uppercase tracking-wide text-emerald-400/70 hover:text-emerald-300 cursor-pointer">All</button>
              <span className="text-white/15">·</span>
              <button onClick={() => onSetAll(boss.bossName, false)} className="text-[9px] uppercase tracking-wide text-white/40 hover:text-white/70 cursor-pointer">None</button>
            </div>
          )}
        </div>
      </div>

      <QueueChips bossName={boss.bossName} guilds={guilds} selected={selected} canManage={canManage} onToggle={onToggle} onSwap={onSwap} />
    </div>
  );
}

/**
 * Participating guilds render first, in actual turn order, followed by
 * non-participating guilds in roster order (click to add them to the end of
 * the queue). Dragging one participating chip onto another swaps their turn
 * positions — since render order IS turn order here, the swap physically
 * exchanges the two chips (color, name, position) instead of just relabeling
 * a number badge. Chips that shift as a result animate into their new slot
 * via FLIP (capture old position, let the DOM update, animate old → new)
 * rather than snapping.
 */
function QueueChips({
  bossName,
  guilds,
  selected,
  canManage,
  onToggle,
  onSwap,
}: {
  bossName: string;
  guilds: FactionGuildData[];
  selected: string[];
  canManage: boolean;
  onToggle: (bossName: string, guildId: string) => void;
  onSwap: (bossName: string, guildIdA: string, guildIdB: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const prevRects = useRef<Map<string, DOMRect>>(new Map());
  // Ref, not state: a real drag fires dragstart then dragenter close enough
  // together that React's setState from dragstart isn't guaranteed to have
  // committed by the time dragenter reads it — the ref is always current.
  const draggingIdRef = useRef<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const orderedIds = useMemo(() => {
    const selectedSet = new Set(selected);
    const rest = guilds.filter((g) => !selectedSet.has(g.id)).map((g) => g.id);
    return [...selected, ...rest];
  }, [selected, guilds]);
  const guildsById = useMemo(() => new Map(guilds.map((g) => [g.id, g])), [guilds]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const chips = Array.from(container.querySelectorAll<HTMLElement>("[data-guild-id]"));
    const nextRects = new Map<string, DOMRect>();
    for (const chip of chips) {
      const id = chip.dataset.guildId!;
      const rect = chip.getBoundingClientRect();
      nextRects.set(id, rect);
      const prev = prevRects.current.get(id);
      if (prev) {
        const dx = prev.left - rect.left;
        const dy = prev.top - rect.top;
        if (dx || dy) {
          chip.style.transition = "none";
          chip.style.transform = `translate(${dx}px, ${dy}px)`;
          void chip.getBoundingClientRect();
          requestAnimationFrame(() => {
            chip.style.transition = "transform 220ms cubic-bezier(0.22, 1, 0.36, 1)";
            chip.style.transform = "";
          });
        }
      }
    }
    prevRects.current = nextRects;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderedIds.join("|")]);

  const selectedSet = useMemo(() => new Set(selected), [selected]);

  return (
    <div ref={containerRef} className="flex flex-wrap gap-1.5">
      {orderedIds.map((id) => {
        const guild = guildsById.get(id);
        if (!guild) return null;
        const on = selectedSet.has(id);
        const color = getGuildColor(guild.name);
        const sequence = on ? selected.indexOf(id) + 1 : null;
        return (
          <button
            key={id}
            data-guild-id={id}
            type="button"
            onClick={() => onToggle(bossName, id)}
            disabled={!canManage}
            draggable={canManage && on}
            onDragStart={(event) => {
              draggingIdRef.current = id;
              setDraggingId(id);
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/plain", id);
            }}
            onDragOver={(event) => {
              if (draggingIdRef.current) event.preventDefault();
            }}
            onDragEnter={(event) => {
              const sourceId = draggingIdRef.current;
              if (!canManage || !sourceId || sourceId === id || !on) return;
              event.preventDefault();
              onSwap(bossName, sourceId, id);
            }}
            onDragEnd={() => {
              draggingIdRef.current = null;
              setDraggingId(null);
            }}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-semibold ${
              on ? `${color.border} ${color.bg} ${color.text}` : "border-white/[0.06] bg-white/[0.02] text-white/35"
            } ${canManage ? (on ? "cursor-grab active:cursor-grabbing hover:opacity-90" : "cursor-pointer hover:opacity-90") : "cursor-default"} ${
              draggingId === id ? "opacity-40" : "opacity-100"
            }`}
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: on ? color.dot : "rgba(255,255,255,0.2)" }} />
            {sequence !== null && (
              <span className="inline-flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-black/25 px-1 text-[9px] font-bold leading-none">
                {sequence}
              </span>
            )}
            {guild.name}
          </button>
        );
      })}
    </div>
  );
}

export default memo(MasterListBossCard);
