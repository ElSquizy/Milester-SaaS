"use client";
import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MESSAGE_VARIABLES, renderMessage, SAMPLE_MESSAGE_PRODUCT } from "@/lib/messageTemplates";

/**
 * Plantillas de mensaje para clientes. Editor con inserción de variables y vista
 * previa en vivo; se copian desde el clic derecho del catálogo.
 */
export type MsgTmpl = { id: number; name: string; body: string };

export default function MessageTemplatesView({ templates }: { templates: MsgTmpl[] }) {
  const router = useRouter();
  const [selId, setSelId] = useState<number | null>(templates[0]?.id ?? null);
  const [busy, setBusy] = useState(false);
  const selected = templates.find((t) => t.id === selId) || null;

  async function create(seed: boolean) {
    setBusy(true);
    const res = await fetch("/api/message-templates", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(seed ? { seed: true } : { name: "Nuevo mensaje", body: "" }),
    });
    const t = await res.json();
    setBusy(false);
    if (res.ok) { setSelId(t.id); router.refresh(); }
  }
  async function remove(t: MsgTmpl) {
    if (!confirm(`¿Eliminar la plantilla de mensaje "${t.name}"?`)) return;
    setBusy(true);
    await fetch(`/api/message-templates/${t.id}`, { method: "DELETE" });
    setBusy(false);
    setSelId(null);
    router.refresh();
  }

  return (
    <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
      <div style={{ width: 240, borderRight: "1px solid var(--color-divider)", overflowY: "auto", padding: 10, flexShrink: 0 }}>
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          <button className="btn-primary" onClick={() => create(false)} disabled={busy} style={{ flex: 1 }}>Nuevo</button>
          {templates.length === 0 && <button className="btn-secondary" onClick={() => create(true)} disabled={busy}>Ejemplo</button>}
        </div>
        {templates.length === 0 ? (
          <div style={{ padding: 16, fontSize: "0.8125rem", color: "var(--color-subtle)", textAlign: "center" }}>
            Sin mensajes todavía. Creá uno para copiarlo al cliente desde el clic derecho del catálogo.
          </div>
        ) : templates.map((t) => (
          <button key={t.id} onClick={() => setSelId(t.id)} className="menu-item" style={{ width: "100%", textAlign: "left", marginBottom: 2, background: t.id === selId ? "var(--color-surface-2)" : "transparent", display: "block" }}>
            <div style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--color-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</div>
            <div style={{ fontSize: "0.6875rem", color: "var(--color-subtle)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.body.replace(/\n/g, " ") || "(vacío)"}</div>
          </button>
        ))}
      </div>
      {selected ? (
        <MessageEditor key={selected.id} template={selected} busy={busy} setBusy={setBusy} onDelete={() => remove(selected)} onSaved={() => router.refresh()} />
      ) : (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-subtle)", fontSize: "0.875rem" }}>Elegí o creá una plantilla de mensaje.</div>
      )}
    </div>
  );
}

function MessageEditor({ template, busy, setBusy, onDelete, onSaved }: {
  template: MsgTmpl; busy: boolean; setBusy: (b: boolean) => void; onDelete: () => void; onSaved: () => void;
}) {
  const [name, setName] = useState(template.name);
  const [body, setBody] = useState(template.body);
  const [saved, setSaved] = useState(false);
  const ta = useRef<HTMLTextAreaElement>(null);

  const preview = useMemo(() => renderMessage(body, SAMPLE_MESSAGE_PRODUCT), [body]);

  function insertVar(token: string) {
    const el = ta.current;
    if (!el) { setBody((b) => b + token); return; }
    const start = el.selectionStart, end = el.selectionEnd;
    setBody((b) => b.slice(0, start) + token + b.slice(end));
    // Reposicionar el cursor tras el token insertado.
    requestAnimationFrame(() => { el.focus(); el.selectionStart = el.selectionEnd = start + token.length; });
  }

  async function save() {
    setBusy(true);
    await fetch(`/api/message-templates/${template.id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, body }),
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
          <label style={lbl}>Variables <span style={{ color: "var(--color-subtle)", fontWeight: 400 }}>— clic para insertar donde está el cursor</span></label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
            {MESSAGE_VARIABLES.map((v) => (
              <button key={v.name} onClick={() => insertVar(`{${v.name}}`)} className="pill pill-neutral"
                title={`{${v.name}}`} style={{ cursor: "pointer", border: "1px dashed var(--color-border)", fontFamily: "var(--font-mono), monospace", fontSize: "0.6875rem" }}>
                {v.label}
              </button>
            ))}
          </div>
          <p style={{ margin: "8px 0 0", fontSize: "0.72rem", color: "var(--color-subtle)", lineHeight: 1.5 }}>
            💡 Las variables de precio admiten operaciones para mostrar cuotas:{" "}
            <code style={{ fontFamily: "var(--font-mono), monospace", background: "var(--color-surface-2)", padding: "1px 5px", borderRadius: 5 }}>{"{precio_actual / 3}"}</code>{" "}
            divide el precio en 3. También sirven <code style={{ fontFamily: "var(--font-mono), monospace" }}>* + -</code>.
          </p>
        </div>
        <div>
          <label style={lbl}>Mensaje</label>
          <textarea ref={ta} className="input" value={body} onChange={(e) => setBody(e.target.value)} rows={12}
            placeholder="¡Hola! Te paso la info de {nombre}…"
            style={{ marginTop: 5, lineHeight: 1.5, resize: "vertical", fontSize: "0.875rem" }} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, paddingTop: 4 }}>
          <button className="btn-primary" onClick={save} disabled={busy}>{saved ? "Guardado ✓" : "Guardar"}</button>
          <button className="btn-secondary" onClick={onDelete} disabled={busy} style={{ color: "var(--color-danger)" }}>Eliminar</button>
        </div>
      </div>

      <div style={{ flex: 1, borderLeft: "1px solid var(--color-divider)", overflowY: "auto", padding: 20, background: "var(--color-surface-2)", minWidth: 0 }}>
        <div style={{ fontSize: "0.6875rem", fontWeight: 700, color: "var(--color-subtle)", textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: 10 }}>
          Vista previa · {SAMPLE_MESSAGE_PRODUCT.name}
        </div>
        {/* Burbuja tipo chat para que se vea como el mensaje que recibe el cliente */}
        <div style={{ background: "var(--color-surface)", borderRadius: 14, border: "1px solid var(--color-border)", padding: "12px 14px", fontSize: "0.875rem", lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word", maxWidth: 420 }}>
          {preview || <span style={{ color: "var(--color-faint)" }}>El mensaje aparecerá acá…</span>}
        </div>
        <p style={{ fontSize: "0.75rem", color: "var(--color-subtle)", marginTop: 12 }}>
          En el catálogo, clic derecho sobre un producto → «Copiar mensaje» reemplaza las variables con sus datos reales.
        </p>
      </div>
    </div>
  );
}

const lbl: React.CSSProperties = { fontSize: "0.8125rem", fontWeight: 600, color: "var(--color-muted)" };
