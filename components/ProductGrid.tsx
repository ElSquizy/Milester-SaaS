"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { format } from "date-fns";
import { es } from "date-fns/locale";

interface Promotion { promoPrice: number; endDate: string; active: boolean }
interface Product {
  id: number; name: string; price: number; originalPrice: number;
  imageUrl: string | null; categoryName: string | null; stock: number | null;
  syncStatus: string; seoTitle: string | null; promotion: Promotion | null;
}

const syncDot: Record<string, string> = {
  synced: "var(--color-success)",
  pending: "var(--color-warning)",
  error: "var(--color-danger)",
};

export default function ProductGrid({
  products, selected, onToggle, onToggleAll,
}: {
  products: Product[];
  selected: Set<number>;
  onToggle: (id: number) => void;
  onToggleAll: () => void;
}) {
  const router = useRouter();
  const params = useSearchParams();

  function openPanel(id: number) {
    const p = new URLSearchParams(params.toString());
    p.set("edit", String(id));
    router.push(`/products?${p.toString()}`);
  }

  return (
    <div>
      {/* Select all row */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <input
          type="checkbox"
          checked={selected.size === products.length && products.length > 0}
          onChange={onToggleAll}
          style={{ accentColor: "var(--color-brand)", cursor: "pointer" }}
        />
        <span style={{ fontSize: "0.75rem", color: "var(--color-subtle)" }}>
          {selected.size > 0 ? `${selected.size} seleccionados` : "Seleccionar todos"}
        </span>
      </div>

      {/* Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 12 }}>
        {products.map((p) => {
          const isSelected = selected.has(p.id);
          const s = syncDot[p.syncStatus] || "var(--color-subtle)";
          return (
            <div
              key={p.id}
              className="panel"
              style={{
                overflow: "hidden", cursor: "pointer",
                outline: isSelected ? `2px solid var(--color-brand)` : "none",
                outlineOffset: -2,
                transition: "box-shadow 0.15s, transform 0.15s",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLDivElement).style.boxShadow =
                  "0 4px 16px oklch(0.16 0.01 252 / 0.13), 0 0 0 0.5px oklch(0.16 0.01 252 / 0.06)";
                (e.currentTarget as HTMLDivElement).style.transform = "translateY(-1px)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLDivElement).style.boxShadow =
                  "0 1px 3px oklch(0.16 0.01 252 / 0.08), 0 0 0 0.5px oklch(0.16 0.01 252 / 0.06)";
                (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)";
              }}
              onClick={() => openPanel(p.id)}
            >
              {/* Image */}
              <div style={{ position: "relative", aspectRatio: "4/3", background: "var(--color-surface-2)" }}>
                {p.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.imageUrl} alt={p.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" style={{ color: "var(--color-faint)" }}>
                      <rect x="3" y="3" width="18" height="18" rx="2" />
                      <circle cx="8.5" cy="8.5" r="1.5" />
                      <polyline points="21 15 16 10 5 21" />
                    </svg>
                  </div>
                )}
                {/* Checkbox */}
                <div
                  style={{ position: "absolute", top: 8, left: 8 }}
                  onClick={(e) => { e.stopPropagation(); onToggle(p.id); }}
                >
                  <input
                    type="checkbox" checked={isSelected}
                    onChange={() => {}}
                    style={{ accentColor: "var(--color-brand)", cursor: "pointer", width: 14, height: 14 }}
                  />
                </div>
                {/* Promo badge */}
                {p.promotion?.active && (
                  <div style={{
                    position: "absolute", top: 8, right: 8,
                    background: "var(--color-success)", color: "white",
                    fontSize: "0.65rem", fontWeight: 600,
                    borderRadius: 4, padding: "2px 6px",
                  }}>
                    PROMO
                  </div>
                )}
              </div>

              {/* Info */}
              <div style={{ padding: "10px 12px" }}>
                <div style={{
                  fontSize: "0.8125rem", fontWeight: 500, color: "var(--color-ink)",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 2,
                }}>
                  {p.name}
                </div>
                {p.categoryName && (
                  <div style={{ fontSize: "0.7rem", color: "var(--color-subtle)", marginBottom: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {p.categoryName}
                  </div>
                )}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 4 }}>
                  <div>
                    {p.promotion?.active ? (
                      <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
                        <span style={{ fontWeight: 700, fontSize: "0.875rem", color: "var(--color-success)" }}>${p.promotion.promoPrice.toFixed(2)}</span>
                        <span style={{ fontSize: "0.7rem", color: "var(--color-subtle)", textDecoration: "line-through" }}>${p.originalPrice.toFixed(2)}</span>
                      </div>
                    ) : (
                      <span style={{ fontWeight: 600, fontSize: "0.875rem", color: "var(--color-ink)" }}>${p.price.toFixed(2)}</span>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {!p.seoTitle && (
                      <span style={{ fontSize: "0.65rem", color: "var(--color-warning)", fontWeight: 500 }}>SEO</span>
                    )}
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: s, display: "inline-block" }} title={p.syncStatus} />
                  </div>
                </div>
                {p.promotion && !p.promotion.active && (
                  <div style={{ fontSize: "0.65rem", color: "var(--color-subtle)", marginTop: 4 }}>
                    Promo hasta {format(new Date(p.promotion.endDate), "dd MMM", { locale: es })}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {products.length === 0 && (
        <div style={{ textAlign: "center", padding: "60px 20px" }}>
          <p style={{ fontSize: "0.875rem", color: "var(--color-muted)" }}>No se encontraron productos</p>
          <p style={{ fontSize: "0.8125rem", color: "var(--color-subtle)", marginTop: 4 }}>Probá con otros filtros</p>
        </div>
      )}
    </div>
  );
}
