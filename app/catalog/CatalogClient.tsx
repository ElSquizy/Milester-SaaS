"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useTransition } from "react";

interface Props {
  initialQ: string;
  initialStatus: string;
  initialCategory: string;
  categories: string[];
}

export default function CatalogClient({ initialQ, initialStatus, initialCategory, categories }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const push = useCallback((key: string, value: string) => {
    const p = new URLSearchParams(params.toString());
    if (value) p.set(key, value);
    else p.delete(key);
    p.delete("page");
    startTransition(() => {
      router.push(`/catalog?${p.toString()}`);
    });
  }, [params, router]);

  const sel: React.CSSProperties = {
    padding: "7px 10px", borderRadius: 7,
    border: "1px solid var(--color-border)",
    background: "var(--color-surface)",
    color: "var(--color-ink)",
    fontSize: "0.875rem", cursor: "pointer", outline: "none",
    minWidth: 140,
    opacity: pending ? 0.6 : 1,
  };

  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
      {/* Search */}
      <div style={{ position: "relative", flex: "1 1 260px", maxWidth: 340 }}>
        <svg
          width="14" height="14" viewBox="0 0 24 24" fill="none"
          stroke="var(--color-subtle)" strokeWidth="2" strokeLinecap="round"
          style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}
        >
          <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="search"
          defaultValue={initialQ}
          placeholder="Buscar productos..."
          onChange={(e) => push("q", e.target.value)}
          style={{
            width: "100%", padding: "7px 10px 7px 32px",
            borderRadius: 7, border: "1px solid var(--color-border)",
            background: "var(--color-surface)", color: "var(--color-ink)",
            fontSize: "0.875rem", outline: "none",
          }}
        />
      </div>

      {/* Status filter */}
      <select
        value={initialStatus}
        onChange={(e) => push("status", e.target.value)}
        style={sel}
      >
        <option value="">Todos los estados</option>
        <option value="synced">Sincronizado</option>
        <option value="pending">Pendiente</option>
        <option value="error">Error</option>
      </select>

      {/* Category filter */}
      {categories.length > 0 && (
        <select
          value={initialCategory}
          onChange={(e) => push("category", e.target.value)}
          style={sel}
        >
          <option value="">Todas las categorías</option>
          {categories.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      )}

      {/* Clear */}
      {(initialQ || initialStatus || initialCategory) && (
        <button
          onClick={() => router.push("/catalog")}
          style={{
            padding: "7px 12px", borderRadius: 7,
            border: "1px solid var(--color-border)",
            background: "transparent", color: "var(--color-muted)",
            fontSize: "0.875rem", cursor: "pointer",
          }}
        >
          Limpiar
        </button>
      )}

      {pending && (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-subtle)" strokeWidth="2.5" strokeLinecap="round" style={{ animation: "spin 0.8s linear infinite" }}>
          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </svg>
      )}
    </div>
  );
}
