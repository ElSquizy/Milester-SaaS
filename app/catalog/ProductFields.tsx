"use client";
import { useState, useEffect } from "react";
import { useDeferredRefresh } from "./useDeferredRefresh";
import { notifyPendingChanged } from "@/lib/pendingEvent";

/**
 * Campos editables de producto, con COMMIT POR CAMPO (guardan al blur/Enter → PUT
 * local → refresh diferido). Compartidos por la vista de tabla y la de tarjetas
 * para que ambas tengan exactamente las mismas capacidades y no vuelvan a divergir.
 */

/** Inline-editable product name. */
export function NameCell({ id, name, del }: { id: number; name: string; del: boolean }) {
  const refresh = useDeferredRefresh();
  const [val, setVal] = useState(name);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setVal(name); }, [name]);

  async function commit(dom: string) {
    const v = dom.trim();
    if (!v || v === name) { setVal(name); return; }
    setBusy(true);
    try {
      const res = await fetch(`/api/products/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: v }) });
      if (res.ok) refresh();
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
export function StockCell({ id, stock, infinite, editable }: { id: number; stock: number | null; infinite: boolean; editable: boolean }) {
  const refresh = useDeferredRefresh();
  const [raw, setRaw] = useState(stock == null ? "" : String(stock));
  const [busy, setBusy] = useState(false);
  useEffect(() => { setRaw(stock == null ? "" : String(stock)); }, [stock]);

  const low = stock != null && stock < 5;
  const color = stock === 0 ? "var(--color-danger)" : low ? "var(--color-warning)" : "var(--color-muted)";
  const weight = stock === 0 || low ? 700 : 500;

  if (infinite) return <span title="Stock ilimitado" style={{ color: "var(--color-muted)", fontSize: "1rem" }}>∞</span>;
  if (!editable) {
    return stock != null
      ? <span title="Stock por variante — editá en las variantes" style={{ color, fontWeight: weight }}>{stock.toLocaleString("es-AR")}</span>
      : <span style={{ color: "var(--color-subtle)" }}>—</span>;
  }

  async function commit(dom: string) {
    const t = dom.trim();
    const v = t === "" ? null : Math.max(0, Math.round(parseFloat(t.replace(/[^\d]/g, "")) || 0));
    if ((v ?? null) === (stock ?? null)) { setRaw(stock == null ? "" : String(stock)); return; }
    setBusy(true);
    try {
      const res = await fetch(`/api/products/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stock: v }) });
      if (res.ok) refresh();
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
        textAlign: "right", fontVariantNumeric: "tabular-nums", color, fontWeight: weight, padding: "3px 6px", borderRadius: 7, cursor: "text",
      }}
    />
  );
}

type LocalVariant = { tiendaNubeId: string | null; values: string[]; price: number; promotionalPrice: number | null; stock: number | null; sku: string | null };

