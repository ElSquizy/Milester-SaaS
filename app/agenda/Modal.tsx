"use client";
import { useEffect, useRef } from "react";

/**
 * Modal accesible compartido por la sección Agenda (tareas, equipo, eventos,
 * turnos). Centraliza: cierre por Escape, role="dialog"/aria-modal, foco movido
 * al diálogo al abrir (respetando un autoFocus interno), trampa de Tab y
 * restauración del foco al cerrar.
 */
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export default function Modal({ title, children, onClose, maxWidth = 560 }: {
  title: string; children: React.ReactNode; onClose: () => void; maxWidth?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const node = ref.current;
    // Si un hijo con autoFocus ya tomó el foco, no lo pisamos.
    if (node && !node.contains(document.activeElement)) node.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { e.stopPropagation(); onClose(); return; }
      if (e.key === "Tab" && node) {
        const els = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE));
        if (els.length === 0) return;
        const first = els[0], last = els[els.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); prev?.focus?.(); };
  }, [onClose]);

  return (
    <div onClick={onClose} className="anim-in" style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(17,24,39,0.45)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div ref={ref} onClick={(e) => e.stopPropagation()} className="anim-modal" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}
        style={{ width: "100%", maxWidth, maxHeight: "calc(100dvh - 48px)", overflowY: "auto", background: "var(--color-surface)", borderRadius: "var(--radius-modal)", boxShadow: "var(--shadow-float)", padding: "22px 24px", outline: "none" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ fontSize: "1.0625rem", fontWeight: 600, letterSpacing: "-0.02em" }}>{title}</div>
          <button onClick={onClose} aria-label="Cerrar" style={{ width: 30, height: 30, borderRadius: 8, border: "none", background: "var(--color-surface-2)", cursor: "pointer", color: "var(--color-muted)" }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
