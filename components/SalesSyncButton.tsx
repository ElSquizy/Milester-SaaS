"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";

/** Incremental sales sync: auto-runs on mount (throttled) + manual refresh. */
export default function SalesSyncButton() {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [result, setResult] = useState<{ created: number; updated: number } | null>(null);
  const didAuto = useRef(false);

  const sync = useCallback(async (force: boolean) => {
    setSyncing(true);
    setResult(null);
    try {
      const res = await fetch("/api/sales/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force }),
      });
      const data = await res.json();
      if (data.skipped) {
        if (data.lastSyncAt) setLastSync(new Date(data.lastSyncAt));
      } else if (!data.error) {
        setLastSync(new Date(data.lastSyncAt || Date.now()));
        if (data.created + data.updated > 0) {
          setResult({ created: data.created, updated: data.updated });
          router.refresh();
          setTimeout(() => setResult(null), 4000);
        }
      }
    } finally {
      setSyncing(false);
    }
  }, [router]);

  // Auto-sync once when the view opens (throttled server-side).
  useEffect(() => {
    if (didAuto.current) return;
    didAuto.current = true;
    sync(false);
  }, [sync]);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      {result && (
        <span style={{ fontSize: "0.8125rem", color: "var(--color-success)", fontWeight: 500, whiteSpace: "nowrap" }}>
          {result.created > 0 && `+${result.created} ${result.created === 1 ? "nueva" : "nuevas"}`}
          {result.created > 0 && result.updated > 0 && " · "}
          {result.updated > 0 && `${result.updated} actualizada${result.updated === 1 ? "" : "s"}`}
        </span>
      )}
      {!result && lastSync && !syncing && (
        <span style={{ fontSize: "0.75rem", color: "var(--color-subtle)", whiteSpace: "nowrap" }}>
          Actualizado {relTime(lastSync)}
        </span>
      )}
      <button
        onClick={() => sync(true)}
        disabled={syncing}
        style={{
          display: "inline-flex", alignItems: "center", gap: 7,
          padding: "7px 14px", borderRadius: 8, border: "1px solid var(--color-border)",
          background: "var(--color-surface)", color: "var(--color-ink)",
          fontSize: "0.8125rem", fontWeight: 500, cursor: syncing ? "default" : "pointer", whiteSpace: "nowrap",
        }}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" className={syncing ? "anim-spin" : undefined}>
          <path d="M21 2v6h-6" /><path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M3 22v-6h6" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
        </svg>
        {syncing ? "Actualizando..." : "Actualizar"}
      </button>
    </div>
  );
}

function relTime(d: Date) {
  const secs = Math.floor((Date.now() - d.getTime()) / 1000);
  if (secs < 60) return "recién";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `hace ${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours}h`;
  return d.toLocaleDateString("es-AR", { day: "numeric", month: "short" });
}
