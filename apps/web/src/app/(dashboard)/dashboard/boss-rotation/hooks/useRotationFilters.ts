import { useMemo, useState } from "react";
import type { BossRotationItem, BossRotationResponse, BossScheduleData, FactionGuildData } from "@/lib/api";
import { PREDEFINED_BOSSES, getBossImageUrl, getNextBossSpawnTime, getBossCycleCategory } from "@guild/shared";
import { spawnSortValue, guildGroupLabel } from "../utils/viewEntry";
import type { CycleFilter, SortMode, ViewMode } from "../types";

type ActiveGuild = { guildId: string; guildName: string; guildSlug: string; guildAvatarUrl: string | null } | undefined;

// Owns the LIVE/UPCOMING toolbar state (search, cycle, taking-guild, sort,
// view mode) plus everything derived from it: the guild roster fallback
// used when the API hasn't returned rotations yet, the filtered rotation
// list, and the upcoming-schedule projection built from that same filtered
// list (so the shared toolbar applies to both tabs).
export function useRotationFilters(
  rotationData: BossRotationResponse | null | undefined,
  schedules: BossScheduleData[],
  activeGuild: ActiveGuild,
) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTakingGuildId, setSelectedTakingGuildId] = useState("ALL");
  const [selectedCycle, setSelectedCycle] = useState<CycleFilter>("ALL");
  const [sortMode, setSortMode] = useState<SortMode>("TIME");
  const [viewMode, setViewMode] = useState<ViewMode>("GRID");

  const fallbackGuilds = useMemo<FactionGuildData[]>(() => {
    const guildMap = new Map<string, FactionGuildData>();
    for (const guild of rotationData?.guilds || []) {
      guildMap.set(guild.id, guild);
    }
    if (activeGuild) {
      guildMap.set(activeGuild.guildId, {
        id: activeGuild.guildId,
        name: activeGuild.guildName,
        slug: activeGuild.guildSlug,
        avatarUrl: activeGuild.guildAvatarUrl,
      });
    }
    for (const schedule of schedules) {
      if (schedule.guildTurnGuildId && schedule.guildTurnGuildName && !guildMap.has(schedule.guildTurnGuildId)) {
        guildMap.set(schedule.guildTurnGuildId, {
          id: schedule.guildTurnGuildId,
          name: schedule.guildTurnGuildName,
          slug: schedule.guildTurnGuildName.toLowerCase().replace(/\s+/g, "-"),
          avatarUrl: null,
        });
      }
    }
    return Array.from(guildMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [activeGuild, rotationData?.guilds, schedules]);

  const fallbackRotations = useMemo<BossRotationItem[]>(() => {
    if ((rotationData?.rotations?.length || 0) > 0 || schedules.length === 0) return [];
    const guildMap = new Map(fallbackGuilds.map((guild) => [guild.id, guild]));
    const queue = fallbackGuilds;

    return PREDEFINED_BOSSES.map((boss) => {
      const bossSchedules = schedules.filter((schedule) => schedule.bossName.toLowerCase() === boss.name.toLowerCase());
      const activeSchedule = bossSchedules
        .filter((schedule) => schedule.status !== "KILLED")
        .sort((a, b) => new Date(a.spawnTime).getTime() - new Date(b.spawnTime).getTime())[0] || null;
      const latestKilled = bossSchedules
        .filter((schedule) => schedule.status === "KILLED")
        .sort((a, b) => new Date(b.killedAt || b.spawnTime).getTime() - new Date(a.killedAt || a.spawnTime).getTime())[0] || null;

      const currentGuild =
        (activeSchedule?.guildTurnGuildId ? guildMap.get(activeSchedule.guildTurnGuildId) : null) ||
        queue[0] ||
        null;
      const currentIndex = currentGuild ? Math.max(0, queue.findIndex((guild) => guild.id === currentGuild.id)) : 0;
      const nextGuild = queue.length ? queue[(currentIndex + 1) % queue.length] || currentGuild : null;
      const everTaken = boss.type === "FIXED_SCHEDULE" || Boolean(activeSchedule || latestKilled);

      return {
        id: `fallback:${boss.name}`,
        bossName: boss.name,
        bossImageUrl: activeSchedule?.bossImageUrl || getBossImageUrl(boss.name),
        level: boss.level,
        type: boss.type,
        cooldownHours: boss.cooldownHours || null,
        location: activeSchedule?.location || boss.location,
        // This fallback path has no faction Low Boss config in scope; it
        // only kicks in when the API returned nothing at all, so it's not
        // the source of truth for this flag anyway.
        isLowBoss: false,
        currentIndex,
        queue,
        currentGuild,
        nextGuild,
        everTaken,
        spawnTime: activeSchedule?.spawnTime ||
          (boss.type === "FIXED_SCHEDULE"
            ? getNextBossSpawnTime(boss.name, latestKilled?.killedAt ? new Date(latestKilled.killedAt) : new Date()).toISOString()
            : (latestKilled?.spawnTime || null)),
        status: activeSchedule?.status || latestKilled?.status || (everTaken ? "UPCOMING" : "NOT_STARTED"),
        activeSchedule,
        latestKilled,
      };
    });
  }, [fallbackGuilds, rotationData?.rotations?.length, schedules]);

  const rotations = useMemo(
    () => (rotationData?.rotations?.length ? rotationData.rotations : fallbackRotations),
    [fallbackRotations, rotationData],
  );

  const takingGuilds = useMemo(() => {
    const guildMap = new Map<string, FactionGuildData>();
    for (const guild of fallbackGuilds) {
      guildMap.set(guild.id, guild);
    }
    for (const rotation of rotations) {
      for (const guild of rotation.queue) {
        guildMap.set(guild.id, guild);
      }
      if (rotation.currentGuild) guildMap.set(rotation.currentGuild.id, rotation.currentGuild);
      if (rotation.nextGuild) guildMap.set(rotation.nextGuild.id, rotation.nextGuild);
    }
    return Array.from(guildMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [fallbackGuilds, rotations]);

  const filteredRotations = useMemo(() => {
    const needle = searchQuery.trim().toLowerCase();
    const filtered = rotations.filter((rotation) => {
      const matchesSearch = !needle ||
        rotation.bossName.toLowerCase().includes(needle) ||
        rotation.location.toLowerCase().includes(needle) ||
        rotation.currentGuild?.name.toLowerCase().includes(needle) ||
        rotation.nextGuild?.name.toLowerCase().includes(needle) ||
        rotation.queue.some((guild) => guild.name.toLowerCase().includes(needle));

      const takingGuildId = rotation.currentGuild?.id || rotation.activeSchedule?.guildTurnGuildId || "";
      const matchesGuild =
        selectedTakingGuildId === "ALL" ||
        (selectedTakingGuildId === "UNASSIGNED" && !takingGuildId) ||
        takingGuildId === selectedTakingGuildId;

      // Low Boss is a separate axis from cadence (a Low Boss can be
      // SHORT_CYCLE or LONG_CYCLE underneath) — the "Low Boss" filter picks
      // it out explicitly, and the cadence filters exclude it so they stay
      // about the per-boss turn queue, not the day-based rotation.
      const matchesCycle =
        selectedCycle === "ALL" ||
        (selectedCycle === "LOW_BOSS"
          ? rotation.isLowBoss
          : !rotation.isLowBoss &&
            getBossCycleCategory(rotation.bossName, rotation.type, rotation.cooldownHours) === selectedCycle);

      return matchesSearch && matchesGuild && matchesCycle;
    });

    // Nearest-spawn-first is the base order in every mode; guild mode groups
    // on top of that ordering (see groupByGuild), so the time sort here
    // guarantees soonest-first inside each guild section too.
    return [...filtered].sort((a, b) => {
      if (sortMode === "GUILD") {
        const guildCompare = guildGroupLabel(a.currentGuild?.name).localeCompare(guildGroupLabel(b.currentGuild?.name));
        if (guildCompare !== 0) return guildCompare;
      }
      return spawnSortValue(a.spawnTime) - spawnSortValue(b.spawnTime);
    });
  }, [rotations, searchQuery, selectedTakingGuildId, selectedCycle, sortMode]);

  // Generate upcoming entries for ALL bosses (including those without explicit schedules).
  // Built from filteredRotations so the shared search/guild/cycle toolbar actually
  // applies here too, not just on the LIVE tab.
  const upcomingBosses = useMemo(() => {
    const allUpcoming: BossScheduleData[] = [];

    for (const rotation of filteredRotations) {
      // A never-taken cycle boss has no real spawn time yet — it belongs in
      // the LIVE tab (so its first kill can be logged), not the upcoming
      // schedule, which has nothing meaningful to count down to.
      if (!rotation.spawnTime) continue;

      allUpcoming.push({
        id: rotation.activeSchedule?.id || rotation.id,
        guildId: activeGuild?.guildId || null,
        bossName: rotation.bossName,
        bossImageUrl: rotation.bossImageUrl,
        spawnTime: rotation.spawnTime,
        location: rotation.location,
        guildTurn: rotation.currentGuild?.name || null,
        guildTurnGuildId: rotation.currentGuild?.id || null,
        guildTurnGuildName: rotation.currentGuild?.name || null,
        status: rotation.status === "NOT_STARTED" ? "UPCOMING" : rotation.status,
        killedAt: rotation.latestKilled?.killedAt || null,
        creatorId: rotation.activeSchedule?.creatorId || "",
        creatorName: rotation.activeSchedule?.creatorName,
        createdAt: rotation.activeSchedule?.createdAt || new Date().toISOString(),
        attendanceSessions: rotation.activeSchedule?.attendanceSessions,
      });
    }

    // Nearest spawn first as the base order; guild mode groups on top of it
    // (see groupByGuild), so each guild's cards still read soonest-first.
    allUpcoming.sort((a, b) => {
      if (sortMode === "GUILD") {
        const guildCompare = guildGroupLabel(a.guildTurnGuildName || a.guildTurn).localeCompare(
          guildGroupLabel(b.guildTurnGuildName || b.guildTurn),
        );
        if (guildCompare !== 0) return guildCompare;
      }
      return spawnSortValue(a.spawnTime) - spawnSortValue(b.spawnTime);
    });
    return allUpcoming.slice(0, 24);
  }, [filteredRotations, activeGuild, sortMode]);

  return {
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
  };
}
