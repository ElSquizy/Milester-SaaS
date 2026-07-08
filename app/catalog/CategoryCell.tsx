"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

type Cat = { id: number; tiendaNubeId: string; name: string; parentTnId: string | null; count: number };

/**
 * Inline category editor: shows a product's collections as chips; clicking opens a
 * popover with every category (searchable, checkboxes) to pick which apply. On close,
 * the change is saved locally (marks the product "modified") and pushed to TN on sync.
 */
export default function CategoryCell({ productId, current }: {
  productId: number; current: { id: number; name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [all, setAll] = useState<Cat[] | null>(null);
  const [sel, setSel] = useState<Set<number>>(new Set(current.map((c) => c.id)));
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const initial = useRef(current.map((c) => c.id).sort().join(","));

  useEffect(() => {
    setSel(new Set(current.map((c) => c.id)));
    initial.current = current.map((c) => c.id).sort().join(",");
  }, [current]);

  function openPopover(e: React.MouseEvent) {
    e.stopPropagation();
    const r = anchorRef.current!.getBoundingClientRect();
    setPos({ x: Math.min(r.left, window.innerWidth - 320), y: Math.min(r.bottom + 4, window.innerHeight - 380) });
    setOpen(true);
    if (!all) fetch("/api/categories").then((r) => r.json()).then(setAll).catch(() => setAll([]));
  }

  async function close() {
    setOpen(false);
    const now = [...sel].sort().join(",");
    if (now === initial.current) return;
    setBusy(true);
    try {
      await fetch(`/api/products/${productId}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryIds: [...sel] }),
      });
      router.refresh();
    } finally { setBusy(false); }
  }

  // Close (and save) on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (popRef.current && !popRef.current.contains(e.target as Node) && !anchorRef.current?.contains(e.target as Node)) close();
    }
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") close(); }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }); // eslint-disable-line react-hooks/exhaustive-deps

  function toggle(id: number) {
    setSel((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  const filtered = (all || []).filter((c) => c.name.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (b.count - a.count) || a.name.localeCompare(b.name));

  return (
    <>
      <button
        ref={anchorRef}
        onClick={openPopover}
        title="Editar colecciones"
        style={{
          display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center",
          border: "1px solid transparent", background: "transparent", cursor: "pointer",
          padding: "3px 4px", borderRadius: 8, maxWidth: 200, textAlign: "left",
          opacity: busy ? 0.6 : 1,
        }}
      >
        {current.length === 0 ? (
          <span style={{ fontSize: "0.8125rem", color: "var(--color-faint)" }}>+ Colección</span>
        ) : (
          <>
            {current.slice(0, 2).map((c) => (
              <span key={c.id} style={{ padding: "2px 8px", borderRadius: "var(--radius-pill)", background: "var(--color-surface-2)", fontSize: "0.75rem", color: "var(--color-ink)", fontWeight: 500, whiteSpace: "nowrap", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis" }}>
                {c.name}
              </span>
            ))}
            {current.length > 2 && (
              <span style={{ fontSize: "0.75rem", color: "var(--color-subtle)", fontWeight: 500 }}>+{current.length - 2}</span>
            )}
          </>
        )}
      </button>

      {open && (
        <div
          ref={popRef}
          className="anim-in menu"
          style={{ position: "fixed", top: pos.y, left: pos.x, zIndex: 80, width: 300, padding: 0, display: "flex", flexDirection: "column", maxHeight: 360, overflow: "hidden" }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ padding: 10, borderBottom: "1px solid var(--color-divider)" }}>
            <input
              autoFocus className="input" value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar colección..." style={{ fontSize: "0.8125rem", padding: "7px 10px" }}
            />
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: 6 }}>
            {all == null ? (
              <div style={{ padding: 16, textAlign: "center", fontSize: "0.8125rem", color: "var(--color-subtle)" }}>Cargando…</div>
            ) : filtered.length === 0 ? (
              <div style={{ padding: 16, textAlign: "center", fontSize: "0.8125rem", color: "var(--color-subtle)" }}>Sin resultados</div>
            ) : filtered.map((c) => {
              const on = sel.has(c.id);
              return (
                <button
                  key={c.id}
                  onClick={() => toggle(c.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 9, width: "100%",
                    padding: "7px 9px", borderRadius: 8, border: "none", cursor: "pointer",
                    background: on ? "var(--color-brand-light)" : "transparent", textAlign: "left",
                  }}
                >
                  <span style={{
                    width: 17, height: 17, borderRadius: 5, flexShrink: 0,
                    border: `1.5px solid ${on ? "var(--color-brand)" : "var(--color-border)"}`,
                    background: on ? "var(--color-brand)" : "transparent",
                    color: "#fff", fontSize: "0.6875rem", fontWeight: 700,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>{on ? "✓" : ""}</span>
                  <span style={{ flex: 1, fontSize: "0.8125rem", color: "var(--color-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
                  <span style={{ fontSize: "0.6875rem", color: "var(--color-faint)", fontVariantNumeric: "tabular-nums" }}>{c.count}</span>
                </button>
              );
            })}
          </div>
          <div style={{ padding: "8px 10px", borderTop: "1px solid var(--color-divider)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "0.6875rem", color: "var(--color-subtle)" }}>{sel.size} seleccionadas</span>
            <button className="btn-primary" onClick={close} style={{ padding: "5px 12px", fontSize: "0.75rem" }}>Listo</button>
          </div>
        </div>
      )}
    </>
  );
}
