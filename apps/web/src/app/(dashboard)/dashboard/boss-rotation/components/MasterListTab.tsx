"use client";

import { useEffect, useMemo, useState } from "react";
import { dashboardApi, type BossMasterListResponse } from "@/lib/api";
import { useQuery, queryClient } from "@/lib/query";
import { useToast } from "@/components/ui/Toast";
import Button from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { getGuildColor } from "../utils/helpers";
import { getBossImageUrl } from "@guild/shared";
import LowBossSchedule from "./LowBossSchedule";

type ViewMode = "BOSS" | "SCHEDULE";

const EMPTY: BossMasterListResponse = { canManage: false, viewerRole: "MEMBER", guilds: [], bosses: [] };

/**
 * Faction-leader-owned master list: which guilds are scheduled to take each boss.
 * Guilds left off a boss simply don't rotate on it (e.g. low-boss-only guilds).
 * Everyone can view; only faction leaders (canManage) can toggle and save.
 */
export default function MasterListTab({ guildId }: { guildId: string }) {
  const { addToast } = useToast();
  const key = `boss_master_list:${guildId}`;

  const { data, isLoading } = useQuery<BossMasterListResponse>(
    key,
    async () => {
      const res = await dashboardApi.getBossMasterList(guildId);
      return res.success && res.data ? res.data : EMPTY;
    },
    { persist: true, staleTime: 15000, enabled: !!guildId },
  );

  const canManage = data?.canManage ?? false;
  const guilds = useMemo(() => data?.guilds ?? [], [data]);
  const bosses = useMemo(() => data?.bosses ?? [], [data]);

  const [view, setView] = useState<ViewMode>("BOSS");
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  // draft: bossName -> participating guild ids
  const [draft, setDraft] = useState<Record<string, string[]>>({});

  useEffect(() => {
    if (!data) return;
    const next: Record<string, string[]> = {};
    for (const b of data.bosses) next[b.bossName] = [...b.participantGuildIds];
    setDraft(next);
  }, [data]);

  const baseline = useMemo(() => {
    const m: Record<string, string[]> = {};
    for (const b of bosses) m[b.bossName] = b.participantGuildIds;
    return m;
  }, [bosses]);

  const changedEntries = useMemo(() => {
    const entries: Array<{ bossName: string; participantGuildIds: string[] }> = [];
    for (const b of bosses) {
      const cur = draft[b.bossName] ?? [];
      const base = baseline[b.bossName] ?? [];
      const same = cur.length === base.length && cur.every((id) => base.includes(id));
      if (!same) entries.push({ bossName: b.bossName, participantGuildIds: cur });
    }
    return entries;
  }, [bosses, draft, baseline]);

  const dirty = changedEntries.length > 0;

  function isParticipating(bossName: string, gId: string) {
    return (draft[bossName] ?? []).includes(gId);
  }

  function toggle(bossName: string, gId: string) {
    if (!canManage) return;
    setDraft((prev) => {
      const cur = prev[bossName] ?? [];
      const nextArr = cur.includes(gId) ? cur.filter((id) => id !== gId) : [...cur, gId];
      return { ...prev, [bossName]: nextArr };
    });
  }

  function setAllForBoss(bossName: string, all: boolean) {
    if (!canManage) return;
    setDraft((prev) => ({ ...prev, [bossName]: all ? guilds.map((g) => g.id) : [] }));
  }

  function reset() {
    const next: Record<string, string[]> = {};
    for (const b of bosses) next[b.bossName] = [...b.participantGuildIds];
    setDraft(next);
  }

  async function save() {
    if (!dirty || saving) return;
    setSaving(true);
    try {
      const res = await dashboardApi.updateBossMasterList(guildId, changedEntries);
      if (res.success) {
        addToast("success", `Master list updated for ${changedEntries.length} boss${changedEntries.length > 1 ? "es" : ""}.`);
        queryClient.invalidateQueries(key);
        queryClient.invalidateQueries(`boss_rotation_v2:${guildId}`);
        queryClient.invalidateQueries(`boss_schedules:${guildId}`);
      } else {
        addToast("error", res.error?.message || "Failed to update master list");
      }
    } catch {
      addToast("error", "Failed to update master list");
    } finally {
      setSaving(false);
    }
  }

  const needle = search.trim().toLowerCase();
  const filteredBosses = useMemo(
    () =>
      bosses.filter(
        (b) => !needle || b.bossName.toLowerCase().includes(needle) || b.location.toLowerCase().includes(needle),
      ),
    [bosses, needle],
  );

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
      </div>
    );
  }

  if (guilds.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 rounded-xl bg-white/[0.015] border border-white/[0.05] p-8 text-center">
        <h3 className="text-sm font-semibold text-white/80">No active guilds</h3>
        <p className="text-xs text-white/45 mt-1">Add guilds to the faction to build a boss master list.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="inline-flex items-center bg-[var(--obsidian-elevated)]/60 border border-[var(--metal-border)] rounded-lg p-1 gap-1">
            {(["BOSS", "SCHEDULE"] as ViewMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setView(mode)}
                className={`px-3 py-1.5 text-[12px] font-semibold rounded-md transition-all cursor-pointer ${
                  view === mode
                    ? "bg-[var(--forge-glow)] border border-[var(--forge-gold)]/25 text-[var(--forge-gold-bright)]"
                    : "text-white/45 hover:text-white/75 border border-transparent"
                }`}
              >
                {mode === "BOSS" ? "By Boss" : "Schedule"}
              </button>
            ))}
          </div>
          {view === "BOSS" && (
            <p className="hidden sm:block text-[11px] text-white/40 max-w-xs">
              {canManage
                ? "Toggle which guilds take each boss. The number on each chip is its turn order — guilds left off don't rotate on it."
                : "Read-only. Only faction leaders can edit the master list."}
            </p>
          )}
        </div>

        {view === "BOSS" && (
          <div className="flex items-center gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search boss..."
              className="h-9 w-full sm:w-48 px-3 rounded-lg bg-[var(--obsidian-elevated)]/60 border border-[var(--metal-border)] text-[13px] text-white/90 placeholder:text-white/35 focus:outline-none focus:border-[var(--forge-gold)]/35"
            />
            {canManage && (
              <>
                <Button variant="ghost" size="sm" onClick={reset} disabled={!dirty || saving}>
                  Reset
                </Button>
                <Button variant="accent" size="sm" onClick={save} isLoading={saving} disabled={!dirty}>
                  Save{dirty ? ` (${changedEntries.length})` : ""}
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      {view === "SCHEDULE" && <LowBossSchedule guildId={guildId} />}

      {/* By Boss view */}
      {view === "BOSS" && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
          {filteredBosses.map((boss) => {
            const selected = draft[boss.bossName] ?? [];

            // A Low Boss has no per-boss participant queue to toggle — its
            // guild comes from the Faction Schedule's day pattern instead.
            // Still shown here (rather than omitted, as before) so a leader
            // browsing "By Boss" isn't left wondering why the boss vanished.
            if (boss.isLowBoss) {
              return (
                <div key={boss.bossName} className="rounded-xl border border-[var(--metal-border)] bg-[var(--obsidian-elevated)]/40 p-3.5">
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
                    onClick={() => setView("SCHEDULE")}
                    className="w-full rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-left text-[11px] leading-relaxed text-white/50 hover:border-cyan-500/25 hover:text-white/75 cursor-pointer transition-all"
                  >
                    Follows the day-based Faction Schedule, not a per-boss queue — open the <span className="text-cyan-300 font-semibold">Schedule</span> tab to see or edit who takes it each day.
                  </button>
                </div>
              );
            }

            return (
              <div key={boss.bossName} className="rounded-xl border border-[var(--metal-border)] bg-[var(--obsidian-elevated)]/40 p-3.5">
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
                        <button onClick={() => setAllForBoss(boss.bossName, true)} className="text-[9px] uppercase tracking-wide text-emerald-400/70 hover:text-emerald-300 cursor-pointer">All</button>
                        <span className="text-white/15">·</span>
                        <button onClick={() => setAllForBoss(boss.bossName, false)} className="text-[9px] uppercase tracking-wide text-white/40 hover:text-white/70 cursor-pointer">None</button>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {guilds.map((g) => {
                    const on = isParticipating(boss.bossName, g.id);
                    const color = getGuildColor(g.name);
                    // Turn order is just array position — the guild added
                    // first takes the boss first, then the queue cycles back
                    // to the start. Surfacing that position is the whole
                    // point of this view: without it there's no way to tell
                    // who's up next just from a flat set of toggled chips.
                    const sequence = on ? selected.indexOf(g.id) + 1 : null;
                    return (
                      <button
                        key={g.id}
                        onClick={() => toggle(boss.bossName, g.id)}
                        disabled={!canManage}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition-all ${
                          on ? `${color.border} ${color.bg} ${color.text}` : "border-white/[0.06] bg-white/[0.02] text-white/35"
                        } ${canManage ? "cursor-pointer hover:opacity-90" : "cursor-default"}`}
                      >
                        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: on ? color.dot : "rgba(255,255,255,0.2)" }} />
                        {sequence !== null && (
                          <span className="inline-flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-black/25 px-1 text-[9px] font-bold leading-none">
                            {sequence}
                          </span>
                        )}
                        {g.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

    </div>
  );
}
