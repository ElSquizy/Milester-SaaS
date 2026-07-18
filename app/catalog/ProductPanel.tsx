"use client";
import { useEffect, useState } from "react";
import CollectionPicker from "./CollectionPicker";
import { isInFocus, toggleFocus } from "./useFocus";
import { useIsMobile } from "@/components/useIsMobile";

type Variant = { id: number; price: number; stock: number | null; sku: string | null };

type Product = {
  id: number;
  tiendaNubeId: string | null;
  name: string;
  description: string | null;
  descriptionTemplateId: number | null;
  imageTemplateId: number | null;
  seoTitle: string | null;
  seoDescription: string | null;
  price: number;
  promotionalPrice: number | null;
  originalPrice: number;
  sku: string | null;
  published: boolean;
  tags: string;
  categoryName: string | null;
  imageUrl: string | null;
  stock: number | null;
  infiniteStock: boolean;
  syncStatus: string;
  unitsSold: number;
  lastSoldAt: Date | string | null;
  variants: Variant[];
  categoryIds: number[];
  categoryChips: Array<{ id: number; name: string }>;
};

interface Props {
  product: Product;
  onClose: () => void;
  onSaved: () => void;
  onAdvanced: () => void;
}

const fmt = (n: number) => `$${n.toLocaleString("es-AR")}`;

