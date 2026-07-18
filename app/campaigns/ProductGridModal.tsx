"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import type { PickedProduct } from "./CampaignExtras";
import { useIsMobile } from "@/components/useIsMobile";

type GridProduct = { id: number; name: string; sku: string | null; price: number; promotionalPrice: number | null; imageUrl: string | null; categoryName: string | null };

/**
 * Centric grid modal for selecting products (like the catalog's hybrid modal).
 * Search + paginated grid of tiles with checkbox selection. Robust selection via a Map.
 */
export default function ProductGridModal({ initial, categories, onConfirm, onClose, allowEmpty, confirmLabel, title }: {
  initial: PickedProduct[];
  categories: string[];
  onConfirm: (picked: PickedProduct[]) => void;
  onClose: () => void;
  allowEmpty?: boolean;
  confirmLabel?: string;
  title?: string;
}) {
  const isMobile = useIsMobile();
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [products, setProducts] = useState<GridProduct[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState<Map<number, PickedProduct>>(new Map(initial.map((p) => [p.id, p])));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchPage = useCallback((pg: number, append: boolean) => {
    setLoading(true);
    const url = `/api/products/search?q=${encodeURIComponent(q)}&category=${encodeURIComponent(category)}&page=${pg}`;
    fetch(url).then((r) => r.json()).then((d) => {
      setProducts((prev) => append ? [...prev, ...d.products] : d.products);
      setTotal(d.total);
      setHasMore(d.hasMore);
      setPage(pg);
    }).finally(() => setLoading(false));
  }, [q, category]);

  // Debounced reset on query/category change.
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => fetchPage(1, false), 250);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [fetchPage]);

  function toggle(p: GridProduct) {
    setSel((prev) => {
      const next = new Map(prev);
      if (next.has(p.id)) next.delete(p.id);
      else next.set(p.id, { id: p.id, name: p.name, imageUrl: p.imageUrl, price: p.price });
      return next;
    });
  }

  return (
    <div
      onClick={onClose}
      className="anim-in"
      style={{
        position: "fixed", inset: 0, zIndex: isMobile ? 420 : 60,
        background: "rgba(17,24,39,0.40)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)",
        display: "flex", alignItems: "flex-start", justifyContent: "center", padding: isMobile ? 0 : "40px 24px",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="anim-modal"
        style={{
          width: "100%", maxWidth: isMobile ? "none" : 900, height: isMobile ? "100dvh" : "calc(100dvh - 80px)",
          background: "var(--color-surface)", borderRadius: isMobile ? 0 : "var(--radius-modal)",
          boxShadow: "var(--shadow-float)", display: "flex", flexDirection: "column", overflow: "hidden",
        }}
      >
        {/* Header + filters */}
        <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--color-divider)", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: "1.125rem", fontWeight: 600, letterSpacing: "-0.02em" }}>{title || "Seleccionar productos"}</div>
              <div style={{ fontSize: "0.75rem", color: "var(--color-subtle)", marginTop: 1 }}>
                {sel.size} seleccionados · {total.toLocaleString("es-AR")} productos
              </div>
            </div>
            <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 9, border: "none", background: "var(--color-surface-2)", cursor: "pointer", color: "var(--color-muted)" }}>✕</button>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre o SKU..." style={{ flex: 1 }} />
            <select className="input" value={category} onChange={(e) => setCategory(e.target.value)} style={{ width: 200 }}>
              <option value="">Todas las colecciones</option>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>

        {/* Grid */}
        <div style={{ flex: 1, overflowY: "auto", padding: "18px 24px" }}>
          {products.length === 0 && !loading ? (
            <div style={{ padding: "48px", textAlign: "center", color: "var(--color-subtle)", fontSize: "0.875rem" }}>Sin resultados</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12 }}>
              {products.map((p) => {
                const on = sel.has(p.id);
                return (
                  <button
                    key={p.id}
                    onClick={() => toggle(p)}
                    style={{
                      textAlign: "left", cursor: "pointer", padding: 0, overflow: "hidden",
                      background: "var(--color-surface)",
                      border: `2px solid ${on ? "var(--color-brand)" : "var(--color-border)"}`,
                      borderRadius: 14,
                      boxShadow: on ? "0 0 0 3px var(--color-brand-ring)" : "var(--shadow-card)",
                      transition: "border-color 0.12s, box-shadow 0.12s",
                    }}
                  >
                    <div style={{ position: "relative", aspectRatio: "1", background: "var(--color-surface-2)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                      {p.imageUrl
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={p.imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        : <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--color-faint)" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>}
                      <span style={{
                        position: "absolute", top: 8, right: 8, width: 22, height: 22, borderRadius: 7,
                        border: `1.5px solid ${on ? "var(--color-brand)" : "rgba(255,255,255,0.9)"}`,
                        background: on ? "var(--color-brand)" : "rgba(255,255,255,0.85)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        color: "#fff", fontSize: "0.75rem", fontWeight: 700, boxShadow: "0 1px 2px rgba(0,0,0,0.15)",
                      }}>{on ? "✓" : ""}</span>
                    </div>
                    <div style={{ padding: "9px 11px" }}>
                      <div style={{ fontSize: "0.8125rem", fontWeight: 500, color: "var(--color-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
                      <div style={{ fontSize: "0.75rem", color: "var(--color-subtle)", fontVariantNumeric: "tabular-nums", marginTop: 2 }}>
                        ${p.price.toLocaleString("es-AR")}
                        {p.promotionalPrice != null && <span style={{ color: "var(--color-success)", fontWeight: 600 }}> · oferta ${p.promotionalPrice.toLocaleString("es-AR")}</span>}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
          {hasMore && (
            <div style={{ textAlign: "center", marginTop: 18 }}>
              <button className="btn-secondary" onClick={() => fetchPage(page + 1, true)} disabled={loading}>
                {loading ? "Cargando..." : "Cargar más"}
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: "16px 24px", borderTop: "1px solid var(--color-divider)", flexShrink: 0, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ flex: 1, fontSize: "0.875rem", color: "var(--color-muted)", fontWeight: 500 }}>{sel.size} productos seleccionados</span>
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" onClick={() => onConfirm([...sel.values()])} disabled={!allowEmpty && sel.size === 0}>
            {confirmLabel || "Confirmar selección"}
          </button>
        </div>
      </div>
    </div>
  );
}
