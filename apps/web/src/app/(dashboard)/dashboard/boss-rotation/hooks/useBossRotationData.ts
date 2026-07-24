import { useEffect, useMemo } from "react";
import {
  dashboardApi,
  guildApi,
  activityApi,
  type BossRotationResponse,
  type BossScheduleData,
  type LowBossRotationResponse,
  type GuildActivitiesResponse,
  type ActivityPointRulesData,
} from "@/lib/api";
import { useSocket } from "@/components/providers/socket-provider";
import { useQuery, queryClient } from "@/lib/query";
import { buildGuildOfDayResolver } from "../utils/calendarChips";
import { buildActivityTypeMeta } from "@/lib/activityTypeMeta";
import { EMPTY_ACTIVITIES, EMPTY_ACTIVITY_RULES } from "../constants";
import type { ActiveGuildRef } from "../types";

// Owns the rotation/schedule/activity queries and the socket-driven cache
// invalidation for them. Boss Killed History and Queue Changes are fetched
// separately by useBossHistory since they're History-tab-only concerns, but
// this hook's socket handler still invalidates their cache keys alongside
// its own — one realtime event, all the caches it can affect.
export function useBossRotationData(activeGuild: ActiveGuildRef) {
  const { socket } = useSocket();

  const {
    data: rotationData,
    isLoading,
    refetch: refetchRotation,
  } = useQuery<BossRotationResponse>(
    activeGuild ? `boss_rotation_v2:${activeGuild.guildId}` : "boss_rotation_empty",
    async () => {
      if (!activeGuild) {
        return { serverTime: new Date().toISOString(), canManage: false, viewerRole: "MEMBER", factionId: null, guilds: [], rotations: [] };
      }
      const result = await dashboardApi.getBossRotation(activeGuild.guildId);
      return result.success && result.data
        ? result.data
        : { serverTime: new Date().toISOString(), canManage: false, viewerRole: "MEMBER", factionId: null, guilds: [], rotations: [] };
    },
    { persist: true, staleTime: 10000, enabled: !!activeGuild },
  );

  const { data: schedulesRaw } = useQuery<BossScheduleData[]>(
    activeGuild ? `boss_schedules:${activeGuild.guildId}` : "boss_schedules_empty",
    async () => {
      if (!activeGuild) return [];
      const result = await dashboardApi.getBossSchedules(activeGuild.guildId);
      return result.success && result.data?.schedules ? result.data.schedules : [];
    },
    { persist: true, staleTime: 15000, enabled: !!activeGuild },
  );

  // Same cache key LowBossSchedule/ActivitiesTab use — feeds the "guild of
  // the day" overlay on the Live/Upcoming weekly calendars, shared rather
  // than re-fetched.
  const { data: lowRotationRaw } = useQuery<LowBossRotationResponse | null>(
    activeGuild ? `boss_low_rotation:${activeGuild.guildId}` : "boss_low_rotation_empty",
    async () => {
      if (!activeGuild) return null;
      const result = await dashboardApi.getLowBossRotation(activeGuild.guildId);
      return result.success && result.data ? result.data : null;
    },
    { persist: true, staleTime: 15000, enabled: !!activeGuild },
  );
  const guildOfDay = useMemo(() => buildGuildOfDayResolver(lowRotationRaw), [lowRotationRaw]);

  // Same cache key ActivitiesTab uses — the Live/Upcoming weekly calendars
  // overlay guild activities alongside boss spawns, shared rather than
  // re-fetched.
  const { data: activitiesRaw } = useQuery<GuildActivitiesResponse>(
    activeGuild ? `guild_activities:${activeGuild.guildId}` : "guild_activities_empty",
    async () => {
      if (!activeGuild) return EMPTY_ACTIVITIES;
      const result = await activityApi.list(activeGuild.guildId);
      return result.success && result.data ? result.data : EMPTY_ACTIVITIES;
    },
    { persist: true, staleTime: 10000, enabled: !!activeGuild },
  );
  const { data: activityRulesRaw } = useQuery<ActivityPointRulesData>(
    activeGuild ? `activity_rules:${activeGuild.guildId}` : "activity_rules_empty",
    async () => {
      if (!activeGuild) return EMPTY_ACTIVITY_RULES;
      const result = await guildApi.getActivityRules(activeGuild.guildId);
      return result.success && result.data ? result.data.rules : EMPTY_ACTIVITY_RULES;
    },
    { persist: true, staleTime: 300000, enabled: !!activeGuild },
  );
  const calendarActivities = useMemo(() => activitiesRaw?.activities ?? [], [activitiesRaw]);
  const calendarTypeMeta = useMemo(
    () => buildActivityTypeMeta(activityRulesRaw?.activities ?? []),
    [activityRulesRaw],
  );

  useEffect(() => {
    if (!socket || !activeGuild) return;
    const handleRotationUpdate = () => {
      queryClient.invalidateQueries(`boss_rotation_v2:${activeGuild.guildId}`);
      queryClient.invalidateQueries(`boss_schedules:${activeGuild.guildId}`);
      queryClient.invalidateQueries(`boss_rotation_queue_changes:${activeGuild.guildId}`);
      queryClient.invalidateQueries(`boss_killed_history:${activeGuild.guildId}`);
    };
    socket.on("boss_rotation_updated", handleRotationUpdate);
    socket.on("boss_schedule_deleted", handleRotationUpdate);
    return () => {
      socket.off("boss_rotation_updated", handleRotationUpdate);
      socket.off("boss_schedule_deleted", handleRotationUpdate);
    };
  }, [socket, activeGuild]);

  const schedules = useMemo(() => schedulesRaw || [], [schedulesRaw]);

  return {
    rotationData,
    isLoading,
    refetchRotation,
    schedules,
    guildOfDay,
    calendarActivities,
    calendarTypeMeta,
  };
}
