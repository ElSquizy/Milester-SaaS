"use client";
import { useState, useMemo, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { renderTemplate, sampleData, parseFields } from "@/lib/descriptionTemplates";
import ImageComposer from "../catalog/ImageComposer";
import TransformationsView from "./TransformationsView";

type Tmpl = { id: number; name: string; skeleton: string; fields: string; productCount: number };
type ImgTmpl = { id: number; name: string; backgroundUrl: string; coverUrl: string; shadowOffsetX: number; shadowOffsetY: number; shadowBlur: number; shadowOpacity: number; productCount: number };

export default function TemplatesClient({ templates, imageTemplates, categories }: { templates: Tmpl[]; imageTemplates: ImgTmpl[]; categories: string[] }) {
  const router = useRouter();
  const [mode, setMode] = useState<"desc" | "image" | "transform">("desc");
  const [selId, setSelId] = useState<number | null>(templates[0]?.id ?? null);
  const [busy, setBusy] = useState(false);

  const selected = templates.find((t) => t.id === selId) || null;

  async function seed() {
    setBusy(true);
    const res = await fetch("/api/description-templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ seed: true }) });
    const t = await res.json();
    setBusy(false);
    if (res.ok) { setSelId(t.id); router.refresh(); }
  }
  async function createBlank() {
    setBusy(true);
    const res = await fetch("/api/description-templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Nueva plantilla", skeleton: "<div>\n  <h2>{{title}}</h2>\n  <p>{{synopsis}}</p>\n</div>", fields: JSON.stringify([{ key: "title", label: "Título", type: "text", bind: "name" }, { key: "synopsis", label: "Sinopsis", type: "textarea" }]) }) });
    const t = await res.json();
    setBusy(false);
    if (res.ok) { setSelId(t.id); router.refresh(); }
  }
  async function remove(t: Tmpl) {
    if (!confirm(`¿Eliminar la plantilla "${t.name}"? Los productos que la usan conservan su descripción actual.`)) return;
    setBusy(true);
    await fetch(`/api/description-templates/${t.id}`, { method: "DELETE" });
    setBusy(false);
    setSelId(null);
    router.refresh();
  }

  return (
    <div style={{ height: "100dvh", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{ padding: "20px 28px 14px", borderBottom: "1px solid var(--color-divider)", flexShrink: 0 }}>
        <Link href="/catalog" style={{ fontSize: "0.8125rem", color: "var(--color-subtle)", textDecoration: "none" }}>← Catálogo</Link>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <h1 style={{ fontSize: "1.375rem", fontWeight: 700, margin: 0, letterSpacing: "-0.03em" }}>Plantillas</h1>
            <div style={{ display: "flex", gap: 3, background: "var(--color-surface-2)", borderRadius: "var(--radius-control)", padding: 3 }}>
              {([["desc", "Descripciones"], ["image", "Imágenes"], ["transform", "Transformaciones"]] as const).map(([m, label]) => (
                <button key={m} onClick={() => setMode(m)} style={{ padding: "6px 14px", borderRadius: 9, border: "none", cursor: "pointer", fontSize: "0.8125rem", fontWeight: mode === m ? 600 : 500, background: mode === m ? "var(--color-surface)" : "transparent", color: mode === m ? "var(--color-brand)" : "var(--color-subtle)", boxShadow: mode === m ? "var(--shadow-card)" : "none" }}>{label}</button>
              ))}
            </div>
          </div>
          {mode === "desc" && (
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn-secondary" onClick={seed} disabled={busy}>Crear de ejemplo</button>
              <button className="btn-primary" onClick={createBlank} disabled={busy}>Nueva plantilla</button>
            </div>
          )}
        </div>
      </div>

      {mode === "desc" ? (
        <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
          {/* List */}
          <div style={{ width: 240, borderRight: "1px solid var(--color-divider)", overflowY: "auto", padding: 10, flexShrink: 0 }}>
            {templates.length === 0 ? (
              <div style={{ padding: 16, fontSize: "0.8125rem", color: "var(--color-subtle)", textAlign: "center" }}>Sin plantillas todavía.</div>
            ) : templates.map((t) => (
              <button key={t.id} onClick={() => setSelId(t.id)} className="menu-item" style={{ width: "100%", textAlign: "left", marginBottom: 2, background: t.id === selId ? "var(--color-surface-2)" : "transparent", display: "block" }}>
                <div style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--color-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</div>
                <div style={{ fontSize: "0.6875rem", color: "var(--color-subtle)" }}>{t.productCount} {t.productCount === 1 ? "producto" : "productos"}</div>
              </button>
            ))}
          </div>

          {/* Editor */}
          {selected ? (
            <TemplateEditor key={selected.id} template={selected} busy={busy} setBusy={setBusy} onDelete={() => remove(selected)} onSaved={() => router.refresh()} />
          ) : (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-subtle)", fontSize: "0.875rem" }}>Elegí o creá una plantilla.</div>
          )}
        </div>
      ) : mode === "image" ? (
        <ImageTemplatesView imageTemplates={imageTemplates} />
      ) : (
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 28px" }}>
          <div style={{ maxWidth: 760, margin: "0 auto" }}>
            <TransformationsView categories={categories} descTemplates={templates.map((t) => ({ id: t.id, name: t.name }))} imageTemplates={imageTemplates.map((t) => ({ id: t.id, name: t.name }))} />
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Image templates ─────────────────────────────────────────── */
function ImageTemplatesView({ imageTemplates }: { imageTemplates: ImgTmpl[] }) {
  const router = useRouter();
  const [selId, setSelId] = useState<number | null>(imageTemplates[0]?.id ?? null);
  const [busy, setBusy] = useState(false);
  const selected = imageTemplates.find((t) => t.id === selId) || null;

  async function createBlank() {
    setBusy(true);
    const res = await fetch("/api/image-templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Nueva plantilla", backgroundUrl: "", coverUrl: "" }) });
    const t = await res.json();
    setBusy(false);
    if (res.ok) { setSelId(t.id); router.refresh(); }
  }
  async function remove(t: ImgTmpl) {
    if (!confirm(`¿Eliminar la plantilla de imagen "${t.name}"? Los productos que la usan conservan su imagen actual.`)) return;
    setBusy(true);
    await fetch(`/api/image-templates/${t.id}`, { method: "DELETE" });
    setBusy(false);
    setSelId(null);
    router.refresh();
  }

  return (
    <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
      <div style={{ width: 240, borderRight: "1px solid var(--color-divider)", overflowY: "auto", padding: 10, flexShrink: 0 }}>
        <button className="btn-primary" onClick={createBlank} disabled={busy} style={{ width: "100%", marginBottom: 8 }}>Nueva plantilla</button>
        {imageTemplates.length === 0 ? (
          <div style={{ padding: 16, fontSize: "0.8125rem", color: "var(--color-subtle)", textAlign: "center" }}>Sin plantillas todavía.</div>
        ) : imageTemplates.map((t) => (
          <button key={t.id} onClick={() => setSelId(t.id)} className="menu-item" style={{ width: "100%", textAlign: "left", marginBottom: 2, background: t.id === selId ? "var(--color-surface-2)" : "transparent", display: "block" }}>
            <div style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--color-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</div>
            <div style={{ fontSize: "0.6875rem", color: "var(--color-subtle)" }}>{t.productCount} {t.productCount === 1 ? "producto" : "productos"}</div>
          </button>
        ))}
      </div>
      {selected ? (
        <ImageTemplateEditor key={selected.id} template={selected} busy={busy} setBusy={setBusy} onDelete={() => remove(selected)} onSaved={() => router.refresh()} />
      ) : (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-subtle)", fontSize: "0.875rem" }}>Elegí o creá una plantilla de imagen.</div>
      )}
    </div>
  );
}

