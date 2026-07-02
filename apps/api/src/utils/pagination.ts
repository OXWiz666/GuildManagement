/**
 * Cursor-based pagination helpers.
 *
 * Offset pagination (`skip`/`take`) degrades on large, fast-changing tables —
 * the database still scans and discards every skipped row, and concurrent
 * inserts shift rows between pages. Cursor pagination instead "seeks" from the
 * last-seen id, giving stable, index-friendly O(limit) reads regardless of how
 * deep the client paginates.
 *
 * Intended for append-mostly tables: audit logs, attendance history, inventory
 * / loot logs, guild-market requests, boss kill history.
 */

export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

export interface CursorParams {
  /** Opaque cursor — the `id` of the last item from the previous page. */
  cursor?: string | undefined;
  /** Page size, clamped to [1, MAX_PAGE_SIZE]. */
  limit?: number | string | undefined;
}

export interface CursorPage<T> {
  items: T[];
  /** Cursor to pass back for the next page, or null when exhausted. */
  nextCursor: string | null;
  hasMore: boolean;
}

/** Normalize/clamp an incoming limit (query strings welcome). */
export function resolveLimit(limit?: number | string): number {
  const n = typeof limit === "string" ? parseInt(limit, 10) : limit;
  if (!n || Number.isNaN(n) || n < 1) return DEFAULT_PAGE_SIZE;
  return Math.min(n, MAX_PAGE_SIZE);
}

/**
 * Build the Prisma args fragment for a cursor query. Fetches `limit + 1` rows
 * to detect whether another page exists without a separate COUNT.
 *
 * Usage:
 *   const args = buildCursorArgs(params);
 *   const rows = await prisma.auditLog.findMany({ where, orderBy: { id: "desc" }, ...args });
 *   return toCursorPage(rows, args.take, (r) => r.id);
 */
export function buildCursorArgs(params: CursorParams): {
  take: number;
  skip?: number;
  cursor?: { id: string };
} {
  const take = resolveLimit(params.limit);
  if (params.cursor) {
    return { take: take + 1, skip: 1, cursor: { id: params.cursor } };
  }
  return { take: take + 1 };
}

/**
 * Trim the `limit + 1` probe row and derive the next cursor. `take` is the
 * value returned by buildCursorArgs (already `limit + 1`).
 */
export function toCursorPage<T>(
  rows: T[],
  takePlusOne: number,
  getId: (row: T) => string,
): CursorPage<T> {
  const limit = takePlusOne - 1;
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items[items.length - 1];
  return {
    items,
    hasMore,
    nextCursor: hasMore && last ? getId(last) : null,
  };
}