/** Expanded sub-rows: a product's variants with inline-editable price/promo/stock (local, staged). */
export function VariantRows({ productId }: { productId: number }) {
  const refresh = useDeferredRefresh();
  const [rows, setRows] = useState<LocalVariant[] | null>(null);
  useEffect(() => {
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
    refresh();
  }

  if (rows === null) return <div style={{ padding: "10px 14px", fontSize: "0.8125rem", color: "var(--color-subtle)" }}>Cargando variantes…</div>;
  return (
    <div style={{ padding: "4px 14px 8px" }}>
      {rows.map((v, i) => (
        <div key={v.tiendaNubeId || i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", borderTop: i > 0 ? "1px solid var(--color-divider)" : "none", flexWrap: "wrap" }}>
          <span style={{ flex: 1, minWidth: 90, fontSize: "0.8125rem", color: "var(--color-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.values.filter(Boolean).join(" · ") || "Variante"}</span>
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
 * One inline-editable price field (base or promotional). Base is gray. Promo is empty
 * when there's no sale; green when active (below base), amber when set but not below base.
 */
export function PriceField({ id, field, value, base, width = 104 }: {
  id: number; field: "price" | "promotionalPrice"; value: number | null; base: number; width?: number;
}) {
  const refresh = useDeferredRefresh();
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
      if (res.ok) { setFlash(true); setTimeout(() => setFlash(false), 900); refresh(); }
    } finally { setBusy(false); }
  }

  const isPromo = field === "promotionalPrice";
  const activePromo = isPromo && value != null && value < base;
  const color = !isPromo
    ? "var(--color-muted)"
    : value == null ? "var(--color-subtle)"
    : activePromo ? "var(--color-success)"
    : "var(--color-warning)";

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
          textAlign: "right", fontVariantNumeric: "tabular-nums", width,
          padding: "3px 6px", borderRadius: 7, cursor: "text",
          color, fontWeight: activePromo ? 600 : 500,
        }}
      />
      {flash && <span style={{ position: "absolute", right: width + 4, top: 6, fontSize: "0.6875rem", color: "var(--color-success)" }}>✓</span>}
    </span>
  );
}

/**
 * USD cost — local bookkeeping (never syncs to TN). `field` selects the base cost or the
 * promotional cost (drives promotionalPrice via the pricing table).
 */
export function CostUsdField({ id, value, field = "costUsd", width = 92 }: { id: number; value: number | null; field?: "costUsd" | "costUsdPromo"; width?: number }) {
  const refresh = useDeferredRefresh();
  const [raw, setRaw] = useState(value != null ? String(value) : "");
  const [busy, setBusy] = useState(false);
  useEffect(() => { setRaw(value != null ? String(value) : ""); }, [value]);

  async function commit(dom: string) {
    const t = dom.trim().replace(/[^\d.,-]/g, "").replace(",", ".");
    const v = t === "" ? null : parseFloat(t);
    if (t !== "" && (v == null || isNaN(v))) { setRaw(value != null ? String(value) : ""); return; }
    if ((v ?? null) === (value ?? null)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/products/${id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: v }),
      });
      if (res.ok) refresh();
    } finally { setBusy(false); }
  }

  const empty = raw.trim() === "";
  return (
    <span style={{ position: "relative", display: "inline-block" }} onKeyDown={(e) => e.stopPropagation()}>
      <span style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", fontSize: "0.8125rem", pointerEvents: "none", color: empty ? "var(--color-faint)" : "var(--color-muted)" }}>US$</span>
      <input
        value={raw}
        placeholder="—"
        onChange={(e) => setRaw(e.target.value)}
        onFocus={(e) => { e.currentTarget.style.borderColor = "var(--color-border)"; e.currentTarget.style.background = "var(--color-surface)"; }}
        onBlur={(e) => { const v = e.target.value; e.currentTarget.style.borderColor = "transparent"; e.currentTarget.style.background = "transparent"; commit(v); }}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        disabled={busy}
        inputMode="decimal"
        aria-label="Costo en dólares"
        title="Costo en dólares — dato local, no se envía a Tienda Nube"
        style={{
          border: "1px solid transparent", background: "transparent",
          textAlign: "right", fontVariantNumeric: "tabular-nums", width,
          padding: "3px 6px 3px 34px", borderRadius: 7, cursor: "text",
          color: empty ? "var(--color-subtle)" : "var(--color-ink)", fontWeight: empty ? 400 : 600,
        }}
      />
    </span>
  );
}

export function IconChip({ color, title, tone = "quiet", spin, onClick, children }: {
  color: string; title: string; tone?: "quiet" | "solid"; spin?: boolean; onClick?: () => void; children: React.ReactNode;
}) {
  const solid = tone === "solid";
  const style: React.CSSProperties = {
    width: 26, height: 26, borderRadius: 8, flexShrink: 0,
    display: "flex", alignItems: "center", justifyContent: "center",
    background: solid ? color : "transparent",
    color: solid ? "#fff" : color,
  };
  const svg = (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={solid ? 2.2 : 2} strokeLinecap="round" strokeLinejoin="round" className={spin ? "anim-spin" : undefined}>
      {children}
    </svg>
  );
  if (onClick) {
    return (
      <button type="button" title={title} aria-label={title} onClick={onClick}
        onMouseEnter={(e) => { e.currentTarget.style.background = solid ? color : "var(--color-surface-2)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = solid ? color : "transparent"; }}
        style={{ ...style, border: "none", cursor: "pointer", transition: "background 0.12s" }}>
        {svg}
      </button>
    );
  }
  return <span title={title} role="img" aria-label={title} style={style}>{svg}</span>;
}

/** Visibility toggle (staged): published/hidden. Commits immediately. */
export function VisibilityIcon({ id, published }: { id: number; published: boolean }) {
  const refresh = useDeferredRefresh();
  const [busy, setBusy] = useState(false);
  async function toggle() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/products/${id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ published: !published }),
      });
      if (res.ok) { notifyPendingChanged(); refresh(); }
    } finally { setBusy(false); }
  }
  return published ? (
    <IconChip color="var(--color-faint)" title="Publicado — clic para ocultar" onClick={toggle} spin={busy}>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
    </IconChip>
  ) : (
    <IconChip color="var(--color-muted)" title="Oculto — clic para publicar" onClick={toggle} spin={busy}>
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" />
    </IconChip>
  );
}

