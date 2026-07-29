"use client";
import { useState } from "react";
import { createPortal } from "react-dom";
import { notifyPendingChanged } from "@/lib/pendingEvent";
import { readFocus, writeFocus } from "./useFocus";
import CollectionPicker from "./CollectionPicker";

interface Props {
  count: number;
  ids: number[];
  onClear: () => void;
  onDone: () => void;
}

type Sub = null | "menu" | "collections" | "tags";
type Confirm = null | "delete" | "revert";
const BATCH = 150;

export default function BulkBar({ count, ids, onClear, onDone }: Props) {
  const [sub, setSub] = useState<Sub>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [collAdd, setCollAdd] = useState<Set<number>>(new Set());
  const [tag, setTag] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; label: string } | null>(null);
  const [result, setResult] = useState("");

  function reset() { setSub(null); setConfirm(null); setCollAdd(new Set()); setTag(""); }
  function finish(msg: string, refresh = true) {
    setResult(msg);
    notifyPendingChanged();
    setTimeout(() => { setResult(""); reset(); if (refresh) onDone(); }, 1400);
  }

  /* ── Acciones locales (un POST a /api/products/bulk) ── */
  async function bulk(action: string, value: unknown, verb: string) {
    setBusy(true); setResult("");
    try {
      const res = await fetch("/api/products/bulk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids, action, value }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Error");
      finish(`✓ ${d.updated ?? count} ${verb}`);
    } catch (e) { setResult(e instanceof Error ? e.message : "Error"); }
    finally { setBusy(false); }
  }

  /* ── Acciones por-lote contra endpoints por-id (con progreso) ── */
  async function perId(path: (id: number) => string, label: string, verb: string) {
    setBusy(true); setResult(""); setProgress({ done: 0, total: ids.length, label });
    let ok = 0;
    try {
      for (let i = 0; i < ids.length; i++) {
        const res = await fetch(path(ids[i]), { method: "POST" });
        if (res.ok) ok++;
        setProgress({ done: i + 1, total: ids.length, label });
      }
      finish(`✓ ${ok} ${verb}`);
    } catch (e) { setResult(e instanceof Error ? e.message : "Error"); }
    finally { setBusy(false); setProgress(null); }
  }

  async function applyPricing() {
    setBusy(true); setResult(""); setProgress({ done: 0, total: ids.length, label: "Aplicando precios" });
    let changed = 0;
    try {
      for (let i = 0; i < ids.length; i += BATCH) {
        const res = await fetch("/api/pricing/apply", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productIds: ids.slice(i, i + BATCH) }) });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || "Error");
        changed += d.changed;
        setProgress({ done: Math.min(i + BATCH, ids.length), total: ids.length, label: "Aplicando precios" });
      }
      finish(`✓ ${changed} con precio actualizado`);
    } catch (e) { setResult(e instanceof Error ? e.message : "Error"); }
    finally { setBusy(false); setProgress(null); }
  }

  function addToFocus() {
    writeFocus([...new Set([...readFocus(), ...ids])]);
    finish(`✓ ${ids.length} al foco`, false);
  }

  const body = (
    <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", zIndex: 400, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>

      {/* Panel de colecciones */}
      {sub === "collections" && !busy && (
        <div className="menu anim-in" style={{ ...panel, width: 340 }}>
          <div style={panelLabel}>Colecciones · {count} productos</div>
          <CollectionPicker selectedIds={collAdd} onToggle={(id) => setCollAdd((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; })} />
          <div style={{ display: "flex", gap: 8, width: "100%" }}>
            <button className="btn-secondary" style={{ flex: 1, justifyContent: "center" }} disabled={collAdd.size === 0} onClick={() => bulk("remove-collection", [...collAdd], "actualizados")}>Quitar de {collAdd.size || ""}</button>
            <button className="btn-primary" style={{ flex: 1, justifyContent: "center" }} disabled={collAdd.size === 0} onClick={() => bulk("add-collection", [...collAdd], "actualizados")}>Agregar a {collAdd.size || ""}</button>
          </div>
          {result && <span style={resultStyle}>{result}</span>}
        </div>
      )}

      {/* Panel de etiquetas */}
      {sub === "tags" && !busy && (
        <div className="menu anim-in" style={{ ...panel, width: 320 }}>
          <div style={panelLabel}>Etiqueta · {count} productos</div>
          <input autoFocus className="input" value={tag} onChange={(e) => setTag(e.target.value)} placeholder="oferta, verano…" style={{ width: "100%" }} />
          <div style={{ display: "flex", gap: 8, width: "100%" }}>
            <button className="btn-secondary" style={{ flex: 1, justifyContent: "center" }} disabled={!tag.trim()} onClick={() => bulk("remove-tag", tag.trim(), "actualizados")}>Quitar</button>
            <button className="btn-primary" style={{ flex: 1, justifyContent: "center" }} disabled={!tag.trim()} onClick={() => bulk("add-tag", tag.trim(), "actualizados")}>Agregar</button>
          </div>
          {result && <span style={resultStyle}>{result}</span>}
        </div>
      )}

      {/* Menú de acciones (estilo clic derecho) */}
      {sub === "menu" && !busy && !confirm && (
        <div className="menu anim-in" style={{ ...menuCard }}>
          <Item icon={<><path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-7l-2-2H5a2 2 0 0 0-2 2z" /></>} onClick={() => setSub("collections")}>Colecciones…</Item>
          <Item icon={<><path d="M20.59 13.41 13.42 20.6a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" /><line x1="7" y1="7" x2="7.01" y2="7" /></>} onClick={() => setSub("tags")}>Etiquetas…</Item>
          <Item icon={<><line x1="19" y1="5" x2="5" y2="19" /><circle cx="6.5" cy="6.5" r="2.5" /><circle cx="17.5" cy="17.5" r="2.5" /></>} onClick={applyPricing}>Aplicar precios de franja</Item>
          <Divider />
          <Item icon={<><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></>} onClick={() => bulk("visibility", true, "publicados")}>Publicar</Item>
          <Item icon={<><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></>} onClick={() => bulk("visibility", false, "ocultados")}>Ocultar</Item>
          <Item icon={<><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>} onClick={() => bulk("duplicate", null, "duplicados")}>Duplicar</Item>
          <Item icon={<><circle cx="12" cy="12" r="9" /><line x1="12" y1="9" x2="12" y2="15" /><line x1="9" y1="12" x2="15" y2="12" /></>} onClick={addToFocus}>Agregar al foco</Item>
          <Divider />
          <Item icon={<><path d="M21 2v6h-6" /><path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M3 22v-6h6" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" /></>} onClick={() => perId((id) => `/api/products/${id}/sync`, "Sincronizando", "sincronizados")}>Forzar sincronización</Item>
          <Item icon={<><path d="M3 7v6h6" /><path d="M3.51 13a9 9 0 1 0 2.13-9.36L3 8" /></>} onClick={() => setConfirm("revert")}>Deshacer cambios</Item>
          <Item danger icon={<><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></>} onClick={() => setConfirm("delete")}>Eliminar</Item>
        </div>
      )}

      {/* Confirmación destructiva */}
      {confirm && !busy && (
        <div className="menu anim-in" style={{ ...panel, width: 300, alignItems: "center" }}>
          <div style={{ ...panelLabel, textAlign: "center" }}>{confirm === "delete" ? `¿Marcar ${count} para eliminar?` : `¿Descartar cambios de ${count}?`}</div>
          <div style={{ fontSize: "0.75rem", color: "var(--color-subtle)", textAlign: "center" }}>{confirm === "delete" ? "Se borran en Tienda Nube al sincronizar." : "Vuelven a la versión de Tienda Nube."}</div>
          <div style={{ display: "flex", gap: 8, width: "100%" }}>
            <button className="btn-secondary" style={{ flex: 1, justifyContent: "center" }} onClick={() => setConfirm(null)}>Cancelar</button>
            <button className="btn-primary" style={{ flex: 1, justifyContent: "center", ...(confirm === "delete" ? { background: "var(--color-danger)" } : {}) }}
              onClick={() => confirm === "delete" ? bulk("stage-delete", null, "marcados para eliminar") : perId((id) => `/api/products/${id}/revert`, "Revirtiendo", "revertidos")}>
              {confirm === "delete" ? "Eliminar" : "Descartar"}
            </button>
          </div>
        </div>
      )}

      {/* Barra principal */}
      <div className="anim-modal" style={mainBar}>
        <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--color-ink)", paddingRight: 10, borderRight: "1px solid var(--color-divider)", whiteSpace: "nowrap" }}>
          {progress ? `${progress.label}… ${progress.done}/${progress.total}` : result || `${count} seleccionados`}
        </span>
        <button onClick={() => setSub(sub ? null : "menu")} disabled={busy} style={barBtn(sub === "menu")}>
          Acciones
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ transform: sub ? "rotate(180deg)" : "none", transition: "transform .12s" }}><polyline points="6 9 12 15 18 9" /></svg>
        </button>
        <button onClick={() => { reset(); onClear(); }} disabled={busy} style={{ ...barBtn(false), color: "var(--color-subtle)" }}>Deseleccionar</button>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(body, document.body);
}

