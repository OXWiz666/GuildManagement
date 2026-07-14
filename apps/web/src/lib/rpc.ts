import { hc } from "hono/client";
import type { ApiResponse } from "@guild/shared";
import type { MarketType } from "@/server/hono/app";
import { getAccessToken, refreshAccessToken, type StorageItemData } from "./api";

/**
 * Type-safe RPC client for the Hono API (migration pilot). Built per-domain so
 * Hono RPC's recursive path types stay cheap at large route counts. During the
 * migration it targets the temporary `/api2` mount; it will move to `/api` once
 * every domain is ported.
 *
 * Auth mirrors lib/api.ts exactly: the in-memory access token is sent as a
 * Bearer header (the same JWT works on both mounts), cookies ride along for the
 * refresh token, and a 401 triggers a single refresh-and-retry.
 */
const RPC_BASE = process.env.NEXT_PUBLIC_API_URL || "/api";

/** fetch wrapper: inject Bearer + credentials, refresh once on 401. */
const authedFetch: typeof fetch = async (input, init) => {
  const build = (): RequestInit => {
    const headers = new Headers(init?.headers);
    const token = getAccessToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
    return { ...init, headers, credentials: "include" };
  };

  let res = await fetch(input, build());
  if (res.status === 401) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      res = await fetch(input, build());
    }
  }
  return res;
};

/** Market domain RPC client. Paths are relative to `/api2/market`. */
export const marketClient = hc<MarketType>(`${RPC_BASE}/market`, {
  fetch: authedFetch,
});

/**
 * Thin, drop-in wrappers that return the same `{ success, data }` envelope the
 * existing `marketApi.*` methods return, so callers/`useQuery` fetchers only
 * swap the import. One method per migrated endpoint is added as pages are wired.
 */
export const marketRpc = {
  async getStorage(
    guildId: string,
  ): Promise<ApiResponse<{ storage: StorageItemData[]; listed: StorageItemData[]; canManage: boolean }>> {
    const res = await marketClient[":guildId"].storage.$get({ param: { guildId } });
    // RPC infers the true service type (e.g. `status: string`); we re-assert the
    // established frontend contract at the boundary, exactly as the previous
    // `api.get<...>()` generic did. Reconciling @guild/shared item types with
    // the service return types is a follow-up for the full migration.
    return (await res.json()) as ApiResponse<{
      storage: StorageItemData[];
      listed: StorageItemData[];
      canManage: boolean;
    }>;
  },
};
