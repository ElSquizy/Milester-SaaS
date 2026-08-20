"use client";
import { useState } from "react";
import type { CatalogProduct } from "./page";
import CategoryCell from "./CategoryCell";
import { NameCell, PriceField, StockCell, CostUsdField, VariantRows, VisibilityIcon, SyncIcon, VisitProductLink } from "./ProductFields";

interface Props {
  products: CatalogProduct[];
  selected: Set<number>;
  onToggle: (id: number) => void;
  onOpen: (id: number) => void;
  onContextMenu: (e: React.MouseEvent, p: CatalogProduct) => void;
}

export default function ProductCards({ products, selected, onToggle, onOpen, onContextMenu }: Props) {
  if (products.length === 0) {
    return (
      <div style={{ padding: "80px 24px", textAlign: "center" }}>
        <p style={{ fontSize: "0.875rem", color: "var(--color-muted)", margin: 0 }}>
          Sin resultados para este filtro
        </p>
      </div>
    );
  }

  return (
    <div className="catalog-cards" style={{
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))",
      gap: 18,
      padding: "24px 32px",
    }}>
      {products.map((p) => (
        <ProductCard key={p.id} product={p} selected={selected.has(p.id)} onToggle={() => onToggle(p.id)} onOpen={() => onOpen(p.id)} onContextMenu={(e) => onContextMenu(e, p)} />
      ))}
    </div>
  );
}

