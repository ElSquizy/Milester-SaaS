"use client";
import { useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import BulkBar from "./BulkBar";
import { useRouter } from "next/navigation";

interface Promotion { promoPrice: number; endDate: string; active: boolean }
interface Product {
  id: number; name: string; price: number; originalPrice: number;
  imageUrl: string | null; categoryName: string | null; stock: number | null;
  syncStatus: string; tiendaNubeId: string | null; seoTitle: string | null;
  promotion: Promotion | null;
}

const syncMap: Record<string, { label: string; dot: string }> = {
  synced:  { label: "Sync",      dot: "var(--color-success)" },
  pending: { label: "Pendiente", dot: "var(--color-warning)" },
  error:   { label: "Error",     dot: "var(--color-danger)"  },
};

const thStyle: React.CSSProperties = {
  textAlign: "left", padding: "9px 12px",
  fontSize: "0.6875rem", fontWeight: 600,
  color: "var(--color-subtle)",
  textTransform: "uppercase", letterSpacing: "0.05em",
  whiteSpace: "nowrap",
};

export default function ProductsTable({ products }: { products: Product[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<number>>(new Set());

  function toggle(id: number) {
    setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function toggleAll() {
    setSelected(selected.size === products.length ? new Set() : new Set(products.map((p) => p.id)));
  }

  return (
    <>
      <div className="panel" style={{ overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8125rem" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--color-divider)", background: "var(--color-surface-2)" }}>
              <th style={{ ...thStyle, width: 40, paddingLeft: 16, paddingRight: 8 }}>
                <input
                  type="checkbox"
                  checked={selected.size === products.length && products.length > 0}
                  onChange={toggleAll}
                  style={{ accentColor: "var(--color-brand)", cursor: "pointer" }}
                />
              </th>
              <th style={{ ...thStyle, width: 44 }} />
              <th style={thStyle}>Producto</th>
              <th style={thStyle}>Precio</th>
              <th style={thStyle}>Stock</th>
              <th style={thStyle}>Promoción</th>
              <th style={thStyle}>SEO</th>
              <th style={thStyle}>Sync</th>
              <th style={{ ...thStyle, width: 60 }} />
            </tr>
          </thead>
          <tbody>
            {products.map((p, i) => {
              const s = syncMap[p.syncStatus] || { label: p.syncStatus, dot: "var(--color-subtle)" };
              return (
                <tr
                  key={p.id}
                  style={{
                    borderTop: i === 0 ? "none" : "1px solid var(--color-divider)",
                    background: selected.has(p.id) ? "var(--color-brand-dim)" : undefined,
                    transition: "background 0.1s",
                  }}
                  onMouseEnter={(e) => { if (!selected.has(p.id)) (e.currentTarget as HTMLTableRowElement).style.background = "var(--color-surface-2)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = selected.has(p.id) ? "var(--color-brand-dim)" : ""; }}
                >
                  <td style={{ padding: "10px 8px 10px 16px" }}>
                    <input
                      type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)}
                      style={{ accentColor: "var(--color-brand)", cursor: "pointer" }}
                    />
                  </td>
                  <td style={{ padding: "10px 4px" }}>
                    {p.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.imageUrl} alt={p.name}
                        style={{ width: 36, height: 36, objectFit: "cover", borderRadius: 7, border: "1px solid var(--color-divider)", display: "block" }} />
                    ) : (
                      <div style={{
                        width: 36, height: 36, borderRadius: 7,
                        background: "var(--color-surface-2)", border: "1px solid var(--color-divider)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: "var(--color-faint)" }}>
                          <rect x="3" y="3" width="18" height="18" rx="2" />
                          <circle cx="8.5" cy="8.5" r="1.5" />
                          <polyline points="21 15 16 10 5 21" />
                        </svg>
                      </div>
                    )}
                  </td>
                  <td style={{ padding: "10px 12px" }}>
                    <div style={{ fontWeight: 500, color: "var(--color-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 220 }}>
                      {p.name}
                    </div>
                    {p.categoryName && (
                      <div style={{ fontSize: "0.7rem", color: "var(--color-subtle)", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 220 }}>
                        {p.categoryName}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                    {p.promotion?.active ? (
                      <div>
                        <span style={{ fontWeight: 600, color: "var(--color-success)" }}>${p.promotion.promoPrice.toFixed(2)}</span>
                        <span style={{ fontSize: "0.7rem", color: "var(--color-subtle)", textDecoration: "line-through", marginLeft: 5 }}>${p.originalPrice.toFixed(2)}</span>
                      </div>
                    ) : (
                      <span style={{ fontWeight: 500, color: "var(--color-ink)" }}>${p.price.toFixed(2)}</span>
                    )}
                  </td>
                  <td style={{ padding: "10px 12px", color: p.stock != null ? "var(--color-muted)" : "var(--color-faint)" }}>
                    {p.stock ?? "—"}
                  </td>
                  <td style={{ padding: "10px 12px" }}>
                    {p.promotion ? (
                      <div>
                        <span style={{
                          display: "inline-block", padding: "2px 8px", borderRadius: 5,
                          fontSize: "0.7rem", fontWeight: 500,
                          background: p.promotion.active ? "var(--color-success-bg)" : "var(--color-warning-bg)",
                          color: p.promotion.active ? "var(--color-success)" : "var(--color-warning)",
                        }}>
                          {p.promotion.active ? "Activa" : "Programada"}
                        </span>
                        <div style={{ fontSize: "0.7rem", color: "var(--color-subtle)", marginTop: 2 }}>
                          hasta {format(new Date(p.promotion.endDate), "dd MMM", { locale: es })}
                        </div>
                      </div>
                    ) : (
                      <span style={{ color: "var(--color-faint)", fontSize: "0.75rem" }}>—</span>
                    )}
                  </td>
                  <td style={{ padding: "10px 12px" }}>
                    {p.seoTitle
                      ? <span style={{ fontSize: "0.75rem", color: "var(--color-success)", fontWeight: 600 }}>✓</span>
                      : <span style={{ fontSize: "0.75rem", color: "var(--color-warning)" }}>Falta</span>}
                  </td>
                  <td style={{ padding: "10px 12px" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: "0.75rem", color: "var(--color-muted)" }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: s.dot, display: "inline-block", flexShrink: 0 }} />
                      {s.label}
                    </span>
                  </td>
                  <td style={{ padding: "10px 16px 10px 8px", textAlign: "right" }}>
                    <Link href={`/products/${p.id}`} style={{ fontSize: "0.8125rem", color: "var(--color-brand)", fontWeight: 500, textDecoration: "none" }}>
                      Editar
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {products.length === 0 && (
          <div style={{ textAlign: "center", padding: "60px 20px" }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12, margin: "0 auto 12px",
              background: "var(--color-surface-2)", border: "1px solid var(--color-border)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: "var(--color-faint)" }}>
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </div>
            <p style={{ fontSize: "0.875rem", fontWeight: 500, color: "var(--color-muted)", margin: 0 }}>No se encontraron productos</p>
            <p style={{ fontSize: "0.8125rem", color: "var(--color-subtle)", margin: "4px 0 0" }}>Probá con otros filtros</p>
          </div>
        )}
      </div>

      <BulkBar selectedIds={Array.from(selected)} onClear={() => setSelected(new Set())} onDone={() => router.refresh()} />
    </>
  );
}
