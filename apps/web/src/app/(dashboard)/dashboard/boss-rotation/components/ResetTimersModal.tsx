import Button from "@/components/ui/Button";

export default function ResetTimersModal({
  isOpen,
  isResetting,
  onConfirm,
  onClose,
}: {
  isOpen: boolean;
  isResetting: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in"
        onClick={() => !isResetting && onClose()}
      />
      <div className="relative w-full max-w-md mx-4 animate-scale-in">
        <div className="rounded-2xl bg-[#0c0c10] border border-white/[0.08] shadow-2xl shadow-black/60 overflow-hidden">
          <div className="relative px-6 pt-6 pb-4">
            <div
              className="absolute inset-x-0 top-0 h-32 pointer-events-none"
              style={{ background: "linear-gradient(180deg, rgba(16,185,129,0.08) 0%, transparent 100%)" }}
            />
            <div className="relative flex items-start gap-4">
              <div className="shrink-0 h-11 w-11 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                <svg className="h-5 w-5 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21.5 2v6h-6" />
                  <path d="M2.5 12a10 10 0 0 1 17.17-6.83L21.5 8" />
                  <path d="M2.5 22v-6h6" />
                  <path d="M21.5 12a10 10 0 0 1-17.17 6.83L2.5 16" />
                </svg>
              </div>
              <div>
                <h3 className="text-[16px] font-bold text-white">Reset All Boss Timers</h3>
                <p className="text-[12px] text-white/45 mt-1 leading-relaxed">
                  Restart <span className="text-emerald-400 font-semibold">every boss</span> timer from
                  now. Each boss&apos;s next spawn will be recalculated as if it were just taken at this moment.
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-end gap-3 px-6 py-5 border-t border-white/[0.04]">
            <Button variant="ghost" size="sm" onClick={onClose} disabled={isResetting}>
              Cancel
            </Button>
            <Button variant="accent" size="sm" onClick={onConfirm} isLoading={isResetting}>
              Reset All Timers
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
