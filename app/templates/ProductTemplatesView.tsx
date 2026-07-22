"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import CollectionPicker from "../catalog/CollectionPicker";

/**
 * Plantillas de PRODUCTO: definen versiones comerciales (PS4, PS5, Secundaria…)
 * y la herencia común. El wizard "Crear producto" del catálogo las consume para
 * generar un producto independiente por versión.
 */

export type ProductTmpl = {
  id: number;
  name: string;
  versions: string;      // JSON [{ key, label, namePattern, skuSuffix }]
  categoryIds: string;   // JSON number[]
  tags: string;          // JSON string[]
  descriptionTemplateId: number | null;
  imageTemplateId: number | null;
};

type Opt = { id: number; name: string };
type Version = {
  key: string; label: string; namePattern: string; skuSuffix: string;
  // Configuración propia de cada versión:
  descriptionTemplateId: number | null; imageTemplateId: number | null; categoryIds: number[];
};
const normalizeVersion = (v: Partial<Version>): Version => ({
  key: v.key ?? `v${Date.now()}`, label: v.label ?? "", namePattern: v.namePattern ?? `${TOKEN} []`, skuSuffix: v.skuSuffix ?? "",
  descriptionTemplateId: v.descriptionTemplateId ?? null, imageTemplateId: v.imageTemplateId ?? null,
  categoryIds: Array.isArray(v.categoryIds) ? v.categoryIds : [],
});

const TOKEN = "{nombre_base}";
const parseJson = <T,>(s: string, fallback: T): T => { try { return JSON.parse(s) as T; } catch { return fallback; } };
const slug = (label: string) => label.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `v${Date.now()}`;

export default function ProductTemplatesView({ templates, descTemplates, imageTemplates }: {
  templates: ProductTmpl[]; descTemplates: Opt[]; imageTemplates: Opt[];
}) {
  const router = useRouter();
  const [selId, setSelId] = useState<number | null>(templates[0]?.id ?? null);
  const [busy, setBusy] = useState(false);
  const selected = templates.find((t) => t.id === selId) || null;

  async function createBlank() {
    setBusy(true);
    const res = await fetch("/api/product-templates", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Nueva plantilla",
        versions: [
          { key: "ps4", label: "PS4", namePattern: `${TOKEN} [PS4]`, skuSuffix: "PS4" },
          { key: "ps5", label: "PS5", namePattern: `${TOKEN} [PS5]`, skuSuffix: "PS5" },
        ],
      }),
    });
    const t = await res.json();
    setBusy(false);
    if (res.ok) { setSelId(t.id); router.refresh(); }
  }
  async function remove(t: ProductTmpl) {
    if (!confirm(`¿Eliminar la plantilla "${t.name}"? Los productos ya creados con ella no se tocan.`)) return;
    setBusy(true);
    await fetch(`/api/product-templates/${t.id}`, { method: "DELETE" });
    setBusy(false);
    setSelId(null);
    router.refresh();
  }

  return (
    <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
      <div style={{ width: 240, borderRight: "1px solid var(--color-divider)", overflowY: "auto", padding: 10, flexShrink: 0 }}>
        <button className="btn-primary" onClick={createBlank} disabled={busy} style={{ width: "100%", marginBottom: 8 }}>Nueva plantilla</button>
        {templates.length === 0 ? (
          <div style={{ padding: 16, fontSize: "0.8125rem", color: "var(--color-subtle)", textAlign: "center" }}>
            Sin plantillas todavía. Creá una para usar «Crear producto» en el catálogo.
          </div>
        ) : templates.map((t) => {
          const n = parseJson<Version[]>(t.versions, []).length;
          return (
            <button key={t.id} onClick={() => setSelId(t.id)} className="menu-item" style={{ width: "100%", textAlign: "left", marginBottom: 2, background: t.id === selId ? "var(--color-surface-2)" : "transparent", display: "block" }}>
              <div style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--color-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</div>
              <div style={{ fontSize: "0.6875rem", color: "var(--color-subtle)" }}>{n} {n === 1 ? "versión" : "versiones"}</div>
            </button>
          );
        })}
      </div>
      {selected ? (
        <ProductTemplateEditor key={selected.id} template={selected} descTemplates={descTemplates} imageTemplates={imageTemplates}
          busy={busy} setBusy={setBusy} onDelete={() => remove(selected)} onSaved={() => router.refresh()} />
      ) : (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-subtle)", fontSize: "0.875rem" }}>Elegí o creá una plantilla de producto.</div>
      )}
    </div>
  );
}

