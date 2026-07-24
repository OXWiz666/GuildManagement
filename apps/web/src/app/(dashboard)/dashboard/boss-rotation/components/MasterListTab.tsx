"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { dashboardApi, type BossMasterListResponse } from "@/lib/api";
import { useQuery, queryClient } from "@/lib/query";
import { useToast } from "@/components/ui/Toast";
import Button from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import LowBossSchedule from "./LowBossSchedule";
import MasterListBossCard from "./MasterListBossCard";

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
      // Order matters here (it's the turn sequence), so a pure reorder with
      // the same members must still count as a change — not just membership.
      const same = cur.length === base.length && cur.every((id, i) => id === base[i]);
      if (!same) entries.push({ bossName: b.bossName, participantGuildIds: cur });
    }
    return entries;
  }, [bosses, draft, baseline]);

  const dirty = changedEntries.length > 0;

  // Stable references (useCallback) so MasterListBossCard's memo isn't
  // defeated by a fresh closure on every MasterListTab render — only the
  // `[bossName]` key actually being edited gets a new `draft` slice, so a
  // card whose own `selected` prop didn't change also needs these callback
  // props to stay referentially equal, or it'd re-render anyway.
  const toggle = useCallback((bossName: string, gId: string) => {
    setDraft((prev) => {
      const cur = prev[bossName] ?? [];
      const nextArr = cur.includes(gId) ? cur.filter((id) => id !== gId) : [...cur, gId];
      return { ...prev, [bossName]: nextArr };
    });
  }, []);

  /** Swap two participating guilds' turn-order positions (drag-to-reorder). */
  const swapGuilds = useCallback((bossName: string, guildIdA: string, guildIdB: string) => {
    setDraft((prev) => {
      const cur = [...(prev[bossName] ?? [])];
      const idxA = cur.indexOf(guildIdA);
      const idxB = cur.indexOf(guildIdB);
      if (idxA < 0 || idxB < 0) return prev;
      [cur[idxA], cur[idxB]] = [cur[idxB]!, cur[idxA]!];
      return { ...prev, [bossName]: cur };
    });
  }, []);

  const setAllForBoss = useCallback((bossName: string, all: boolean) => {
    setDraft((prev) => ({ ...prev, [bossName]: all ? guilds.map((g) => g.id) : [] }));
  }, [guilds]);

  const openSchedule = useCallback(() => setView("SCHEDULE"), []);

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
                ? "Click to toggle which guilds take each boss. Drag a participating guild's chip onto another to swap their turn order."
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
          {filteredBosses.map((boss) => (
            <MasterListBossCard
              key={boss.bossName}
              boss={boss}
              guilds={guilds}
              selected={draft[boss.bossName] ?? []}
              canManage={canManage}
              onToggle={toggle}
              onSwap={swapGuilds}
              onSetAll={setAllForBoss}
              onOpenSchedule={openSchedule}
            />
          ))}
        </div>
      )}
    </div>
  );
}
