"use client";

import Button from "@/components/ui/Button";

export default function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="card-obsidian rounded-2xl p-8 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10 border border-red-500/20">
        <svg className="h-6 w-6 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="13" />
          <line x1="12" y1="16.5" x2="12" y2="16.5" />
        </svg>
      </div>
      <h3 className="text-base font-semibold text-white">Scan failed</h3>
      <p className="mx-auto mt-1.5 max-w-md text-sm text-white/50 leading-relaxed">{message}</p>
      <div className="mt-5">
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Try another screenshot
        </Button>
      </div>
    </div>
  );
}
