"use client";
import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { renderTemplate, sampleData, parseFields } from "@/lib/descriptionTemplates";

type Tmpl = { id: number; name: string; skeleton: string; fields: string; productCount: number };

export default function TemplatesClient({ templates }: { templates: Tmpl[] }) {
  const router = useRouter();
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
      <div style={{ padding: "20px 28px 16px", borderBottom: "1px solid var(--color-divider)", flexShrink: 0 }}>
        <Link href="/catalog" style={{ fontSize: "0.8125rem", color: "var(--color-subtle)", textDecoration: "none" }}>← Catálogo</Link>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 6 }}>
          <div>
            <h1 style={{ fontSize: "1.375rem", fontWeight: 700, margin: 0, letterSpacing: "-0.03em" }}>Plantillas de descripción</h1>
            <p style={{ fontSize: "0.8125rem", color: "var(--color-subtle)", margin: "2px 0 0" }}>Formato compartido para las descripciones de tus productos.</p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn-secondary" onClick={seed} disabled={busy}>Crear de ejemplo</button>
            <button className="btn-primary" onClick={createBlank} disabled={busy}>Nueva plantilla</button>
          </div>
        </div>
      </div>

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
