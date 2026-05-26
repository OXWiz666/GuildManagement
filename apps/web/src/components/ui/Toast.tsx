"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

type ToastType = "success" | "error" | "info" | "warning";

interface Toast {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
}

interface ToastContextType {
  toasts: Toast[];
  addToast: (type: ToastType, message: string, duration?: number) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    (type: ToastType, message: string, duration = 4000) => {
      const id = crypto.randomUUID();
      setToasts((prev) => [...prev, { id, type, message, duration }]);
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

  return (
    <div
      className={`
        ${style.bg} ${style.border}
        glass-strong rounded-xl border px-4 py-3 flex items-start gap-3
        animate-slide-up shadow-xl
      `}
    >
      <span className={`${style.icon} text-lg mt-0.5 shrink-0`}>{icons[toast.type]}</span>
      <p className="text-sm text-gray-200 flex-1">{toast.message}</p>
      <button
        onClick={onClose}
        className="text-gray-500 hover:text-gray-300 transition-colors shrink-0 mt-0.5"
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
