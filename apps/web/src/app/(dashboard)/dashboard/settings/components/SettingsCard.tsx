"use client";

import React from "react";

export interface SettingsCardProps {
  eyebrow: string;
  title: string;
  description?: React.ReactNode;
  right?: React.ReactNode;
  children: React.ReactNode;
}

export default function SettingsCard({
  eyebrow,
  title,
  description,
  right,
  children,
}: SettingsCardProps) {
  return (
    <div className="relative glass rounded-2xl p-6 md:p-7 border border-white/[0.06] overflow-hidden">
      <span
        aria-hidden
        className="absolute inset-x-6 top-0 h-px"
        style={{
          background:
            "linear-gradient(90deg, transparent, oklch(1 0 0 / 0.16), transparent)",
        }}
      />
      <div className="flex items-start justify-between gap-4 mb-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] text-white/40 uppercase tracking-[0.22em]">
              {eyebrow}
            </span>
            <span className="h-px w-10 bg-gradient-to-r from-white/15 to-transparent" />
          </div>
          <h2 className="text-[16px] font-semibold text-white tracking-tight">
            {title}
          </h2>
          {description && (
            <p className="text-[12px] text-white/45 mt-1.5 leading-relaxed">
              {description}
            </p>
          )}
        </div>
        {right && <div className="shrink-0">{right}</div>}
      </div>
      {children}
    </div>
  );
}