function ProductCard({ product, selected, onToggle, onOpen, onContextMenu }: {
  product: CatalogProduct; selected: boolean; onToggle: () => void; onOpen: () => void; onContextMenu: (e: React.MouseEvent) => void;
}) {
  const originalTags: string[] = (() => { try { return JSON.parse(product.tags); } catch { return []; } })();
  const multiVariant = product.variantCount > 1;
  const stockEditable = !multiVariant && !product.infiniteStock;

  const [hover, setHover] = useState(false);
  const [showCosts, setShowCosts] = useState(false);
  const [expandedVariants, setExpandedVariants] = useState(false);

  // Descuento a partir de los valores del servidor (ya no hay estado local:
  // cada campo hace commit por su cuenta, igual que la tabla).
  const activePromo = product.promotionalPrice != null && product.promotionalPrice < product.price;
  const discountPct = activePromo && product.price > 0 ? Math.round((1 - product.promotionalPrice! / product.price) * 100) : 0;

  const del = product.pendingDelete;
  const borderColor = del ? "var(--color-danger)" : selected ? "var(--color-brand)" : "var(--color-border)";

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onContextMenu={onContextMenu}
      style={{
        opacity: del ? 0.72 : 1,
        display: "flex", flexDirection: "column",
        background: "var(--color-surface)",
        border: `1px solid ${borderColor}`,
        borderRadius: "var(--radius-card)", overflow: "hidden",
        boxShadow: hover ? "var(--shadow-float)" : "var(--shadow-card)",
        transform: hover ? "translateY(-2px)" : "none",
        transition: "box-shadow 0.16s, transform 0.16s, border-color 0.15s",
      }}>
      {/* Image */}
      <div style={{ position: "relative", aspectRatio: "1", background: "var(--color-surface-2)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", padding: 10 }}>
        {product.imageUrl
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={product.imageUrl} alt="" loading="lazy" decoding="async" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
          : <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--color-faint)" strokeWidth="1.5" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>}

        {/* Select checkbox */}
        <button
          onClick={onToggle}
          aria-label={`${selected ? "Deseleccionar" : "Seleccionar"} ${product.name}`}
          aria-pressed={selected}
          style={{
            position: "absolute", top: 12, left: 12, width: 22, height: 22, borderRadius: 7,
            border: `1.5px solid ${selected ? "var(--color-brand)" : "rgba(255,255,255,0.9)"}`,
            background: selected ? "var(--color-brand)" : "rgba(255,255,255,0.85)",
            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
            color: "#fff", fontSize: "0.75rem", fontWeight: 700,
            boxShadow: "0 1px 2px rgba(0,0,0,0.15)",
          }}
        >
          {selected ? "✓" : ""}
        </button>

        {/* Discount badge */}
        {discountPct > 0 && !del && (
          <span style={{
            position: "absolute", bottom: 12, left: 12,
            padding: "3px 8px", borderRadius: "var(--radius-pill)",
            background: "rgba(255,255,255,0.92)", color: "var(--color-success)",
            fontSize: "0.75rem", fontWeight: 700, fontVariantNumeric: "tabular-nums",
          }}>
            −{discountPct}%
          </span>
        )}

        {/* Sync status — clickable (force push), white-backed for legibility over the image */}
        <span style={{ position: "absolute", top: 10, right: 10, background: "rgba(255,255,255,0.92)", borderRadius: 9, boxShadow: "0 1px 2px rgba(0,0,0,0.10)", display: "flex" }}>
          <SyncIcon id={product.id} status={del ? "pending-delete" : product.syncStatus} lastSyncedAt={product.lastSyncedAt} />
        </span>
      </div>

      {/* Body */}
      <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 12, flex: 1 }}>
        {/* Name + SKU + variant badge */}
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <div style={{ marginLeft: -6 }}><NameCell id={product.id} name={product.name} del={del} /></div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.75rem", color: "var(--color-subtle)", paddingLeft: 0 }}>
            {product.sku && <span className="mono" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{product.sku}</span>}
            {multiVariant && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--color-brand)", fontWeight: 600, flexShrink: 0 }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>
                {product.variantCount} variantes
              </span>
            )}
          </div>
        </div>

        {/* Prices — base (gray) + promotional. Commit per field. */}
        <div style={{ display: "flex", gap: 10 }}>
          <label style={{ flex: 1, display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
            <span style={fieldLabel}>Precio base</span>
            <div style={{ marginLeft: -6 }}><PriceField id={product.id} field="price" value={product.price} base={product.price} width={110} /></div>
          </label>
          <label style={{ flex: 1, display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
            <span style={fieldLabel}>Promocional</span>
            <div style={{ marginLeft: -6 }}><PriceField id={product.id} field="promotionalPrice" value={product.promotionalPrice} base={product.price} width={110} /></div>
          </label>
        </div>

        {/* Stock + sales */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          {multiVariant ? (
            <button onClick={() => setExpandedVariants((v) => !v)} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 9px", borderRadius: 8, border: "1px solid var(--color-border)", background: "var(--color-surface)", cursor: "pointer", fontSize: "0.75rem", color: "var(--color-muted)", fontWeight: 500 }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ transform: expandedVariants ? "none" : "rotate(-90deg)", transition: "transform 0.12s" }}><polyline points="6 9 12 15 18 9" /></svg>
              Editar {product.variantCount} variantes
            </button>
          ) : product.infiniteStock ? (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "0.8125rem", color: "var(--color-muted)" }}>
              <span style={fieldLabel}>Stock</span><span title="Ilimitado" style={{ fontWeight: 600 }}>∞</span>
            </span>
          ) : (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span style={fieldLabel}>Stock</span>
              <StockCell id={product.id} stock={product.stock} infinite={product.infiniteStock} editable={stockEditable} />
            </span>
          )}
          {product.unitsSold > 0 && (
            <span style={{ fontSize: "0.75rem", color: "var(--color-subtle)", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }} title="Unidades vendidas">
              {product.unitsSold.toLocaleString("es-AR")} vend.
            </span>
          )}
        </div>

        {/* Variants inline (expandable) */}
        {multiVariant && expandedVariants && (
          <div style={{ borderRadius: 10, background: "var(--color-surface-2)", border: "1px solid var(--color-divider)" }}>
            <VariantRows productId={product.id} />
          </div>
        )}

        {/* Costos USD — colapsable (dato local, no viaja a TN) */}
        <div>
          <button onClick={() => setShowCosts((v) => !v)} style={{ display: "inline-flex", alignItems: "center", gap: 6, border: "none", background: "transparent", cursor: "pointer", padding: 0, fontSize: "0.6875rem", fontWeight: 700, letterSpacing: "0.03em", textTransform: "uppercase", color: "var(--color-subtle)" }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ transform: showCosts ? "none" : "rotate(-90deg)", transition: "transform 0.12s" }}><polyline points="6 9 12 15 18 9" /></svg>
            Costos USD
            {(product.costUsd != null || product.costUsdPromo != null) && !showCosts && (
              <span style={{ fontWeight: 600, color: "var(--color-muted)", textTransform: "none", letterSpacing: 0 }}>
                US${(product.costUsd ?? product.costUsdPromo)?.toLocaleString("es-AR")}
              </span>
            )}
          </button>
          {showCosts && (
            <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
              <label style={{ flex: 1, display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
                <span style={fieldLabel}>Costo</span>
                <div style={{ marginLeft: -6 }}><CostUsdField id={product.id} value={product.costUsd} field="costUsd" width={96} /></div>
              </label>
              <label style={{ flex: 1, display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
                <span style={fieldLabel}>Costo promo</span>
                <div style={{ marginLeft: -6 }}><CostUsdField id={product.id} value={product.costUsdPromo} field="costUsdPromo" width={96} /></div>
              </label>
            </div>
          )}
        </div>

        {/* Categorías (editable) + tags (lectura) */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ marginLeft: -4 }}>
            <CategoryCell productId={product.id} current={product.categoryLinks} />
          </div>
          {originalTags.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
              {originalTags.slice(0, 4).map((t) => <span key={t} style={chip}>{t}</span>)}
              {originalTags.length > 4 && <span style={chip}>+{originalTags.length - 4}</span>}
            </div>
          )}
        </div>

        {/* Spacer pushes the footer to the bottom */}
        <div style={{ flex: 1 }} />

        {/* Footer actions: editar (panel), visibilidad, visitar, menú. Sin "Guardar" (commit por campo). */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", paddingTop: 4, borderTop: "1px solid var(--color-divider)" }}>
          <button onClick={onOpen} className="btn-secondary" style={{ flex: 1, padding: "8px 12px", fontSize: "0.8125rem", justifyContent: "center" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z" /></svg>
            Editar
          </button>
          <VisibilityIcon id={product.id} published={product.published} />
          {product.productUrl && <VisitProductLink url={product.productUrl} />}
          <button
            onClick={(e) => { e.stopPropagation(); onContextMenu(e); }}
            aria-haspopup="menu"
            aria-label={`Acciones de ${product.name}`}
            title="Acciones"
            style={{ flexShrink: 0, width: 32, height: 32, padding: 0, borderRadius: 8, border: "none", background: "transparent", cursor: "pointer", color: "var(--color-subtle)", display: "flex", alignItems: "center", justifyContent: "center" }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--color-surface-2)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <circle cx="5" cy="12" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="19" cy="12" r="1.7" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

const fieldLabel: React.CSSProperties = {
  fontSize: "0.625rem", fontWeight: 600, letterSpacing: "0.03em", textTransform: "uppercase",
  color: "var(--color-subtle)",
};
const chip: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", padding: "3px 8px", borderRadius: "var(--radius-pill)",
  background: "var(--color-surface-2)", fontSize: "0.6875rem", color: "var(--color-muted)", fontWeight: 500,
  maxWidth: 130, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
};