function Item({ children, icon, onClick, danger }: { children: React.ReactNode; icon: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button className="menu-item" role="menuitem" onClick={onClick}
      style={{ display: "flex", alignItems: "center", gap: 9, width: "100%", border: "none", background: "transparent", textAlign: "left", font: "inherit", color: danger ? "var(--color-danger)" : "var(--color-ink)", cursor: "pointer" }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{icon}</svg>
      {children}
    </button>
  );
}
function Divider() { return <div style={{ height: 1, background: "var(--color-divider)", margin: "4px 0" }} />; }

const mainBar: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 6, padding: "8px 10px 8px 14px",
  background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 14,
  boxShadow: "var(--shadow-float)",
};
const barBtn = (active: boolean): React.CSSProperties => ({
  display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 9, border: "none",
  background: active ? "var(--color-brand-light)" : "transparent", color: active ? "var(--color-brand)" : "var(--color-ink)",
  fontSize: "0.8125rem", fontWeight: 500, cursor: "pointer", whiteSpace: "nowrap",
});
const menuCard: React.CSSProperties = { width: 240, padding: 6 };
const panel: React.CSSProperties = {
  display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-start", padding: 16,
};
const panelLabel: React.CSSProperties = { fontSize: "0.8125rem", fontWeight: 600, color: "var(--color-ink)" };
const resultStyle: React.CSSProperties = { fontSize: "0.8125rem", color: "var(--color-success)", fontWeight: 500 };
