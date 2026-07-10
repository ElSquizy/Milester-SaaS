"use client";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useState, useCallback, useTransition, useEffect, useRef } from "react";
import type { CatalogProduct } from "./page";
import ProductTable from "./ProductTable";
import ProductCards from "./ProductCards";
import ProductPanel from "./ProductPanel";
import BulkBar from "./BulkBar";
import ProductModal from "./ProductModal";
import ProductContextMenu, { type MenuTarget } from "./ProductContextMenu";

type EditProduct = {
  id: number;
  name: string;
  description: string | null;
  descriptionTemplateId: number | null;
  descriptionData: string | null;
  imageTemplateId: number | null;
  productImageUrl: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  price: number;
  promotionalPrice: number | null;
  originalPrice: number;
  sku: string | null;
  published: boolean;
  tags: string;
  categoryName: string | null;
  imageUrl: string | null;
  stock: number | null;
  infiniteStock: boolean;
  syncStatus: string;
  unitsSold: number;
  lastSoldAt: Date | null;
  variants: Array<{ id: number; price: number; stock: number | null; sku: string | null }>;
  categoryIds: number[];
  categoryChips: Array<{ id: number; name: string }>;
} | null;

interface Props {
  products: CatalogProduct[];
  total: number;
  page: number;
  totalPages: number;
  categories: string[];
  categoryTree?: { name: string; tnId: string; parentTnId: string | null }[];
  currentQ: string;
  currentStatus: string;
  currentCategory: string;
  currentFlag: string;
  currentSort: string;
  editProduct: EditProduct;
  pendingCount: number;
}

type Tri = Map<string, "inc" | "exc">;
function parseTri(param: string): Tri {
  const m: Tri = new Map();
  for (const raw of (param || "").split(",").map((s) => s.trim()).filter(Boolean)) {
    if (raw.startsWith("-")) m.set(raw.slice(1), "exc");
    else m.set(raw.startsWith("+") ? raw.slice(1) : raw, "inc");
  }
  return m;
}
function serializeTri(m: Tri): string {
  return [...m.entries()].map(([k, v]) => (v === "exc" ? "-" : "+") + k).join(",");
}

const STATUS_OPTS = [
  { v: "published", label: "Publicado" },
  { v: "hidden", label: "Oculto" },
  { v: "synced", label: "Sincronizado" },
  { v: "modified", label: "Modificado" },
  { v: "error", label: "Con error" },
];
const FLAG_OPTS = [
  { v: "no-image", label: "Sin imagen" },
  { v: "no-category", label: "Sin categoría" },
  { v: "no-stock", label: "Sin stock" },
  { v: "no-sku", label: "Sin SKU" },
  { v: "stale", label: "Sin vender 60d" },
];

const filterGroupLabel: React.CSSProperties = {
  fontSize: "0.6875rem", fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase",
  color: "var(--color-subtle)", marginRight: 2,
};

function FilterChip({ label, state, onClick }: { label: string; state?: "inc" | "exc"; onClick: () => void }) {
  const s = state === "inc"
    ? { bg: "var(--color-success-bg)", color: "var(--color-success)", bd: "var(--color-success)" }
    : state === "exc"
    ? { bg: "var(--color-danger-bg, #FEF2F2)", color: "var(--color-danger)", bd: "var(--color-danger)" }
    : { bg: "var(--color-surface-2)", color: "var(--color-muted)", bd: "transparent" };
  return (
    <button onClick={onClick} title={state === "inc" ? "Incluir (clic para excluir)" : state === "exc" ? "Excluir (clic para quitar)" : "Filtrar por este valor"}
      style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "5px 10px", borderRadius: "var(--radius-pill)", border: `1px solid ${s.bd}`, background: s.bg, color: s.color, fontSize: "0.75rem", fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
      {state === "inc" && <span style={{ fontSize: "0.6875rem" }}>✓</span>}
      {state === "exc" && <span style={{ fontSize: "0.875rem", lineHeight: 1 }}>−</span>}
      {label}
    </button>
  );
}

