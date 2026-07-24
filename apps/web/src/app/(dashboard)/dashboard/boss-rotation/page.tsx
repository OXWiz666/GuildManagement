"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useAuth } from "@/lib/auth-context";
import { dashboardApi, type BossCommitmentData } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import Button from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import DashboardDecor from "@/components/dashboard/DashboardDecor";
import { ModuleHeader } from "@/components/dashboard/DashboardHelpers";
import { useQuery } from "@/lib/query";
import MasterListTab from "./components/MasterListTab";
import ActivitiesTab from "./components/ActivitiesTab";
import WeeklyCalendar from "./components/WeeklyCalendar";
import { buildWeeklyChips } from "./utils/calendarChips";
import { groupByGuild, rotationToViewEntry, scheduleToViewEntry, groupSchedulesByDay } from "./utils/viewEntry";
import RotationCard from "./components/RotationCard";
import UpcomingCard from "./components/UpcomingCard";
import TimelineView from "./components/TimelineView";
import RotationFiltersBar from "./components/RotationFiltersBar";
import GuildSection from "./components/GuildSection";
import EmptyState from "./components/EmptyState";
import HistoryTab from "./components/HistoryTab";
import ConfirmTakenModal from "./components/ConfirmTakenModal";
import EditHistoryKillModal from "./components/EditHistoryKillModal";
import ResetTimersModal from "./components/ResetTimersModal";
import type { RotationTab, HistoryView, HistoryCategory, HistoryRange } from "./types";
import { useBossRotationData } from "./hooks/useBossRotationData";
import { useRotationFilters } from "./hooks/useRotationFilters";
import { useBossHistory } from "./hooks/useBossHistory";
import { useBossKillActions } from "./hooks/useBossKillActions";

// Modals are only ever needed after a user action (opening the maintenance
// reset dialog, closing out a boss-kill sale) — code-split them out of the
// main route chunk instead of shipping them on every boss-rotation load.
const MaintenanceResetModal = dynamic(() => import("./components/MaintenanceResetModal"));
const BossKillSaleModal = dynamic(() => import("./components/BossKillSaleModal"));

