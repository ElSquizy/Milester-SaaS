"use client";
import { useState, useEffect, useMemo } from "react";

export type Cat = { id: number; tiendaNubeId: string; name: string; parentTnId: string | null; count: number };
type Node = Cat & { children: Node[] };

interface Props {
  selectedIds: Set<number>;
  onToggle: (id: number, name: string) => void;
}

export default function CollectionPicker({ selectedIds, onToggle }: Props) {
  const [cats, setCats] = useState<Cat[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/categories")
      .then((r) => r.json())
      .then((d) => setCats(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const tree = useMemo(() => buildTree(cats), [cats]);

  const filtered = useMemo(() => {
    if (!query.trim()) return tree;
    const q = query.toLowerCase();
    // Flat filter: when searching, show a flat list of matches.
    return cats
      .filter((c) => c.name.toLowerCase().includes(q))
      .map((c) => ({ ...c, children: [] as Node[] }));
  }, [query, tree, cats]);

  return (
    <div style={{ border: "1px solid var(--color-border)", borderRadius: 10, overflow: "hidden" }}>
      <div style={{ padding: 8, borderBottom: "1px solid var(--color-divider)", background: "var(--color-surface-2)" }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar colección..."
          style={{
            width: "100%", padding: "6px 10px", borderRadius: 7,
            border: "1px solid var(--color-border)", background: "var(--color-surface)",
            fontSize: "0.8125rem", color: "var(--color-ink)", outline: "none",
          }}
        />
      </div>
      <div style={{ maxHeight: 240, overflowY: "auto", padding: "6px 4px" }}>
        {loading ? (
          <div style={{ padding: 16, textAlign: "center", color: "var(--color-subtle)", fontSize: "0.8125rem" }}>Cargando...</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 16, textAlign: "center", color: "var(--color-subtle)", fontSize: "0.8125rem" }}>Sin resultados</div>
        ) : (
          filtered.map((n) => <TreeRow key={n.id} node={n} depth={0} selectedIds={selectedIds} onToggle={onToggle} flat={!!query.trim()} />)
        )}
      </div>
    </div>
  );
}

function TreeRow({ node, depth, selectedIds, onToggle, flat }: {
  node: Node; depth: number; selectedIds: Set<number>; onToggle: (id: number, name: string) => void; flat: boolean;
}) {
  const checked = selectedIds.has(node.id);
  return (
    <>
      <label style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "5px 8px", paddingLeft: 8 + (flat ? 0 : depth * 16),
        borderRadius: 6, cursor: "pointer", fontSize: "0.8125rem",
      }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-surface-2)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
      >
        <input
          type="checkbox"
          checked={checked}
          onChange={() => onToggle(node.id, node.name)}
          style={{ width: 14, height: 14, accentColor: "var(--color-brand)", cursor: "pointer", flexShrink: 0 }}
        />
        <span style={{ color: checked ? "var(--color-ink)" : "var(--color-muted)", fontWeight: checked ? 500 : 400, flex: 1 }}>
          {node.name}
        </span>
        <span style={{ fontSize: "0.6875rem", color: "var(--color-faint)", fontVariantNumeric: "tabular-nums" }}>{node.count}</span>
      </label>
      {!flat && node.children.map((c) => (
        <TreeRow key={c.id} node={c} depth={depth + 1} selectedIds={selectedIds} onToggle={onToggle} flat={flat} />
      ))}
    </>
  );
}

function buildTree(cats: Cat[]): Node[] {
  const byTnId = new Map<string, Node>();
  cats.forEach((c) => byTnId.set(c.tiendaNubeId, { ...c, children: [] }));
  const roots: Node[] = [];
  byTnId.forEach((node) => {
    const parent = node.parentTnId && node.parentTnId !== "0" ? byTnId.get(node.parentTnId) : null;
    if (parent) parent.children.push(node);
    else roots.push(node);
  });
  const sortRec = (nodes: Node[]) => {
    nodes.sort((a, b) => a.name.localeCompare(b.name));
    nodes.forEach((n) => sortRec(n.children));
  };
  sortRec(roots);
  return roots;
}
