"use client";
import { renderTemplate, parseFields, emptyData, type TemplateField, type TemplateData } from "@/lib/descriptionTemplates";

export type Tmpl = { id: number; name: string; skeleton: string; fields: string };

/** Builds initial slot data for a template, prefilling bind:"name" slots. */
export function initDataFor(tmpl: Tmpl, productName: string): TemplateData {
  const fields = parseFields(tmpl.fields);
  const data = emptyData(fields);
  for (const f of fields) if (f.type === "text" && f.bind === "name") data[f.key] = productName;
  return data;
}

interface Props {
  templates: Tmpl[];
  mode: "html" | "template";
  setMode: (m: "html" | "template") => void;
  html: string;
  setHtml: (v: string) => void;
  templateId: number | null;
  setTemplateId: (id: number | null) => void;
  data: TemplateData;
  setData: (d: TemplateData) => void;
  productName: string;
}

export default function DescriptionEditor({ templates, mode, setMode, html, setHtml, templateId, setTemplateId, data, setData, productName }: Props) {
  const tmpl = templates.find((t) => t.id === templateId) || null;
  const fields = tmpl ? parseFields(tmpl.fields) : [];
  const previewHtml = tmpl ? renderTemplate(tmpl.skeleton, data) : "";

  function setScalar(key: string, v: string) { setData({ ...data, [key]: v }); }
  function setListItem(key: string, i: number, sub: string, v: string) {
    const arr = [...((data[key] as Array<Record<string, string>>) || [])];
    arr[i] = { ...arr[i], [sub]: v };
    setData({ ...data, [key]: arr });
  }
  function addRow(key: string, blank: Record<string, string>) {
    const arr = [...((data[key] as Array<Record<string, string>>) || [])];
    arr.push({ ...blank });
    setData({ ...data, [key]: arr });
  }
  function removeRow(key: string, i: number) {
    const arr = [...((data[key] as Array<Record<string, string>>) || [])];
    arr.splice(i, 1);
    setData({ ...data, [key]: arr });
  }

  return (
    <div>
      {/* Mode switch */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <div style={{ display: "flex", gap: 3, background: "var(--color-surface-2)", borderRadius: "var(--radius-control)", padding: 3 }}>
          {([["template", "Plantilla"], ["html", "HTML"]] as const).map(([m, label]) => (
            <button key={m} type="button" onClick={() => setMode(m)} style={{ padding: "5px 12px", borderRadius: 9, border: "none", cursor: "pointer", fontSize: "0.75rem", fontWeight: mode === m ? 600 : 500, background: mode === m ? "var(--color-surface)" : "transparent", color: mode === m ? "var(--color-brand)" : "var(--color-subtle)", boxShadow: mode === m ? "var(--shadow-card)" : "none" }}>{label}</button>
          ))}
        </div>
        {mode === "template" && (
          <select className="input" value={templateId ?? ""} onChange={(e) => {
            const id = e.target.value ? Number(e.target.value) : null;
            setTemplateId(id);
            const t = templates.find((x) => x.id === id);
            if (t) setData(initDataFor(t, productName));
          }} style={{ width: "auto", flex: 1, fontSize: "0.8125rem", padding: "7px 10px" }}>
            <option value="">Elegí una plantilla…</option>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        )}
      </div>

      {mode === "html" ? (
        <textarea className="input" value={html} onChange={(e) => setHtml(e.target.value)} rows={7} style={{ resize: "vertical", lineHeight: 1.6, fontFamily: "inherit" }} placeholder="Descripción del producto (acepta HTML)" />
      ) : templates.length === 0 ? (
        <div style={{ padding: "14px", fontSize: "0.8125rem", color: "var(--color-subtle)", border: "1px dashed var(--color-border)", borderRadius: "var(--radius-input)" }}>
          No hay plantillas todavía. Creá una en <a href="/catalog/templates" style={{ color: "var(--color-brand)" }}>Catálogo → Plantillas</a>.
        </div>
      ) : !tmpl ? (
        <div style={{ padding: "14px", fontSize: "0.8125rem", color: "var(--color-subtle)" }}>Elegí una plantilla para completar sus campos.</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          {/* Slots */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
            {fields.map((f) => <SlotField key={f.key} field={f} data={data} setScalar={setScalar} setListItem={setListItem} addRow={addRow} removeRow={removeRow} />)}
          </div>
          {/* Preview */}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: "0.6875rem", fontWeight: 700, color: "var(--color-subtle)", textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: 6 }}>Vista previa</div>
            <div style={{ border: "1px solid var(--color-border)", borderRadius: "var(--radius-input)", overflow: "hidden", maxHeight: 420, overflowY: "auto", background: "#fff" }} dangerouslySetInnerHTML={{ __html: previewHtml }} />
          </div>
        </div>
      )}
    </div>
  );
}

