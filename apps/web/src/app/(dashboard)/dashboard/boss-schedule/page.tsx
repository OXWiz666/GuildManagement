"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Guild Activities moved into Boss Rotation as its "Activities" tab — this
 * route just forwards old links/bookmarks there instead of 404ing.
 */
export default function GuildActivitiesRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/dashboard/boss-rotation");
  }, [router]);

  return null;
}
