"use client";

import RouteErrorFallback from "@/components/dashboard/RouteErrorFallback";

export default function BossRotationError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteErrorFallback error={error} reset={reset} label="Boss Rotation" />;
}
