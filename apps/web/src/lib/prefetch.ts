import { prefetchQuery } from "./query";
import { dashboardApi, guildApi, factionApi, equipmentApi, activityApi } from "./api";

/**
 * Warms the client-side query cache for a sidebar destination's primary
 * data, keyed identically to that page's own `useQuery` calls — call on
 * link hover/focus (see Sidebar.tsx) so navigation lands on a warm cache
 * instead of a loading skeleton. Best-effort: a failed prefetch is silently
 * dropped and the page's own `useQuery` will just fetch normally on mount.
 */
export function prefetchForRoute(href: string, guildId: string | undefined) {
  if (!guildId) return;

  const run = (key: string, fetcher: () => Promise<unknown>, staleTime: number) => {
    prefetchQuery(key, fetcher, { persist: true, staleTime }).catch(() => {
      // best-effort — the destination page's own useQuery will retry on mount
    });
  };

  switch (href) {
    case "/dashboard":
      run(`boss_schedules:${guildId}`, async () => {
        const r = await dashboardApi.getBossSchedules(guildId);
        return r.success && r.data?.schedules ? r.data.schedules : [];
      }, 15000);
      run(`boss_rotation_v2:${guildId}`, async () => {
        const r = await dashboardApi.getBossRotation(guildId);
        return r.success && r.data ? r.data : null;
      }, 15000);
      run(`dashboard_stats:${guildId}`, async () => {
        const r = await dashboardApi.getDashboardStats(guildId);
        return r.success && r.data ? r.data : null;
      }, 30000);
      break;

    case "/dashboard/statistics":
      run(`dashboard_stats:${guildId}`, async () => {
        const r = await dashboardApi.getDashboardStats(guildId);
        return r.success && r.data ? r.data : null;
      }, 30000);
      run(`attendance_stats:${guildId}`, async () => {
        const r = await dashboardApi.getAttendanceStats(guildId);
        return r.success && r.data ? r.data : null;
      }, 30000);
      break;

    case "/dashboard/faction":
      run("faction_announcements", async () => {
        const r = await factionApi.getAnnouncements();
        return r.success && r.data?.announcements ? r.data.announcements : [];
      }, 30000);
      run("faction_events", async () => {
        const r = await factionApi.getEvents();
        return r.success && r.data?.events ? r.data.events : [];
      }, 30000);
      break;

    case "/dashboard/equipment":
      run("equipment:catalog", async () => {
        const r = await equipmentApi.getCatalog();
        return r.success && r.data ? r.data.slots : [];
      }, 1000 * 60 * 30);
      run(`equipment:mine:${guildId}`, async () => {
        const r = await equipmentApi.getMine(guildId);
        return r.success && r.data ? r.data.equipment : [];
      }, 1000 * 30);
      break;

    case "/dashboard/boss-rotation":
      run(`boss_rotation_v2:${guildId}`, async () => {
        const r = await dashboardApi.getBossRotation(guildId);
        return r.success && r.data ? r.data : null;
      }, 15000);
      run(`boss_schedules:${guildId}`, async () => {
        const r = await dashboardApi.getBossSchedules(guildId);
        return r.success && r.data?.schedules ? r.data.schedules : [];
      }, 15000);
      break;

    case "/dashboard/boss-schedule":
      run(`guild_activities:${guildId}`, async () => {
        const r = await activityApi.list(guildId);
        return r.success && r.data ? r.data : { activities: [] };
      }, 10000);
      break;

    case "/dashboard/boss-attendance":
      run(`boss_schedules:${guildId}`, async () => {
        const r = await dashboardApi.getBossSchedules(guildId);
        return r.success && r.data?.schedules ? r.data.schedules : [];
      }, 15000);
      run(`attendance_stats:${guildId}`, async () => {
        const r = await dashboardApi.getAttendanceStats(guildId);
        return r.success && r.data ? r.data : null;
      }, 30000);
      run(`attendance_sessions:${guildId}`, async () => {
        const r = await dashboardApi.listAttendanceSessions(guildId);
        return r.success && r.data ? r.data : [];
      }, 20000);
      break;

    case "/dashboard/members":
    case "/dashboard/audit":
      run(`guild_members:${guildId}`, async () => {
        const r = await guildApi.getMembers(guildId);
        return r.success && r.data?.members ? r.data.members : [];
      }, 30000);
      break;

    case "/dashboard/guild-market":
      run(`guild_settings:${guildId}`, async () => {
        const r = await guildApi.getSettings(guildId);
        return r.success ? r.data : null;
      }, 300000);
      run(`boss_schedules:${guildId}`, async () => {
        const r = await dashboardApi.getBossSchedules(guildId);
        return r.success && r.data?.schedules ? r.data.schedules : [];
      }, 15000);
      run(`loot_sales:${guildId}`, async () => {
        const r = await dashboardApi.getLootSales(guildId);
        return r.success && r.data?.sales ? r.data.sales : [];
      }, 30000);
      break;

    case "/dashboard/guild-settings":
      run(`guild_settings:${guildId}`, async () => {
        const r = await guildApi.getSettings(guildId);
        return r.success ? r.data : null;
      }, 300000);
      break;

    default:
      break;
  }
}

/**
 * Every sidebar destination `prefetchForRoute` knows how to warm. Kept as an
 * explicit list (rather than derived from Sidebar's navGroups) so this module
 * has no dependency on a component file.
 */
const ALL_PREFETCHABLE_ROUTES = [
  "/dashboard",
  "/dashboard/statistics",
  "/dashboard/faction",
  "/dashboard/equipment",
  "/dashboard/boss-rotation",
  "/dashboard/boss-schedule",
  "/dashboard/boss-attendance",
  "/dashboard/members",
  "/dashboard/guild-market",
  "/dashboard/guild-settings",
];

/**
 * Warms every sidebar tab's data in the background right after login/guild
 * switch, so tab switching later hits a warm cache even without a preceding
 * hover/focus (mobile taps, keyboard nav straight to a link, etc.). Requests
 * are staggered one at a time on the idle callback queue instead of firing
 * all at once, so this never competes with the current page's own fetch for
 * bandwidth or DB connections.
 */
export function prefetchAllRoutes(guildId: string | undefined) {
  if (!guildId || typeof window === "undefined") return;

  const schedule = (fn: () => void) => {
    if ("requestIdleCallback" in window) {
      window.requestIdleCallback(fn, { timeout: 2000 });
    } else {
      setTimeout(fn, 300);
    }
  };

  ALL_PREFETCHABLE_ROUTES.forEach((href, i) => {
    setTimeout(() => schedule(() => prefetchForRoute(href, guildId)), i * 150);
  });
}
