// Build a public Supabase Storage URL for an icon object. The icon buckets are
// public, so no signing is needed. Used where the API hands back raw
// bucket/path pairs (e.g. applicant gear on the officer review screen).

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";

export function publicIconUrl(bucket: string, path: string): string {
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  return `${SUPABASE_URL}/storage/v1/object/public/${encodeURIComponent(bucket)}/${encoded}`;
}
