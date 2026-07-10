import type { NextRequest } from "next/server";
import { services } from "@guild/core";
import { withApi, ok } from "@/server/respond";
import { requirePlatformAdmin } from "@/server/guards";

export const runtime = "nodejs";

// Returns the caller's platform-admin profile. 403 if they are not a platform admin —
// the admin shell uses this to gate access to the Super Admin area.
export const GET = withApi(async (req: NextRequest) => {
  const { admin } = await requirePlatformAdmin(req);
  return ok({ platformAdmin: services.platform.toPlatformAdminPublic(admin) });
});
