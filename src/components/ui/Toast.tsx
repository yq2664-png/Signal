"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { clsx } from "clsx";
import { X } from "lucide-react";

export type ToastTone = "default" | "success" | "error";

type ToastItem = {
  id: string;
  message: string;
  tone: ToastTone;
};

type ToastContextValue = {
  toast: (message: string, tone?: ToastTone) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback((message: string, tone: ToastTone = "default") => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setItems((prev) => [...prev.slice(-3), { id, message, tone }]);
    window.setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id));
    }, 3200);
  }, []);

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] flex flex-col items-center gap-2 p-4"
        aria-live="polite"
      >
        {items.map((item) => (
          <div
            key={item.id}
            className={clsx(
              "pointer-events-auto flex max-w-sm items-start gap-2 rounded-[8px] px-3 py-2.5 text-[13px] shadow-[rgba(0,0,0,0.4)_0px_2px_4px_0px]",
              item.tone === "success" && "bg-[var(--bg-elevated)] text-[var(--text-primary)]",
              item.tone === "error" && "bg-[var(--bg-elevated)] text-[var(--text-body)]",
              item.tone === "default" && "bg-[var(--bg-elevated)] text-[var(--text-body)]"
            )}
            style={{
              boxShadow:
                "rgb(35,37,42) 0px 0px 0px 1px inset, rgba(0,0,0,0.4) 0px 2px 4px 0px",
            }}
          >
            <span className="min-w-0 flex-1 leading-5">{item.message}</span>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => dismiss(item.id)}
              className="shrink-0 rounded-[4px] p-0.5 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
