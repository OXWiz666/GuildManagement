"use client";

import { useState, useEffect } from "react";

interface AvatarProps {
  src?: string | null;
  name: string;
  size?: "sm" | "md" | "lg" | "xl";
  showStatus?: boolean;
  isOnline?: boolean;
  className?: string;
}

const sizeMap = {
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-12 w-12 text-base",
  xl: "h-16 w-16 text-lg",
};

const statusSizeMap = {
  sm: "h-2.5 w-2.5 -bottom-0 -right-0",
  md: "h-3 w-3 -bottom-0.5 -right-0.5",
  lg: "h-3.5 w-3.5 -bottom-0.5 -right-0.5",
  xl: "h-4 w-4 -bottom-0.5 -right-0.5",
};

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

// Deterministic gradient from name — monochrome with cool tints
function getGradient(name: string): string {
  const gradients = [
    "from-white/20 to-white/[0.06]",
    "from-white/[0.18] to-white/[0.04]",
    "from-white/[0.22] to-white/[0.06]",
    "from-white/[0.16] to-white/[0.04]",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return gradients[Math.abs(hash) % gradients.length]!;
}

// Normalize the URL — trims whitespace; accepts only http(s)/data/protocol-relative
function sanitizeUrl(src?: string | null): string | null {
  if (!src) return null;
  const trimmed = src.trim();
  if (!trimmed) return null;
  if (
    /^https?:\/\//i.test(trimmed) ||
    /^data:image\//i.test(trimmed) ||
    /^\/\//.test(trimmed) ||
    trimmed.startsWith("/")
  ) {
    return trimmed;
  }
  return null;
}

export default function Avatar({
  src,
  name,
  size = "md",
  showStatus = false,
  isOnline = false,
  className = "",
}: AvatarProps) {
  const normalized = sanitizeUrl(src);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Reset failure state when src changes (so retyping the URL gives a fresh try)
  useEffect(() => {
    setFailed(false);
    setLoaded(false);
  }, [normalized]);

  const showImage = normalized && !failed;

  return (
    <div className={`relative inline-flex shrink-0 ${className}`}>
      <div
        className={`${sizeMap[size]} relative rounded-full overflow-hidden ring-1 ring-white/10 bg-gradient-to-br ${getGradient(
          name,
        )}`}
      >
        {/* Initials fallback layer — always present underneath */}
        <div className="absolute inset-0 flex items-center justify-center font-semibold text-white/90 select-none">
          {getInitials(name)}
        </div>

        {/* Image layer */}
        {showImage && (
          <img
            src={normalized}
            alt={name}
            referrerPolicy="no-referrer"
            loading="lazy"
            decoding="async"
            onLoad={() => setLoaded(true)}
            onError={() => setFailed(true)}
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ${
              loaded ? "opacity-100" : "opacity-0"
            }`}
          />
        )}
      </div>

      {showStatus && (
        <span
          className={`absolute ${statusSizeMap[size]} block rounded-full ring-2 ring-[#08080a] ${
            isOnline
              ? "bg-emerald-400 shadow-[0_0_6px_1px_rgba(52,211,153,0.5)]"
              : "bg-white/30"
          }`}
        />
      )}
    </div>
  );
}
