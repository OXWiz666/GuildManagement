import type { MetadataRoute } from "next";

const SITE_URL = "https://forgekeep.vercel.app";

// Everything under the dashboard/admin route groups requires auth and has no
// SEO value — crawling it just wastes budget and risks indexing member data.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/dashboard", "/admin", "/api"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