// A neutral placeholder "product" so the shadow silhouette is solid in previews.
function placeholderProduct(): string {
  if (typeof document === "undefined") return "";
  const c = document.createElement("canvas");
  c.width = 670; c.height = 670;
  const x = c.getContext("2d")!;
  x.fillStyle = "#cbd5e1";
  x.beginPath(); x.roundRect(0, 0, 670, 670, 16); x.fill();
  x.fillStyle = "#94a3b8"; x.font = "600 34px system-ui"; x.textAlign = "center";
  x.fillText("producto", 335, 345);
  return c.toDataURL("image/png");
}

function ImageTemplateEditor({ template, busy, setBusy, onDelete, onSaved }: {
  template: ImgTmpl; busy: boolean; setBusy: (b: boolean) => void; onDelete: () => void; onSaved: () => void;
}) {
  const [name, setName] = useState(template.name);
  const [backgroundUrl, setBackgroundUrl] = useState(template.backgroundUrl);
  const [coverUrl, setCoverUrl] = useState(template.coverUrl);
  const [sx, setSx] = useState(template.shadowOffsetX);
  const [sy, setSy] = useState(template.shadowOffsetY);
  const [blur, setBlur] = useState(template.shadowBlur);
  const [opacity, setOpacity] = useState(template.shadowOpacity);
  const [saved, setSaved] = useState(false);

  const [preview, setPreview] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const placeholder = useMemo(placeholderProduct, []);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced server compose so the shadow shows for real and updates as you tune it.
  useEffect(() => {
    if (!backgroundUrl && !coverUrl) { setPreview(null); return; }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setComposing(true);
      try {
        const res = await fetch("/api/compose", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ backgroundUrl, coverUrl, productUrl: placeholder, shadow: { offsetX: sx, offsetY: sy, blur, opacity } }),
        });
        if (res.ok) {
          const blob = await res.blob();
          setPreview((prev) => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(blob); });
        }
      } finally { setComposing(false); }
    }, 450);
    return () => { if (timer.current) clearTimeout(timer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backgroundUrl, coverUrl, sx, sy, blur, opacity, placeholder]);

  async function save() {
    setBusy(true);
    await fetch(`/api/image-templates/${template.id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, backgroundUrl, coverUrl, shadowOffsetX: sx, shadowOffsetY: sy, shadowBlur: blur, shadowOpacity: opacity }),
    });
    setBusy(false);
    setSaved(true); setTimeout(() => setSaved(false), 2500);
    onSaved();
  }

  return (
    <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
      <div style={{ flex: 1, overflowY: "auto", padding: 20, display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
        <div>
          <label style={lbl}>Nombre</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} style={{ marginTop: 5 }} />
        </div>
        <div>
          <label style={lbl}>URL del fondo <span style={{ color: "var(--color-subtle)", fontWeight: 400 }}>— lienzo 1024×1024</span></label>
          <input className="input" value={backgroundUrl} onChange={(e) => setBackgroundUrl(e.target.value)} placeholder="https://…/fondo.png" style={{ marginTop: 5, fontSize: "0.8125rem" }} />
        </div>
        <div>
          <label style={lbl}>URL del cover (marco) <span style={{ color: "var(--color-subtle)", fontWeight: 400 }}>— 670×763, sin sombra</span></label>
          <input className="input" value={coverUrl} onChange={(e) => setCoverUrl(e.target.value)} placeholder="https://…/cover-ps5.png" style={{ marginTop: 5, fontSize: "0.8125rem" }} />
        </div>

        {/* Shadow controls */}
        <div style={{ borderTop: "1px solid var(--color-divider)", paddingTop: 14, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--color-subtle)", textTransform: "uppercase", letterSpacing: "0.03em" }}>Sombra</div>
          <Slider label="Horizontal" value={sx} min={-60} max={60} step={1} onChange={setSx} suffix="px" />
          <Slider label="Vertical" value={sy} min={-60} max={60} step={1} onChange={setSy} suffix="px" />
          <Slider label="Difuminado" value={blur} min={0} max={60} step={1} onChange={setBlur} suffix="px" />
          <Slider label="Opacidad" value={opacity} min={0} max={1} step={0.05} onChange={setOpacity} pct />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, paddingTop: 4 }}>
          <button className="btn-primary" onClick={save} disabled={busy}>{saved ? "Guardado ✓" : "Guardar"}</button>
          <button className="btn-secondary" onClick={onDelete} disabled={busy} style={{ color: "var(--color-danger)" }}>Eliminar</button>
        </div>
      </div>
      <div style={{ flex: 1, borderLeft: "1px solid var(--color-divider)", overflowY: "auto", padding: 20, background: "var(--color-surface-2)", minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ fontSize: "0.6875rem", fontWeight: 700, color: "var(--color-subtle)", textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: 12, alignSelf: "flex-start" }}>
          Vista previa {composing && <span style={{ color: "var(--color-faint)" }}>· componiendo…</span>}
        </div>
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="" style={{ width: 360, maxWidth: "100%", aspectRatio: "1/1", borderRadius: "var(--radius-input)", border: "1px solid var(--color-border)" }} />
        ) : (
          <ImageComposer backgroundUrl={backgroundUrl} coverUrl={coverUrl} size={360} />
        )}
        <p style={{ fontSize: "0.75rem", color: "var(--color-subtle)", marginTop: 12, textAlign: "center" }}>La imagen “producto” es un marcador; cada producto pone la suya. La sombra se genera automáticamente.</p>
      </div>
    </div>
  );
}

function Slider({ label, value, min, max, step, onChange, suffix, pct }: {
  label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; suffix?: string; pct?: boolean;
}) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", color: "var(--color-muted)", marginBottom: 4 }}>
        <span>{label}</span>
        <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>{pct ? `${Math.round(value * 100)}%` : `${value}${suffix || ""}`}</span>
      </div>
      <input type="range" value={value} min={min} max={max} step={step} onChange={(e) => onChange(parseFloat(e.target.value))} style={{ width: "100%", accentColor: "var(--color-brand)" }} />
    </div>
  );
}

function TemplateEditor({ template, busy, setBusy, onDelete, onSaved }: {
  template: Tmpl; busy: boolean; setBusy: (b: boolean) => void; onDelete: () => void; onSaved: () => void;
}) {
  const [name, setName] = useState(template.name);
  const [skeleton, setSkeleton] = useState(template.skeleton);
  const [fieldsText, setFieldsText] = useState(() => {
    try { return JSON.stringify(JSON.parse(template.fields), null, 2); } catch { return template.fields; }
  });
  const [saved, setSaved] = useState(false);

  const { previewHtml, fieldsError } = useMemo(() => {
    try {
      const fields = parseFields(fieldsText);
      return { previewHtml: renderTemplate(skeleton, sampleData(fields)), fieldsError: "" };
    } catch (e) {
      return { previewHtml: renderTemplate(skeleton, {}), fieldsError: e instanceof Error ? e.message : "JSON inválido" };
    }
  }, [skeleton, fieldsText]);

  async function save() {
    // Validate fields JSON before saving.
    try { JSON.parse(fieldsText); } catch { alert("El esquema de campos no es JSON válido."); return; }
    setBusy(true);
    await fetch(`/api/description-templates/${template.id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, skeleton, fields: fieldsText }),
    });
    setBusy(false);
    setSaved(true); setTimeout(() => setSaved(false), 2500);
    onSaved();
  }

  return (
    <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
      {/* Left: fields to edit */}
      <div style={{ flex: 1, overflowY: "auto", padding: 20, display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
        <div>
          <label style={lbl}>Nombre</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} style={{ marginTop: 5 }} />
        </div>
        <div>
          <label style={lbl}>Esqueleto HTML <span style={{ color: "var(--color-subtle)", fontWeight: 400 }}>— usá {"{{slot}}"} y regiones {"<!--repeat:key-->…<!--/repeat-->"}</span></label>
          <textarea className="input" value={skeleton} onChange={(e) => setSkeleton(e.target.value)} spellCheck={false} rows={14} style={{ marginTop: 5, fontFamily: "ui-monospace, monospace", fontSize: "0.75rem", lineHeight: 1.5, resize: "vertical" }} />
        </div>
        <div>
          <label style={lbl}>Campos (esquema JSON) {fieldsError && <span style={{ color: "var(--color-danger)", fontWeight: 400 }}>— {fieldsError}</span>}</label>
          <textarea className="input" value={fieldsText} onChange={(e) => setFieldsText(e.target.value)} spellCheck={false} rows={10} style={{ marginTop: 5, fontFamily: "ui-monospace, monospace", fontSize: "0.75rem", lineHeight: 1.5, resize: "vertical", borderColor: fieldsError ? "var(--color-danger)" : undefined }} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, paddingTop: 4 }}>
          <button className="btn-primary" onClick={save} disabled={busy}>{saved ? "Guardado ✓" : "Guardar"}</button>
          <button className="btn-secondary" onClick={onDelete} disabled={busy} style={{ color: "var(--color-danger)" }}>Eliminar</button>
        </div>
      </div>

      {/* Right: live preview */}
      <div style={{ flex: 1, borderLeft: "1px solid var(--color-divider)", overflowY: "auto", padding: 20, background: "var(--color-surface-2)", minWidth: 0 }}>
        <div style={{ fontSize: "0.6875rem", fontWeight: 700, color: "var(--color-subtle)", textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: 10 }}>Vista previa (datos de ejemplo)</div>
        <div style={{ background: "#fff", borderRadius: 10, overflow: "hidden" }} dangerouslySetInnerHTML={{ __html: previewHtml }} />
      </div>
    </div>
  );
}

const lbl: React.CSSProperties = { fontSize: "0.8125rem", fontWeight: 600, color: "var(--color-muted)" };