function SlotField({ field, data, setScalar, setListItem, addRow, removeRow }: {
  field: TemplateField; data: TemplateData;
  setScalar: (k: string, v: string) => void;
  setListItem: (k: string, i: number, sub: string, v: string) => void;
  addRow: (k: string, blank: Record<string, string>) => void;
  removeRow: (k: string, i: number) => void;
}) {
  const label = <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--color-muted)", display: "block", marginBottom: 4 }}>{field.label}</label>;

  if (field.type === "text") {
    return <div>{label}<input className="input" value={(data[field.key] as string) || ""} onChange={(e) => setScalar(field.key, e.target.value)} placeholder={field.placeholder} style={{ fontSize: "0.8125rem" }} /></div>;
  }
  if (field.type === "textarea") {
    return <div>{label}<textarea className="input" value={(data[field.key] as string) || ""} onChange={(e) => setScalar(field.key, e.target.value)} placeholder={field.placeholder} rows={4} style={{ fontSize: "0.8125rem", resize: "vertical", lineHeight: 1.5 }} /></div>;
  }
  if (field.type === "list") {
    const rows = (data[field.key] as Array<Record<string, string>>) || [];
    const blank = Object.fromEntries(field.item.map((s) => [s.key, ""]));
    return (
      <div>{label}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {rows.map((row, i) => (
            <div key={i} style={{ border: "1px solid var(--color-border)", borderRadius: "var(--radius-input)", padding: 8, display: "flex", flexDirection: "column", gap: 6, position: "relative" }}>
              {field.item.map((s) => s.type === "textarea"
                ? <textarea key={s.key} className="input" value={row[s.key] || ""} onChange={(e) => setListItem(field.key, i, s.key, e.target.value)} placeholder={s.placeholder || s.label} rows={2} style={{ fontSize: "0.8125rem", resize: "vertical" }} />
                : <input key={s.key} className="input" value={row[s.key] || ""} onChange={(e) => setListItem(field.key, i, s.key, e.target.value)} placeholder={s.placeholder || s.label} style={{ fontSize: "0.8125rem" }} />)}
              <button type="button" onClick={() => removeRow(field.key, i)} title="Quitar" style={{ position: "absolute", top: 6, right: 6, border: "none", background: "transparent", cursor: "pointer", color: "var(--color-faint)", fontSize: "0.875rem" }}>×</button>
            </div>
          ))}
          <button type="button" className="btn-secondary" onClick={() => addRow(field.key, blank)} style={{ fontSize: "0.75rem", padding: "5px 10px", alignSelf: "flex-start" }}>+ {field.addLabel || "Agregar"}</button>
        </div>
      </div>
    );
  }
  // pairs
  const rows = (data[field.key] as Array<Record<string, string>>) || [];
  return (
    <div>{label}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {rows.map((row, i) => (
          <div key={i} style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input className="input" value={row.label || ""} onChange={(e) => setListItem(field.key, i, "label", e.target.value)} placeholder={field.labelPlaceholder} style={{ fontSize: "0.8125rem", width: "40%" }} />
            <input className="input" value={row.value || ""} onChange={(e) => setListItem(field.key, i, "value", e.target.value)} placeholder={field.valuePlaceholder} style={{ fontSize: "0.8125rem", flex: 1 }} />
            <button type="button" onClick={() => removeRow(field.key, i)} title="Quitar" style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--color-faint)", fontSize: "1rem", flexShrink: 0 }}>×</button>
          </div>
        ))}
        <button type="button" className="btn-secondary" onClick={() => addRow(field.key, { label: "", value: "" })} style={{ fontSize: "0.75rem", padding: "5px 10px", alignSelf: "flex-start" }}>+ {field.addLabel || "Agregar"}</button>
      </div>
    </div>
  );
}
