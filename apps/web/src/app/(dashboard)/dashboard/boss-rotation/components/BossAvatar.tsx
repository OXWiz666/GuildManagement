export default function BossAvatar({ src, name }: { src: string; name: string }) {
  return (
    <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg border border-white/[0.08] bg-zinc-950">
      <img
        src={src}
        alt={name}
        className="h-full w-full object-cover"
        loading="lazy"
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/35 to-transparent" />
    </div>
  );
}
