"use client";

import Button from "./Button";

export interface ConfirmModalProps {
  show: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isDanger?: boolean;
  isSubmitting?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmModal({
  show,
  title,
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  isDanger = false,
  isSubmitting = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  if (!show) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Blurred Backdrop overlay */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-md transition-opacity duration-300 animate-fade-in"
        onClick={() => !isSubmitting && onCancel()}
      />

      {/* Modern Glassmorphic Container with spring animation */}
      <div className="relative glass-strong max-w-md w-full rounded-3xl p-6 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.8)] border border-white/[0.08] animate-scale-in z-50 overflow-hidden text-left flex flex-col gap-5">
        {/* Subtle decorative glow wash on top */}
        <div
          aria-hidden
          className={`absolute top-0 inset-x-0 h-24 pointer-events-none rounded-t-3xl ${
            isDanger
              ? "bg-gradient-to-b from-rose-500/[0.06] to-transparent"
              : "bg-gradient-to-b from-amber-500/[0.06] to-transparent"
          }`}
        />

        {/* Modal Content Header & Icon */}
        <div className="flex gap-4 items-start relative z-10">
          <div
            className={`h-11 w-11 rounded-2xl flex items-center justify-center shrink-0 border shadow-inner ${
              isDanger
                ? "bg-rose-500/10 border-rose-500/20 text-rose-400"
                : "bg-amber-500/10 border-amber-500/20 text-amber-400"
            }`}
          >
            {isDanger ? (
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            ) : (
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            )}
          </div>

          <div className="space-y-1.5 min-w-0">
            <h3 className="text-base font-extrabold text-white uppercase tracking-wider leading-none">
              {title}
            </h3>
            <p className="text-xs text-white/50 leading-relaxed">
              {message}
            </p>
          </div>
        </div>

        {/* Modal Buttons */}
        <div className="flex gap-3 justify-end relative z-10 border-t border-white/[0.06] pt-4 mt-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={onCancel}
            disabled={isSubmitting}
            className="text-xs tracking-wider uppercase font-bold text-white/60 hover:text-white"
          >
            {cancelText}
          </Button>
          <Button
            variant={isDanger ? "danger" : "primary"}
            size="sm"
            onClick={onConfirm}
            isLoading={isSubmitting}
            className="text-xs tracking-wider uppercase font-bold shrink-0 min-w-[90px]"
          >
            {confirmText}
          </Button>
        </div>
      </div>
    </div>
  );
}
