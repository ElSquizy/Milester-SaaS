"use client";
import { useState, useEffect, useRef } from "react";
import CollectionPicker from "./CollectionPicker";
import VariantsManager from "./VariantsManager";
import DescriptionEditor, { type Tmpl } from "./DescriptionEditor";
import ImageTab from "./ImageTab";
import type { TemplateData } from "@/lib/descriptionTemplates";

type ImgTmpl = { id: number; name: string; backgroundUrl: string; coverUrl: string };

type Product = {
  id: number;
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
  categoryIds: number[];
  categoryChips: Array<{ id: number; name: string }>;
};

interface Props {
  product: Product;
  onClose: () => void;   // back to the side panel
  onSaved: () => void;   // fully close
}

export default function ProductModal({ product, onClose, onSaved }: Props) {
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
  const [catIds, setCatIds] = useState<Set<number>>(new Set(product.categoryIds));
  const [extraNames, setExtraNames] = useState<Map<number, string>>(new Map());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [tab, setTab] = useState<"general" | "descripcion" | "imagen" | "variantes" | "seo">("general");

  useEffect(() => {
    fetch("/api/description-templates").then((r) => r.json()).then(setTemplates).catch(() => {});
    fetch("/api/image-templates").then((r) => r.json()).then(setImageTemplates).catch(() => {});
  }, []);

  // Dirty tracking: compare a signature of every editable field to its initial value,
  // so an accidental click outside doesn't silently discard unsaved work.
  const currentSig = JSON.stringify({ name, sku, description, descMode, tmplId, tmplData, seoTitle, seoDescription, imageUrl, imgTmplId, productImageUrl, cats: [...catIds].sort((a, b) => a - b) });
  const initialSig = useRef<string | null>(null);
  if (initialSig.current === null) initialSig.current = currentSig;
  const dirty = initialSig.current !== currentSig;

  // When closing with unsaved changes, hold the intended close action and ask
  // the user: save, discard, or cancel. When clean, close immediately.
  const [pendingClose, setPendingClose] = useState<null | { run: () => void }>(null);
  function requestClose(fn: () => void) {
    if (dirty) setPendingClose({ run: fn });
    else fn();
  }

  // ESC also triggers the same guard.
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") requestClose(onClose); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty]);

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
          position: "fixed", inset: 0, zIndex: 60,
          background: "rgba(17,24,39,0.40)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)",
          display: "flex", alignItems: "flex-start", justifyContent: "center",
          padding: "56px 24px", overflowY: "auto",
        }}
      >
        {/* Dialog */}
        <div
          onClick={(e) => e.stopPropagation()}
          className="anim-modal"
          style={{
            width: "100%", maxWidth: 940,
            background: "var(--color-surface)",
            borderRadius: "var(--radius-modal)",
            boxShadow: "var(--shadow-float)",
            display: "flex", flexDirection: "column",
            maxHeight: "calc(100dvh - 112px)",
          }}
        >
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "22px 28px", borderBottom: "1px solid var(--color-divider)", flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button onClick={() => requestClose(onClose)} title="Volver al panel" style={{ width: 32, height: 32, borderRadius: 9, border: "1px solid var(--color-border)", background: "var(--color-surface)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-muted)" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
              </button>
              <div>
                <div style={{ fontSize: "1.125rem", fontWeight: 600, letterSpacing: "-0.02em", color: "var(--color-ink)" }}>Edición avanzada</div>
                <div style={{ fontSize: "0.75rem", color: "var(--color-subtle)", marginTop: 1 }}>ID {product.id}{product.sku && ` · ${product.sku}`}</div>
              </div>
            </div>
            <button onClick={() => requestClose(onSaved)} style={{ width: 32, height: 32, borderRadius: 9, border: "none", background: "var(--color-surface-2)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-muted)" }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          </div>

          {/* Tab bar */}
          <div style={{ display: "flex", gap: 2, padding: "0 20px", borderBottom: "1px solid var(--color-divider)", flexShrink: 0 }}>
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
              }}>
                {label}
                {tab === v && <span style={{ position: "absolute", left: 8, right: 8, bottom: -1, height: 2, background: "var(--color-brand)", borderRadius: 2 }} />}
              </button>
            ))}
          </div>

          {/* Body */}
          <div style={{ flex: 1, overflowY: "auto", padding: "24px 28px" }}>
            {tab === "general" && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 32 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 20, minWidth: 0 }}>
                  <Field label="Nombre">
                    <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
                  </Field>
                  <Field label="SKU" hint="Código interno">
                    <input className="input" value={sku} onChange={(e) => setSku(e.target.value)} placeholder="Ej: PS5-DIG-0601" style={{ fontFamily: "var(--font-mono), monospace" }} />
                  </Field>
                  <Field label="Colecciones" hint={`${catIds.size}`}>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                      {[...catIds].map((id) => (
                        <span key={id} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 9px", borderRadius: "var(--radius-pill)", background: "var(--color-surface-2)", fontSize: "0.75rem", color: "var(--color-ink)", fontWeight: 500 }}>
                          {catNameById.get(id) || `#${id}`}
                          <button onClick={() => toggleCat(id)} style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--color-faint)", padding: 0, fontSize: "1rem", lineHeight: 1 }}>×</button>
                        </span>
                      ))}
                      {catIds.size === 0 && <span style={{ fontSize: "0.8125rem", color: "var(--color-faint)" }}>Sin colecciones</span>}
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

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <label style={{ fontSize: "0.8125rem", fontWeight: 500, color: "var(--color-muted)" }}>{label}</label>
        {hint && <span style={{ fontSize: "0.75rem", color: "var(--color-faint)" }}>{hint}</span>}
      </div>
      {children}
    </div>
  );
}
