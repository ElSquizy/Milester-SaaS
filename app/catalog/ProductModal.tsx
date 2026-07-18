"use client";
import { useState, useEffect, useRef } from "react";
import CollectionPicker from "./CollectionPicker";
import VariantsManager from "./VariantsManager";
import DescriptionEditor, { type Tmpl } from "./DescriptionEditor";
import ImageTab from "./ImageTab";
import type { TemplateData } from "@/lib/descriptionTemplates";
import { useIsMobile } from "@/components/useIsMobile";

type ImgTmpl = { id: number; name: string; backgroundUrl: string; coverUrl: string; shadowOffsetX: number; shadowOffsetY: number; shadowBlur: number; shadowOpacity: number };

type Product = {
  id: number;
  tiendaNubeId: string | null;
  name: string;
  description: string | null;
  descriptionTemplateId: number | null;
  descriptionData: string | null;
  imageTemplateId: number | null;
  productImageUrl: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  sku: string | null;
  imageUrl: string | null;
  stock: number | null;
  infiniteStock: boolean;
  variants: Array<{ id: number }>;
  categoryIds: number[];
  categoryChips: Array<{ id: number; name: string }>;
};

type Tab = "general" | "descripcion" | "imagen" | "variantes" | "seo";

interface Props {
  product: Product;
  tab: Tab;
  setTab: (t: Tab) => void;
  navIndex?: number;                    // position within the current list
  navTotal?: number;
  onNavigate?: (delta: number) => void; // move to prev/next product, same tab
  onClose: () => void;   // back to the side panel
  onSaved: () => void;   // fully close
}

