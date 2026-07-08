"use client";
import { useState, useEffect, Fragment } from "react";
import { useRouter } from "next/navigation";
import type { CatalogProduct } from "./page";
import CategoryCell from "./CategoryCell";

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
              style={{ cursor: "pointer", width: 15, height: 15, accentColor: "var(--color-brand)" }}
            />
          </th>
          <th style={{ ...th, width: 48 }} />
          <th style={{ ...th, textAlign: "left", minWidth: 200 }}>Nombre</th>
          <th style={{ ...th, textAlign: "left", minWidth: 140 }}>Categoría</th>
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
                  style={{ cursor: "pointer", width: 14, height: 14, accentColor: "var(--color-brand)" }}
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
                    ? <img src={p.imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
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

              {/* Status — unified visibility + sync icons */}
              <td style={{ ...td, paddingRight: 20 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                  <VisibilityIcon published={p.published} />
                  <SyncIcon status={del ? "pending-delete" : p.syncStatus} lastSyncedAt={p.lastSyncedAt} />
                </div>
              </td>
            </tr>
            {isExpanded && (
              <tr>
                <td colSpan={9} style={{ padding: 0, background: "var(--color-surface-2)", borderTop: "1px solid var(--color-divider)" }}>
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

/** Inline-editable product name (commit on blur/Enter → local save). */
function NameCell({ id, name, del }: { id: number; name: string; del: boolean }) {
  const router = useRouter();
  const [val, setVal] = useState(name);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setVal(name); }, [name]);

  async function commit(dom: string) {
    const v = dom.trim();
    if (!v || v === name) { setVal(name); return; }
    setBusy(true);
    try {
      const res = await fetch(`/api/products/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: v }) });
      if (res.ok) router.refresh();
    } finally { setBusy(false); }
  }

  return (
    <input
      value={val}
      onChange={(e) => setVal(e.target.value)}
      onFocus={(e) => { e.currentTarget.style.borderColor = "var(--color-border)"; e.currentTarget.style.background = "var(--color-surface)"; e.currentTarget.style.textDecoration = "none"; }}
      onBlur={(e) => { const v = e.target.value; e.currentTarget.style.borderColor = "transparent"; e.currentTarget.style.background = "transparent"; commit(v); }}
      onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      disabled={busy}
      title="Editar nombre"
      style={{
        width: "100%", border: "1px solid transparent", background: "transparent", outline: "none",
        fontWeight: 500, color: "var(--color-ink)", padding: "3px 6px", borderRadius: 7,
        textDecoration: del ? "line-through" : "none", cursor: "text", textOverflow: "ellipsis",
      }}
    />
  );
}

/** Inline-editable stock; ∞ or read-only when unlimited or multi-variant. */
function StockCell({ id, stock, infinite, editable }: { id: number; stock: number | null; infinite: boolean; editable: boolean }) {
  const router = useRouter();
  const [raw, setRaw] = useState(stock == null ? "" : String(stock));
  const [busy, setBusy] = useState(false);
  useEffect(() => { setRaw(stock == null ? "" : String(stock)); }, [stock]);

  const color = stock === 0 ? "var(--color-danger)" : stock != null && stock < 5 ? "var(--color-warning)" : "var(--color-muted)";

  if (infinite) return <span title="Stock ilimitado" style={{ color: "var(--color-muted)", fontSize: "1rem" }}>∞</span>;
  if (!editable) {
    return stock != null
      ? <span title="Stock por variante — editá en la edición avanzada" style={{ color }}>{stock.toLocaleString("es-AR")}</span>
      : <span style={{ color: "var(--color-faint)" }}>—</span>;
  }

  async function commit(dom: string) {
    const t = dom.trim();
    const v = t === "" ? null : Math.max(0, Math.round(parseFloat(t.replace(/[^\d]/g, "")) || 0));
    if ((v ?? null) === (stock ?? null)) { setRaw(stock == null ? "" : String(stock)); return; }
    setBusy(true);
    try {
      const res = await fetch(`/api/products/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stock: v }) });
      if (res.ok) router.refresh();
    } finally { setBusy(false); }
  }

  return (
    <input
      value={raw}
      onChange={(e) => setRaw(e.target.value)}
      onFocus={(e) => { e.currentTarget.style.borderColor = "var(--color-border)"; e.currentTarget.style.background = "var(--color-surface)"; }}
      onBlur={(e) => { const v = e.target.value; e.currentTarget.style.borderColor = "transparent"; e.currentTarget.style.background = "transparent"; commit(v); }}
      onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      disabled={busy}
      title="Editar stock"
      placeholder="0"
      style={{
        width: 58, border: "1px solid transparent", background: "transparent", outline: "none",
        textAlign: "right", fontVariantNumeric: "tabular-nums", color, padding: "3px 6px", borderRadius: 7, cursor: "text",
      }}
    />
  );
}

