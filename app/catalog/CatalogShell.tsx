"use client";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useState, useCallback, useTransition, useEffect, useRef } from "react";
import type { CatalogProduct } from "./page";
import ProductTable from "./ProductTable";
import ProductCards from "./ProductCards";
import ProductPanel from "./ProductPanel";
import BulkBar from "./BulkBar";
import ProductModal from "./ProductModal";
import ProductContextMenu, { type MenuTarget } from "./ProductContextMenu";
import CreateFromTemplate from "./CreateFromTemplate";
import { useFocus } from "./useFocus";
import { useIsMobile } from "@/components/useIsMobile";
import CollectionFilter, { type Tri, parseTri, serializeTri } from "@/components/CollectionFilter";

type EditProduct = {
  id: number;
  tiendaNubeId: string | null;
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
  costUsd: number | null;
  costUsdPromo: number | null;
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

const SORT_OPTS = [
  { v: "recent", label: "Más recientes" },
  { v: "oldest", label: "Más antiguos" },
  { v: "name-asc", label: "Nombre A → Z" },
  { v: "name-desc", label: "Nombre Z → A" },
  { v: "edited", label: "Editados recientemente" },
  { v: "best-selling", label: "Más vendidos" },
  { v: "worst-selling", label: "Menos vendidos" },
  { v: "price-high", label: "Mayor precio" },
  { v: "price-low", label: "Menor precio" },
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

  const isMobile = useIsMobile();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [localQ, setLocalQ] = useState(currentQ);
  const [view, setView] = useState<"table" | "cards">("table");
  // The wide table is unusable on phones — always show cards there.
  const effectiveView = isMobile ? "cards" : view;
  const [advanced, setAdvanced] = useState(false);
  // Lives here (not in the modal) so it survives moving between products.
  const [modalTab, setModalTab] = useState<"general" | "descripcion" | "imagen" | "variantes" | "seo">("general");

  // Focus set (browser-local). Entering focus just filters the catalog to those
  // ids, so the modal's prev/next then walks the working set for free.
  const focus = useFocus();
  const focusActive = !!searchParams.get("focus");
  function enterFocus() {
    if (focus.count === 0) return;
    const p = new URLSearchParams();
    p.set("focus", focus.ids.join(","));
    router.push(`${pathname}?${p.toString()}`);
  }
  function exitFocus() {
    const p = new URLSearchParams(searchParams.toString());
    p.delete("focus");
    p.delete("edit");
    router.push(`${pathname}?${p.toString()}`);
  }
  const [menuTarget, setMenuTarget] = useState<MenuTarget | null>(null);

  const openMenu = useCallback((e: React.MouseEvent, p: CatalogProduct) => {
    e.preventDefault();
    // Right-click gives pointer coordinates; a keyboard-activated button reports
    // 0,0, so fall back to anchoring the menu under the trigger itself.
    const fromPointer = e.clientX !== 0 || e.clientY !== 0;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setMenuTarget({
      id: p.id, name: p.name, pendingDelete: p.pendingDelete, syncStatus: p.syncStatus,
      x: fromPointer ? e.clientX : r.left,
      y: fromPointer ? e.clientY : r.bottom + 4,
    });
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
  const collectionMap = parseTri(currentCategory);
  const activeFilterCount = statusMap.size + flagMap.size + collectionMap.size + (currentSort && currentSort !== "recent" ? 1 : 0);

  // Turning a facet off from the summary row.
  const removeTri = useCallback((param: string, value: string) => {
    const m = parseTri(searchParams.get(param) || "");
    m.delete(value);
    updateParam(param, serializeTri(m));
  }, [searchParams, updateParam]);

  const clearFilters = useCallback(() => {
    // One push: sequential updateParam calls would each start from the same stale
    // params and clobber each other.
    const p = new URLSearchParams(searchParams.toString());
    ["status", "category", "flag", "sort", "page", "edit"].forEach((k) => p.delete(k));
    startTransition(() => router.push(`${pathname}?${p.toString()}`));
  }, [searchParams, pathname, router]);

  // What's applied right now, shown as removable chips so the filter state is
  // readable without opening the panel.
  const activeFilters: { id: string; label: string; remove: () => void }[] = [
    ...[...statusMap].map(([v, st]) => ({ id: `status:${v}`, label: (st === "exc" ? "Sin " : "") + (STATUS_OPTS.find((o) => o.v === v)?.label ?? v), remove: () => removeTri("status", v) })),
    ...[...flagMap].map(([v, st]) => ({ id: `flag:${v}`, label: (st === "exc" ? "No " : "") + (FLAG_OPTS.find((o) => o.v === v)?.label ?? v), remove: () => removeTri("flag", v) })),
    ...[...collectionMap].map(([v, st]) => ({ id: `cat:${v}`, label: (st === "exc" ? "Sin " : "") + v, remove: () => removeTri("category", v) })),
    ...(currentSort && currentSort !== "recent"
      ? [{ id: "sort", label: SORT_OPTS.find((o) => o.v === currentSort)?.label ?? currentSort, remove: () => updateParam("sort", "") }]
      : []),
  ];
  const cycleFilter = useCallback((param: string, value: string) => {
    const m = parseTri(searchParams.get(param) || "");
    const cur = m.get(value);
    if (!cur) m.set(value, "inc");
    else if (cur === "inc") m.set(value, "exc");
    else m.delete(value);
    updateParam(param, serializeTri(m));
  }, [searchParams, updateParam]);

  // One definition, rendered inside the desktop dropdown and the mobile sheet.
  const filterControls = (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span style={filterGroupLabel}>Colecciones</span>
        <CollectionFilter categories={categories} tree={categoryTree} state={collectionMap} onCycle={(v) => cycleFilter("category", v)} />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span style={filterGroupLabel}>Ordenar por</span>
        <select
          value={currentSort}
          onChange={(e) => updateParam("sort", e.target.value === "recent" ? "" : e.target.value)}
          className="input"
        >
          {SORT_OPTS.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
        </select>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span style={filterGroupLabel}>Estado</span>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {STATUS_OPTS.map((o) => <FilterChip key={o.v} label={o.label} state={statusMap.get(o.v)} onClick={() => cycleFilter("status", o.v)} />)}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span style={filterGroupLabel}>Alertas</span>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {FLAG_OPTS.map((o) => <FilterChip key={o.v} label={o.label} state={flagMap.get(o.v)} onClick={() => cycleFilter("flag", o.v)} />)}
        </div>
      </div>
    </>
  );

  function openEdit(id: number) {
    const p = new URLSearchParams(searchParams.toString());
    p.set("edit", String(id));
    router.push(`${pathname}?${p.toString()}`);
  }

  // Move to the previous/next product without leaving the advanced modal, so you
  // can sweep a list staying on the same tab.
  const editIndex = editProduct ? products.findIndex((p) => p.id === editProduct.id) : -1;
  function navigateEdit(delta: number) {
    if (editIndex < 0) return;
    const next = products[editIndex + delta];
    if (next) openEdit(next.id);
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
      <div className="catalog-header" style={{
        padding: "28px 32px 18px",
        background: "var(--color-bg)",
        flexShrink: 0,
      }}>
        <div className="catalog-header-row" style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 18 }}>
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
            <button className="btn-primary" onClick={() => setCreateOpen(true)} style={{ padding: "8px 14px", fontSize: "0.8125rem" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
              {isMobile ? "Crear" : "Crear producto"}
            </button>
            {/* Focus chip: the working set you curate with right-click → "Agregar al foco" */}
            {(focus.count > 0 || focusActive) && (
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <button
                  onClick={() => focusActive ? exitFocus() : enterFocus()}
                  className="pill"
                  style={{
                    cursor: "pointer", padding: "8px 13px", fontSize: "0.8125rem", fontWeight: 600, border: "1px solid transparent",
                    background: focusActive ? "var(--color-brand)" : "var(--color-brand-light)",
                    color: focusActive ? "var(--color-brand-ink)" : "var(--color-brand)",
                  }}
                  title={focusActive ? "Volver al catálogo completo" : "Ver solo los productos del foco"}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="3.5" /></svg>
                  {focusActive ? `Foco · ${focus.count}` : `Foco: ${focus.count}`}
                </button>
                {focusActive && (
                  <button onClick={() => { focus.clear(); exitFocus(); }} title="Vaciar el foco" className="btn-secondary" style={{ padding: "6px 9px", fontSize: "0.75rem" }}>
                    Vaciar
                  </button>
                )}
              </div>
            )}
            {/* View toggle — hidden on mobile, where cards are forced */}
            <div style={{ display: isMobile ? "none" : "flex", background: "var(--color-surface-2)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-control)", padding: 3 }}>
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

        {/* Filter bar — one model on every screen: search + Filtros. Desktop used
            to inline every control plus two rows of chips, which made the two
            layouts diverge and ate the top of the page. The panel is the same
            content in both; only its container differs. */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <div style={{ position: "relative", flex: 1, minWidth: 0, maxWidth: isMobile ? undefined : 420 }}>
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

            <div style={{ position: "relative", flexShrink: 0 }}>
              <button
                onClick={() => setFiltersOpen((o) => !o)}
                aria-label="Filtros"
                aria-expanded={filtersOpen}
                title="Filtros"
                style={{
                  position: "relative", display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                  height: 42, padding: isMobile ? 0 : "0 14px", width: isMobile ? 42 : undefined,
                  borderRadius: "var(--radius-input)",
                  border: `1px solid ${activeFilterCount > 0 ? "var(--color-brand)" : "var(--color-border)"}`,
                  background: activeFilterCount > 0 ? "var(--color-brand-light)" : "var(--color-surface)",
                  color: activeFilterCount > 0 ? "var(--color-brand)" : "var(--color-muted)",
                  cursor: "pointer", fontSize: "0.875rem", fontWeight: 500, whiteSpace: "nowrap",
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                </svg>
                {!isMobile && "Filtros"}
                {activeFilterCount > 0 && (
                  <span style={{ position: isMobile ? "absolute" : "static", top: -6, right: -6, minWidth: 18, height: 18, padding: "0 5px", borderRadius: 999, background: "var(--color-brand)", color: "#fff", fontSize: "0.6875rem", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", fontVariantNumeric: "tabular-nums" }}>
                    {activeFilterCount}
                  </span>
                )}
              </button>

              {/* Desktop: dropdown anchored to the button. Mobile gets the sheet below. */}
              {!isMobile && filtersOpen && (
                <>
                  <div onClick={() => setFiltersOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 69 }} />
                  <div className="anim-in menu" style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 70, width: 380, padding: 0, display: "flex", flexDirection: "column", maxHeight: "70vh" }}>
                    <div style={{ flex: 1, overflowY: "auto", padding: "16px 18px", display: "flex", flexDirection: "column", gap: 18 }}>
                      {filterControls}
                    </div>
                    <div style={{ display: "flex", gap: 8, padding: "12px 18px", borderTop: "1px solid var(--color-divider)" }}>
                      {activeFilterCount > 0 && (
                        <button className="btn-secondary" onClick={clearFilters} style={{ flex: 1, justifyContent: "center", fontSize: "0.8125rem" }}>Limpiar</button>
                      )}
                      <button className="btn-primary" onClick={() => setFiltersOpen(false)} style={{ flex: 1, justifyContent: "center", fontSize: "0.8125rem" }}>Ver resultados</button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* What's applied, removable one by one — readable without opening the panel */}
          {activeFilters.length > 0 && (
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              {activeFilters.map((f) => (
                <span key={f.id} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 6px 4px 10px", borderRadius: "var(--radius-pill)", background: "var(--color-brand-light)", color: "var(--color-brand)", fontSize: "0.75rem", fontWeight: 600, maxWidth: 240 }}>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.label}</span>
                  <button onClick={f.remove} aria-label={`Quitar filtro ${f.label}`} style={{ border: "none", background: "transparent", cursor: "pointer", color: "inherit", padding: 0, width: 16, height: 16, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                  </button>
                </span>
              ))}
              <button onClick={clearFilters} style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--color-subtle)", fontSize: "0.75rem", fontWeight: 500, textDecoration: "underline", padding: "4px 6px" }}>
                Limpiar todo
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Mobile: the same controls as a bottom-sheet */}
      {isMobile && filtersOpen && (
        <>
          <div onClick={() => setFiltersOpen(false)} className="anim-in" style={{ position: "fixed", inset: 0, background: "rgba(17,24,39,0.4)", zIndex: 400 }} />
          <div className="anim-modal" style={{
            position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 400,
            background: "var(--color-surface)", borderTopLeftRadius: "var(--radius-modal)", borderTopRightRadius: "var(--radius-modal)",
            boxShadow: "var(--shadow-float)", maxHeight: "82dvh", display: "flex", flexDirection: "column",
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid var(--color-divider)", flexShrink: 0 }}>
              <span style={{ fontSize: "1rem", fontWeight: 600, letterSpacing: "-0.01em" }}>Filtros</span>
              <button onClick={() => setFiltersOpen(false)} style={{ width: 32, height: 32, borderRadius: 9, border: "none", background: "var(--color-surface-2)", cursor: "pointer", color: "var(--color-muted)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: "18px 20px", display: "flex", flexDirection: "column", gap: 20 }}>
              {filterControls}
            </div>

            <div style={{ display: "flex", gap: 10, padding: "14px 20px", borderTop: "1px solid var(--color-divider)", flexShrink: 0 }}>
              {activeFilterCount > 0 && (
                <button className="btn-secondary" onClick={clearFilters} style={{ flex: 1, justifyContent: "center" }}>Limpiar filtros</button>
              )}
              <button className="btn-primary" onClick={() => setFiltersOpen(false)} style={{ flex: 1, justifyContent: "center" }}>Ver resultados</button>
            </div>
          </div>
        </>
      )}

      {/* Body */}
      <div style={{ flex: 1, overflow: "hidden", display: "flex" }}>
        {/* Table / cards area */}
        <div style={{ flex: 1, overflow: "auto", padding: "0" }}>
          {effectiveView === "table" ? (
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
              onOpen={openEdit}
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
            key={editProduct.id}
            product={editProduct}
            tab={modalTab}
            setTab={setModalTab}
            navIndex={editIndex}
            navTotal={products.length}
            onNavigate={navigateEdit}
            onClose={() => setAdvanced(false)}
            onSaved={closeEdit}
          />
        )}
      </div>

      {/* Wizard: crear productos desde una plantilla de producto */}
      {createOpen && (
        <CreateFromTemplate
          isMobile={isMobile}
          onClose={() => setCreateOpen(false)}
          onCreated={() => router.refresh()}
          onEditProduct={(id) => {
            setCreateOpen(false);
            setAdvanced(true); // abrir directo el editor completo
            const p = new URLSearchParams(searchParams.toString());
            p.set("edit", String(id));
            router.push(`${pathname}?${p.toString()}`);
          }}
        />
      )}

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
