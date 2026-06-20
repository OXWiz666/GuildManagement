"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

type ToastType = "success" | "error" | "info" | "warning";

export interface ToastAction {
  label: string;
  onClick: () => void | Promise<void>;
  variant?: "danger" | "primary" | "ghost";
}

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
  action?: ToastAction;
}

interface ToastContextType {
  toasts: Toast[];
  addToast: (type: ToastType, message: string, duration?: number, action?: ToastAction) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    (type: ToastType, message: string, duration = 4000, action?: ToastAction) => {
      const id = crypto.randomUUID();
      setToasts((prev) => [...prev, { id, type, message, duration, action }]);
      if (duration > 0) {
        setTimeout(() => removeToast(id), duration);
      }
    },
    [removeToast],
  );

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used within ToastProvider");
  return context;
}

// ─── Toast Container ────────────────────────────
function ToastContainer({
  toasts,
  removeToast,
}: {
  toasts: Toast[];
  removeToast: (id: string) => void;
}) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3 max-w-sm">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onClose={() => removeToast(toast.id)} />
      ))}
    </div>
  );
}

const typeStyles: Record<ToastType, { bg: string; icon: string; border: string }> = {
  success: {
    bg: "bg-emerald-500/10",
    icon: "text-emerald-400",
    border: "border-emerald-500/20",
  },
  error: {
    bg: "bg-red-500/10",
    icon: "text-red-400",
    border: "border-red-500/20",
  },
  info: {
    bg: "bg-blue-500/10",
    icon: "text-blue-400",
    border: "border-blue-500/20",
  },
  warning: {
    bg: "bg-amber-500/10",
    icon: "text-amber-400",
    border: "border-amber-500/20",
  },
};

const icons: Record<ToastType, string> = {
  success: "✓",
  error: "✕",
  info: "ℹ",
  warning: "⚠",
};

function ToastItem({
  toast,
  onClose,
}: {
  toast: Toast;
  onClose: () => void;
}) {
  const style = typeStyles[toast.type];
  const [isExecuting, setIsExecuting] = useState(false);

  return (
    <div
      className={`
        ${style.bg} ${style.border}
        glass-strong rounded-xl border px-4 py-3 flex items-start gap-3
        animate-slide-up shadow-xl min-w-[320px] max-w-sm
      `}
    >
      <span className={`${style.icon} text-lg mt-0.5 shrink-0`}>{icons[toast.type]}</span>
      <div className="flex-1 flex flex-col gap-2 min-w-0">
        <p className="text-sm text-gray-200 leading-snug">{toast.message}</p>
        {toast.action && (
          <div className="flex items-center gap-2 mt-1 select-none">
            <button
              disabled={isExecuting}
              onClick={async (e) => {
                e.stopPropagation();
                setIsExecuting(true);
                try {
                  await toast.action!.onClick();
                } finally {
                  setIsExecuting(false);
                  onClose();
                }
              }}
              className={`
                px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider rounded-lg border transition-all cursor-pointer disabled:opacity-50
                ${
                  toast.action.variant === "danger"
                    ? "bg-red-500/15 hover:bg-red-500/25 text-red-400 border-red-500/30"
                    : "bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 border-amber-500/30"
                }
              `}
            >
              {isExecuting ? (
                <span className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 border border-current border-t-transparent rounded-full animate-spin shrink-0" />
                  Processing...
                </span>
              ) : (
                toast.action.label
              )}
            </button>
            <button
              disabled={isExecuting}
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              className="px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider rounded-lg border border-white/5 bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-all cursor-pointer"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
      <button
        onClick={onClose}
        disabled={isExecuting}
        className="text-gray-500 hover:text-gray-300 transition-colors shrink-0 mt-0.5 disabled:opacity-50"
      >
        <svg
          className="h-4 w-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
