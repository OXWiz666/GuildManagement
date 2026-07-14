"use client";

import { useEffect } from "react";
import Button from "@/components/ui/Button";

interface RouteErrorFallbackProps {
  error: Error & { digest?: string };
  reset: () => void;
  label?: string;
}

/**
 * Shared body for per-route error.tsx boundaries. Keeps a section-level
 * render error from taking down the whole dashboard shell (sidebar/topbar
 * stay interactive) and offers a retry that re-renders just this segment.
 */
export default function RouteErrorFallback({ error, reset, label = "this page" }: RouteErrorFallbackProps) {
  useEffect(() => {
    console.error(`[RouteError] ${label}:`, error);
  }, [error, label]);

  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] px-6 py-16 text-center">
      <p className="text-sm font-medium text-zinc-200">Something went wrong loading {label}.</p>
      <p className="max-w-md text-xs text-zinc-500">
        {error.message || "An unexpected error occurred."}
      </p>
      <Button variant="secondary" size="sm" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
