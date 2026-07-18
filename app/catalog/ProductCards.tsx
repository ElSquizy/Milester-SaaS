"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CatalogProduct } from "./page";
import CategoryCell from "./CategoryCell";

interface Props {
  products: CatalogProduct[];
  selected: Set<number>;
  onToggle: (id: number) => void;
  onContextMenu: (e: React.MouseEvent, p: CatalogProduct) => void;
}

export default function ProductCards({ products, selected, onToggle, onContextMenu }: Props) {
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
        <ProductCard key={p.id} product={p} selected={selected.has(p.id)} onToggle={() => onToggle(p.id)} onContextMenu={(e) => onContextMenu(e, p)} />
      ))}
    </div>
  );
}

function ProductCard({ product, selected, onToggle, onContextMenu }: {
  product: CatalogProduct; selected: boolean; onToggle: () => void; onContextMenu: (e: React.MouseEvent) => void;
}) {
  const router = useRouter();
  const originalTags: string[] = (() => { try { return JSON.parse(product.tags); } catch { return []; } })();

  const [name, setName] = useState(product.name);
  const [price, setPrice] = useState(String(product.price));
  const [promo, setPromo] = useState(product.promotionalPrice != null ? String(product.promotionalPrice) : "");
  const [published, setPublished] = useState(product.published);
  const [tags, setTags] = useState<string[]>(originalTags);
  const [newTag, setNewTag] = useState("");
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState(false);
  const [hover, setHover] = useState(false);

  const parseNum = (v: string) => parseFloat(v.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", "."));
  const parsedPrice = parseNum(price);
  const parsedPromo = promo.trim() === "" ? null : parseNum(promo);
  const priceChanged = !isNaN(parsedPrice) && parsedPrice !== product.price;
  const promoChanged = (parsedPromo == null ? null : parsedPromo) !== (product.promotionalPrice ?? null);
  const tagsChanged = JSON.stringify([...tags].sort()) !== JSON.stringify([...originalTags].sort());
  const dirty = name !== product.name || priceChanged || promoChanged || published !== product.published || tagsChanged;

  const activePromo = parsedPromo != null && !isNaN(parsedPromo) && parsedPromo < parsedPrice;

  async function save(sync: boolean) {
    setSaving(true);
    try {
      const res = await fetch(`/api/products/${product.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, price: parsedPrice, promotionalPrice: parsedPromo, published, tags: JSON.stringify(tags), sync }),
      });
      if (res.ok) {
        setFlash(true);
        setTimeout(() => { setFlash(false); router.refresh(); }, 900);
      }
    } finally {
      setSaving(false);
    }
  }

  function addTag() {
    const t = newTag.trim();
    if (t && !tags.includes(t)) setTags([...tags, t]);
    setNewTag("");
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
      {/* Image — full cover, not cropped */}
      <div style={{ position: "relative", aspectRatio: "1", background: "var(--color-surface-2)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", padding: 10 }}>
        {product.imageUrl
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={product.imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
          : <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--color-faint)" strokeWidth="1.5" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>}

        {/* Select checkbox */}
        <button
          onClick={onToggle}
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

        {/* Sync state pill */}
        {del ? (
          <span className="pill pill-danger" style={{ position: "absolute", top: 12, right: 12, boxShadow: "0 1px 2px rgba(0,0,0,0.08)" }}>
            🗑 Se eliminará
          </span>
        ) : (
          <span className={`pill ${dirty ? "pill-warning" : product.syncStatus === "synced" ? "pill-success" : "pill-warning"}`}
            style={{ position: "absolute", top: 12, right: 12, background: dirty ? "var(--color-warning)" : undefined, color: dirty ? "#fff" : undefined, boxShadow: "0 1px 2px rgba(0,0,0,0.08)" }}>
            {dirty ? "Modificado" : product.syncStatus === "synced" ? "Sincronizado" : "Pendiente"}
          </span>
        )}
      </div>

      {/* Body */}
      <div style={{ padding: "18px", display: "flex", flexDirection: "column", gap: 13, flex: 1 }}>
        {/* Name */}
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{
            border: "none", background: "transparent", outline: "none", padding: 0,
            fontSize: "0.9375rem", fontWeight: 600, color: "var(--color-ink)",
            letterSpacing: "-0.01em", width: "100%",
          }}
        />

        {/* Categories (chips + picker) + stock/sales */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginTop: -6, marginLeft: -4 }}>
          <CategoryCell productId={product.id} current={product.categoryLinks} />
          <span style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, fontSize: "0.75rem" }}>
            {product.unitsSold > 0 && (
              <span style={{ color: stale ? "var(--color-warning)" : "var(--color-subtle)", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
                {stale && "● "}{product.unitsSold} vend.
              </span>
            )}
            {product.infiniteStock ? (
              <span title="Stock ilimitado" style={{ color: "var(--color-subtle)", fontWeight: 500 }}>∞</span>
            ) : product.stock != null && (
              <span style={{ color: product.stock <= 0 ? "var(--color-danger)" : "var(--color-subtle)", fontVariantNumeric: "tabular-nums", fontWeight: 500 }}>
                {product.stock <= 0 ? "Sin stock" : `Stock ${product.stock}`}
              </span>
            )}
          </span>
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
              <span style={{ ...priceDollar, color: promo.trim() === "" ? "var(--color-faint)" : priceDollar.color }}>$</span>
              <input className="input" value={promo} onChange={(e) => setPromo(e.target.value)} placeholder="—"
                style={{ paddingLeft: 20, fontWeight: 600, fontVariantNumeric: "tabular-nums",
                  color: promo.trim() === "" ? "var(--color-faint)" : activePromo ? "var(--color-success)" : "var(--color-warning)" }} />
            </div>
          </label>
        </div>

        {/* Visibility — iOS switch */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: "0.8125rem", color: "var(--color-muted)", fontWeight: 500 }}>
            {published ? "Publicado" : "Oculto"}
          </span>
          <button
            className="switch"
            data-on={published}
            aria-label="Visibilidad"
            onClick={() => setPublished(!published)}
          />
        </div>

        {/* Tags */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
          {tags.map((t) => (
            <span key={t} style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              padding: "3px 8px", borderRadius: "var(--radius-pill)", background: "var(--color-surface-2)",
              fontSize: "0.75rem", color: "var(--color-muted)", fontWeight: 500,
            }}>
              {t}
              <button onClick={() => setTags(tags.filter((x) => x !== t))} style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--color-faint)", padding: 0, fontSize: "0.875rem", lineHeight: 1 }}>×</button>
            </span>
          ))}
          <input
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
            onBlur={addTag}
            placeholder="+ etiqueta"
            style={{ border: "none", background: "transparent", outline: "none", fontSize: "0.75rem", color: "var(--color-ink)", width: 70, padding: "3px 0" }}
          />
        </div>
      </div>

      {/* Footer — appears when dirty */}
      {(dirty || flash) && (
        <div style={{
          display: "flex", gap: 8, padding: "12px 16px",
          borderTop: "1px solid var(--color-divider)", background: "var(--color-surface-2)",
        }}>
          {flash ? (
            <span style={{ fontSize: "0.8125rem", color: "var(--color-success)", fontWeight: 600, padding: "4px 0" }}>✓ Guardado</span>
          ) : (
            <button className="btn-primary" onClick={() => save(false)} disabled={saving} style={{ flex: 1, padding: "7px 10px", whiteSpace: "nowrap" }}>
              {saving ? "..." : "Guardar"}
            </button>
          )}
        </div>
      )}
    </div>
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
