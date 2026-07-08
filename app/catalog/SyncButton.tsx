"use client";
import { useState, useRef } from "react";
import { useRouter } from "next/navigation";

interface Props {
  pendingCount: number;
}

type Phase = "idle" | "running" | "done";

export default function SyncButton({ pendingCount }: Props) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [done, setDone] = useState(0);
  const [errors, setErrors] = useState(0);
  const [total, setTotal] = useState(pendingCount);
  const [current, setCurrent] = useState("");
  const esRef = useRef<EventSource | null>(null);

  function startSync() {
    if (phase === "running" || pendingCount === 0) return;
    setPhase("running");
    setDone(0);
    setErrors(0);
    setTotal(pendingCount);
    setCurrent("");

    const es = new EventSource("/api/sync");
    esRef.current = es;

    es.onmessage = (e) => {
      const data = JSON.parse(e.data);
      switch (data.status) {
        case "start":
          setTotal(data.total);
          break;
        case "syncing":
          setCurrent(data.name);
          break;
        case "progress":
          setDone(data.done);
          setErrors(data.errors);
          break;
        case "done":
          setDone(data.done);
          setErrors(data.errors);
          setPhase("done");
          es.close();
          setTimeout(() => {
            setPhase("idle");
            router.refresh();
          }, 1600);
          break;
        case "error":
          setCurrent(data.message || "Error");
          setPhase("done");
          es.close();
          setTimeout(() => { setPhase("idle"); router.refresh(); }, 2200);
          break;
      }
    };

    es.onerror = () => {
      es.close();
      setPhase("idle");
      router.refresh();
    };
  }

  if (pendingCount === 0 && phase === "idle") {
    return (
      <span className="pill pill-success" style={{ padding: "6px 12px" }}>
        <span className="pill-dot" />
        Todo sincronizado
      </span>
    );
  }

  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      {phase === "running" && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 180 }}>
          <div style={{ flex: 1, height: 5, background: "var(--color-surface-2)", borderRadius: 999, border: "1px solid var(--color-border)", overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${pct}%`, background: "var(--color-brand)", borderRadius: 999, transition: "width 0.2s" }} />
          </div>
          <span style={{ fontSize: "0.75rem", color: "var(--color-subtle)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
            {done}/{total}
          </span>
        </div>
      )}

      {phase === "done" && (
        <span style={{ fontSize: "0.8125rem", color: errors > 0 ? "var(--color-warning)" : "var(--color-success)", fontWeight: 500, whiteSpace: "nowrap" }}>
          {errors > 0 ? `✓ ${done} ok · ${errors} con error` : `✓ ${done} sincronizados`}
        </span>
      )}

      {phase === "idle" && pendingCount > 0 && (
        <button className="btn-primary" onClick={startSync} style={{ padding: "8px 14px", fontSize: "0.8125rem", whiteSpace: "nowrap" }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 2v6h-6" /><path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
            <path d="M3 22v-6h6" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
          </svg>
          Sincronizar {pendingCount} {pendingCount === 1 ? "cambio" : "cambios"}
        </button>
      )}
    </div>
  );
}
