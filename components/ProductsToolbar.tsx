"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useTransition } from "react";

const ctrlStyle: React.CSSProperties = {
  background: "var(--color-surface)",
  border: "1px solid var(--color-border)",
  borderRadius: 8,
  padding: "6px 10px",
  fontSize: "0.8125rem",
  color: "var(--color-ink)",
  outline: "none",
  boxShadow: "0 1px 2px oklch(0.16 0.01 252 / 0.05)",
  cursor: "pointer",
};

export default function ProductsToolbar() {
  const router = useRouter();
  const params = useSearchParams();
  const [, startTransition] = useTransition();

  const set = useCallback((key: string, val: string) => {
    const p = new URLSearchParams(params.toString());
    if (val) p.set(key, val); else p.delete(key);
    p.delete("page");
    startTransition(() => router.push(`/products?${p.toString()}`));
  }, [params, router]);

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
      {/* Search */}
      <div style={{ position: "relative", flex: 1, minWidth: 180 }}>
        <svg
          style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "var(--color-subtle)" }}
          width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
        >
          <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="search"
          defaultValue={params.get("q") || ""}
          placeholder="Buscar productos..."
          onChange={(e) => set("q", e.target.value)}
          style={{ ...ctrlStyle, paddingLeft: 28, width: "100%" }}
        />
      </div>

      {[
        { key: "status", options: [["", "Estado: todos"], ["synced", "Sincronizado"], ["pending", "Pendiente"], ["error", "Error"]] },
        { key: "promo",  options: [["", "Promo: todas"], ["active", "Activa"], ["scheduled", "Programada"], ["none", "Sin promo"]] },
        { key: "seo",    options: [["", "SEO: todos"], ["missing", "Sin SEO"], ["ok", "Con SEO"]] },
        { key: "desc",   options: [["", "Descripción: todos"], ["missing", "Sin descripción"]] },
      ].map(({ key, options }) => (
        <select
          key={key}
          value={params.get(key) || ""}
          onChange={(e) => set(key, e.target.value)}
          style={ctrlStyle}
        >
          {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      ))}
    </div>
  );
}