type LocalVariant = { tiendaNubeId: string | null; values: string[]; price: number; promotionalPrice: number | null; stock: number | null; sku: string | null };

/** Expanded sub-rows: a product's variants with inline-editable price/promo/stock (local, staged). */
function VariantRows({ productId }: { productId: number }) {
  const router = useRouter();
  const [rows, setRows] = useState<LocalVariant[] | null>(null);
  useEffect(() => {
    // Labels (attribute values) from the live TN state; price/promo/stock from the local
    // mirror so any staged, not-yet-synced edits are reflected.
    Promise.all([
      fetch(`/api/products/${productId}/variants`).then((r) => r.json()),
      fetch(`/api/products/${productId}/variants?local=1`).then((r) => r.json()),
    ]).then(([live, local]) => {
      const byTn = new Map((local.variants || []).map((v: LocalVariant) => [v.tiendaNubeId, v]));
      const merged: LocalVariant[] = (live.variants || []).map((v: LocalVariant) => {
        const l = byTn.get(v.tiendaNubeId) as LocalVariant | undefined;
        return { ...v, price: l?.price ?? v.price, promotionalPrice: l?.promotionalPrice ?? v.promotionalPrice, stock: l?.stock ?? v.stock };
      });
      setRows(merged.length ? merged : (local.variants || []));
    }).catch(() => setRows([]));
  }, [productId]);

  async function commit(tnId: string | null, field: "price" | "promotionalPrice" | "stock", raw: string) {
    const body: Record<string, unknown> = { tiendaNubeId: tnId };
    body[field] = raw.trim() === "" ? null : raw;
    await fetch(`/api/products/${productId}/variants`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    router.refresh();
  }

  if (rows === null) return <div style={{ padding: "10px 20px 10px 68px", fontSize: "0.8125rem", color: "var(--color-subtle)" }}>Cargando variantes…</div>;
  return (
    <div style={{ padding: "4px 20px 8px 68px" }}>
      {rows.map((v, i) => (
        <div key={v.tiendaNubeId || i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", borderTop: i > 0 ? "1px solid var(--color-divider)" : "none" }}>
          <span style={{ flex: 1, minWidth: 0, fontSize: "0.8125rem", color: "var(--color-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.values.filter(Boolean).join(" · ") || "Variante"}</span>
          <VLabel>Precio</VLabel><VInput initial={String(v.price)} onCommit={(raw) => commit(v.tiendaNubeId, "price", raw)} />
          <VLabel>Promo</VLabel><VInput initial={v.promotionalPrice == null ? "" : String(v.promotionalPrice)} placeholder="—" onCommit={(raw) => commit(v.tiendaNubeId, "promotionalPrice", raw)} />
          <VLabel>Stock</VLabel><VInput initial={v.stock == null ? "" : String(v.stock)} placeholder="∞" width={52} onCommit={(raw) => commit(v.tiendaNubeId, "stock", raw)} />
        </div>
      ))}
    </div>
  );
}
function VLabel({ children }: { children: React.ReactNode }) {
  return <span style={{ fontSize: "0.625rem", textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--color-subtle)", fontWeight: 700 }}>{children}</span>;
}
function VInput({ initial, onCommit, placeholder, width = 82 }: { initial: string; onCommit: (raw: string) => Promise<void>; placeholder?: string; width?: number }) {
  const [v, setV] = useState(initial);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setV(initial); }, [initial]);
  return (
    <input
      value={v} placeholder={placeholder} disabled={busy}
      onChange={(e) => setV(e.target.value)}
      onFocus={(e) => { e.currentTarget.style.borderColor = "var(--color-border)"; e.currentTarget.style.background = "var(--color-surface)"; }}
      onBlur={async (e) => { const raw = e.target.value; e.currentTarget.style.borderColor = "transparent"; e.currentTarget.style.background = "transparent"; if (raw !== initial) { setBusy(true); try { await onCommit(raw); } finally { setBusy(false); } } }}
      onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      style={{ width, border: "1px solid transparent", background: "transparent", outline: "none", textAlign: "right", fontVariantNumeric: "tabular-nums", padding: "3px 6px", borderRadius: 7, fontSize: "0.8125rem", fontWeight: 600, color: "var(--color-ink)", cursor: "text" }}
    />
  );
}

function parsePrice(v: string): number | null {
  const n = parseFloat(v.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", "."));
  return isNaN(n) ? null : n;
}
function fmtMoney(raw: string): string {
  if (raw.trim() === "") return "";
  const n = parsePrice(raw);
  return n == null ? raw : `$${n.toLocaleString("es-AR")}`;
}

/**
 * One inline-editable price field (base or promotional), shown in its own column.
 * Base is gray. Promo is empty when there's no sale; green when it's an active promo
 * (a value below the base price), amber when set but not below base (won't apply).
 */
function PriceField({ id, field, value, base }: {
  id: number; field: "price" | "promotionalPrice"; value: number | null; base: number;
}) {
  const router = useRouter();
  const [raw, setRaw] = useState(value != null ? String(value) : "");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState(false);

  useEffect(() => { setRaw(value != null ? String(value) : ""); }, [value]);

  async function commit(dom: string) {
    let bodyVal: number | null;
    if (field === "price") {
      const v = parsePrice(dom);
      if (v == null || v === value) { setRaw(value != null ? String(value) : ""); return; }
      bodyVal = v;
    } else {
      const v = dom.trim() === "" ? null : parsePrice(dom);
      if ((v ?? null) === (value ?? null)) { setRaw(value != null ? String(value) : ""); return; }
      bodyVal = v;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/products/${id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(field === "price" ? { price: bodyVal } : { promotionalPrice: bodyVal }),
      });
      if (res.ok) { setFlash(true); setTimeout(() => setFlash(false), 900); router.refresh(); }
    } finally { setBusy(false); }
  }

  const isPromo = field === "promotionalPrice";
  const activePromo = isPromo && value != null && value < base;
  const color = !isPromo
    ? "var(--color-muted)"                                    // base — gray
    : value == null ? "var(--color-faint)"                    // no promo
    : activePromo ? "var(--color-success)"                    // applies
    : "var(--color-warning)";                                 // set but ≥ base

  return (
    <span style={{ position: "relative", display: "inline-block" }} onKeyDown={(e) => e.stopPropagation()}>
      <input
        value={editing ? raw : fmtMoney(raw)}
        placeholder={isPromo ? "—" : ""}
        onChange={(e) => setRaw(e.target.value)}
        onFocus={(e) => { setEditing(true); e.currentTarget.style.borderColor = "var(--color-border)"; e.currentTarget.style.background = "var(--color-surface)"; }}
        onBlur={(e) => { const v = e.target.value; setEditing(false); e.currentTarget.style.borderColor = "transparent"; e.currentTarget.style.background = "transparent"; commit(v); }}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        disabled={busy}
        title={isPromo ? "Precio promocional (vacío = sin oferta)" : "Precio base"}
        style={{
          border: "1px solid transparent", background: "transparent", outline: "none",
          textAlign: "right", fontVariantNumeric: "tabular-nums", width: 104,
          padding: "3px 6px", borderRadius: 7, cursor: "text",
          color, fontWeight: activePromo ? 600 : 500,
        }}
      />
      {flash && <span style={{ position: "absolute", right: 108, top: 6, fontSize: "0.6875rem", color: "var(--color-success)" }}>✓</span>}
    </span>
  );
}

function IconChip({ color, bg, title, spin, children }: {
  color: string; bg: string; title: string; spin?: boolean; children: React.ReactNode;
}) {
  return (
    <span
      title={title}
      style={{
        width: 26, height: 26, borderRadius: 8, flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: bg, color,
      }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={spin ? "anim-spin" : undefined}>
        {children}
      </svg>
    </span>
  );
}

function VisibilityIcon({ published }: { published: boolean }) {
  return published ? (
    <IconChip color="var(--color-success)" bg="var(--color-success-bg)" title="Publicado">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
    </IconChip>
  ) : (
    <IconChip color="var(--color-subtle)" bg="var(--color-surface-2)" title="Oculto">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" />
    </IconChip>
  );
}

function SyncIcon({ status, lastSyncedAt }: { status: string; lastSyncedAt: Date | string | null }) {
  if (status === "pending-delete") {
    return (
      <IconChip color="var(--color-danger)" bg="var(--color-danger-bg, #FEF2F2)" title="Se eliminará al sincronizar">
        <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      </IconChip>
    );
  }
  if (status === "error") {
    return (
      <IconChip color="var(--color-danger)" bg="var(--color-danger-bg, #FEF2F2)" title="Error al sincronizar">
        <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
      </IconChip>
    );
  }
  if (status === "syncing") {
    return (
      <IconChip color="var(--color-brand)" bg="var(--color-brand-light)" title="Sincronizando…" spin>
        <path d="M21 2v6h-6" /><path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M3 22v-6h6" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
      </IconChip>
    );
  }
  if (status === "modified" || status === "pending") {
    return (
      <IconChip color="var(--color-warning)" bg="var(--color-warning-bg)" title="Cambios sin sincronizar">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
      </IconChip>
    );
  }
  return (
    <IconChip color="var(--color-success)" bg="var(--color-success-bg)" title={lastSyncedAt ? `Sincronizado ${formatDate(lastSyncedAt)}` : "Sincronizado"}>
      <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" /><polyline points="9 15 11 17 15 12" />
    </IconChip>
  );
}

function SalesCell({ unitsSold, lastSoldAt }: { unitsSold: number; lastSoldAt: Date | string | null }) {
  if (unitsSold === 0) {
    return <span style={{ color: "var(--color-faint)" }}>—</span>;
  }
  // Flag dead stock: last sale older than 60 days.
  const stale = lastSoldAt
    ? (Date.now() - new Date(lastSoldAt).getTime()) / 86400000 > 60
    : true;
  return (
    <span style={{ display: "inline-flex", alignItems: "baseline", gap: 5, justifyContent: "flex-end" }}>
      <span style={{ color: "var(--color-ink)", fontWeight: 500 }}>{unitsSold.toLocaleString("es-AR")}</span>
      {stale && (
        <span title="Sin ventas recientes" style={{ fontSize: "0.6875rem", color: "var(--color-warning)" }}>●</span>
      )}
    </span>
  );
}

function formatDate(d: Date | string) {
  const date = new Date(d);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `hace ${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `hace ${days}d`;
  return date.toLocaleDateString("es-AR", { day: "numeric", month: "short" });
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
