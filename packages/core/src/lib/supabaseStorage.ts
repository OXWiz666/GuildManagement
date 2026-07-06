import { env } from "../config/env";

/**
 * Minimal Supabase Storage helpers built on the REST API + the project key.
 *
 * The icon buckets are PUBLIC and READ-ONLY to this feature — we only ever build
 * public URLs to existing objects, never write to them. The object *catalog* is
 * read directly from `storage.objects` via Prisma (see equipment.service), which
 * is more reliable than the Storage list REST endpoint for the publishable key.
 *
 * Writes only ever target the dedicated, separate `EquipmentScreenshots` bucket.
 */

const STORAGE_BASE = `${env.SUPABASE_URL}/storage/v1`;

/** Build a public object URL (bucket must be public). Path segments are URL-encoded. */
export function publicUrl(bucket: string, path: string): string {
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  return `${STORAGE_BASE}/object/public/${encodeURIComponent(bucket)}/${encoded}`;
}

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    apikey: env.SUPABASE_KEY,
    Authorization: `Bearer ${env.SUPABASE_KEY}`,
    ...extra,
  };
}

/**
 * Upload a binary object (used only for the EquipmentScreenshots bucket).
 * Returns true on success. This is best-effort: if the bucket lacks an insert
 * policy for the current key, it resolves false instead of throwing so the
 * core "save equipment" flow is never blocked by screenshot persistence.
 */
export async function uploadObject(
  bucket: string,
  path: string,
  body: Buffer,
  contentType: string,
): Promise<boolean> {
  try {
    // Node's global fetch (undici) accepts a Uint8Array body; init is cast to
    // sidestep DOM-lib `BodyInit` typings (not in scope here).
    const init = {
      method: "POST",
      headers: authHeaders({ "Content-Type": contentType, "x-upsert": "true" }),
      signal: AbortSignal.timeout(15000),
      body: new Uint8Array(body),
    } as unknown as RequestInit;
    const res = await fetch(`${STORAGE_BASE}/object/${encodeURIComponent(bucket)}/${path}`, init);
    if (!res.ok) {
      console.error(`[storage] upload ${bucket}/${path} failed: ${res.status} ${await res.text()}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`[storage] upload ${bucket}/${path} threw:`, err);
    return false;
  }
}

/** Create a short-lived signed URL for a private object (best-effort, null on failure). */
export async function signUrl(bucket: string, path: string, expiresIn: number): Promise<string | null> {
  try {
    const res = await fetch(`${STORAGE_BASE}/object/sign/${encodeURIComponent(bucket)}/${path}`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      signal: AbortSignal.timeout(8000),
      body: JSON.stringify({ expiresIn }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { signedURL?: string };
    return json.signedURL ? `${STORAGE_BASE}${json.signedURL}` : null;
  } catch {
    return null;
  }
}