/** Collection include/exclude filter: a button opening a searchable popover of collections. */
function CollectionFilter({ categories, tree, state, onCycle }: { categories: string[]; tree?: { name: string; tnId: string; parentTnId: string | null }[]; state: Tri; onCycle: (v: string) => void }) {
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

export default function CatalogShell({
  products,
  total,
  page,
  totalPages,
  categories,
  categoryTree,
  currentQ,
  currentStatus,
  currentCategory,
  currentFlag,
  currentSort,
  editProduct,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [localQ, setLocalQ] = useState(currentQ);
  const [view, setView] = useState<"table" | "cards">("table");
  const [advanced, setAdvanced] = useState(false);
  const [menuTarget, setMenuTarget] = useState<MenuTarget | null>(null);

  const openMenu = useCallback((e: React.MouseEvent, p: CatalogProduct) => {
    e.preventDefault();
    setMenuTarget({ id: p.id, name: p.name, pendingDelete: p.pendingDelete, x: e.clientX, y: e.clientY });
  }, []);

  // Persist the table/cards preference across sessions.
  useEffect(() => {
    const stored = localStorage.getItem("milester-catalog-view");
    if (stored === "cards" || stored === "table") setView(stored);
  }, []);
  function changeView(v: "table" | "cards") {
    setView(v);
    localStorage.setItem("milester-catalog-view", v);
  }

  const updateParam = useCallback(
    (key: string, value: string) => {
      const p = new URLSearchParams(searchParams.toString());
      if (value) p.set(key, value);
      else p.delete(key);
      if (key !== "page") p.delete("page");
      p.delete("edit");
      startTransition(() => router.push(`${pathname}?${p.toString()}`));
    },
    [searchParams, pathname, router]
  );

  // Tri-state filter chips: click cycles off → include → exclude → off.
  const statusMap = parseTri(currentStatus);
  const flagMap = parseTri(currentFlag);
  const cycleFilter = useCallback((param: string, value: string) => {
    const m = parseTri(searchParams.get(param) || "");
    const cur = m.get(value);
    if (!cur) m.set(value, "inc");
    else if (cur === "inc") m.set(value, "exc");
    else m.delete(value);
    updateParam(param, serializeTri(m));
  }, [searchParams, updateParam]);

  function openEdit(id: number) {
    const p = new URLSearchParams(searchParams.toString());
    p.set("edit", String(id));
    router.push(`${pathname}?${p.toString()}`);
  }

  function closeEdit() {
    setAdvanced(false);
    const p = new URLSearchParams(searchParams.toString());
    p.delete("edit");
    router.push(`${pathname}?${p.toString()}`);
  }

  function toggleSelect(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === products.length) setSelected(new Set());
    else setSelected(new Set(products.map((p) => p.id)));
  }

  function clearSelected() {
    setSelected(new Set());
  }

  function pageUrl(p: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(p));
    params.delete("edit");
    return `${pathname}?${params.toString()}`;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100dvh", overflow: "hidden" }}>
      {/* Header + filters */}
      <div style={{
        padding: "28px 32px 18px",
        background: "var(--color-bg)",
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 18 }}>
          <div>
            <h1 style={{ fontSize: "1.5rem", fontWeight: 600, margin: "0 0 3px", letterSpacing: "-0.02em" }}>
              Catálogo
            </h1>
            <p style={{ fontSize: "0.8125rem", color: "var(--color-muted)", margin: 0, fontVariantNumeric: "tabular-nums" }}>
              {total.toLocaleString("es-AR")} {total === 1 ? "producto" : "productos"}
              {currentQ && ` · "${currentQ}"`}
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Link href="/catalog/templates" className="btn-secondary" style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 7, fontSize: "0.8125rem" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="9" y1="21" x2="9" y2="9" /></svg>
              Plantillas
            </Link>
            {/* View toggle */}
            <div style={{ display: "flex", background: "var(--color-surface-2)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-control)", padding: 3 }}>
              {([
                { v: "table", label: "Tabla", icon: <><line x1="3" y1="9" x2="21" y2="9" /><line x1="3" y1="15" x2="21" y2="15" /><rect x="3" y="4" width="18" height="16" rx="1" /></> },
                { v: "cards", label: "Tarjetas", icon: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></> },
              ] as const).map(({ v, label, icon }) => (
                <button
                  key={v}
                  onClick={() => changeView(v)}
                  title={label}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "center",
                    width: 34, height: 30, borderRadius: 9, border: "none", cursor: "pointer",
                    background: view === v ? "var(--color-surface)" : "transparent",
                    color: view === v ? "var(--color-brand)" : "var(--color-subtle)",
                    boxShadow: view === v ? "var(--shadow-card)" : "none",
                    transition: "background 0.14s, color 0.14s",
                  }}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{icon}</svg>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Filter bar */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {/* Row 1: search + collection + sort + clear */}
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <div style={{ position: "relative", flex: 1, maxWidth: 340 }}>
              <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", zIndex: 1 }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--color-subtle)" strokeWidth="2" strokeLinecap="round">
                  <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </span>
              <input
                className="input" type="text" value={localQ}
                onChange={(e) => setLocalQ(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") updateParam("q", localQ); }}
                onBlur={() => { if (localQ !== currentQ) updateParam("q", localQ); }}
                placeholder="Buscar productos, SKU..." style={{ paddingLeft: 36 }}
              />
            </div>

            <CollectionFilter categories={categories} tree={categoryTree} state={parseTri(currentCategory)} onCycle={(v) => cycleFilter("category", v)} />

            <select
              value={currentSort}
              onChange={(e) => updateParam("sort", e.target.value === "recent" ? "" : e.target.value)}
              className="input" style={{ width: "auto", marginLeft: "auto" }}
            >
              <option value="recent">Más recientes</option>
              <option value="oldest">Más antiguos</option>
              <option value="best-selling">Más vendidos</option>
              <option value="worst-selling">Menos vendidos</option>
              <option value="price-high">Mayor precio</option>
              <option value="price-low">Menor precio</option>
            </select>

            {(currentQ || currentStatus || currentCategory || currentFlag) && (
              <button className="btn-secondary" onClick={() => { setLocalQ(""); router.push(pathname); }} style={{ padding: "8px 14px", fontSize: "0.8125rem", whiteSpace: "nowrap" }}>
                Limpiar
              </button>
            )}
          </div>

          {/* Row 2: tri-state chips (click: incluir → excluir → apagado) */}
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <span style={filterGroupLabel}>Estado</span>
            {STATUS_OPTS.map((o) => <FilterChip key={o.v} label={o.label} state={statusMap.get(o.v)} onClick={() => cycleFilter("status", o.v)} />)}
            <span style={{ width: 1, height: 18, background: "var(--color-border)", margin: "0 4px" }} />
            <span style={filterGroupLabel}>Alertas</span>
            {FLAG_OPTS.map((o) => <FilterChip key={o.v} label={o.label} state={flagMap.get(o.v)} onClick={() => cycleFilter("flag", o.v)} />)}
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflow: "hidden", display: "flex" }}>
        {/* Table / cards area */}
        <div style={{ flex: 1, overflow: "auto", padding: "0" }}>
          {view === "table" ? (
            <ProductTable
              products={products}
              selected={selected}
              onToggle={toggleSelect}
              onToggleAll={toggleAll}
              onOpen={openEdit}
              onContextMenu={openMenu}
            />
          ) : (
            <ProductCards
              products={products}
              selected={selected}
              onToggle={toggleSelect}
              onContextMenu={openMenu}
            />
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "16px 24px",
              borderTop: "1px solid var(--color-divider)",
            }}>
              <span style={{ fontSize: "0.8125rem", color: "var(--color-subtle)", fontVariantNumeric: "tabular-nums" }}>
                Página {page} de {totalPages}
              </span>
              <div style={{ display: "flex", gap: 4 }}>
                {page > 1 && (
                  <a href={pageUrl(page - 1)} style={pageBtnStyle(false)}>← Ant.</a>
                )}
                {(() => {
                  const start = Math.max(1, Math.min(page - 2, totalPages - 4));
                  const end = Math.min(totalPages, start + 4);
                  return Array.from({ length: end - start + 1 }, (_, i) => start + i).map((p) => (
                    <a key={p} href={pageUrl(p)} style={pageBtnStyle(p === page)}>{p}</a>
                  ));
                })()}
                {page < totalPages && (
                  <a href={pageUrl(page + 1)} style={pageBtnStyle(false)}>Sig. →</a>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Quick-edit side panel (hidden while the advanced modal is open) */}
        {editProduct && !advanced && (
          <ProductPanel
            product={editProduct}
            onClose={closeEdit}
            onSaved={closeEdit}
            onAdvanced={() => setAdvanced(true)}
          />
        )}

        {/* Advanced-edit center modal */}
        {editProduct && advanced && (
          <ProductModal
            product={editProduct}
            onClose={() => setAdvanced(false)}
            onSaved={closeEdit}
          />
        )}
      </div>

      {/* Right-click context menu */}
      {menuTarget && (
        <ProductContextMenu
          target={menuTarget}
          onClose={() => setMenuTarget(null)}
          onDone={() => router.refresh()}
        />
      )}

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <BulkBar
          count={selected.size}
          ids={Array.from(selected)}
          categories={categories}
          onClear={clearSelected}
          onDone={() => {
            clearSelected();
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

const pageBtnStyle = (active: boolean): React.CSSProperties => ({
  padding: "6px 11px", borderRadius: 9,
  fontSize: "0.8125rem", textDecoration: "none", fontVariantNumeric: "tabular-nums",
  background: active ? "var(--color-brand)" : "var(--color-surface)",
  color: active ? "var(--color-brand-ink)" : "var(--color-muted)",
  border: `1px solid ${active ? "var(--color-brand)" : "var(--color-border)"}`,
  fontWeight: active ? 600 : 500,
  display: "inline-block",
  boxShadow: "var(--shadow-card)",
});
