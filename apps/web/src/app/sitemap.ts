import type { MetadataRoute } from "next";

const SITE_URL = "https://forgekeep.io";

// Only genuinely public, indexable marketing/auth pages — dashboard/admin
// routes require auth and are excluded via robots.ts.
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  return [
    { url: SITE_URL, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/register`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/login`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ];
}
