"use client";
import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import ProductGridModal from "../campaigns/ProductGridModal";
import type { PickedProduct } from "../campaigns/CampaignExtras";

type Cat = { id: number; tiendaNubeId: string; name: string; parentTnId: string | null; count: number };
type Node = Cat & { children: Node[]; total: number };

export default function CollectionsClient({ categories }: { categories: Cat[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const [managing, setManaging] = useState<Cat | null>(null);
  const [creating, setCreating] = useState(false);
  const [moving, setMoving] = useState<Cat | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const catNames = useMemo(() => [...new Set(categories.map((c) => c.name))].sort(), [categories]);
  const { tree, rootCount } = useMemo(() => buildTree(categories), [categories]);

  const visible = useMemo(() => {
    if (!query.trim()) return null;
    const q = query.toLowerCase();
    return categories.filter((c) => c.name.toLowerCase().includes(q)).sort((a, b) => b.count - a.count);
  }, [query, categories]);

  function toggleCollapse(id: number) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function duplicate(cat: Cat) {
    setBusyId(cat.id);
    try {
      const res = await fetch(`/api/collections/${cat.id}/duplicate`, { method: "POST" });
      if (!res.ok) { const d = await res.json().catch(() => ({})); alert(d.error || "No se pudo duplicar"); }
      router.refresh();
    } finally { setBusyId(null); }
  }

  async function remove(cat: Cat) {
    if (!confirm(`¿Eliminar la colección "${cat.name}" de Tienda Nube? Los productos no se borran, solo se quita la colección.`)) return;
    setBusyId(cat.id);
    try {
      const res = await fetch(`/api/categories/${cat.id}`, { method: "DELETE" });
      if (!res.ok) { const d = await res.json().catch(() => ({})); alert(d.error || "No se pudo eliminar"); }
      router.refresh();
    } finally { setBusyId(null); }
  }

  return (
    <div style={{ height: "100dvh", overflowY: "auto", padding: "48px 48px 80px" }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>

        {/* Header */}
        <div className="anim-up" style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 28, gap: 16 }}>
          <div>
            <h1 style={{ fontSize: "1.75rem", fontWeight: 600, letterSpacing: "-0.02em", margin: "0 0 4px", lineHeight: 1.1 }}>
              Colecciones
            </h1>
            <p style={{ fontSize: "0.875rem", color: "var(--color-muted)", margin: 0 }}>
              {categories.length} colecciones · {rootCount} principales. Gestioná qué productos hay en cada una.
            </p>
          </div>
          <button className="btn-primary" onClick={() => setCreating(true)} style={{ whiteSpace: "nowrap" }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            Nueva colección
          </button>
        </div>

        {/* Search */}
        <div className="anim-up delay-1" style={{ position: "relative", marginBottom: 20, maxWidth: 360 }}>
          <span style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-faint)" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
          </span>
          <input
            className="input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar colección..."
            style={{ paddingLeft: 36 }}
          />
        </div>

        {/* Tree */}
        <div className="anim-up delay-2 card-float" style={{ overflow: "hidden", padding: 0 }}>
          {visible ? (
            visible.length === 0 ? (
              <div style={{ padding: "40px", textAlign: "center", color: "var(--color-subtle)", fontSize: "0.875rem" }}>Sin resultados</div>
            ) : (
              visible.map((c, i) => (
                <Row key={c.id} cat={c} depth={0} first={i === 0} hasChildren={false} collapsed={false} busy={busyId === c.id} onManage={() => setManaging(c)} onDuplicate={() => duplicate(c)} onDelete={() => remove(c)} onMove={() => setMoving(c)} />
              ))
            )
          ) : (
            flatten(tree, collapsed).map((r, i) => (
              <Row
                key={r.cat.id} cat={r.cat} depth={r.depth} first={i === 0}
                hasChildren={r.hasChildren} collapsed={collapsed.has(r.cat.id)}
                busy={busyId === r.cat.id}
                onToggleCollapse={() => toggleCollapse(r.cat.id)}
                onManage={() => setManaging(r.cat)}
                onDuplicate={() => duplicate(r.cat)}
                onDelete={() => remove(r.cat)}
                onMove={() => setMoving(r.cat)}
              />
            ))
          )}
        </div>
      </div>

      {managing && (
        <CollectionPanel
          collection={managing}
          categoryNames={catNames}
          onClose={() => setManaging(null)}
          onSaved={() => { setManaging(null); router.refresh(); }}
        />
      )}

      {creating && (
        <NewCollectionModal
          roots={categories.filter((c) => !c.parentTnId || c.parentTnId === "0")}
          onClose={() => setCreating(false)}
          onCreated={() => { setCreating(false); router.refresh(); }}
        />
      )}

      {moving && (
        <MoveCollectionModal
          collection={moving}
          categories={categories}
          onClose={() => setMoving(null)}
          onMoved={() => { setMoving(null); router.refresh(); }}
        />
      )}
    </div>
  );
}

function Row({ cat, depth, first, hasChildren, collapsed, busy, onToggleCollapse, onManage, onDuplicate, onDelete, onMove }: {
  cat: Cat; depth: number; first: boolean;
  hasChildren: boolean; collapsed: boolean; busy: boolean; onToggleCollapse?: () => void;
  onManage: () => void; onDuplicate: () => void; onDelete: () => void; onMove: () => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "11px 16px", paddingLeft: 16 + depth * 20,
        borderTop: first ? "none" : "1px solid var(--color-divider)",
        background: hover ? "var(--color-surface-2)" : "transparent",
        transition: "background 0.12s",
      }}
    >
      {hasChildren ? (
        <button onClick={onToggleCollapse} style={{
          width: 18, height: 18, border: "none", background: "transparent", cursor: "pointer",
          color: "var(--color-subtle)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ transform: collapsed ? "rotate(-90deg)" : "none", transition: "transform 0.12s" }}>
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      ) : (
        <span style={{ width: 18, flexShrink: 0 }} />
      )}

      <button
        onClick={onManage}
        style={{
          flex: 1, textAlign: "left", border: "none", background: "transparent", cursor: "pointer", padding: 0,
          fontSize: "0.9375rem", color: "var(--color-ink)", fontWeight: depth === 0 ? 600 : 400, letterSpacing: "-0.01em",
        }}
      >
        {cat.name}
      </button>

      {busy && <span style={{ fontSize: "0.75rem", color: "var(--color-subtle)" }}>…</span>}

      <span className="pill pill-neutral" style={{ fontVariantNumeric: "tabular-nums" }}>
        {cat.count.toLocaleString("es-AR")}
      </span>

      <div style={{ display: "flex", gap: 4, alignItems: "center", opacity: hover && !busy ? 1 : 0, transition: "opacity 0.12s", pointerEvents: hover && !busy ? "auto" : "none" }}>
        <button onClick={onManage} className="btn-secondary" style={{ padding: "5px 11px", fontSize: "0.75rem" }}>Gestionar</button>
        <button onClick={onDuplicate} title="Duplicar colección" className="btn-secondary" style={{ padding: "5px 8px", fontSize: "0.75rem" }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
        </button>
        <button onClick={onMove} title="Mover a otra colección padre" className="btn-secondary" style={{ padding: "5px 8px", fontSize: "0.75rem" }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="5 9 2 12 5 15" /><polyline points="9 5 12 2 15 5" /><polyline points="15 19 12 22 9 19" /><polyline points="19 9 22 12 19 15" /><line x1="2" y1="12" x2="22" y2="12" /><line x1="12" y1="2" x2="12" y2="22" /></svg>
        </button>
        <button onClick={onDelete} title="Eliminar colección" className="btn-secondary" style={{ padding: "5px 8px", fontSize: "0.75rem", color: "var(--color-danger)" }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
        </button>
      </div>

      <Link
        href={`/catalog?category=${encodeURIComponent(cat.name)}`}
        style={{
          display: "inline-flex", alignItems: "center", fontSize: "0.75rem",
          color: "var(--color-subtle)", textDecoration: "none", padding: "5px 6px", borderRadius: 6, flexShrink: 0,
        }}
      >
        Ver →
      </Link>
    </div>
  );
}

/** Modal to create a new collection (optionally a subcollection) in Tienda Nube. */
function NewCollectionModal({ roots, onClose, onCreated }: {
  roots: Cat[]; onClose: () => void; onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [parent, setParent] = useState(""); // tiendaNubeId of parent, "" = root
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function create() {
    if (!name.trim()) { setError("Poné un nombre"); return; }
    setSaving(true); setError("");
    try {
      const res = await fetch("/api/categories", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), parentTnId: parent || null }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Error");
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally { setSaving(false); }
  }

  return (
    <div onClick={onClose} className="anim-in" style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(17,24,39,0.40)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "80px 24px" }}>
      <div onClick={(e) => e.stopPropagation()} className="anim-modal" style={{ width: "100%", maxWidth: 440, background: "var(--color-surface)", borderRadius: "var(--radius-modal)", boxShadow: "var(--shadow-float)", overflow: "hidden" }}>
        <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--color-divider)", fontSize: "1.0625rem", fontWeight: 600, letterSpacing: "-0.02em" }}>Nueva colección</div>
        <div style={{ padding: "22px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label style={{ fontSize: "0.8125rem", fontWeight: 500, color: "var(--color-muted)" }}>Nombre</label>
            <input autoFocus className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Ofertas de verano" style={{ marginTop: 6 }} onKeyDown={(e) => { if (e.key === "Enter") create(); }} />
          </div>
          <div>
            <label style={{ fontSize: "0.8125rem", fontWeight: 500, color: "var(--color-muted)" }}>Colección padre (opcional)</label>
            <select className="input" value={parent} onChange={(e) => setParent(e.target.value)} style={{ marginTop: 6 }}>
              <option value="">Colección principal (sin padre)</option>
              {roots.map((c) => <option key={c.id} value={c.tiendaNubeId}>Subcolección de: {c.name}</option>)}
            </select>
          </div>
        </div>
        <div style={{ padding: "16px 24px", borderTop: "1px solid var(--color-divider)", display: "flex", alignItems: "center", gap: 10 }}>
          {error && <span style={{ flex: 1, fontSize: "0.8125rem", color: "var(--color-danger)" }}>{error}</span>}
          {!error && <span style={{ flex: 1 }} />}
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" onClick={create} disabled={saving || !name.trim()}>{saving ? "Creando…" : "Crear en Tienda Nube"}</button>
        </div>
      </div>
    </div>
  );
}

/** Modal to move a collection under a different parent (or to root) in Tienda Nube. */
function MoveCollectionModal({ collection, categories, onClose, onMoved }: {
  collection: Cat; categories: Cat[]; onClose: () => void; onMoved: () => void;
}) {
  const currentParent = collection.parentTnId && collection.parentTnId !== "0" ? collection.parentTnId : "";
  const [parent, setParent] = useState(currentParent);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Valid parents = every collection except this one and its descendants (no cycles).
  const excluded = useMemo(() => {
    const childrenOf = new Map<string, Cat[]>();
    for (const c of categories) {
      const p = c.parentTnId && c.parentTnId !== "0" ? c.parentTnId : "";
      if (!childrenOf.has(p)) childrenOf.set(p, []);
      childrenOf.get(p)!.push(c);
    }
    const set = new Set<string>([collection.tiendaNubeId]);
    const stack = [collection.tiendaNubeId];
    while (stack.length) { const t = stack.pop()!; for (const ch of childrenOf.get(t) || []) { if (!set.has(ch.tiendaNubeId)) { set.add(ch.tiendaNubeId); stack.push(ch.tiendaNubeId); } } }
    return set;
  }, [categories, collection]);

  // Flatten into indented options so the nested tree is visible in the picker.
  const options = useMemo(() => {
    const childrenOf = new Map<string, Cat[]>();
    for (const c of categories) {
      const p = c.parentTnId && c.parentTnId !== "0" ? c.parentTnId : "";
      if (!childrenOf.has(p)) childrenOf.set(p, []);
      childrenOf.get(p)!.push(c);
    }
    const out: { id: string; label: string }[] = [];
    const walk = (parentId: string, depth: number) => {
      for (const c of (childrenOf.get(parentId) || []).sort((a, b) => a.name.localeCompare(b.name, "es"))) {
        if (excluded.has(c.tiendaNubeId)) continue; // skip self + descendants entirely
        out.push({ id: c.tiendaNubeId, label: `${"    ".repeat(depth)}${depth > 0 ? "└ " : ""}${c.name}` });
        walk(c.tiendaNubeId, depth + 1);
      }
    };
    walk("", 0);
    return out;
  }, [categories, excluded]);

  async function move() {
    if (parent === currentParent) { onClose(); return; }
    setSaving(true); setError("");
    try {
      const res = await fetch(`/api/categories/${collection.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parentTnId: parent || null }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Error");
      onMoved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally { setSaving(false); }
  }

  return (
    <div onClick={onClose} className="anim-in" style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(17,24,39,0.40)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "80px 24px" }}>
      <div onClick={(e) => e.stopPropagation()} className="anim-modal" style={{ width: "100%", maxWidth: 440, background: "var(--color-surface)", borderRadius: "var(--radius-modal)", boxShadow: "var(--shadow-float)", overflow: "hidden" }}>
        <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--color-divider)", fontSize: "1.0625rem", fontWeight: 600, letterSpacing: "-0.02em" }}>Mover «{collection.name}»</div>
        <div style={{ padding: "22px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label style={{ fontSize: "0.8125rem", fontWeight: 500, color: "var(--color-muted)" }}>Nueva colección padre</label>
            <select autoFocus className="input" value={parent} onChange={(e) => setParent(e.target.value)} style={{ marginTop: 6 }}>
              <option value="">Colección principal (sin padre)</option>
              {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
            <p style={{ marginTop: 8, fontSize: "0.75rem", color: "var(--color-subtle)" }}>Se aplica en Tienda Nube. No podés moverla dentro de sí misma ni de una subcolección suya.</p>
          </div>
        </div>
        <div style={{ padding: "16px 24px", borderTop: "1px solid var(--color-divider)", display: "flex", alignItems: "center", gap: 10 }}>
          {error && <span style={{ flex: 1, fontSize: "0.8125rem", color: "var(--color-danger)" }}>{error}</span>}
          {!error && <span style={{ flex: 1 }} />}
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" onClick={move} disabled={saving}>{saving ? "Moviendo…" : "Mover en Tienda Nube"}</button>
        </div>
      </div>
    </div>
  );
}

/** Central modal: shows a collection's current products and opens the grid to edit membership. */
function CollectionPanel({ collection, categoryNames, onClose, onSaved }: {
  collection: Cat; categoryNames: string[]; onClose: () => void; onSaved: () => void;
}) {
  const [members, setMembers] = useState<PickedProduct[] | null>(null);
  const [gridOpen, setGridOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/collections/${collection.id}/products`)
      .then((r) => r.json())
      .then((d) => setMembers((d.products || []).map((p: PickedProduct) => ({ id: p.id, name: p.name, imageUrl: p.imageUrl, price: p.price }))))
      .catch(() => setMembers([]));
  }, [collection.id]);

  async function apply(picked: PickedProduct[]) {
    setGridOpen(false);
    const before = new Set((members || []).map((p) => p.id));
    const after = new Set(picked.map((p) => p.id));
    const add = picked.filter((p) => !before.has(p.id)).map((p) => p.id);
    const remove = (members || []).filter((p) => !after.has(p.id)).map((p) => p.id);
    if (add.length === 0 && remove.length === 0) { setResult("Sin cambios"); return; }

    setSaving(true); setError(null); setResult(null);
    try {
      const res = await fetch(`/api/collections/${collection.id}/products`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ add, remove }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Error");
      setMembers(picked);
      const parts: string[] = [];
      if (d.added) parts.push(`${d.added} agregados`);
      if (d.removed) parts.push(`${d.removed} quitados`);
      if (d.errors) parts.push(`${d.errors} con error`);
      setResult(parts.length ? parts.join(", ") : "Listo");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div onClick={onClose} className="anim-in" style={{ position: "fixed", inset: 0, zIndex: 55, background: "rgba(17,24,39,0.40)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "56px 24px" }}>
        <div onClick={(e) => e.stopPropagation()} className="anim-modal" style={{ width: "100%", maxWidth: 540, maxHeight: "calc(100dvh - 112px)", background: "var(--color-surface)", borderRadius: "var(--radius-modal)", boxShadow: "var(--shadow-float)", display: "flex", flexDirection: "column", overflow: "hidden" }}>

          <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--color-divider)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
            <div>
              <div style={{ fontSize: "1.0625rem", fontWeight: 600, letterSpacing: "-0.02em" }}>{collection.name}</div>
              <div style={{ fontSize: "0.75rem", color: "var(--color-subtle)", marginTop: 2 }}>
                {members == null ? "Cargando…" : `${members.length} ${members.length === 1 ? "producto" : "productos"} en la colección`}
              </div>
            </div>
            <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 9, border: "none", background: "var(--color-surface-2)", cursor: "pointer", color: "var(--color-muted)" }}>✕</button>
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px" }}>
            {members == null ? (
              <div style={{ padding: "32px", textAlign: "center", color: "var(--color-subtle)", fontSize: "0.875rem" }}>Cargando productos…</div>
            ) : members.length === 0 ? (
              <div style={{ padding: "28px 16px", textAlign: "center", color: "var(--color-subtle)", fontSize: "0.875rem" }}>
                Esta colección todavía no tiene productos.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {members.slice(0, 60).map((p) => (
                  <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    {p.imageUrl
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={p.imageUrl} alt="" style={{ width: 30, height: 30, borderRadius: 7, objectFit: "cover", flexShrink: 0 }} />
                      : <span style={{ width: 30, height: 30, borderRadius: 7, background: "var(--color-surface-2)", flexShrink: 0 }} />}
                    <span style={{ flex: 1, fontSize: "0.8125rem", color: "var(--color-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
                    <span style={{ fontSize: "0.75rem", color: "var(--color-subtle)", fontVariantNumeric: "tabular-nums" }}>${p.price.toLocaleString("es-AR")}</span>
                  </div>
                ))}
                {members.length > 60 && (
                  <div style={{ fontSize: "0.75rem", color: "var(--color-subtle)", paddingTop: 4 }}>… y {members.length - 60} más</div>
                )}
              </div>
            )}
          </div>

          <div style={{ padding: "14px 24px", borderTop: "1px solid var(--color-divider)", flexShrink: 0, display: "flex", alignItems: "center", gap: 10 }}>
            {error ? <span style={{ flex: 1, fontSize: "0.8125rem", color: "var(--color-danger)" }}>✕ {error}</span>
              : result ? <span style={{ flex: 1, fontSize: "0.8125rem", color: "var(--color-success)" }}>✓ {result}</span>
              : <span style={{ flex: 1, fontSize: "0.75rem", color: "var(--color-subtle)" }}>Los cambios se escriben en Tienda Nube.</span>}
            {saving ? (
              <button className="btn-primary" disabled>Guardando…</button>
            ) : (
              <button className="btn-primary" onClick={() => setGridOpen(true)} disabled={members == null}>
                Editar productos
              </button>
            )}
          </div>
        </div>
      </div>

      {gridOpen && members != null && (
        <ProductGridModal
          initial={members}
          categories={categoryNames}
          allowEmpty
          title={`Productos en "${collection.name}"`}
          confirmLabel="Guardar cambios"
          onClose={() => setGridOpen(false)}
          onConfirm={apply}
        />
      )}
    </>
  );
}

// Deterministically flatten the visible tree (respecting collapsed nodes) into ordered rows.
function flatten(nodes: Node[], collapsed: Set<number>, depth = 0): { cat: Node; depth: number; hasChildren: boolean }[] {
  const out: { cat: Node; depth: number; hasChildren: boolean }[] = [];
  for (const n of nodes) {
    out.push({ cat: n, depth, hasChildren: n.children.length > 0 });
    if (!collapsed.has(n.id) && n.children.length > 0) {
      out.push(...flatten(n.children, collapsed, depth + 1));
    }
  }
  return out;
}

function buildTree(cats: Cat[]) {
  const byTnId = new Map<string, Node>();
  cats.forEach((c) => byTnId.set(c.tiendaNubeId, { ...c, children: [], total: c.count }));
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
  return { tree: roots, rootCount: roots.length };
}
