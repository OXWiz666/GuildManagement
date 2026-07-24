export default function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-72 rounded-xl bg-white/[0.015] border border-white/[0.05] p-8 text-center">
      <svg className="h-10 w-10 text-white/20 mb-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 8v4" />
        <path d="M12 16h.01" />
      </svg>
      <h3 className="text-sm font-semibold text-white/80">{title}</h3>
      <p className="text-xs text-white/45 mt-1 max-w-sm">{body}</p>
    </div>
  );
}
