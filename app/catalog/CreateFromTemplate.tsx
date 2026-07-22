"use client";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { notifyPendingChanged } from "@/lib/pendingEvent";

/**
 * Wizard «Crear producto»: plantilla → versiones → información común →
 * confirmación → productos staged creados. Un producto independiente por
 * versión; la info individual se completa después en el editor del catálogo.
 * Portal a <body> para no quedar atrapado en contextos de apilamiento.
 */

type Tmpl = {
  id: number; name: string; versions: string; categoryIds: string; tags: string;
  descriptionTemplateId: number | null; imageTemplateId: number | null;
};
type Version = {
  key: string; label: string; namePattern: string; skuSuffix: string;
  descriptionTemplateId?: number | null; imageTemplateId?: number | null; categoryIds?: number[];
};
type Planned = { versionKey: string; versionLabel: string; name: string; sku: string; skuConflict: string | null; nameExists: boolean };

const parseJson = <T,>(s: string, fallback: T): T => { try { return JSON.parse(s) as T; } catch { return fallback; } };

const STAGES = ["Plantilla y versiones", "Información común", "Confirmar"] as const;

export default function CreateFromTemplate({ isMobile, onClose, onCreated, onEditProduct }: {
  isMobile: boolean;
  onClose: () => void;
  onCreated: () => void;
  onEditProduct: (id: number) => void;
}) {
  const [stage, setStage] = useState(0);
  const [templates, setTemplates] = useState<Tmpl[] | null>(null);
  const [tplId, setTplId] = useState<number | null>(null);
  const [versionKeys, setVersionKeys] = useState<Set<string>>(new Set());
  const [baseName, setBaseName] = useState("");
  const [baseSku, setBaseSku] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [planned, setPlanned] = useState<Planned[] | null>(null);
  const [created, setCreated] = useState<{ id: number; name: string; sku: string }[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/product-templates").then((r) => r.json()).then((d) => {
      setTemplates(d);
      if (d.length === 1) setTplId(d[0].id);
    }).catch(() => setTemplates([]));
  }, []);

  const tpl = templates?.find((t) => t.id === tplId) ?? null;
  const versions = useMemo(() => (tpl ? parseJson<Version[]>(tpl.versions, []) : []), [tpl]);
  const inherited = useMemo(() => {
    if (!tpl) return [];
    const parts: string[] = [];
    const tags = parseJson<string[]>(tpl.tags, []);
    if (tags.length) parts.push(`etiquetas: ${tags.join(", ")}`);
    return parts;
  }, [tpl]);

  // Resumen de la configuración PROPIA de una versión (cada una elige la suya).
  const versionSummary = (v: Version) => {
    const parts: string[] = [];
    const nCats = v.categoryIds?.length ?? 0;
    if (nCats) parts.push(`${nCats} col.`);
    if (v.descriptionTemplateId ?? tpl?.descriptionTemplateId) parts.push("desc");
    if (v.imageTemplateId ?? tpl?.imageTemplateId) parts.push("img");
    return parts.join(" · ");
  };

  function toggleVersion(key: string) {
    setVersionKeys((prev) => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  }

  const payload = () => ({
    templateId: tplId,
    versionKeys: [...versionKeys],
    baseName,
    baseSku,
    productImageUrl: imageUrl.trim() || null,
  });

  // Paso 3: pedir la vista previa (nombres/SKUs generados + conflictos).
  async function goConfirm() {
    setBusy(true); setError(""); setPlanned(null);
    try {
      const res = await fetch("/api/products/from-template", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload(), preview: true }),
      });
      const d = await res.json();
      if (d.error) throw new Error(d.error);
      setPlanned(d.planned);
      setStage(2);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally { setBusy(false); }
  }

  async function create() {
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/products/from-template", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload()),
      });
      const d = await res.json();
      if (!res.ok || !d.ok) {
        if (d.planned) setPlanned(d.planned); // conflictos frescos
        throw new Error(d.error || "No se pudieron crear los productos");
      }
      setCreated(d.created);
      notifyPendingChanged();
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally { setBusy(false); }
  }

  const canNext =
    stage === 0 ? !!tpl && versionKeys.size > 0
    : stage === 1 ? baseName.trim() !== "" && baseSku.trim() !== ""
    : true;
  const blocked = (planned ?? []).some((p) => p.skuConflict);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div onClick={onClose} className="anim-in" style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(17,24,39,0.40)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: isMobile ? 0 : "48px 24px" }}>
      <div onClick={(e) => e.stopPropagation()} className="anim-modal" style={{ width: "100%", maxWidth: isMobile ? "none" : 640, height: isMobile ? "100dvh" : undefined, maxHeight: isMobile ? "100dvh" : "calc(100dvh - 96px)", background: "var(--color-surface)", borderRadius: isMobile ? 0 : "var(--radius-modal)", boxShadow: "var(--shadow-float)", display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* Header + stepper */}
        <div style={{ padding: isMobile ? "14px 16px" : "18px 24px", borderBottom: "1px solid var(--color-divider)", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontSize: "1rem", fontWeight: 600, letterSpacing: "-0.01em" }}>Crear producto</div>
            <button onClick={onClose} aria-label="Cerrar" style={{ width: 32, height: 32, borderRadius: 9, border: "none", background: "var(--color-surface-2)", cursor: "pointer", color: "var(--color-muted)" }}>✕</button>
          </div>
          {!created && (
            <div style={{ display: "flex", gap: 6, marginTop: 12, alignItems: "center" }}>
              {STAGES.map((s, i) => (
                <div key={s} style={{ display: "flex", alignItems: "center", gap: 6, flex: i < STAGES.length - 1 ? 1 : undefined }}>
                  <span style={{ width: 20, height: 20, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.6875rem", fontWeight: 700, flexShrink: 0, background: i <= stage ? "var(--color-brand)" : "var(--color-surface-2)", color: i <= stage ? "#fff" : "var(--color-subtle)" }}>{i + 1}</span>
                  <span style={{ fontSize: "0.72rem", fontWeight: i === stage ? 700 : 500, color: i === stage ? "var(--color-ink)" : "var(--color-subtle)", whiteSpace: "nowrap" }}>{s}</span>
                  {i < STAGES.length - 1 && <span style={{ flex: 1, height: 1, background: "var(--color-divider)", minWidth: 12 }} />}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: isMobile ? 16 : "20px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
          {created ? (
            /* ── Resultado ── */
            <>
              <div style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--color-success)" }}>
                ✓ {created.length} {created.length === 1 ? "producto creado" : "productos creados"} — ocultos, listos para completar
              </div>
              <div style={{ border: "1px solid var(--color-border)", borderRadius: "var(--radius-input)", overflow: "hidden" }}>
                {created.map((c, i) => (
                  <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderTop: i > 0 ? "1px solid var(--color-divider)" : "none" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--color-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</div>
                      <div style={{ fontSize: "0.72rem", color: "var(--color-subtle)", fontFamily: "var(--font-mono), monospace" }}>{c.sku}</div>
                    </div>
                    <button className="btn-secondary" onClick={() => onEditProduct(c.id)} style={{ padding: "5px 11px", fontSize: "0.75rem", flexShrink: 0 }}>
                      Completar información
                    </button>
                  </div>
                ))}
              </div>
              <p style={{ margin: 0, fontSize: "0.75rem", color: "var(--color-subtle)" }}>
                Completá precios, stock, descripción y SEO de cada uno. Cuando estén listos, subilos a Tienda Nube con «Subir cambios» y publicalos.
              </p>
            </>
          ) : stage === 0 ? (
            /* ── Paso 1: plantilla y versiones ── */
            templates === null ? (
              <div style={{ padding: 20, fontSize: "0.875rem", color: "var(--color-subtle)" }}>Cargando plantillas…</div>
            ) : templates.length === 0 ? (
              <div style={{ padding: "24px 16px", textAlign: "center" }}>
                <p style={{ margin: "0 0 6px", fontSize: "0.875rem", fontWeight: 600 }}>Todavía no hay plantillas de producto</p>
                <p style={{ margin: "0 0 14px", fontSize: "0.8125rem", color: "var(--color-muted)" }}>
                  Definí primero una plantilla con sus versiones (ej: PS4 / PS5 / Secundaria).
                </p>
                <Link href="/templates" className="btn-primary" style={{ textDecoration: "none" }}>Ir a Plantillas</Link>
              </div>
            ) : (
              <>
                <div>
                  <label style={lbl}>Plantilla</label>
                  <select className="input" value={tplId ?? ""} onChange={(e) => { setTplId(e.target.value ? Number(e.target.value) : null); setVersionKeys(new Set()); }} style={{ marginTop: 5 }}>
                    <option value="">Elegí una plantilla…</option>
                    {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
                {tpl && (
                  <div>
                    <label style={lbl}>Seleccioná las versiones <span style={{ fontWeight: 400, color: "var(--color-subtle)" }}>— una por producto a crear</span></label>
                    <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 6 }}>
                      {versions.map((v) => (
                        <label key={v.key} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", border: `1.5px solid ${versionKeys.has(v.key) ? "var(--color-brand)" : "var(--color-border)"}`, borderRadius: "var(--radius-input)", cursor: "pointer", background: versionKeys.has(v.key) ? "var(--color-brand-light)" : "var(--color-surface)" }}>
                          <input type="checkbox" checked={versionKeys.has(v.key)} onChange={() => toggleVersion(v.key)} style={{ accentColor: "var(--color-brand)" }} />
                          <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--color-ink)" }}>{v.label}</span>
                          {versionSummary(v) && <span style={{ fontSize: "0.6875rem", color: "var(--color-subtle)" }}>{versionSummary(v)}</span>}
                          <span style={{ fontSize: "0.72rem", color: "var(--color-subtle)", fontFamily: "var(--font-mono), monospace", marginLeft: "auto" }}>
                            {v.skuSuffix ? `SKU: …-${v.skuSuffix}` : "SKU: base"}
                          </span>
                        </label>
                      ))}
                    </div>
                    <p style={{ margin: "10px 0 0", fontSize: "0.75rem", color: versionKeys.size ? "var(--color-brand)" : "var(--color-subtle)", fontWeight: 600 }}>
                      {versionKeys.size === 0 ? "Elegí al menos una versión" : `Se ${versionKeys.size === 1 ? "creará 1 producto" : `crearán ${versionKeys.size} productos`}`}
                    </p>
                  </div>
                )}
              </>
            )
          ) : stage === 1 ? (
            /* ── Paso 2: información común ── */
            <>
              <div>
                <label style={lbl}>Nombre Base</label>
                <input className="input" autoFocus value={baseName} onChange={(e) => setBaseName(e.target.value)} placeholder="Resident Evil 4" style={{ marginTop: 5 }} />
              </div>
              <div>
                <label style={lbl}>SKU Base</label>
                <input className="input" value={baseSku} onChange={(e) => setBaseSku(e.target.value.toUpperCase().replace(/\s+/g, ""))} placeholder="RE4-2023" style={{ marginTop: 5, fontFamily: "var(--font-mono), monospace" }} />
              </div>
              <div>
                <label style={lbl}>Imagen del producto (URL) <span style={{ fontWeight: 400, color: "var(--color-subtle)" }}>— opcional</span></label>
                <input className="input" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://…/producto.png" style={{ marginTop: 5, fontSize: "0.8125rem" }} />
                <p style={{ margin: "6px 0 0", fontSize: "0.72rem", color: "var(--color-subtle)" }}>
                  Al subir a Tienda Nube, cada producto recibe su propia copia, compuesta con la plantilla de imagen de su versión si la tiene.
                </p>
              </div>
              {inherited.length > 0 && (
                <div style={{ padding: "10px 12px", background: "var(--color-surface-2)", borderRadius: "var(--radius-input)", fontSize: "0.75rem", color: "var(--color-muted)" }}>
                  <b style={{ color: "var(--color-ink)" }}>Heredan de la plantilla:</b> {inherited.join(" · ")}
                </div>
              )}
            </>
          ) : (
            /* ── Paso 3: confirmación ── */
            <>
              <div style={{ fontSize: "0.8125rem", color: "var(--color-muted)" }}>
                Revisá lo que se va a crear. Los productos nacen <b>ocultos</b> y el original de la información sos vos: nada se publica sin tu revisión.
              </div>
              <div style={{ border: "1px solid var(--color-border)", borderRadius: "var(--radius-input)", overflow: "hidden" }}>
                {(planned ?? []).map((p, i) => (
                  <div key={p.versionKey} style={{ padding: "10px 12px", borderTop: i > 0 ? "1px solid var(--color-divider)" : "none", display: "flex", flexDirection: "column", gap: 2 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                      <span style={{ fontSize: "0.6875rem", color: "var(--color-subtle)", width: 80, flexShrink: 0 }}>{p.versionLabel}</span>
                      <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--color-ink)" }}>{p.name}</span>
                      {p.nameExists && <span style={{ fontSize: "0.6875rem", color: "var(--color-warning)", fontWeight: 600 }}>⚠ nombre ya existe</span>}
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "baseline", paddingLeft: 88 }}>
                      <span style={{ fontSize: "0.75rem", color: p.skuConflict ? "var(--color-danger)" : "var(--color-subtle)", fontFamily: "var(--font-mono), monospace", fontWeight: p.skuConflict ? 700 : 400 }}>{p.sku}</span>
                      {p.skuConflict && <span style={{ fontSize: "0.72rem", color: "var(--color-danger)", fontWeight: 600 }}>✕ {p.skuConflict}</span>}
                    </div>
                  </div>
                ))}
              </div>
              {blocked && (
                <div style={{ fontSize: "0.8125rem", color: "var(--color-danger)", fontWeight: 600 }}>
                  Hay conflictos de SKU — volvé atrás y corregí el SKU Base. No se creará ningún producto hasta resolverlos.
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: isMobile ? "12px 16px" : "14px 24px", borderTop: "1px solid var(--color-divider)", flexShrink: 0, display: "flex", alignItems: "center", gap: 10 }}>
          {error ? <span style={{ flex: 1, fontSize: "0.8125rem", color: "var(--color-danger)" }}>{error}</span> : <span style={{ flex: 1 }} />}
          {created ? (
            <button className="btn-primary" onClick={onClose}>Listo</button>
          ) : (
            <>
              {stage > 0 && <button className="btn-secondary" onClick={() => { setError(""); setStage(stage - 1); }} disabled={busy}>Atrás</button>}
              {stage < 2 ? (
                <button className="btn-primary" disabled={!canNext || busy} onClick={() => { setError(""); if (stage === 1) goConfirm(); else setStage(stage + 1); }}>
                  {busy ? "…" : "Continuar"}
                </button>
              ) : (
                <button className="btn-primary" disabled={busy || blocked || (planned ?? []).length === 0} onClick={create}>
                  {busy ? "Creando…" : `Crear ${(planned ?? []).length} ${(planned ?? []).length === 1 ? "producto" : "productos"}`}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

const lbl: React.CSSProperties = { fontSize: "0.8125rem", fontWeight: 600, color: "var(--color-muted)" };
