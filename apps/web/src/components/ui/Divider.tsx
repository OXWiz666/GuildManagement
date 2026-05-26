interface DividerProps {
  label?: string;
  className?: string;
}

export function Divider({ label, className = "" }: DividerProps) {
  if (label) {
    return (
      <div className={`flex items-center gap-4 ${className}`}>
        <div className="flex-1 h-px bg-white/8" />
        <span className="text-xs text-gray-500 font-medium uppercase tracking-widest shrink-0">
          {label}
        </span>
        <div className="flex-1 h-px bg-white/8" />
      </div>
    );
  }
  return <div className={`h-px bg-white/8 ${className}`} />;
}

export function VDivider({ className = "" }: { className?: string }) {
  return <div className={`w-px self-stretch bg-white/8 ${className}`} />;
}
