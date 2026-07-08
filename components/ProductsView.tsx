"use client";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ProductsTable from "./ProductsTable";
import ProductGrid from "./ProductGrid";
import ProductPanel from "./ProductPanel";
import BulkBar from "./BulkBar";

interface Promotion { promoPrice: number; endDate: string; active: boolean }
interface Product {
  id: number; name: string; price: number; originalPrice: number;
  imageUrl: string | null; categoryName: string | null; stock: number | null;
  syncStatus: string; tiendaNubeId: string | null; seoTitle: string | null;
  promotion: Promotion | null;
}
interface EditProduct {
  id: number; name: string; description: string; price: number; originalPrice: number;
  seoTitle: string; seoDescription: string; imageUrl: string | null;
  syncStatus: string;
  promotion: { promoPrice: number; startDate: string; endDate: string; active: boolean } | null;
  variants: { id?: number; tiendaNubeId?: string | null; price: number; stock: number | null; sku: string | null }[];
}
interface AiProvider { id: number; name: string; provider: string }

interface Props {
  products: Product[];
  editProduct: EditProduct | null;
  aiProviders: AiProvider[];
}

function IconGrid() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
    </svg>
  );
}
function IconList() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  );
}

export default function ProductsView({ products, editProduct, aiProviders }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const [view, setView] = useState<"list" | "grid">(
    (params.get("view") as "list" | "grid") || "list"
  );
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const hasPanel = !!editProduct;

  function switchView(v: "list" | "grid") {
    setView(v);
    const p = new URLSearchParams(params.toString());
    p.set("view", v);
    router.push(`/products?${p.toString()}`);
  }

  function openPanel(id: number) {
    const p = new URLSearchParams(params.toString());
    p.set("edit", String(id));
    router.push(`/products?${p.toString()}`);
  }

  function toggle(id: number) {
    setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function toggleAll() {
    setSelected(selected.size === products.length ? new Set() : new Set(products.map((p) => p.id)));
  }

  return (
    <>
      {/* View toggle */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
        <div style={{
          display: "flex", gap: 2, padding: 3,
          background: "var(--color-surface-2)", border: "1px solid var(--color-border)",
          borderRadius: 9,
        }}>
          {(["list", "grid"] as const).map((v) => (
            <button
              key={v}
              onClick={() => switchView(v)}
              title={v === "list" ? "Vista lista" : "Vista cuadrícula"}
              style={{
                width: 30, height: 28, borderRadius: 7, border: "none", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                background: view === v ? "var(--color-surface)" : "transparent",
                color: view === v ? "var(--color-ink)" : "var(--color-subtle)",
                boxShadow: view === v ? "0 1px 3px oklch(0.16 0.01 265 / 0.08)" : "none",
                transition: "all 0.12s",
              }}
            >
              {v === "list" ? <IconList /> : <IconGrid />}
            </button>
          ))}
        </div>
      </div>

      {/* Main layout: content + panel */}
      <div style={{ display: "flex", gap: 0, alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {view === "list" ? (
            <StripeTable
              products={products}
              selected={selected}
              onToggle={toggle}
              onToggleAll={toggleAll}
              onEdit={openPanel}
            />
          ) : (
            <ProductGrid
              products={products}
              selected={selected}
              onToggle={toggle}
              onToggleAll={toggleAll}
            />
          )}
        </div>

        {/* Side panel */}
        {hasPanel && editProduct && (
          <div style={{
            width: 400, flexShrink: 0,
            animation: "panel-slide-in 0.22s cubic-bezier(0.16,1,0.3,1) both",
          }}>
            <ProductPanel product={editProduct} aiProviders={aiProviders} />
          </div>
        )}
      </div>

      <BulkBar
        selectedIds={Array.from(selected)}
        onClear={() => setSelected(new Set())}
        onDone={() => router.refresh()}
      />
    </>
  );
}

/* ── Stripe-style table ──────────────────────────────────────── */
function StripeTable({
  products, selected, onToggle, onToggleAll, onEdit,
}: {
  products: Product[];
  selected: Set<number>;
  onToggle: (id: number) => void;
  onToggleAll: () => void;
  onEdit: (id: number) => void;
}) {
  const params = useSearchParams();
  const editId = params.get("edit") ? Number(params.get("edit")) : null;

  const syncColor: Record<string, string> = {
    synced: "var(--color-success)",
    pending: "var(--color-warning)",
    error: "var(--color-danger)",
  };
  const syncLabel: Record<string, string> = { synced: "Sync", pending: "Pendiente", error: "Error" };

  /* Column header — sentence case, no uppercase */
  const th: React.CSSProperties = {
    textAlign: "left",
    padding: "11px 14px",
    fontSize: "0.75rem",
    fontWeight: 500,
    color: "var(--color-subtle)",
    whiteSpace: "nowrap",
    borderBottom: "1px solid var(--color-border)",
    background: "var(--color-surface)",
  };

  return (
    <div style={{
      background: "var(--color-surface)",
      border: "1px solid var(--color-border)",
      borderRadius: 12,
      overflow: "hidden",
    }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
        <thead>
          <tr>
            <th style={{ ...th, width: 44, paddingLeft: 18, paddingRight: 0 }}>
              <input
                type="checkbox"
                checked={selected.size === products.length && products.length > 0}
                onChange={onToggleAll}
                style={{ accentColor: "var(--color-brand)", cursor: "pointer" }}
              />
            </th>
            <th style={{ ...th, width: 48, padding: "11px 8px" }} />
            <th style={th}>Producto</th>
            <th style={{ ...th, textAlign: "right" }}>Precio</th>
            <th style={{ ...th, textAlign: "right" }}>Stock</th>
            <th style={th}>Promo</th>
            <th style={th}>SEO</th>
            <th style={th}>Estado</th>
            <th style={{ ...th, width: 70, textAlign: "right", paddingRight: 20 }} />
          </tr>
        </thead>
        <tbody>
          {products.map((p) => {
            const isActive = editId === p.id;
            const isSelected = selected.has(p.id);
            return (
              <TableRow
                key={p.id}
                p={p}
                isActive={isActive}
                isSelected={isSelected}
                onToggle={onToggle}
                onEdit={onEdit}
                syncColor={syncColor}
                syncLabel={syncLabel}
              />
            );
          })}
        </tbody>
      </table>

      {products.length === 0 && (
        <div style={{ textAlign: "center", padding: "72px 20px" }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: "var(--color-surface-2)", margin: "0 auto 12px", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-faint)" strokeWidth="1.5" strokeLinecap="round">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
            </svg>
          </div>
          <p style={{ fontSize: "0.875rem", color: "var(--color-muted)", margin: 0 }}>No se encontraron productos</p>
          <p style={{ fontSize: "0.8rem", color: "var(--color-subtle)", marginTop: 4 }}>Intentá ajustar los filtros</p>
        </div>
      )}
    </div>
  );
}

function TableRow({
  p, isActive, isSelected, onToggle, onEdit, syncColor, syncLabel,
}: {
  p: {
    id: number; name: string; price: number; originalPrice: number;
    imageUrl: string | null; categoryName: string | null; stock: number | null;
    syncStatus: string; seoTitle: string | null;
    promotion: { promoPrice: number; endDate: string; active: boolean } | null;
  };
  isActive: boolean; isSelected: boolean;
  onToggle: (id: number) => void;
  onEdit: (id: number) => void;
  syncColor: Record<string, string>;
  syncLabel: Record<string, string>;
}) {
  const [hovered, setHovered] = useState(false);

  const rowBg = isActive
    ? "var(--color-brand-dim)"
    : isSelected
    ? "oklch(0.972 0.035 86 / 0.6)"
    : hovered
    ? "var(--color-surface-2)"
    : "transparent";

  const td: React.CSSProperties = {
    padding: "14px 14px",
    borderTop: "1px solid var(--color-divider)",
    verticalAlign: "middle",
    transition: "background 0.1s",
  };

  return (
    <tr
      style={{ background: rowBg, transition: "background 0.1s" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Checkbox */}
      <td style={{ ...td, paddingLeft: 18, paddingRight: 0, width: 44 }}>
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onToggle(p.id)}
          style={{ accentColor: "var(--color-brand)", cursor: "pointer" }}
        />
      </td>

      {/* Thumbnail */}
      <td style={{ ...td, padding: "14px 8px", width: 48 }}>
        {p.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.imageUrl} alt={p.name}
            style={{ width: 34, height: 34, objectFit: "cover", borderRadius: 7, border: "1px solid var(--color-divider)", display: "block" }} />
        ) : (
          <div style={{
            width: 34, height: 34, borderRadius: 7,
            background: "var(--color-surface-2)", border: "1px solid var(--color-divider)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--color-faint)" strokeWidth="1.5" strokeLinecap="round">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
          </div>
        )}
      </td>

      {/* Name + category */}
      <td style={{ ...td, maxWidth: 240 }}>
        <div style={{ fontWeight: 500, color: "var(--color-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {p.name}
        </div>
        {p.categoryName && (
          <div style={{ fontSize: "0.75rem", color: "var(--color-subtle)", marginTop: 2 }}>{p.categoryName}</div>
        )}
      </td>

      {/* Price */}
      <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
        {p.promotion?.active ? (
          <div>
            <div style={{ fontWeight: 600, color: "var(--color-success)" }}>
              ${p.promotion.promoPrice.toLocaleString("es-AR")}
            </div>
            <div style={{ fontSize: "0.75rem", color: "var(--color-subtle)", textDecoration: "line-through" }}>
              ${p.originalPrice.toLocaleString("es-AR")}
            </div>
          </div>
        ) : (
          <span style={{ fontWeight: 500, color: "var(--color-ink)" }}>
            ${p.price.toLocaleString("es-AR")}
          </span>
        )}
      </td>

      {/* Stock */}
      <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
        {p.stock != null
          ? <span style={{ color: "var(--color-muted)" }}>{p.stock}</span>
          : <span style={{ color: "var(--color-faint)" }}>—</span>}
      </td>

      {/* Promo */}
      <td style={td}>
        {p.promotion ? (
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            fontSize: "0.75rem", fontWeight: 500,
            color: p.promotion.active ? "var(--color-success)" : "var(--color-muted)",
          }}>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: "currentColor", display: "inline-block" }} />
            {p.promotion.active ? "Activa" : "Prog."}
          </span>
        ) : (
          <span style={{ color: "var(--color-faint)", fontSize: "0.75rem" }}>—</span>
        )}
      </td>

      {/* SEO */}
      <td style={td}>
        {p.seoTitle ? (
          <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: "var(--color-success)" }} />
        ) : (
          <span style={{
            fontSize: "0.7rem", fontWeight: 600,
            color: "var(--color-warning)",
            background: "var(--color-warning-bg)",
            borderRadius: 5, padding: "2px 7px",
          }}>
            Falta
          </span>
        )}
      </td>

      {/* Sync status */}
      <td style={td}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "0.8rem", color: "var(--color-muted)" }}>
          <span style={{
            width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
            background: syncColor[p.syncStatus] || "var(--color-subtle)",
            display: "inline-block",
          }} />
          {syncLabel[p.syncStatus] || p.syncStatus}
        </span>
      </td>

      {/* Edit action */}
      <td style={{ ...td, textAlign: "right", paddingRight: 20 }}>
        <button
          onClick={() => onEdit(p.id)}
          style={{
            fontSize: "0.8rem",
            color: isActive ? "var(--color-brand-text)" : "var(--color-subtle)",
            fontWeight: isActive ? 600 : 400,
            background: "none", border: "none", cursor: "pointer", padding: "2px 0",
          }}
        >
          {isActive ? "Editando" : "Editar"}
        </button>
      </td>
    </tr>
  );
}
