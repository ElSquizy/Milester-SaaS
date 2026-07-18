"use client";
import { useState } from "react";
import type { CatalogProduct } from "./page";
import { useDeferredRefresh } from "./useDeferredRefresh";

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

const parseNum = (v: string) => parseFloat(v.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", "."));

function ProductCard({ product, selected, onToggle, onOpen, onContextMenu }: {
  product: CatalogProduct; selected: boolean; onToggle: () => void; onOpen: () => void; onContextMenu: (e: React.MouseEvent) => void;
}) {
  const refresh = useDeferredRefresh();
  const originalTags: string[] = (() => { try { return JSON.parse(product.tags); } catch { return []; } })();
  const multiVariant = product.variantCount > 1;
  const stockEditable = !multiVariant && !product.infiniteStock;

  const [name, setName] = useState(product.name);
  const [price, setPrice] = useState(String(product.price));
  const [promo, setPromo] = useState(product.promotionalPrice != null ? String(product.promotionalPrice) : "");
  const [stock, setStock] = useState(product.stock == null ? "" : String(product.stock));
  const [published, setPublished] = useState(product.published);
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState(false);
  const [hover, setHover] = useState(false);

  const parsedPrice = parseNum(price);
  const parsedPromo = promo.trim() === "" ? null : parseNum(promo);
  const parsedStock = stock.trim() === "" ? null : Math.max(0, Math.round(Number(stock)));
  const priceChanged = !isNaN(parsedPrice) && parsedPrice !== product.price;
  const promoChanged = (parsedPromo == null ? null : parsedPromo) !== (product.promotionalPrice ?? null);
  const stockChanged = stockEditable && parsedStock !== product.stock;
  const dirty = name !== product.name || priceChanged || promoChanged || stockChanged || published !== product.published;

  const activePromo = parsedPromo != null && !isNaN(parsedPromo) && parsedPromo < parsedPrice;
  const discountPct = activePromo && parsedPrice > 0 ? Math.round((1 - parsedPromo / parsedPrice) * 100) : 0;

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/products/${product.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name, price: parsedPrice, promotionalPrice: parsedPromo, published,
          ...(stockEditable ? { stock: parsedStock } : {}),
        }),
      });
      if (res.ok) {
        setFlash(true);
        setTimeout(() => { setFlash(false); refresh(); }, 900);
      }
    } finally {
      setSaving(false);
    }
  }

  const stale = product.unitsSold > 0 && (!product.lastSoldAt || (Date.now() - new Date(product.lastSoldAt).getTime()) / 86400000 > 60);
  const del = product.pendingDelete;
  const borderColor = del ? "var(--color-danger)" : dirty ? "var(--color-warning)" : selected ? "var(--color-brand)" : "var(--color-border)";

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

        {/* Discount badge. The discount is data, not a state — a solid fill here
            would compete with the attention pills, which now own the saturated
            treatment, so it stays quiet. */}
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

        {/* Real sync status (separate from the unsaved-edits state) */}
        <span style={{ position: "absolute", top: 12, right: 12, boxShadow: "0 1px 2px rgba(0,0,0,0.08)" }}>
          <SyncPill status={del ? "pending-delete" : product.syncStatus} />
        </span>
      </div>

      {/* Body */}
      <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: 12, flex: 1 }}>
        {/* Name + SKU + variant badge */}
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{
              border: "none", background: "transparent", outline: "none", padding: 0,
              fontSize: "0.9375rem", fontWeight: 600, color: "var(--color-ink)",
              letterSpacing: "-0.01em", width: "100%",
            }}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.75rem", color: "var(--color-subtle)" }}>
            {product.sku && <span className="mono" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{product.sku}</span>}
            {multiVariant && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--color-brand)", fontWeight: 600, flexShrink: 0 }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>
                {product.variantCount} variantes
              </span>
            )}
          </div>
        </div>

        {/* Prices — base (gray) + promotional */}
        <div style={{ display: "flex", gap: 10 }}>
          <label style={{ flex: 1, display: "flex", flexDirection: "column", gap: 3 }}>
            <span style={priceLabel}>Precio base</span>
            <div style={{ position: "relative" }}>
              <span style={priceDollar}>$</span>
              <input className="input" value={price} onChange={(e) => setPrice(e.target.value)}
                style={{ paddingLeft: 20, fontWeight: 600, fontVariantNumeric: "tabular-nums", color: "var(--color-muted)" }} />
            </div>
          </label>
          <label style={{ flex: 1, display: "flex", flexDirection: "column", gap: 3 }}>
            <span style={priceLabel}>Promocional</span>
            <div style={{ position: "relative" }}>
              <span style={{ ...priceDollar, color: promo.trim() === "" ? "var(--color-subtle)" : priceDollar.color }}>$</span>
              <input className="input" value={promo} onChange={(e) => setPromo(e.target.value)} placeholder="—"
                style={{ paddingLeft: 20, fontWeight: 600, fontVariantNumeric: "tabular-nums",
                  color: promo.trim() === "" ? "var(--color-subtle)" : activePromo ? "var(--color-success)" : "var(--color-warning)" }} />
            </div>
          </label>
        </div>

        {/* Stock (editable on simple, link to panel on multi) + sales */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          {multiVariant ? (
            <button onClick={onOpen} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 9px", borderRadius: 8, border: "1px solid var(--color-border)", background: "var(--color-surface)", cursor: "pointer", fontSize: "0.75rem", color: "var(--color-muted)", fontWeight: 500 }}>
              Stock por variante →
            </button>
          ) : product.infiniteStock ? (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: "0.8125rem", color: "var(--color-muted)" }}>
              <span style={stockTag}>Stock</span><span title="Ilimitado" style={{ fontWeight: 600 }}>∞</span>
            </span>
          ) : (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span style={stockTag}>Stock</span>
              <input
                value={stock}
                onChange={(e) => setStock(e.target.value)}
                placeholder="0"
                inputMode="numeric"
                style={{
                  width: 56, textAlign: "right", padding: "5px 8px", borderRadius: 8,
                  border: "1px solid var(--color-border)", background: "var(--color-surface)", outline: "none",
                  fontVariantNumeric: "tabular-nums", fontWeight: 600,
                  color: parsedStock === 0 ? "var(--color-danger)" : parsedStock != null && parsedStock < 5 ? "var(--color-warning)" : "var(--color-ink)",
                }}
              />
            </span>
          )}
          {product.unitsSold > 0 && (
            <span style={{ fontSize: "0.75rem", color: stale ? "var(--color-warning)" : "var(--color-subtle)", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }} title={stale ? "Sin ventas recientes" : "Unidades vendidas"}>
              {stale && "● "}{product.unitsSold.toLocaleString("es-AR")} vend.
            </span>
          )}
        </div>

        {/* Visibility */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: "0.8125rem", color: "var(--color-muted)", fontWeight: 500 }}>
            {published ? "Publicado" : "Oculto"}
          </span>
          <button className="switch" data-on={published} aria-label="Visibilidad" onClick={() => setPublished(!published)} />
        </div>

        {/* Read-only collections + tags */}
        {(product.categoryLinks.length > 0 || originalTags.length > 0) && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
            {product.categoryLinks.slice(0, 4).map((c) => (
              <span key={`c${c.id}`} style={{ ...chip, background: "var(--color-brand-light)", color: "var(--color-brand)" }}>{c.name}</span>
            ))}
            {product.categoryLinks.length > 4 && <span style={{ ...chip, background: "var(--color-brand-light)", color: "var(--color-brand)" }}>+{product.categoryLinks.length - 4}</span>}
            {originalTags.slice(0, 3).map((t) => (
              <span key={`t${t}`} style={chip}>{t}</span>
            ))}
            {originalTags.length > 3 && <span style={chip}>+{originalTags.length - 3}</span>}
          </div>
        )}

        {/* Spacer pushes the footer to the bottom for a clean baseline */}
        <div style={{ flex: 1 }} />

        {/* Actions: Editar (panel) always; Guardar when dirty */}
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            onClick={onOpen}
            className="btn-secondary"
            style={{ flex: dirty || flash ? "0 0 auto" : 1, padding: "8px 12px", fontSize: "0.8125rem", justifyContent: "center" }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z" /></svg>
            Editar
          </button>
          {/* On touch there is no right-click, so the card needs its own way in. */}
          <button
            onClick={(e) => { e.stopPropagation(); onContextMenu(e); }}
            aria-haspopup="menu"
            aria-label={`Acciones de ${product.name}`}
            title="Acciones"
            className="btn-secondary"
            style={{ flexShrink: 0, width: 44, height: 40, padding: 0, justifyContent: "center" }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <circle cx="5" cy="12" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="19" cy="12" r="1.7" />
            </svg>
          </button>
          {flash ? (
            <span style={{ flex: 1, textAlign: "center", fontSize: "0.8125rem", color: "var(--color-success)", fontWeight: 600 }}>✓ Guardado</span>
          ) : dirty ? (
            <button className="btn-primary" onClick={save} disabled={saving} style={{ flex: 1, padding: "8px 12px", whiteSpace: "nowrap" }}>
              {saving ? "..." : "Guardar"}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/**
 * Same rule as the table: colour is reserved for states that need action.
 *
 * A labelled green "Sincronizado" pill on every card is noise — almost every card
 * is synced, so it stops meaning anything and leaves the states that DO matter
 * nothing to stand out against. The healthy default shrinks to a small unlabelled
 * check; anything needing attention keeps a full solid, labelled pill.
 *
 * Unlike the table, this sits on top of the product image, so even the quiet
 * marker needs a backing to stay legible over an arbitrary photo.
 */
function SyncPill({ status }: { status: string }) {
  const attention: Record<string, { bg: string; label: string }> = {
    "pending-delete": { bg: "var(--color-danger)",  label: "Se eliminará" },
    error:            { bg: "var(--color-danger)",  label: "Error" },
    modified:         { bg: "var(--color-warning)", label: "Modificado" },
    pending:          { bg: "var(--color-warning)", label: "Pendiente" },
    syncing:          { bg: "var(--color-brand)",   label: "Sincronizando" },
  };
  const a = attention[status];
  if (a) {
    return (
      <span className="pill" style={{ background: a.bg, color: "#fff", fontWeight: 600 }}>
        {a.label}
      </span>
    );
  }
  return (
    <span
      role="img"
      aria-label="Sincronizado"
      title="Sincronizado"
      style={{
        width: 22, height: 22, borderRadius: "50%", display: "flex",
        alignItems: "center", justifyContent: "center",
        background: "rgba(255,255,255,0.92)", color: "var(--color-success-icon)",
      }}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    </span>
  );
}

const priceLabel: React.CSSProperties = {
  fontSize: "0.625rem", fontWeight: 600, letterSpacing: "0.03em", textTransform: "uppercase",
  color: "var(--color-subtle)",
};
const priceDollar: React.CSSProperties = {
  position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)",
  fontSize: "0.8125rem", color: "var(--color-muted)", pointerEvents: "none",
};
const stockTag: React.CSSProperties = {
  fontSize: "0.625rem", fontWeight: 600, letterSpacing: "0.03em", textTransform: "uppercase", color: "var(--color-subtle)",
};
const chip: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", padding: "3px 8px", borderRadius: "var(--radius-pill)",
  background: "var(--color-surface-2)", fontSize: "0.6875rem", color: "var(--color-muted)", fontWeight: 500,
  maxWidth: 130, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
};