function ProductTemplateEditor({ template, descTemplates, imageTemplates, busy, setBusy, onDelete, onSaved }: {
  template: ProductTmpl; descTemplates: Opt[]; imageTemplates: Opt[];
  busy: boolean; setBusy: (b: boolean) => void; onDelete: () => void; onSaved: () => void;
}) {
  const [name, setName] = useState(template.name);
  // Migración suave: si la plantilla es vieja (config a nivel plantilla), esa
  // config se vuelca como punto de partida de cada versión que no tenga la suya.
  const [versions, setVersions] = useState<Version[]>(() =>
    parseJson<Partial<Version>[]>(template.versions, []).map((v) => normalizeVersion({
      ...v,
      descriptionTemplateId: v.descriptionTemplateId ?? template.descriptionTemplateId,
      imageTemplateId: v.imageTemplateId ?? template.imageTemplateId,
      categoryIds: v.categoryIds?.length ? v.categoryIds : parseJson<number[]>(template.categoryIds, []),
    })));
  const [tags, setTags] = useState(() => parseJson<string[]>(template.tags, []).join(", "));
  const [openVersion, setOpenVersion] = useState<number | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const patchVersion = (i: number, patch: Partial<Version>) =>
    setVersions((prev) => prev.map((v, x) => (x === i ? { ...v, ...patch } : v)));
  const addVersion = () => setVersions((prev) => [...prev, normalizeVersion({})]);
  const removeVersion = (i: number) => { setVersions((prev) => prev.filter((_, x) => x !== i)); setOpenVersion(null); };

  // Vista previa honesta con un nombre base de ejemplo.
  const sampleBase = "Resident Evil 4";
  const preview = useMemo(() => versions.map((v) => ({
    label: v.label || "(sin nombre)",
    name: v.namePattern.replaceAll(TOKEN, sampleBase).replace(/\s+/g, " ").trim(),
    sku: v.skuSuffix ? `RE4-2023-${v.skuSuffix}` : "RE4-2023",
    badPattern: !v.namePattern.includes(TOKEN),
  })), [versions]);

  async function save() {
    setBusy(true); setError("");
    const res = await fetch(`/api/product-templates/${template.id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        versions: versions.map((v) => ({ ...v, key: v.key || slug(v.label) })),
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
        // La config vive en cada versión; los campos de nivel plantilla quedan
        // vacíos (eran el sistema anterior y ahora solo actúan de fallback).
        categoryIds: [],
        descriptionTemplateId: null,
        imageTemplateId: null,
      }),
    });
    setBusy(false);
    if (!res.ok) { setError((await res.json().catch(() => ({}))).error || "No se pudo guardar"); return; }
    setSaved(true); setTimeout(() => setSaved(false), 2500);
    onSaved();
  }

  return (
    <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
      {/* Izquierda: edición */}
      <div style={{ flex: 1, overflowY: "auto", padding: 20, display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
        <div>
          <label style={lbl}>Nombre</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} style={{ marginTop: 5 }} />
        </div>

        {/* Versiones */}
        <div>
          <label style={lbl}>Versiones <span style={{ color: "var(--color-subtle)", fontWeight: 400 }}>— una por producto a generar; el patrón usa {TOKEN}</span></label>
          <div style={{ marginTop: 6, border: "1px solid var(--color-border)", borderRadius: "var(--radius-input)", overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: "110px 1fr 110px 30px", gap: 8, padding: "7px 10px", background: "var(--color-surface-2)", fontSize: "0.6875rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.03em", color: "var(--color-subtle)" }}>
              <span>Versión</span><span>Patrón del nombre</span><span>Sufijo SKU</span><span />
            </div>
            {versions.map((v, i) => (
              <div key={i} style={{ borderTop: "1px solid var(--color-divider)" }}>
                <div style={{ display: "grid", gridTemplateColumns: "110px 1fr 110px 30px", gap: 8, padding: "7px 10px", alignItems: "center" }}>
                  <input className="input" value={v.label} placeholder="PS4" onChange={(e) => {
                    const label = e.target.value;
                    // Al nombrar la versión, autocompleta patrón y sufijo si estaban vacíos/derivados.
                    patchVersion(i, {
                      label,
                      ...(v.namePattern === `${TOKEN} [${v.label}]` || v.namePattern === `${TOKEN} []` ? { namePattern: `${TOKEN} [${label}]` } : {}),
                      ...(v.skuSuffix === v.label.toUpperCase().replace(/\s+/g, "") || v.skuSuffix === "" ? { skuSuffix: label.toUpperCase().replace(/\s+/g, "") } : {}),
                    });
                  }} style={{ padding: "6px 8px", fontSize: "0.8125rem" }} />
                  <input className="input" value={v.namePattern} onChange={(e) => patchVersion(i, { namePattern: e.target.value })} style={{ padding: "6px 8px", fontSize: "0.8125rem", fontFamily: "var(--font-mono), monospace" }} />
                  <input className="input" value={v.skuSuffix} placeholder="(ninguno)" onChange={(e) => patchVersion(i, { skuSuffix: e.target.value.toUpperCase().replace(/\s+/g, "") })} style={{ padding: "6px 8px", fontSize: "0.8125rem", fontFamily: "var(--font-mono), monospace" }} />
                  <button onClick={() => removeVersion(i)} aria-label="Quitar versión" style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--color-subtle)", padding: 2 }}>✕</button>
                </div>
                {/* Configuración PROPIA de esta versión */}
                <button onClick={() => setOpenVersion(openVersion === i ? null : i)} style={{ display: "flex", alignItems: "center", gap: 7, width: "100%", textAlign: "left", border: "none", background: "transparent", cursor: "pointer", padding: "0 10px 8px 12px" }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--color-subtle)", transform: openVersion === i ? "none" : "rotate(-90deg)", transition: "transform 0.12s", flexShrink: 0 }}><polyline points="6 9 12 15 18 9" /></svg>
                  <span style={{ fontSize: "0.72rem", fontWeight: 600, color: "var(--color-muted)" }}>Descripción, imagen y colecciones de esta versión</span>
                  {(() => { const n = (v.descriptionTemplateId ? 1 : 0) + (v.imageTemplateId ? 1 : 0) + v.categoryIds.length; return n > 0 ? <span className="pill pill-neutral" style={{ fontSize: "0.625rem" }}>{n}</span> : null; })()}
                </button>
                {openVersion === i && (
                  <div style={{ margin: "0 10px 10px", padding: 12, borderRadius: "var(--radius-input)", background: "var(--color-surface-2)", display: "flex", flexDirection: "column", gap: 10 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      <div>
                        <label style={lbl}>Plantilla de descripción</label>
                        <select className="input" value={v.descriptionTemplateId ?? ""} onChange={(e) => patchVersion(i, { descriptionTemplateId: e.target.value ? Number(e.target.value) : null })} style={{ marginTop: 5, background: "var(--color-surface)" }}>
                          <option value="">Sin plantilla</option>
                          {descTemplates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={lbl}>Plantilla de imagen</label>
                        <select className="input" value={v.imageTemplateId ?? ""} onChange={(e) => patchVersion(i, { imageTemplateId: e.target.value ? Number(e.target.value) : null })} style={{ marginTop: 5, background: "var(--color-surface)" }}>
                          <option value="">Sin plantilla</option>
                          {imageTemplates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label style={lbl}>Colecciones <span style={{ color: "var(--color-subtle)", fontWeight: 400 }}>· {v.categoryIds.length}</span></label>
                      <div style={{ marginTop: 6 }}>
                        <CollectionPicker
                          selectedIds={new Set(v.categoryIds)}
                          onToggle={(id) => {
                            const n = new Set(v.categoryIds);
                            if (n.has(id)) n.delete(id); else n.add(id);
                            patchVersion(i, { categoryIds: [...n] });
                          }}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
          <button onClick={addVersion} style={{ marginTop: 8, border: "1px dashed var(--color-border)", background: "transparent", borderRadius: 8, padding: "5px 11px", fontSize: "0.75rem", color: "var(--color-muted)", cursor: "pointer" }}>
            + Agregar versión
          </button>
        </div>

        {/* Herencia común — lo único compartido por todas las versiones */}
        <div style={{ borderTop: "1px solid var(--color-divider)", paddingTop: 14, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--color-subtle)", textTransform: "uppercase", letterSpacing: "0.03em" }}>
            Común a todas las versiones
          </div>
          <div>
            <label style={lbl}>Etiquetas <span style={{ color: "var(--color-subtle)", fontWeight: 400 }}>(separadas por coma)</span></label>
            <input className="input" value={tags} onChange={(e) => setTags(e.target.value)} style={{ marginTop: 5 }} />
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, paddingTop: 4 }}>
          <button className="btn-primary" onClick={save} disabled={busy}>{saved ? "Guardada ✓" : "Guardar"}</button>
          <button className="btn-secondary" onClick={onDelete} disabled={busy} style={{ color: "var(--color-danger)" }}>Eliminar</button>
          {error && <span style={{ fontSize: "0.8125rem", color: "var(--color-danger)" }}>{error}</span>}
        </div>
      </div>

      {/* Derecha: vista previa */}
      <div style={{ flex: 1, borderLeft: "1px solid var(--color-divider)", overflowY: "auto", padding: 20, background: "var(--color-surface-2)", minWidth: 0 }}>
        <div style={{ fontSize: "0.6875rem", fontWeight: 700, color: "var(--color-subtle)", textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: 10 }}>
          Vista previa · Nombre Base "{sampleBase}" · SKU Base "RE4-2023"
        </div>
        <div style={{ border: "1px solid var(--color-border)", borderRadius: "var(--radius-input)", overflow: "hidden", background: "var(--color-surface)" }}>
          {preview.length === 0 ? (
            <div style={{ padding: 16, fontSize: "0.8125rem", color: "var(--color-subtle)", textAlign: "center" }}>Agregá versiones para ver el resultado.</div>
          ) : preview.map((p, i) => (
            <div key={i} style={{ padding: "9px 12px", borderTop: i > 0 ? "1px solid var(--color-divider)" : "none", display: "flex", flexDirection: "column", gap: 2 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                <span style={{ fontSize: "0.6875rem", color: "var(--color-subtle)", width: 84, flexShrink: 0 }}>{p.label}</span>
                <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: p.badPattern ? "var(--color-danger)" : "var(--color-ink)" }}>
                  {p.badPattern ? `El patrón debe incluir ${TOKEN}` : p.name}
                </span>
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--color-subtle)", fontFamily: "var(--font-mono), monospace", paddingLeft: 92 }}>{p.sku}</div>
            </div>
          ))}
        </div>
        <p style={{ fontSize: "0.75rem", color: "var(--color-subtle)", marginTop: 12 }}>
          Cada versión seleccionada en «Crear producto» genera un producto independiente con este nombre y SKU,
          heredando colecciones, etiquetas y plantillas. Después se completa individualmente (precios, stock, SEO…).
        </p>
      </div>
    </div>
  );
}

const lbl: React.CSSProperties = { fontSize: "0.8125rem", fontWeight: 600, color: "var(--color-muted)" };