export default function ProductPanel({ product, onClose, onSaved, onAdvanced }: Props) {
  const isMobile = useIsMobile();
  const originalTags: string[] = (() => { try { return JSON.parse(product.tags); } catch { return []; } })();

  const [name, setName] = useState(product.name);
  const [price, setPrice] = useState(String(product.price));
  const [promo, setPromo] = useState(product.promotionalPrice != null ? String(product.promotionalPrice) : "");
  const [sku, setSku] = useState(product.sku || "");
  const [published, setPublished] = useState(product.published);
  const [infiniteStock, setInfiniteStock] = useState(product.infiniteStock);
  const [stock, setStock] = useState(product.stock == null ? "" : String(product.stock));
  const [tagInput, setTagInput] = useState(originalTags.join(", "));
  const [catIds, setCatIds] = useState<Set<number>>(new Set(product.categoryIds));
  const [extraCatNames, setExtraCatNames] = useState<Map<number, string>>(new Map());
  const [showPicker, setShowPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<string | null>(null); // quick actions
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [inFocus, setInFocus] = useState(false);
  useEffect(() => { setInFocus(isInFocus(product.id)); }, [product.id]);

  const singleVariant = product.variants.length <= 1;
  const parsedPrice = parseFloat(price.replace(/\./g, "").replace(",", "."));
  const parsedPromo = promo.trim() === "" ? null : parseFloat(promo.replace(/\./g, "").replace(",", "."));
  const parsedStock = stock.trim() === "" ? null : Math.max(0, Math.round(Number(stock)));
  const normSku = sku.trim() || null;
  const parsedTags = tagInput.split(",").map((t) => t.trim()).filter(Boolean);

  // TN only accepts unlimited stock at CREATE time; on an existing product the
  // API silently ignores it. Warn instead of failing quietly.
  const infiniteWarning = infiniteStock && !product.infiniteStock && !!product.tiendaNubeId;

  const catNameById = new Map<number, string>([
    ...product.categoryChips.map((c) => [c.id, c.name] as [number, string]),
    ...extraCatNames,
  ]);
  const originalCatIds = new Set(product.categoryIds);

  // Diff between edited state and the original values.
  const stockLabel = (inf: boolean, st: number | null) => (inf ? "∞" : String(st ?? 0));
  const diffs: { label: string; from: React.ReactNode; to: React.ReactNode }[] = [];
  if (name !== product.name) diffs.push({ label: "Nombre", from: product.name, to: name });
  if (!isNaN(parsedPrice) && parsedPrice !== product.price)
    diffs.push({ label: "Precio base", from: fmt(product.price), to: fmt(parsedPrice) });
  if ((parsedPromo ?? null) !== (product.promotionalPrice ?? null))
    diffs.push({ label: "Precio promocional", from: product.promotionalPrice != null ? fmt(product.promotionalPrice) : "—", to: parsedPromo != null ? fmt(parsedPromo) : "—" });
  if (singleVariant && (infiniteStock !== product.infiniteStock || (!infiniteStock && parsedStock !== product.stock)))
    diffs.push({ label: "Stock", from: stockLabel(product.infiniteStock, product.stock), to: stockLabel(infiniteStock, parsedStock) });
  if (normSku !== (product.sku || null))
    diffs.push({ label: "SKU", from: product.sku || "—", to: normSku || "—" });
  if (published !== product.published)
    diffs.push({ label: "Visibilidad", from: product.published ? "Publicado" : "Oculto", to: published ? "Publicado" : "Oculto" });
  const addedTags = parsedTags.filter((t) => !originalTags.includes(t));
  const removedTags = originalTags.filter((t) => !parsedTags.includes(t));
  if (addedTags.length || removedTags.length)
    diffs.push({ label: "Etiquetas", from: originalTags.join(", ") || "—", to: [...addedTags.map((t) => `+ ${t}`), ...removedTags.map((t) => `− ${t}`)].join("  ") });
  const addedCats = [...catIds].filter((id) => !originalCatIds.has(id));
  const removedCats = [...originalCatIds].filter((id) => !catIds.has(id));
  if (addedCats.length || removedCats.length)
    diffs.push({ label: "Colecciones", from: `${originalCatIds.size}`, to: `${catIds.size} (${addedCats.length ? `+${addedCats.length} ` : ""}${removedCats.length ? `−${removedCats.length}` : ""})`.trim() });

  const hasChanges = diffs.length > 0;
  const hasPendingSync = product.syncStatus === "modified" || product.syncStatus === "error";

  function toggleCat(id: number) {
    setCatIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function handleSave(sync: boolean) {
    setSaving(true);
    setError("");
    try {
      if (isNaN(parsedPrice)) throw new Error("Precio inválido");
      const res = await fetch(`/api/products/${product.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name, price: parsedPrice, promotionalPrice: parsedPromo, sku: normSku, published,
          ...(singleVariant ? { infiniteStock, stock: infiniteStock ? null : parsedStock } : {}),
          tags: JSON.stringify(parsedTags), categoryIds: [...catIds], sync,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Error al guardar");
      }
      setSaved(true);
      setTimeout(() => { setSaved(false); onSaved(); }, 1000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setSaving(false);
    }
  }

  async function runAction(key: string, fn: () => Promise<Response>, confirmMsg?: string) {
    if (confirmMsg && !confirm(confirmMsg)) return;
    setBusy(key);
    setError("");
    try {
      const res = await fn();
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || "Error"); }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} className="anim-in"
        style={{ position: "fixed", inset: 0, background: "rgba(17,24,39,0.16)", zIndex: isMobile ? 400 : 40 }} />

      {/* Floating panel — full-screen on mobile (above the app top bar), floating card on desktop */}
      <div className={isMobile ? "anim-in" : "anim-panel"} style={{
        position: "fixed",
        ...(isMobile
          ? { inset: 0, width: "100%", maxWidth: "none", borderRadius: 0, zIndex: 410 }
          : { top: 14, right: 14, bottom: 14, width: 420, maxWidth: "calc(100vw - 28px)", borderRadius: "var(--radius-card)", zIndex: 50, border: "1px solid var(--color-border)" }),
        background: "var(--color-surface)",
        display: "flex", flexDirection: "column",
        boxShadow: "var(--shadow-float)", overflow: "hidden",
      }}>
        {/* Header: the product itself, not a generic title */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid var(--color-divider)", flexShrink: 0, gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
            {product.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={product.imageUrl} alt="" style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 10, border: "1px solid var(--color-divider)", flexShrink: 0 }} />
            )}
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: "0.9375rem", fontWeight: 600, color: "var(--color-ink)", letterSpacing: "-0.01em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {product.name}
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--color-subtle)", marginTop: 1, display: "flex", alignItems: "center", gap: 8 }}>
                <span>ID {product.id}{product.sku && ` · ${product.sku}`}</span>
                <SyncStatus status={product.syncStatus} />
              </div>
            </div>
          </div>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 9, border: "none", background: "var(--color-surface-2)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-muted)", flexShrink: 0 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        {/* Quick actions */}
        <div style={{ display: "flex", gap: 6, padding: "10px 20px", borderBottom: "1px solid var(--color-divider)", flexShrink: 0 }}>
          <ActionBtn
            label={inFocus ? "En foco" : "Foco"}
            active={inFocus}
            onClick={() => setInFocus(toggleFocus(product.id))}
            icon={<><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="3.5" /></>}
          />
          <ActionBtn
            label="Duplicar"
            busy={busy === "dup"}
            onClick={() => runAction("dup", () => fetch(`/api/products/${product.id}/duplicate`, { method: "POST" }))}
            icon={<><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>}
          />
          <ActionBtn
            label="Sincronizar"
            busy={busy === "sync"}
            onClick={() => runAction("sync", () => fetch(`/api/products/${product.id}/sync`, { method: "POST" }))}
            icon={<><path d="M21 2v6h-6" /><path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M3 22v-6h6" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" /></>}
          />
          {hasPendingSync && (
            <ActionBtn
              label="Deshacer"
              busy={busy === "revert"}
              danger
              onClick={() => runAction("revert", () => fetch(`/api/products/${product.id}/revert`, { method: "POST" }),
                `¿Descartar los cambios sin sincronizar de "${product.name}"? Vuelve a la versión de Tienda Nube.`)}
              icon={<><path d="M3 7v6h6" /><path d="M3.51 13a9 9 0 1 0 2.13-9.36L3 8" /></>}
            />
          )}
        </div>

        {/* Advanced-edit hint bar */}
        <button onClick={onAdvanced} style={{
          display: "flex", alignItems: "center", gap: 8, width: "100%",
          padding: "10px 20px", border: "none", borderBottom: "1px solid var(--color-divider)",
          background: "var(--color-brand-light)", color: "var(--color-brand)",
          fontSize: "0.8125rem", fontWeight: 600, cursor: "pointer", textAlign: "left",
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
            <path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" />
          </svg>
          Edición avanzada (descripción, imagen, variantes, SEO)
          <span style={{ marginLeft: "auto" }}>→</span>
        </button>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>

            {/* Prices — the most-touched fields go first */}
            <div style={{ display: "flex", gap: 12 }}>
              <Field label="Precio base">
                <div style={{ position: "relative" }}>
                  <span style={dollarStyle}>$</span>
                  <input type="text" value={price} onChange={(e) => setPrice(e.target.value)}
                    style={{ ...inputStyle, paddingLeft: 22, fontVariantNumeric: "tabular-nums", color: "var(--color-muted)" }} />
                </div>
              </Field>
              <Field label="Precio promocional" hint="vacío = sin oferta">
                <div style={{ position: "relative" }}>
                  <span style={{ ...dollarStyle, color: promo.trim() === "" ? "var(--color-faint)" : "var(--color-muted)" }}>$</span>
                  <input type="text" value={promo} onChange={(e) => setPromo(e.target.value)} placeholder="—"
                    style={{ ...inputStyle, paddingLeft: 22, fontVariantNumeric: "tabular-nums",
                      color: promo.trim() === "" ? "var(--color-faint)" : (parsedPromo != null && parsedPromo < parsedPrice ? "var(--color-success)" : "var(--color-warning)"),
                      fontWeight: 600 }} />
                </div>
              </Field>
            </div>

            {/* Stock + visibility, side by side */}
            <div style={{ display: "flex", gap: 12 }}>
              <Field label="Stock">
                {singleVariant ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "9px 12px", borderRadius: "var(--radius-input)", border: "1px solid var(--color-border)" }}>
                    <button className="switch" data-on={infiniteStock} aria-label="Stock ilimitado" onClick={() => setInfiniteStock((v) => !v)} />
                    {infiniteStock
                      ? <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--color-ink)" }}>∞</span>
                      : <input type="number" min={0} value={stock} onChange={(e) => setStock(e.target.value)} placeholder="0"
                          style={{ width: "100%", border: "none", outline: "none", background: "transparent", fontSize: "0.875rem", color: "var(--color-ink)", fontVariantNumeric: "tabular-nums" }} />}
                  </div>
                ) : (
                  <button onClick={onAdvanced} style={{ width: "100%", display: "flex", alignItems: "center", gap: 6, padding: "10px 12px", borderRadius: "var(--radius-input)", border: "1px solid var(--color-border)", background: "var(--color-surface)", cursor: "pointer", fontSize: "0.8125rem", color: "var(--color-muted)" }}>
                    {product.variants.length} variantes →
                  </button>
                )}
              </Field>
              <Field label="Visibilidad">
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 12px", borderRadius: "var(--radius-input)", border: "1px solid var(--color-border)" }}>
                  <span style={{ fontSize: "0.875rem", color: "var(--color-ink)", fontWeight: 500 }}>{published ? "Publicado" : "Oculto"}</span>
                  <button className="switch" data-on={published} aria-label="Visibilidad" onClick={() => setPublished(!published)} />
                </div>
              </Field>
            </div>

            {/* TN can't turn an existing product's stock unlimited via the API */}
            {infiniteWarning && (
              <div style={{ padding: "9px 12px", borderRadius: 8, background: "var(--color-warning-bg)", border: "1px solid var(--color-warning)", fontSize: "0.75rem", color: "var(--color-warning)", lineHeight: 1.5 }}>
                ⚠ Tienda Nube solo permite <strong>stock ilimitado al crear</strong> el producto. Para este producto ya publicado, activalo desde el panel de Tienda Nube — acá se guarda solo el valor local.
              </div>
            )}

            {/* Name */}
            <Field label="Nombre">
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
            </Field>

            {/* SKU */}
            <Field label="SKU" hint="Código interno">
              <input type="text" value={sku} onChange={(e) => setSku(e.target.value)} placeholder="Ej: PS5-DIG-0601"
                style={{ ...inputStyle, fontFamily: "var(--font-mono), monospace" }} />
            </Field>

            {/* Tags */}
            <Field label="Etiquetas" hint="Separadas por coma">
              <input type="text" value={tagInput} onChange={(e) => setTagInput(e.target.value)} placeholder="verano, oferta, nuevo..." style={inputStyle} />
            </Field>

            {/* Collections */}
            <Field label="Colecciones" hint={`${catIds.size}`}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: showPicker ? 10 : 8 }}>
                {[...catIds].map((id) => (
                  <span key={id} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 8px", borderRadius: 7, background: "var(--color-surface-2)", border: "1px solid var(--color-divider)", fontSize: "0.8125rem", color: "var(--color-ink)" }}>
                    {catNameById.get(id) || `#${id}`}
                    <button onClick={() => toggleCat(id)} style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--color-faint)", padding: 0, fontSize: "1rem", lineHeight: 1 }}>×</button>
                  </span>
                ))}
                {catIds.size === 0 && <span style={{ fontSize: "0.8125rem", color: "var(--color-faint)" }}>Sin colecciones</span>}
              </div>
              {showPicker ? (
                <CollectionPicker selectedIds={catIds} onToggle={(id, nm) => { setExtraCatNames((prev) => new Map(prev).set(id, nm)); toggleCat(id); }} />
              ) : (
                <button onClick={() => setShowPicker(true)} style={{ padding: "6px 12px", borderRadius: 7, border: "1px dashed var(--color-border)", background: "transparent", color: "var(--color-muted)", fontSize: "0.8125rem", cursor: "pointer" }}>
                  + Editar colecciones
                </button>
              )}
            </Field>

            {/* Templates status — the moulds live in advanced edit */}
            <Field label="Plantillas">
              <button onClick={onAdvanced} style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderRadius: "var(--radius-input)", border: "1px solid var(--color-border)", background: "var(--color-surface)", cursor: "pointer", textAlign: "left" }}>
                <TemplateChip ok={product.descriptionTemplateId != null} label="Descripción" />
                <TemplateChip ok={product.imageTemplateId != null} label="Imagen" />
                <span style={{ marginLeft: "auto", fontSize: "0.8125rem", color: "var(--color-brand)", fontWeight: 600 }}>Editar →</span>
              </button>
            </Field>

            {/* Sales */}
            <div style={{ display: "flex", gap: 1, background: "var(--color-border)", border: "1px solid var(--color-border)", borderRadius: 8, overflow: "hidden" }}>
              <div style={{ flex: 1, background: "var(--color-surface)", padding: "11px 14px" }}>
                <div style={{ fontSize: "1.125rem", fontWeight: 700, letterSpacing: "-0.02em", color: "var(--color-ink)", fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
                  {product.unitsSold.toLocaleString("es-AR")}
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--color-subtle)", marginTop: 3 }}>Unidades vendidas</div>
              </div>
              <div style={{ flex: 1, background: "var(--color-surface)", padding: "11px 14px" }}>
                <div style={{ fontSize: "1.125rem", fontWeight: 700, letterSpacing: "-0.02em", color: "var(--color-ink)", lineHeight: 1 }}>
                  {product.lastSoldAt
                    ? new Date(product.lastSoldAt).toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" })
                    : "—"}
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--color-subtle)", marginTop: 3 }}>Última venta</div>
              </div>
            </div>

            {/* Pending changes diff */}
            {hasChanges && (
              <div style={{ border: "1px solid var(--color-warning)", borderRadius: 8, overflow: "hidden", background: "var(--color-warning-bg)" }}>
                <div style={{ padding: "8px 14px", borderBottom: "1px solid var(--color-warning)", fontSize: "0.75rem", fontWeight: 600, color: "var(--color-warning)", display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: "0.6875rem" }}>⚠</span>
                  Cambios pendientes de guardar
                </div>
                <div style={{ padding: "10px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
                  {diffs.map((d) => (
                    <div key={d.label} style={{ fontSize: "0.8125rem" }}>
                      <div style={{ color: "var(--color-muted)", fontSize: "0.75rem", marginBottom: 2 }}>{d.label}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ color: "var(--color-subtle)", textDecoration: "line-through" }}>{d.from}</span>
                        <span style={{ color: "var(--color-faint)" }}>→</span>
                        <span style={{ color: "var(--color-ink)", fontWeight: 600 }}>{d.to}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: "14px 20px", borderTop: "1px solid var(--color-divider)", flexShrink: 0, display: "flex", alignItems: "center", gap: 10 }}>
          {error && <span style={{ flex: 1, fontSize: "0.8125rem", color: "var(--color-danger)" }}>{error}</span>}
          {saved && <span style={{ flex: 1, fontSize: "0.8125rem", color: "var(--color-success)", fontWeight: 600 }}>✓ Guardado</span>}
          {!error && !saved && <span style={{ flex: 1 }} />}
          <button
            className="btn-primary"
            onClick={() => handleSave(false)}
            disabled={saving || !hasChanges}
            title="Guarda los cambios. Se suben a Tienda Nube desde el botón de sincronizar del panel."
            style={{ padding: "8px 18px", whiteSpace: "nowrap" }}
          >
            {saving ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </div>
    </>
  );
}

function ActionBtn({ label, icon, onClick, busy, active, danger }: {
  label: string; icon: React.ReactNode; onClick: () => void; busy?: boolean; active?: boolean; danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      style={{
        flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
        padding: "8px 4px", borderRadius: 9, cursor: busy ? "default" : "pointer",
        border: `1px solid ${active ? "var(--color-brand)" : "var(--color-border)"}`,
        background: active ? "var(--color-brand-light)" : "var(--color-surface)",
        color: danger ? "var(--color-danger)" : active ? "var(--color-brand)" : "var(--color-muted)",
      }}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={busy ? "anim-spin" : undefined}>
        {busy ? <path d="M21 12a9 9 0 1 1-6.219-8.56" /> : icon}
      </svg>
      <span style={{ fontSize: "0.6875rem", fontWeight: 600 }}>{label}</span>
    </button>
  );
}

function TemplateChip({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`pill ${ok ? "pill-success" : "pill-neutral"}`} style={{ fontSize: "0.6875rem", fontWeight: 600, padding: "3px 8px" }}>
      {ok ? "✓" : "—"} {label}
    </span>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <label style={labelStyle}>{label}</label>
        {hint && <span style={{ fontSize: "0.75rem", color: "var(--color-faint)" }}>{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function SyncStatus({ status }: { status: string }) {
  const map: Record<string, { color: string; label: string }> = {
    synced:   { color: "var(--color-success)", label: "Sincronizado" },
    modified: { color: "var(--color-warning)", label: "Modificado" },
    pending:  { color: "var(--color-warning)", label: "Pendiente" },
    syncing:  { color: "var(--color-info)",    label: "Subiendo…" },
    error:    { color: "var(--color-danger)",  label: "Error" },
  };
  const s = map[status] || { color: "var(--color-subtle)", label: status };
  return (
    <span style={{ color: s.color, fontWeight: 500, fontSize: "0.75rem", display: "inline-flex", alignItems: "center", gap: 4 }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor", display: "inline-block" }} />
      {s.label}
    </span>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "9px 12px",
  border: "1px solid var(--color-border)", borderRadius: "var(--radius-input)",
  background: "var(--color-surface)", fontSize: "0.875rem",
  color: "var(--color-ink)", outline: "none",
};

const labelStyle: React.CSSProperties = {
  fontSize: "0.8125rem", fontWeight: 500, color: "var(--color-muted)",
  display: "block",
};

const dollarStyle: React.CSSProperties = {
  position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)",
  fontSize: "0.875rem", color: "var(--color-muted)", pointerEvents: "none",
};
