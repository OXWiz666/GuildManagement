"use client";

import RouteErrorFallback from "@/components/dashboard/RouteErrorFallback";

export default function MembersError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteErrorFallback error={error} reset={reset} label="Members" />;
}