/** Sync status glyph; clicking forces a push to Tienda Nube. */
export function SyncIcon({ id, status, lastSyncedAt }: { id: number; status: string; lastSyncedAt: Date | string | null }) {
  const refresh = useDeferredRefresh();
  const [busy, setBusy] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  async function forceSync() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/products/${id}/sync`, { method: "POST" });
      if (!res.ok) { const d = await res.json().catch(() => ({})); alert(d.error || "No se pudo sincronizar"); }
      notifyPendingChanged();
      refresh();
    } finally { setBusy(false); }
  }
  if (busy || status === "syncing") {
    return (
      <IconChip color="var(--color-brand)" tone="solid" title="Sincronizando…" spin>
        <path d="M21 2v6h-6" /><path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M3 22v-6h6" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
      </IconChip>
    );
  }
  if (status === "pending-delete") {
    return (
      <IconChip color="var(--color-danger)" tone="solid" title="Se eliminará al sincronizar — clic para forzar" onClick={forceSync}>
        <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      </IconChip>
    );
  }
  if (status === "error") {
    return (
      <IconChip color="var(--color-danger)" tone="solid" title="Error al sincronizar — clic para reintentar" onClick={forceSync}>
        <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
      </IconChip>
    );
  }
  if (status === "modified" || status === "pending") {
    return (
      <IconChip color="var(--color-warning)" tone="solid" title="Cambios sin sincronizar — clic para forzar" onClick={forceSync}>
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
      </IconChip>
    );
  }
  return (
    <IconChip color="var(--color-success-icon)" title={`${mounted && lastSyncedAt ? `Sincronizado ${formatDate(lastSyncedAt)}` : "Sincronizado"} — clic para forzar`} onClick={forceSync}>
      <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" /><polyline points="9 15 11 17 15 12" />
    </IconChip>
  );
}

export function SalesCell({ unitsSold, lastSoldAt }: { unitsSold: number; lastSoldAt: Date | string | null }) {
  if (unitsSold === 0) return <span style={{ color: "var(--color-subtle)" }}>—</span>;
  const stale = lastSoldAt ? (Date.now() - new Date(lastSoldAt).getTime()) / 86400000 > 60 : true;
  return (
    <span style={{ display: "inline-flex", alignItems: "baseline", gap: 5, justifyContent: "flex-end" }}>
      <span style={{ color: "var(--color-ink)", fontWeight: 500 }}>{unitsSold.toLocaleString("es-AR")}</span>
      {stale && <span title="Sin ventas recientes" style={{ fontSize: "0.6875rem", color: "var(--color-warning)" }}>●</span>}
    </span>
  );
}

/** External link to the product's public store page. */
export function VisitProductLink({ url }: { url: string }) {
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" title="Visitar producto en la tienda" aria-label="Visitar producto en la tienda"
      onClick={(e) => e.stopPropagation()}
      style={{ width: 26, height: 26, flexShrink: 0, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-subtle)", transition: "background 0.12s, color 0.12s" }}
      onMouseEnter={(e) => { e.currentTarget.style.background = "var(--color-surface-2)"; e.currentTarget.style.color = "var(--color-brand)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--color-subtle)"; }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
      </svg>
    </a>
  );
}

export function formatDate(d: Date | string) {
  const date = new Date(d);
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `hace ${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `hace ${days}d`;
  return date.toLocaleDateString("es-AR", { day: "numeric", month: "short" });
}
