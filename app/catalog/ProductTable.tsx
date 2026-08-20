"use client";
import { useState, Fragment } from "react";
import type { CatalogProduct } from "./page";
import CategoryCell from "./CategoryCell";
import { NameCell, StockCell, CostUsdField, PriceField, VariantRows, VisibilityIcon, SyncIcon, SalesCell, VisitProductLink } from "./ProductFields";

interface Props {
  products: CatalogProduct[];
  selected: Set<number>;
  onToggle: (id: number) => void;
  onToggleAll: () => void;
  onOpen: (id: number) => void;
  onContextMenu: (e: React.MouseEvent, p: CatalogProduct) => void;
}

export default function ProductTable({ products, selected, onToggle, onToggleAll, onOpen, onContextMenu }: Props) {
  const allSelected = products.length > 0 && selected.size === products.length;
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const toggleExpand = (id: number) => setExpanded((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  if (products.length === 0) {
    return (
      <div style={{ padding: "80px 24px", textAlign: "center" }}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--color-faint)" strokeWidth="1.5" strokeLinecap="round" style={{ margin: "0 auto 12px", display: "block" }}>
          <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <p style={{ fontSize: "0.875rem", color: "var(--color-muted)", margin: 0 }}>
          Sin resultados para este filtro
        </p>
      </div>
    );
  }

  return (
    <div className="card-float" style={{ margin: "24px 32px", overflow: "hidden" }}>
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
      <thead style={{ position: "sticky", top: 0, zIndex: 10 }}>
        <tr style={{ background: "var(--color-surface)", borderBottom: "1px solid var(--color-divider)" }}>
          <th style={{ ...th, width: 44, paddingLeft: 20 }}>
            <input
              type="checkbox"
              checked={allSelected}
              onChange={onToggleAll}
              aria-label={allSelected ? "Deseleccionar todos los productos" : "Seleccionar todos los productos"}
              style={{ cursor: "pointer", width: 15, height: 15, accentColor: "var(--color-brand)" }}
            />
          </th>
          <th style={{ ...th, width: 48 }} />
          <th style={{ ...th, textAlign: "left", minWidth: 200 }}>Nombre</th>
          <th style={{ ...th, textAlign: "left", minWidth: 140 }}>Categoría</th>
          <th style={{ ...th, textAlign: "right", minWidth: 96 }} title="Costo del producto en dólares. Es un dato tuyo: no se envía a Tienda Nube.">Costo USD</th>
          <th style={{ ...th, textAlign: "right", minWidth: 96 }} title="Costo promocional en dólares (el proveedor lo puso en oferta). Vinculado al precio promocional por la tabla de Precios.">Costo USD Promo</th>
          <th style={{ ...th, textAlign: "right", minWidth: 110 }}>Precio base</th>
          <th style={{ ...th, textAlign: "right", minWidth: 120 }}>Precio promocional</th>
          <th style={{ ...th, textAlign: "right", minWidth: 70 }}>Stock</th>
          <th style={{ ...th, textAlign: "right", minWidth: 90 }}>Ventas</th>
          <th style={{ ...th, textAlign: "center", minWidth: 96, paddingRight: 20 }}>Estado</th>
        </tr>
      </thead>
      <tbody>
        {products.map((p, i) => {
          const isSelected = selected.has(p.id);
          const del = p.pendingDelete;
          const isExpanded = expanded.has(p.id);
          return (
            <Fragment key={p.id}>
            <tr
              onClick={() => onOpen(p.id)}
              onContextMenu={(e) => onContextMenu(e, p)}
              style={{
                borderTop: i === 0 ? "none" : "1px solid var(--color-divider)",
                cursor: "pointer",
                background: isSelected ? "var(--color-brand-light)" : del ? "var(--color-danger-bg, #FEF2F2)" : "transparent",
                opacity: del ? 0.75 : 1,
                transition: "background 0.1s",
              }}
              onMouseEnter={(e) => {
                if (!isSelected && !del) (e.currentTarget as HTMLTableRowElement).style.background = "var(--color-surface-2)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLTableRowElement).style.background = isSelected ? "var(--color-brand-light)" : del ? "var(--color-danger-bg, #FEF2F2)" : "transparent";
              }}
            >
              {/* Checkbox */}
              <td style={{ ...td, width: 44, paddingLeft: 20 }} onClick={(e) => { e.stopPropagation(); onToggle(p.id); }}>
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => onToggle(p.id)}
                  onClick={(e) => e.stopPropagation()}
                  aria-label={`Seleccionar ${p.name}`}
                  style={{ cursor: "pointer", width: 16, height: 16, accentColor: "var(--color-brand)" }}
                />
              </td>

              {/* Image */}
              <td style={{ ...td, width: 48, padding: "10px 6px 10px 8px" }}>
                <div style={{
                  width: 34, height: 34, borderRadius: 7, flexShrink: 0,
                  background: "var(--color-surface-2)", border: "1px solid var(--color-divider)",
                  overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {p.imageUrl
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={p.imageUrl} alt="" loading="lazy" decoding="async" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    : <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--color-faint)" strokeWidth="1.5" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>}
                </div>
              </td>

              {/* Name — inline editable */}
              <td style={{ ...td, maxWidth: 280 }} onClick={(e) => e.stopPropagation()}>
                <NameCell id={p.id} name={p.name} del={del} />
              </td>

              {/* Category — inline chips + picker */}
              <td style={{ ...td, maxWidth: 210 }} onClick={(e) => e.stopPropagation()}>
                <CategoryCell productId={p.id} current={p.categoryLinks} />
              </td>

              {/* Cost in USD — local-only, never pushed to TN */}
              <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }} onClick={(e) => e.stopPropagation()}>
                <CostUsdField id={p.id} value={p.costUsd} />
              </td>

              {/* Promo cost in USD — drives promotionalPrice via the pricing table */}
              <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }} onClick={(e) => e.stopPropagation()}>
                <CostUsdField id={p.id} value={p.costUsdPromo} field="costUsdPromo" />
              </td>

              {/* Base price — inline editable, gray */}
              <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }} onClick={(e) => e.stopPropagation()}>
                <PriceField id={p.id} field="price" value={p.price} base={p.price} />
              </td>

              {/* Promotional price — inline editable; empty = no promo */}
              <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }} onClick={(e) => e.stopPropagation()}>
                <PriceField id={p.id} field="promotionalPrice" value={p.promotionalPrice} base={p.price} />
              </td>

              {/* Stock — inline editable (single variant) or expand to edit each variant */}
              <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" }} onClick={(e) => e.stopPropagation()}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4, justifyContent: "flex-end" }}>
                  {p.variantCount > 1 && (
                    <button onClick={(e) => { e.stopPropagation(); toggleExpand(p.id); }} title={`${p.variantCount} variantes`}
                      style={{ display: "inline-flex", alignItems: "center", gap: 2, border: "none", background: "transparent", cursor: "pointer", color: "var(--color-subtle)", fontSize: "0.6875rem", fontWeight: 600, padding: "2px 4px", borderRadius: 6 }}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ transform: isExpanded ? "none" : "rotate(-90deg)", transition: "transform 0.12s" }}><polyline points="6 9 12 15 18 9" /></svg>
                      {p.variantCount}
                    </button>
                  )}
                  <StockCell id={p.id} stock={p.stock} infinite={p.infiniteStock} editable={!p.infiniteStock && p.variantCount <= 1} />
                </span>
              </td>

              {/* Sales */}
              <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                <SalesCell unitsSold={p.unitsSold} lastSoldAt={p.lastSoldAt} />
              </td>

              {/* Status — unified visibility + sync icons (both clickable) */}
              <td style={{ ...td, paddingRight: 20 }} onClick={(e) => e.stopPropagation()}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                  <VisibilityIcon id={p.id} published={p.published} />
                  <SyncIcon id={p.id} status={del ? "pending-delete" : p.syncStatus} lastSyncedAt={p.lastSyncedAt} />
                  {p.productUrl && <VisitProductLink url={p.productUrl} />}
                  {/* Keyboard/touch path to the same actions as right-click. */}
                  <button
                    onClick={(e) => { e.stopPropagation(); onContextMenu(e, p); }}
                    aria-haspopup="menu"
                    aria-label={`Acciones de ${p.name}`}
                    title="Acciones"
                    style={{
                      width: 26, height: 26, flexShrink: 0, borderRadius: 8, border: "none",
                      background: "transparent", color: "var(--color-subtle)", cursor: "pointer",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" />
                    </svg>
                  </button>
                </div>
              </td>
            </tr>
            {isExpanded && (
              <tr>
                <td colSpan={11} style={{ padding: 0, background: "var(--color-surface-2)", borderTop: "1px solid var(--color-divider)" }}>
                  <VariantRows productId={p.id} />
                </td>
              </tr>
            )}
            </Fragment>
          );
        })}
      </tbody>
    </table>
    </div>
  );
}

const th: React.CSSProperties = {
  padding: "13px 12px",
  fontSize: "0.6875rem", fontWeight: 600,
  letterSpacing: "0.04em", textTransform: "uppercase",
  color: "var(--color-subtle)",
  whiteSpace: "nowrap",
};

const td: React.CSSProperties = {
  padding: "12px 12px",
  verticalAlign: "middle",
};
