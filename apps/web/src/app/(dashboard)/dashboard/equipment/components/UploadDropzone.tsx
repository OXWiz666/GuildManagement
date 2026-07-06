"use client";

import { useRef, useState } from "react";

export default function UploadDropzone({
  onFile,
  disabled,
}: {
  onFile: (file: File) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const pick = (files: FileList | null) => {
    const file = files?.[0];
    if (file && file.type.startsWith("image/")) onFile(file);
  };

  return (
    <div
      onClick={() => !disabled && inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        if (!disabled) pick(e.dataTransfer.files);
      }}
      className={`group relative flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-12 text-center transition-all
        ${dragOver ? "border-[var(--forge-gold)]/60 bg-[var(--forge-gold)]/[0.04]" : "border-white/[0.12] hover:border-white/25 hover:bg-white/[0.02]"}
        ${disabled ? "pointer-events-none opacity-50" : ""}`}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => pick(e.target.files)}
      />
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/[0.08] bg-[var(--forge-glow)] transition-transform group-hover:scale-105">
        <svg className="h-7 w-7 text-[var(--forge-gold)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
      </div>
      <p className="text-sm font-semibold text-white">
        Drop a screenshot with your gear or Combat Power
      </p>
      <p className="mt-1 text-xs text-white/45">
        or <span className="text-[var(--forge-gold)]">browse files</span> · PNG, JPG or WebP · up to 10MB
      </p>
      <p className="mt-2 max-w-xs text-[11px] leading-relaxed text-white/30">
        One scan reads both: the Equipment panel for gear icons and the &quot;Combat Power&quot; value for your CP.
      </p>
    </div>
  );
}
