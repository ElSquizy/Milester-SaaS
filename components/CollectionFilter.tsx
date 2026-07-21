"use client";
import { useEffect, useRef, useState } from "react";

/** A collection filter's state: name → include/exclude. Shared by the catalog
 *  and the product picker so both behave identically. */
export type Tri = Map<string, "inc" | "exc">;

export function parseTri(param: string): Tri {
  const m: Tri = new Map();
  for (const raw of (param || "").split(",").map((s) => s.trim()).filter(Boolean)) {
    if (raw.startsWith("-")) m.set(raw.slice(1), "exc");
    else m.set(raw.startsWith("+") ? raw.slice(1) : raw, "inc");
  }
  return m;
}

export function serializeTri(m: Tri): string {
  return [...m.entries()].map(([k, v]) => (v === "exc" ? "-" : "+") + k).join(",");
}

/** Cycles one collection off → include → exclude → off in a Tri map (immutable). */
export function cycleTri(m: Tri, value: string): Tri {
  const next = new Map(m);
  const cur = next.get(value);
  if (!cur) next.set(value, "inc");
  else if (cur === "inc") next.set(value, "exc");
  else next.delete(value);
  return next;
}

/** Collection include/exclude filter: a button opening a searchable popover of
 *  collections (nested when a tree is provided, flat while searching). */
export default function CollectionFilter({ categories, tree, state, onCycle }: {
  categories: string[];
  tree?: { name: string; tnId: string; parentTnId: string | null }[];
  state: Tri;
  onCycle: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const active = state.size;

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  // Build a depth-ordered, nested list from the tree. When searching, fall back
  // to a flat filtered list (nesting is meaningless once ancestors are hidden).
  const rows: { name: string; depth: number }[] = (() => {
    const query = q.trim().toLowerCase();
    if (query || !tree || tree.length === 0) {
      return categories.filter((c) => c.toLowerCase().includes(query)).slice(0, 200).map((name) => ({ name, depth: 0 }));
    }
    const childrenOf = new Map<string, typeof tree>();
    for (const c of tree) {
      const p = c.parentTnId && c.parentTnId !== "0" ? c.parentTnId : "";
      if (!childrenOf.has(p)) childrenOf.set(p, []);
      childrenOf.get(p)!.push(c);
    }
    const out: { name: string; depth: number }[] = [];
    const walk = (parentId: string, depth: number) => {
      for (const c of (childrenOf.get(parentId) || []).slice().sort((a, b) => a.name.localeCompare(b.name, "es"))) {
        out.push({ name: c.name, depth });
        walk(c.tnId, depth + 1);
      }
    };
    walk("", 0);
    return out;
  })();

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button onClick={() => setOpen((o) => !o)} className="input" style={{ width: "auto", display: "inline-flex", alignItems: "center", gap: 7, cursor: "pointer", color: active ? "var(--color-ink)" : "var(--color-muted)" }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg>
        Colecciones{active > 0 ? ` · ${active}` : ""}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="6 9 12 15 18 9" /></svg>
      </button>
      {open && (
        <div className="anim-in menu" style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 70, width: 260, padding: 0, display: "flex", flexDirection: "column", maxHeight: 340, overflow: "hidden" }}>
          <div style={{ padding: 8, borderBottom: "1px solid var(--color-divider)" }}>
            <input autoFocus className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar colección..." style={{ fontSize: "0.8125rem", padding: "6px 10px" }} />
          </div>
          <div style={{ overflowY: "auto", padding: 6 }}>
            {rows.length === 0 ? (
              <div style={{ padding: 14, textAlign: "center", fontSize: "0.8125rem", color: "var(--color-subtle)" }}>Sin resultados</div>
            ) : rows.map((row, i) => {
              const c = row.name;
              const st = state.get(c);
              return (
                <button key={`${c}-${i}`} onClick={() => onCycle(c)} className="menu-item" style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", paddingLeft: 8 + row.depth * 16 }}>
                  <span style={{ width: 15, height: 15, borderRadius: 5, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.6875rem", fontWeight: 700,
                    border: `1.5px solid ${st === "inc" ? "var(--color-success)" : st === "exc" ? "var(--color-danger)" : "var(--color-border)"}`,
                    background: st === "inc" ? "var(--color-success)" : st === "exc" ? "var(--color-danger)" : "transparent", color: "#fff" }}>
                    {st === "inc" ? "✓" : st === "exc" ? "−" : ""}
                  </span>
                  {row.depth > 0 && <span style={{ color: "var(--color-faint)", flexShrink: 0 }}>└</span>}
                  <span style={{ flex: 1, textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: st === "exc" ? "var(--color-danger)" : "var(--color-ink)" }}>{c}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
