"use client";
import { useEffect, useRef, useState } from "react";
import { isInFocus, toggleFocus } from "./useFocus";
import { notifyPendingChanged } from "@/lib/pendingEvent";
import { renderMessage } from "@/lib/messageTemplates";

type MsgTmpl = { id: number; name: string; body: string };

export type MenuTarget = {
  id: number; name: string; pendingDelete: boolean; syncStatus: string; x: number; y: number;
  // Datos para renderizar las plantillas de mensaje al copiar.
  sku: string | null; price: number; promotionalPrice: number | null; categoryName: string | null;
  stock: number | null; infiniteStock: boolean; productUrl: string | null;
};

/** Right-click context menu for a catalog product: duplicate, force-sync, discard local changes, stage/undo delete. */
export default function ProductContextMenu({ target, onClose, onDone }: {
  target: MenuTarget;
  onClose: () => void;
  onDone: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msgTemplates, setMsgTemplates] = useState<MsgTmpl[] | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [copyOpen, setCopyOpen] = useState(false);

  // Plantillas de mensaje para el submenú "Copiar mensaje".
  useEffect(() => {
    fetch("/api/message-templates").then((r) => r.json()).then(setMsgTemplates).catch(() => setMsgTemplates([]));
  }, []);

  async function copyMessage(t: MsgTmpl) {
    const text = renderMessage(t.body, {
      name: target.name, sku: target.sku, price: target.price, promotionalPrice: target.promotionalPrice,
      categoryName: target.categoryName, stock: target.stock, infiniteStock: target.infiniteStock, productUrl: target.productUrl,
    });
    try { await navigator.clipboard.writeText(text); } catch { /* clipboard bloqueado */ }
    setCopiedId(t.id);
    setTimeout(() => onClose(), 700);
  }

  // Keyboard support: the menu is a real menu (roving focus with arrows, Home/End,
  // Escape to dismiss). Without this it was reachable by right-click only, which
  // left keyboard and touch users with no path to these actions at all.
  const items = () =>
    Array.from(ref.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not([disabled])') ?? []);

  useEffect(() => {
    // Move focus into the menu so arrow keys work and focus can't stay behind it.
    items()[0]?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { e.preventDefault(); onClose(); return; }
      const list = items();
      if (list.length === 0) return;
      const i = list.indexOf(document.activeElement as HTMLButtonElement);
      if (e.key === "ArrowDown") { e.preventDefault(); list[(i + 1 + list.length) % list.length].focus(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); list[(i - 1 + list.length) % list.length].focus(); }
      else if (e.key === "Home") { e.preventDefault(); list[0].focus(); }
      else if (e.key === "End") { e.preventDefault(); list[list.length - 1].focus(); }
      else if (e.key === "Tab") { e.preventDefault(); onClose(); } // menus trap Tab; close instead
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [onClose]);

  async function run(key: string, fn: () => Promise<Response>) {
    setBusy(key);
    try {
      const res = await fn();
      if (!res.ok) { const d = await res.json().catch(() => ({})); alert(d.error || "Error"); }
      notifyPendingChanged();
      onDone();
    } finally {
      setBusy(null);
      onClose();
    }
  }

  const duplicate = () => run("dup", () => fetch(`/api/products/${target.id}/duplicate`, { method: "POST" }));
  const forceSync = () => run("sync", () => fetch(`/api/products/${target.id}/sync`, { method: "POST" }));
  const revert = () => {
    if (!confirm(`¿Descartar los cambios sin sincronizar de "${target.name}"? Vuelve a la versión que está hoy en Tienda Nube.`)) return;
    run("revert", () => fetch(`/api/products/${target.id}/revert`, { method: "POST" }));
  };

  // Only meaningful while the change hasn't been pushed: once synced, TN *is* the
  // new version and undoing belongs in Actividad (as a fresh change).
  const hasPending = target.syncStatus === "modified" || target.syncStatus === "error" || target.pendingDelete;

  // Focus is a local scratchpad: toggling is instant, no server round-trip.
  const inFocus = isInFocus(target.id);
  const flipFocus = () => { toggleFocus(target.id); onClose(); };
  const stageDelete = () => run("del", () => fetch("/api/products/bulk", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids: [target.id], action: "stage-delete" }),
  }));
  const restore = () => run("del", () => fetch("/api/products/bulk", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids: [target.id], action: "restore" }),
  }));

  // Keep the menu inside the viewport.
  const vw = typeof window !== "undefined" ? window.innerWidth : 9999;
  const x = Math.min(target.x, vw - 220);
  const y = Math.min(target.y, (typeof window !== "undefined" ? window.innerHeight : 9999) - 200);
  // The message submenu opens to the right unless there's no room — then left.
  const submenuFlipLeft = x + 210 + 216 > vw;

  return (
    <div
      ref={ref}
      className="anim-in menu"
      role="menu"
      aria-label={`Acciones de ${target.name}`}
      style={{ position: "fixed", top: y, left: x, zIndex: 80, width: 210, padding: 6 }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div style={{ padding: "6px 10px 8px", fontSize: "0.6875rem", color: "var(--color-subtle)", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", borderBottom: "1px solid var(--color-divider)", marginBottom: 4 }}>
        {target.name}
      </div>

      <MenuItem onClick={flipFocus} icon={inFocus
        ? <><circle cx="12" cy="12" r="9" /><line x1="9" y1="12" x2="15" y2="12" /></>
        : <><circle cx="12" cy="12" r="9" /><line x1="12" y1="9" x2="12" y2="15" /><line x1="9" y1="12" x2="15" y2="12" /></>}>
        {inFocus ? "Quitar del foco" : "Agregar al foco"}
      </MenuItem>

      <div style={{ height: 1, background: "var(--color-divider)", margin: "4px 0" }} />

      <MenuItem onClick={duplicate} busy={busy === "dup"} icon={<><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>}>
        Duplicar
      </MenuItem>

      <MenuItem onClick={forceSync} busy={busy === "sync"} icon={<><path d="M21 2v6h-6" /><path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M3 22v-6h6" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" /></>}>
        Forzar sincronización
      </MenuItem>

      {/* Copiar mensaje — submenú lateral para que el panel no crezca con muchos mensajes */}
      {msgTemplates && msgTemplates.length > 0 && (
        <div style={{ position: "relative" }} onMouseEnter={() => setCopyOpen(true)} onMouseLeave={() => setCopyOpen(false)}>
          <button className="menu-item" role="menuitem" aria-haspopup="menu" aria-expanded={copyOpen}
            onClick={() => setCopyOpen((o) => !o)}
            style={{ display: "flex", alignItems: "center", gap: 9, width: "100%", border: "none", background: "transparent", textAlign: "left", font: "inherit", color: "var(--color-ink)", cursor: "pointer" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
            <span style={{ flex: 1 }}>Copiar mensaje</span>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--color-subtle)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              {submenuFlipLeft ? <polyline points="15 18 9 12 15 6" /> : <polyline points="9 18 15 12 9 6" />}
            </svg>
          </button>
          {copyOpen && (
            <div className="menu anim-in" role="menu" aria-label="Elegí un mensaje"
              style={{ position: "absolute", top: -6, [submenuFlipLeft ? "right" : "left"]: "100%", [submenuFlipLeft ? "marginRight" : "marginLeft"]: 4, width: 210, maxHeight: 300, overflowY: "auto", padding: 6, zIndex: 81 }}>
              {msgTemplates.map((t) => (
                <MenuItem key={t.id} onClick={() => copyMessage(t)}
                  icon={copiedId === t.id
                    ? <polyline points="20 6 9 17 4 12" />
                    : <><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>}>
                  {copiedId === t.id ? "¡Copiado!" : t.name}
                </MenuItem>
              ))}
            </div>
          )}
        </div>
      )}

      {hasPending && (
        <MenuItem onClick={revert} busy={busy === "revert"} icon={<><path d="M3 7v6h6" /><path d="M3.51 13a9 9 0 1 0 2.13-9.36L3 8" /></>}>
          Deshacer cambios
        </MenuItem>
      )}

      {target.pendingDelete ? (
        <MenuItem onClick={restore} busy={busy === "del"} icon={<><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /></>}>
          Deshacer eliminación
        </MenuItem>
      ) : (
        <MenuItem onClick={stageDelete} busy={busy === "del"} danger icon={<><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></>}>
          Eliminar
        </MenuItem>
      )}
    </div>
  );
}

function MenuItem({ children, icon, onClick, busy, danger }: {
  children: React.ReactNode; icon: React.ReactNode; onClick: () => void; busy?: boolean; danger?: boolean;
}) {
  return (
    <button
      className="menu-item"
      role="menuitem"
      onClick={onClick}
      disabled={busy}
      style={{
        display: "flex", alignItems: "center", gap: 9, width: "100%",
        border: "none", background: "transparent", textAlign: "left", font: "inherit",
        color: danger ? "var(--color-danger)" : "var(--color-ink)",
        cursor: busy ? "default" : "pointer",
      }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={busy ? { animation: "spin 0.8s linear infinite" } : undefined}>
        {icon}
      </svg>
      {children}
    </button>
  );
}