export default function ProductModal({ product, tab, setTab, navIndex, navTotal, onNavigate, onClose, onSaved }: Props) {
  const isMobile = useIsMobile();
  const [name, setName] = useState(product.name);
  const [sku, setSku] = useState(product.sku || "");
  const [description, setDescription] = useState(product.description || "");
  const [templates, setTemplates] = useState<Tmpl[]>([]);
  const [descMode, setDescMode] = useState<"html" | "template">(product.descriptionTemplateId ? "template" : "html");
  const [tmplId, setTmplId] = useState<number | null>(product.descriptionTemplateId);
  const [tmplData, setTmplData] = useState<TemplateData>(() => {
    try { return product.descriptionData ? JSON.parse(product.descriptionData) : {}; } catch { return {}; }
  });
  const [seoTitle, setSeoTitle] = useState(product.seoTitle || "");
  const [seoDescription, setSeoDescription] = useState(product.seoDescription || "");
  const [imageUrl, setImageUrl] = useState(product.imageUrl || "");
  const [imageTemplates, setImageTemplates] = useState<ImgTmpl[]>([]);
  const [imgTmplId, setImgTmplId] = useState<number | null>(product.imageTemplateId);
  const [productImageUrl, setProductImageUrl] = useState(product.productImageUrl || "");
  const [infiniteStock, setInfiniteStock] = useState(product.infiniteStock);
  const [stock, setStock] = useState(product.stock == null ? "" : String(product.stock));
  const [catIds, setCatIds] = useState<Set<number>>(new Set(product.categoryIds));
  const [extraNames, setExtraNames] = useState<Map<number, string>>(new Map());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/description-templates").then((r) => r.json()).then(setTemplates).catch(() => {});
    fetch("/api/image-templates").then((r) => r.json()).then(setImageTemplates).catch(() => {});
  }, []);

  // Dirty tracking: compare a signature of every editable field to its initial value,
  // so an accidental click outside doesn't silently discard unsaved work.
  const currentSig = JSON.stringify({ name, sku, description, descMode, tmplId, tmplData, seoTitle, seoDescription, imageUrl, imgTmplId, productImageUrl, infiniteStock, stock, cats: [...catIds].sort((a, b) => a - b) });
  const initialSig = useRef<string | null>(null);
  if (initialSig.current === null) initialSig.current = currentSig;
  const dirty = initialSig.current !== currentSig;

  // When leaving (closing OR moving to another product) with unsaved changes,
  // hold the intended action and ask: save, discard, or cancel. The dialog's
  // "Guardar cambios" therefore doubles as "guardar y siguiente".
  const [pendingClose, setPendingClose] = useState<null | { run: () => void }>(null);
  function requestClose(fn: () => void) {
    if (dirty) setPendingClose({ run: fn });
    else fn();
  }

  // navIndex is -1 when the edited product isn't part of the current list
  // (e.g. opened by URL while the page shows other results) — then we can't walk it.
  const inList = navIndex !== undefined && navIndex >= 0;
  const canPrev = !!onNavigate && inList && navIndex! > 0;
  const canNext = !!onNavigate && inList && navTotal !== undefined && navIndex! < navTotal - 1;
  function go(delta: number) {
    if (!onNavigate) return;
    requestClose(() => onNavigate(delta));
  }

  // ESC closes; Alt+←/→ moves between products (Alt so arrows still work in inputs).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") return requestClose(onClose);
      if (e.altKey && e.key === "ArrowLeft" && canPrev) { e.preventDefault(); go(-1); }
      if (e.altKey && e.key === "ArrowRight" && canNext) { e.preventDefault(); go(1); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, canPrev, canNext]);

  const catNameById = new Map<number, string>([
    ...product.categoryChips.map((c) => [c.id, c.name] as [number, string]),
    ...extraNames,
  ]);

  function toggleCat(id: number) {
    setCatIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function persist(sync: boolean): Promise<boolean> {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/products/${product.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name, sku, seoTitle, seoDescription, imageUrl,
          imageTemplateId: imgTmplId, productImageUrl,
          infiniteStock, stock: infiniteStock ? null : (stock.trim() === "" ? null : Number(stock)),
          categoryIds: [...catIds], sync,
          // Template mode renders server-side into `description`; HTML mode sends raw + detaches template.
          ...(descMode === "template" && tmplId
            ? { descriptionTemplateId: tmplId, descriptionData: tmplData }
            : { description, descriptionTemplateId: null }),
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Error al guardar");
      }
      return true;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function save(sync: boolean) {
    if (await persist(sync)) {
      setSaved(true);
      setTimeout(() => { setSaved(false); onSaved(); }, 1000);
    }
  }

  // "Guardar" from the unsaved-changes dialog: persist, then run the pending close.
  async function saveThenClose() {
    const action = pendingClose;
    if (await persist(false)) { setPendingClose(null); (action?.run ?? onSaved)(); }
  }

  return (
    <>
      {/* Dark blurred backdrop */}
      <div
        onClick={() => requestClose(onClose)}
        className="anim-in"
        style={{
          position: "fixed", inset: 0, zIndex: isMobile ? 400 : 60,
          background: "rgba(17,24,39,0.40)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)",
          display: "flex", alignItems: "flex-start", justifyContent: "center",
          padding: isMobile ? 0 : "56px 24px", overflowY: "auto",
        }}
      >
        {/* Dialog — full-screen on mobile (above the app top bar), centered card on desktop */}
        <div
          onClick={(e) => e.stopPropagation()}
          className="anim-modal"
          style={{
            width: "100%", maxWidth: isMobile ? "none" : 940,
            background: "var(--color-surface)",
            borderRadius: isMobile ? 0 : "var(--radius-modal)",
            boxShadow: "var(--shadow-float)",
            display: "flex", flexDirection: "column",
            maxHeight: isMobile ? "100dvh" : "calc(100dvh - 112px)",
            minHeight: isMobile ? "100dvh" : undefined,
          }}
        >
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: isMobile ? "14px 16px" : "22px 28px", borderBottom: "1px solid var(--color-divider)", flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: 1 }}>
              <button onClick={() => requestClose(onClose)} title="Volver al panel" style={{ width: 32, height: 32, flexShrink: 0, borderRadius: 9, border: "1px solid var(--color-border)", background: "var(--color-surface)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-muted)" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
              </button>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: isMobile ? "1rem" : "1.125rem", fontWeight: 600, letterSpacing: "-0.02em", color: "var(--color-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: isMobile ? "100%" : 420 }}>{product.name}</div>
                <div style={{ fontSize: "0.75rem", color: "var(--color-subtle)", marginTop: 1 }}>ID {product.id}{product.sku && ` · ${product.sku}`}</div>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {/* Move between products without leaving the tab you're working on */}
              {onNavigate && inList && navTotal !== undefined && navTotal > 1 && (
                <div style={{ display: "flex", alignItems: "center", gap: 4, marginRight: 4 }}>
                  <button onClick={() => go(-1)} disabled={!canPrev} title="Producto anterior (Alt + ←)" style={navBtn(!canPrev)}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
                  </button>
                  <span style={{ fontSize: "0.75rem", color: "var(--color-subtle)", fontVariantNumeric: "tabular-nums", minWidth: 52, textAlign: "center" }}>
                    {(navIndex ?? 0) + 1} / {navTotal}
                  </span>
                  <button onClick={() => go(1)} disabled={!canNext} title="Producto siguiente (Alt + →)" style={navBtn(!canNext)}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
                  </button>
                </div>
              )}
              <button onClick={() => requestClose(onSaved)} style={{ width: 32, height: 32, borderRadius: 9, border: "none", background: "var(--color-surface-2)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-muted)" }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
          </div>

          {/* Tab bar */}
          <div style={{ display: "flex", gap: 2, padding: isMobile ? "0 10px" : "0 20px", borderBottom: "1px solid var(--color-divider)", flexShrink: 0, overflowX: "auto", scrollbarWidth: "none" }}>
            {([
              ["general", "General"],
              ["descripcion", "Descripción"],
              ["imagen", "Imagen"],
              ["variantes", "Variantes"],
              ["seo", "SEO"],
            ] as const).map(([v, label]) => (
              <button key={v} onClick={() => setTab(v)} style={{
                position: "relative", padding: "13px 14px", border: "none", background: "transparent", cursor: "pointer",
                fontSize: "0.875rem", fontWeight: tab === v ? 600 : 500,
                color: tab === v ? "var(--color-brand)" : "var(--color-muted)",
                flexShrink: 0, whiteSpace: "nowrap",
              }}>
                {label}
                {tab === v && <span style={{ position: "absolute", left: 8, right: 8, bottom: -1, height: 2, background: "var(--color-brand)", borderRadius: 2 }} />}
              </button>
            ))}
          </div>

          {/* Body */}
          <div style={{ flex: 1, overflowY: "auto", padding: isMobile ? "18px 16px" : "24px 28px" }}>
            {tab === "general" && (
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 320px", gap: isMobile ? 18 : 32 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 20, minWidth: 0 }}>
                  <Field label="Nombre">
                    <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
                  </Field>
                  <Field label="SKU" hint="Código interno">
                    <input className="input" value={sku} onChange={(e) => setSku(e.target.value)} placeholder="Ej: PS5-DIG-0601" style={{ fontFamily: "var(--font-mono), monospace" }} />
                  </Field>
                  <Field label="Stock">
                    {product.variants.length > 1 ? (
                      <p style={{ fontSize: "0.8125rem", color: "var(--color-subtle)", margin: 0 }}>Este producto tiene variantes — gestioná el stock en la pestaña <strong>Variantes</strong>.</p>
                    ) : (
                      <>
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          <button type="button" className="switch" data-on={infiniteStock} onClick={() => setInfiniteStock((v) => !v)} aria-label="Stock ilimitado" />
                          <span style={{ fontSize: "0.875rem", color: "var(--color-ink)" }}>Stock ilimitado (∞)</span>
                          {!infiniteStock && (
                            <input className="input" type="number" min={0} value={stock} onChange={(e) => setStock(e.target.value)} placeholder="0" style={{ width: 110, marginLeft: "auto" }} />
                          )}
                        </div>
                        {/* TN only honours unlimited stock at CREATE time; updates are silently ignored. */}
                        {infiniteStock && !product.infiniteStock && product.tiendaNubeId && (
                          <p style={{ marginTop: 8, padding: "8px 11px", borderRadius: 8, background: "var(--color-warning-bg)", border: "1px solid var(--color-warning)", fontSize: "0.75rem", color: "var(--color-warning)", lineHeight: 1.5 }}>
                            ⚠ Tienda Nube solo permite <strong>stock ilimitado al crear</strong> el producto. Para este producto ya publicado, activalo desde el panel de Tienda Nube — acá se guarda solo el valor local.
                          </p>
                        )}
                      </>
                    )}
                  </Field>
                  <Field label="Colecciones" hint={`${catIds.size}`}>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                      {[...catIds].map((id) => (
                        <span key={id} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 9px", borderRadius: "var(--radius-pill)", background: "var(--color-surface-2)", fontSize: "0.75rem", color: "var(--color-ink)", fontWeight: 500 }}>
                          {catNameById.get(id) || `#${id}`}
                          <button onClick={() => toggleCat(id)} style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--color-subtle)", padding: 0, fontSize: "1rem", lineHeight: 1 }}>×</button>
                        </span>
                      ))}
                      {catIds.size === 0 && <span style={{ fontSize: "0.8125rem", color: "var(--color-subtle)" }}>Sin colecciones</span>}
                    </div>
                    <CollectionPicker selectedIds={catIds} onToggle={(id, nm) => { setExtraNames((p) => new Map(p).set(id, nm)); toggleCat(id); }} />
                  </Field>
                </div>
                <div>
                  <Field label="Imagen">
                    <div style={{ aspectRatio: "1", borderRadius: "var(--radius-input)", overflow: "hidden", background: "var(--color-surface-2)", border: "1px solid var(--color-border)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 8 }}>
                      {imageUrl
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        : <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--color-faint)" strokeWidth="1.5" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>}
                    </div>
                    <input className="input" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="URL de la imagen" style={{ fontSize: "0.8125rem" }} />
                  </Field>
                </div>
              </div>
            )}

            {tab === "descripcion" && (
              <DescriptionEditor
                templates={templates}
                mode={descMode} setMode={setDescMode}
                html={description} setHtml={setDescription}
                templateId={tmplId} setTemplateId={setTmplId}
                data={tmplData} setData={setTmplData}
                productName={name}
              />
            )}

            {tab === "imagen" && (
              <ImageTab
                productId={product.id}
                imageTemplates={imageTemplates}
                imgTmplId={imgTmplId} setImgTmplId={setImgTmplId}
                productImageUrl={productImageUrl} setProductImageUrl={setProductImageUrl}
                fallbackImageUrl={imageUrl}
              />
            )}

            {tab === "variantes" && <VariantsManager productId={product.id} />}

            {tab === "seo" && (
              <div style={{ maxWidth: 560, display: "flex", flexDirection: "column", gap: 18 }}>
                <Field label="Título SEO" hint={`${seoTitle.length} car.`}>
                  <input className="input" value={seoTitle} onChange={(e) => setSeoTitle(e.target.value)} placeholder="Título para buscadores" />
                </Field>
                <Field label="Meta descripción" hint={`${seoDescription.length} car.`}>
                  <textarea className="input" value={seoDescription} onChange={(e) => setSeoDescription(e.target.value)} rows={4} style={{ resize: "vertical", lineHeight: 1.5, fontFamily: "inherit" }} placeholder="Descripción para resultados de búsqueda" />
                </Field>
              </div>
            )}
          </div>

          {/* Footer */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 28px", borderTop: "1px solid var(--color-divider)", flexShrink: 0 }}>
            {error && <span style={{ flex: 1, fontSize: "0.8125rem", color: "var(--color-danger)" }}>{error}</span>}
            {saved && <span style={{ flex: 1, fontSize: "0.8125rem", color: "var(--color-success)", fontWeight: 600 }}>✓ Guardado</span>}
            {!error && !saved && <span style={{ flex: 1 }} />}
            <button className="btn-secondary" onClick={() => save(false)} disabled={saving}>Guardar</button>
            <button className="btn-primary" onClick={() => save(true)} disabled={saving} style={{ whiteSpace: "nowrap" }}>
              {saving ? "Guardando..." : "Guardar y sincronizar"}
            </button>
          </div>
        </div>
      </div>

      {/* Unsaved-changes dialog */}
      {pendingClose && (
        <div
          onClick={() => setPendingClose(null)}
          className="anim-in"
          style={{ position: "fixed", inset: 0, zIndex: 70, background: "rgba(17,24,39,0.45)", backdropFilter: "blur(3px)", WebkitBackdropFilter: "blur(3px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
        >
          <div onClick={(e) => e.stopPropagation()} className="anim-modal" style={{ width: "100%", maxWidth: 420, background: "var(--color-surface)", borderRadius: "var(--radius-modal)", boxShadow: "var(--shadow-float)", padding: "24px 26px" }}>
            <div style={{ fontSize: "1.0625rem", fontWeight: 600, letterSpacing: "-0.02em", marginBottom: 6 }}>Cambios sin guardar</div>
            <p style={{ fontSize: "0.875rem", color: "var(--color-muted)", margin: "0 0 20px", lineHeight: 1.5 }}>
              Tenés cambios sin guardar en este producto. ¿Qué querés hacer?
            </p>
            {error && <p style={{ fontSize: "0.8125rem", color: "var(--color-danger)", margin: "0 0 12px" }}>{error}</p>}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button className="btn-primary" onClick={saveThenClose} disabled={saving}>{saving ? "Guardando…" : "Guardar cambios"}</button>
              <button className="btn-secondary" onClick={() => { const a = pendingClose; setPendingClose(null); a.run(); }} disabled={saving} style={{ color: "var(--color-danger)" }}>Salir sin guardar</button>
              <button className="btn-secondary" onClick={() => setPendingClose(null)} disabled={saving}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const navBtn = (disabled: boolean): React.CSSProperties => ({
  width: 30, height: 30, borderRadius: 8,
  border: "1px solid var(--color-border)", background: "var(--color-surface)",
  cursor: disabled ? "default" : "pointer",
  display: "flex", alignItems: "center", justifyContent: "center",
  color: disabled ? "var(--color-faint)" : "var(--color-muted)",
});

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <label style={{ fontSize: "0.8125rem", fontWeight: 500, color: "var(--color-muted)" }}>{label}</label>
        {hint && <span style={{ fontSize: "0.75rem", color: "var(--color-subtle)" }}>{hint}</span>}
      </div>
      {children}
    </div>
  );
}
