"use client";

import RouteErrorFallback from "@/components/dashboard/RouteErrorFallback";

export default function GuildSettingsError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteErrorFallback error={error} reset={reset} label="Guild Settings" />;
}
