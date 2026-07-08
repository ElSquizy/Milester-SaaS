"use client";
import { createContext, useCallback, useContext, useRef, useState } from "react";

type ToastType = "success" | "error" | "info";
interface ToastItem { id: number; message: string; type: ToastType }

const ToastContext = createContext<(msg: string, type?: ToastType) => void>(() => {});
export function useToast() { return useContext(ToastContext); }

const config: Record<ToastType, { dot: string; bg: string; border: string; color: string }> = {
  success: { dot: "var(--color-success)", bg: "oklch(0.99 0.015 145)", border: "oklch(0.88 0.06 145)", color: "var(--color-ink)" },
  error:   { dot: "var(--color-danger)",  bg: "oklch(0.99 0.015 27)",  border: "oklch(0.88 0.06 27)",  color: "var(--color-ink)" },
  info:    { dot: "var(--color-brand)",   bg: "oklch(0.99 0.015 252)", border: "oklch(0.88 0.05 252)", color: "var(--color-ink)" },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const counter = useRef(0);

  const show = useCallback((message: string, type: ToastType = "success") => {
    const id = ++counter.current;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3500);
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div style={{ position: "fixed", bottom: 16, right: 16, zIndex: 60, display: "flex", flexDirection: "column", gap: 8, pointerEvents: "none" }}>
        {toasts.map((t) => {
          const c = config[t.type];
          return (
            <div
              key={t.id}
              className="animate-slide-up"
              style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "10px 14px", borderRadius: 10,
                background: c.bg, border: `1px solid ${c.border}`,
                boxShadow: "0 4px 20px oklch(0.16 0.01 252 / 0.14), 0 1px 4px oklch(0.16 0.01 252 / 0.08)",
                fontSize: "0.8125rem", color: c.color, fontWeight: 450,
                pointerEvents: "auto", whiteSpace: "nowrap",
              }}
            >
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: c.dot, flexShrink: 0, display: "inline-block" }} />
              {t.message}
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