export default function BossRotationPage() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const activeGuild = user?.guilds?.[0];
  const isOfficer =
    activeGuild?.role === "OFFICER" ||
    activeGuild?.role === "GUILD_LEADER" ||
    activeGuild?.role === "FACTION_LEADER" ||
    activeGuild?.role === "ADMIN";

  const [activeTab, setActiveTab] = useState<RotationTab>("LIVE");
  const [historyMonth, setHistoryMonth] = useState("");
  const [historySearch, setHistorySearch] = useState("");
  const [historyView, setHistoryView] = useState<HistoryView>("LEDGER");
  const [historyCategory, setHistoryCategory] = useState<HistoryCategory>("FIXED_HOUR");
  const [historyRange, setHistoryRange] = useState<HistoryRange>("LAST_MONTH");
  const [now, setNow] = useState<number | null>(null);

  const { rotationData, isLoading, refetchRotation, schedules, guildOfDay, calendarActivities, calendarTypeMeta } =
    useBossRotationData(activeGuild);

  const {
    searchQuery,
    setSearchQuery,
    selectedTakingGuildId,
    setSelectedTakingGuildId,
    selectedCycle,
    setSelectedCycle,
    sortMode,
    setSortMode,
    viewMode,
    setViewMode,
    takingGuilds,
    filteredRotations,
    upcomingBosses,
  } = useRotationFilters(rotationData, schedules, activeGuild);

  const canManage = rotationData?.canManage || false;

  const killActions = useBossKillActions(activeGuild, addToast, refetchRotation, takingGuilds, canManage);

  const history = useBossHistory(activeGuild, historyRange, historyMonth, historySearch, historyCategory);

  // Timeline/Calendar views compute their countdown text from this shared
  // `now`, so the tick only needs to run there — the default Grid view's
  // cards keep their own live countdown internally (see RotationCard /
  // UpcomingCard), and Master/Activity/History have no countdown to show at
  // all. Without this gate the whole page (every card, every tab) was
  // re-rendering once a second regardless of what was actually on screen.
  const needsSharedTick =
    (activeTab === "LIVE" || activeTab === "UPCOMING") &&
    (viewMode === "TIMELINE" || viewMode === "CALENDAR");

  useEffect(() => {
    if (!needsSharedTick) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [needsSharedTick]);

  const serverNow = now ?? new Date(rotationData?.serverTime || 0).getTime();

  // Every boss card currently on screen (LIVE + UPCOMING) mounts its own
  // BossCommitButton, which otherwise fires one `getBossCommitments` request
  // per card. Fetch all of them here in one batched call and pass each
  // card its own slice as `initialData` (see BossCommitButton) so a card
  // that mounts once this has already resolved — tab switches, filter
  // changes, revisits — skips its own request entirely. Keyed on the
  // actual id set so a boss appearing/disappearing (kill, filter change)
  // refreshes the batch, not just guildId.
  const commitScheduleIds = useMemo(() => {
    const ids = new Set<string>();
    for (const rotation of filteredRotations) {
      if (rotation.activeSchedule?.id) ids.add(rotation.activeSchedule.id);
    }
    for (const schedule of upcomingBosses) {
      ids.add(schedule.id);
    }
    return Array.from(ids).sort();
  }, [filteredRotations, upcomingBosses]);

  const commitmentsBatchKey = activeGuild && commitScheduleIds.length > 0
    ? `boss_commitments_batch:${activeGuild.guildId}:${commitScheduleIds.join(",")}`
    : "boss_commitments_batch_empty";

  const { data: commitmentsBatch } = useQuery<Record<string, BossCommitmentData>>(
    commitmentsBatchKey,
    async () => {
      if (!activeGuild || commitScheduleIds.length === 0) return {};
      const res = await dashboardApi.getBossCommitmentsBatch(activeGuild.guildId, commitScheduleIds);
      return res.success && res.data ? res.data : {};
    },
    { staleTime: 20000, enabled: !!activeGuild && commitScheduleIds.length > 0 },
  );

  // react-hooks/refs can't see into buildWeeklyChips: it only ever *stores*
  // the onBossClick closure on each chip (invoked later, on an actual user
  // click) and never calls it while building the map, so openKillModal's
  // internal isKillingRef access never happens during render. Safe to
  // silence — the lint rule is guarding against a call pattern this isn't.
  /* eslint-disable react-hooks/refs */
  const liveCalendarChips = useMemo(
    () =>
      buildWeeklyChips({
        bossEntries: filteredRotations.map((rotation) => rotationToViewEntry(rotation, serverNow)),
        onBossClick: canManage
          ? (id) => {
              const rotation = filteredRotations.find((r) => r.id === id);
              if (rotation) killActions.openKillModal(rotation);
            }
          : undefined,
        activities: calendarActivities,
        typeMeta: calendarTypeMeta,
      }),
    [filteredRotations, serverNow, canManage, killActions.openKillModal, calendarActivities, calendarTypeMeta],
  );
  /* eslint-enable react-hooks/refs */

  const upcomingCalendarChips = useMemo(
    () =>
      buildWeeklyChips({
        bossEntries: upcomingBosses.map((schedule) => scheduleToViewEntry(schedule, serverNow)),
        activities: calendarActivities,
        typeMeta: calendarTypeMeta,
      }),
    [upcomingBosses, serverNow, calendarActivities, calendarTypeMeta],
  );

  if (!user || !activeGuild) {
    return (
      <div className="flex items-center justify-center h-64 animate-fade-in">
        <p className="text-white/40">No active guild selected</p>
      </div>
    );
  }

  const tabs: Array<{ id: RotationTab; label: string; count?: number; hidden?: boolean }> = [
    { id: "LIVE", label: "Guild Rotation", count: filteredRotations.length },
    { id: "UPCOMING", label: "Upcoming", count: upcomingBosses.length },
    { id: "ACTIVITIES", label: "Guild Event" },
    { id: "MASTER", label: "Faction Schedule", hidden: !isOfficer },
    { id: "HISTORY", label: "Activity", count: history.killedHistory.total },
  ];

  return (
    <div className="relative max-w-full xl:max-w-[1600px] mx-auto w-full px-2 md:px-4 lg:px-6">
      <DashboardDecor />
      <div className="relative z-10 space-y-6 text-white/85">
        <ModuleHeader
          eyebrow="Faction Operations"
          title="Faction Boss Rotation"
          description="Server-owned rotation queues, realtime timers, and guild leader notifications."
          right={
            <div className="flex flex-wrap items-center gap-2">
              {isOfficer && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => killActions.setShowResetModal(true)}
                    className="border border-white/[0.08] hover:border-emerald-500/35 hover:text-emerald-300"
                  >
                    <svg className="h-3.5 w-3.5 mr-1.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21.5 2v6h-6" />
                      <path d="M2.5 12a10 10 0 0 1 17.17-6.83L21.5 8" />
                      <path d="M2.5 22v-6h6" />
                      <path d="M21.5 12a10 10 0 0 1-17.17 6.83L2.5 16" />
                    </svg>
                    Reset Timers
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => killActions.setShowMaintenanceModal(true)}
                    className="border border-white/[0.08] hover:border-amber-500/35 hover:text-amber-300"
                  >
                    <svg className="h-3.5 w-3.5 mr-1.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
                    </svg>
                    Maintenance Reset
                  </Button>
                </>
              )}
              <Button variant="ghost" size="sm" onClick={refetchRotation} isLoading={isLoading}>
                Refresh
              </Button>
            </div>
          }
        />

        <div className="flex flex-nowrap items-center bg-[var(--obsidian-elevated)]/40 backdrop-blur-md border border-[var(--metal-border)] rounded-xl p-1 gap-1 min-w-0 max-w-full overflow-x-auto no-scrollbar">
          {tabs.filter((tab) => !tab.hidden).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative shrink-0 whitespace-nowrap px-4 py-2 text-[13px] font-semibold rounded-lg transition-all cursor-pointer focus-ring ${
                activeTab === tab.id
                  ? "bg-[var(--forge-glow)] border border-[var(--forge-gold)]/25 text-[var(--forge-gold-bright)] shadow-[0_0_12px_rgba(212,168,83,0.1)]"
                  : "text-white/45 hover:text-white/75 border border-transparent hover:bg-white/[0.03]"
              }`}
            >
              {tab.label}
              {typeof tab.count === "number" && (
                <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded-full ${
                  activeTab === tab.id
                    ? "bg-[var(--forge-gold)]/15 text-[var(--forge-gold)]"
                    : "bg-white/5 text-white/45"
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {(activeTab === "LIVE" || activeTab === "UPCOMING") && (
          <RotationFiltersBar
            selectedCycle={selectedCycle}
            onSelectedCycleChange={setSelectedCycle}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            sortMode={sortMode}
            onSortModeChange={setSortMode}
            selectedTakingGuildId={selectedTakingGuildId}
            onSelectedTakingGuildIdChange={setSelectedTakingGuildId}
            searchQuery={searchQuery}
            onSearchQueryChange={setSearchQuery}
            takingGuilds={takingGuilds}
          />
        )}

        {activeTab === "LIVE" && (
          isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
              {[1, 2, 3, 4].map((item) => <Skeleton key={item} className="h-72 rounded-2xl" />)}
            </div>
          ) : filteredRotations.length === 0 ? (
            <EmptyState title="No rotations found" body="Try a different boss or guild search." />
          ) : viewMode === "TIMELINE" ? (
            <TimelineView
              entries={filteredRotations.map((rotation) => rotationToViewEntry(rotation, serverNow))}
              canManage={canManage}
              onTaken={(id) => {
                const rotation = filteredRotations.find((r) => r.id === id);
                if (rotation) killActions.openKillModal(rotation);
              }}
            />
          ) : viewMode === "CALENDAR" ? (
            <WeeklyCalendar chipsByDate={liveCalendarChips} guildOfDay={guildOfDay} />
          ) : sortMode === "GUILD" ? (
            <div className="space-y-7">
              {groupByGuild(filteredRotations, (rotation) => rotation.currentGuild?.name).map(([guildName, guildRotations]) => (
                <GuildSection key={guildName} guildName={guildName} count={guildRotations.length}>
                  {guildRotations.map((rotation, index) => (
                    <RotationCard
                      key={rotation.id}
                      rotation={rotation}
                      canManage={canManage}
                      onKilled={killActions.openKillModal}
                      guildId={activeGuild.guildId}
                      index={index}
                      commitmentsBatch={commitmentsBatch}
                    />
                  ))}
                </GuildSection>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
              {filteredRotations.map((rotation, index) => (
                <RotationCard
                  key={rotation.id}
                  rotation={rotation}
                  canManage={canManage}
                  onKilled={killActions.openKillModal}
                  guildId={activeGuild.guildId}
                  index={index}
                  commitmentsBatch={commitmentsBatch}
                />
              ))}
            </div>
          )
        )}

        {activeTab === "UPCOMING" && (
          <div>
            {upcomingBosses.length === 0 ? (
              <EmptyState title="No upcoming bosses" body="All bosses that will spawn in the future appear here." />
            ) : viewMode === "TIMELINE" ? (
              <TimelineView entries={upcomingBosses.map((schedule) => scheduleToViewEntry(schedule, serverNow))} />
            ) : viewMode === "CALENDAR" ? (
              <WeeklyCalendar chipsByDate={upcomingCalendarChips} />
            ) : sortMode === "GUILD" ? (
              <div className="space-y-7">
                {groupByGuild(upcomingBosses, (schedule) => schedule.guildTurnGuildName || schedule.guildTurn).map(([guildName, guildSchedules]) => (
                  <GuildSection key={guildName} guildName={guildName} count={guildSchedules.length}>
                    {guildSchedules.map((schedule, index) => (
                      <UpcomingCard
                        key={schedule.id}
                        schedule={schedule}
                        guildId={activeGuild.guildId}
                        index={index}
                        commitmentsBatch={commitmentsBatch}
                      />
                    ))}
                  </GuildSection>
                ))}
              </div>
            ) : (
              <div className="space-y-7">
                {groupSchedulesByDay(upcomingBosses).map((group) => (
                  <div key={group.key}>
                    <div className="flex items-center gap-3 mb-3">
                      <span className={`text-[11px] font-bold uppercase tracking-[0.18em] ${group.label === "Today" ? "text-[var(--forge-gold-bright)]" : "text-white/50"}`}>
                        {group.label}
                      </span>
                      <span className="h-px flex-1 bg-white/[0.06]" />
                      <span className="text-[10px] text-white/30 font-mono">{group.items.length}</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
                      {group.items.map((schedule, index) => (
                        <UpcomingCard
                          key={schedule.id}
                          schedule={schedule}
                          guildId={activeGuild.guildId}
                          index={index}
                          commitmentsBatch={commitmentsBatch}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "ACTIVITIES" && <ActivitiesTab guildId={activeGuild.guildId} />}

        {activeTab === "MASTER" && <MasterListTab guildId={activeGuild.guildId} />}

        {activeTab === "HISTORY" && (
          <HistoryTab
            historyView={historyView}
            onHistoryViewChange={setHistoryView}
            historySearch={historySearch}
            onHistorySearchChange={setHistorySearch}
            historyCategory={historyCategory}
            onHistoryCategoryChange={setHistoryCategory}
            historyRange={historyRange}
            onHistoryRangeChange={setHistoryRange}
            historyMonth={historyMonth}
            onHistoryMonthChange={setHistoryMonth}
            killedHistoryMonth={history.killedHistory.month}
            isLoadingQueueChanges={history.isLoadingQueueChanges}
            filteredQueueChanges={history.filteredQueueChanges}
            isLoadingHistory={history.isLoadingHistory}
            historyRows={history.historyRows}
            filteredHistoryDays={history.filteredHistoryDays}
            categoryBossNames={history.categoryBossNames}
            canManage={canManage}
            onSelectKill={killActions.setSaleModalKill}
            onEditKill={killActions.openHistoryKillEditModal}
          />
        )}
      </div>

      {killActions.killTarget && (
        <ConfirmTakenModal
          killTarget={killActions.killTarget}
          modalGuildQueue={killActions.modalGuildQueue}
          selectedTakenGuildId={killActions.selectedTakenGuildId}
          onSelectedTakenGuildIdChange={killActions.setSelectedTakenGuildId}
          selectedTakenGuild={killActions.selectedTakenGuild}
          previewNextGuild={killActions.previewNextGuild}
          killTime={killActions.killTime}
          onKillTimeChange={killActions.setKillTime}
          killDrops={killActions.killDrops}
          onKillDropsChange={killActions.setKillDrops}
          showDropsPicker={killActions.showDropsPicker}
          onShowDropsPickerChange={killActions.setShowDropsPicker}
          isKilling={killActions.isKilling}
          canConfirmTaken={killActions.canConfirmTaken}
          onConfirm={killActions.confirmKill}
          onCancel={() => killActions.setKillTarget(null)}
        />
      )}

      {killActions.editingHistoryKill && (
        <EditHistoryKillModal
          editingHistoryKill={killActions.editingHistoryKill}
          editHistoryKillTime={killActions.editHistoryKillTime}
          onEditHistoryKillTimeChange={killActions.setEditHistoryKillTime}
          isEditingHistoryKill={killActions.isEditingHistoryKill}
          canSaveHistoryEdit={killActions.canSaveHistoryEdit}
          onSave={killActions.saveHistoryKillEdit}
          onCancel={() => killActions.setEditingHistoryKill(null)}
        />
      )}

      {killActions.saleModalKill && activeGuild && (
        <BossKillSaleModal
          guildId={activeGuild.guildId}
          kill={killActions.saleModalKill}
          isOfficer={isOfficer}
          onClose={() => killActions.setSaleModalKill(null)}
        />
      )}

      <MaintenanceResetModal
        isOpen={killActions.showMaintenanceModal}
        onClose={() => !killActions.isMaintenanceResetting && killActions.setShowMaintenanceModal(false)}
        onConfirm={killActions.handleMaintenanceReset}
        isProcessing={killActions.isMaintenanceResetting}
      />

      <ResetTimersModal
        isOpen={killActions.showResetModal}
        isResetting={killActions.isResetting}
        onConfirm={killActions.handleResetAllTimers}
        onClose={() => killActions.setShowResetModal(false)}
      />
    </div>
  );
}
