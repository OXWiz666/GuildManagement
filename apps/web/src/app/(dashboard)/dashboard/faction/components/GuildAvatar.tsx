"use client";

const SIZES = {
  sm: "h-9 w-9 text-[12px] rounded-lg",
  md: "h-11 w-11 text-[14px] rounded-xl",
  lg: "h-14 w-14 text-[18px] rounded-2xl",
} as const;

export default function GuildAvatar({
  name,
  avatarUrl,
  size = "md",
}: {
  name: string;
  avatarUrl?: string | null;
  size?: keyof typeof SIZES;
}) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  return (
    <div
      className={`relative shrink-0 overflow-hidden border border-white/[0.10] bg-gradient-to-br from-primary-500/25 to-accent-500/20 flex items-center justify-center font-semibold text-white/90 ${SIZES[size]}`}
    >
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatarUrl}
          alt={name}
          referrerPolicy="no-referrer"
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <span>{initials}</span>
      )}
    </div>
  );
}
