"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval,
  addMonths, format, isSameDay, isSameMonth, isWithinInterval, isBefore,
} from "date-fns";
import { es } from "date-fns/locale";
import { useIsMobile } from "@/components/useIsMobile";
import { type PricingConfig, priceForUsd, isSecondary } from "@/lib/pricingCore";

type Sel = { id: number; name: string; imageUrl: string | null; price: number };
type VariantInfo = { id: number; label: string; price: number; promotionalPrice: number | null };
type Cat = { id: number; tiendaNubeId: string; name: string; parentTnId: string | null; count: number };
type GridProduct = { id: number; name: string; sku: string | null; price: number; promotionalPrice: number | null; imageUrl: string | null };

const STAGES = ["Identidad y productos", "Programación", "Precios"];

type Rounding = "none" | "990" | "900" | "99";

/** Rounds a price to a psychological ending (…990, …900, …99). Never returns below 0. */
function roundEnding(n: number, mode: Rounding): number {
  if (n <= 0) return 0;
  if (mode === "none") return Math.round(n);
  if (mode === "990") { const b = Math.round(n / 1000) * 1000 - 10; return b > 0 ? b : 990; }
  if (mode === "900") { const b = Math.round(n / 1000) * 1000 - 100; return b > 0 ? b : 900; }
  // "99": nearest hundred minus 1 → …99
  const b = Math.round(n / 100) * 100 - 1;
  return b > 0 ? b : 99;
}

const ROUNDING_OPTS: { v: Rounding; label: string }[] = [
  { v: "none", label: "Sin redondeo" },
  { v: "990", label: "Terminar en 990" },
  { v: "900", label: "Terminar en 900" },
  { v: "99", label: "Terminar en 99" },
];

export default function CampaignWizard({ mode = "prices", onClose, onCreated }: { mode?: "prices" | "costs"; onClose: () => void; onCreated: () => void }) {
  const isMobile = useIsMobile();
  const isCosts = mode === "costs";
  const stages = isCosts ? ["Identidad y productos", "Programación", "Costos"] : STAGES;
  const [stage, setStage] = useState(0);
  // Modo costos: costo promocional USD por producto + costUsd editable si falta.
  const [promoCosts, setPromoCosts] = useState<Map<number, string>>(new Map());
  const [baseCosts, setBaseCosts] = useState<Map<number, { current: number | null; edited: string }>>(new Map());
  const [pricingCfg, setPricingCfg] = useState<PricingConfig | null>(null);
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<Map<number, Sel>>(new Map());
  const [tag, setTag] = useState("");
  // category: mode none | existing | new
  const [catMode, setCatMode] = useState<"none" | "existing" | "new">("none");
  const [existingCatId, setExistingCatId] = useState("");
  const [newCatName, setNewCatName] = useState("");
  const [newCatParent, setNewCatParent] = useState(""); // tiendaNubeId of parent, "" = root
  const [cats, setCats] = useState<Cat[]>([]);
  const [start, setStart] = useState<Date | null>(null);
  const [end, setEnd] = useState<Date | null>(null);
  const [prices, setPrices] = useState<Map<number, number>>(new Map());
  // Per-variant campaign prices for multi-variant products: productId -> (variantId -> price).
  const [variantMeta, setVariantMeta] = useState<Map<number, VariantInfo[]>>(new Map());
  const [variantPrices, setVariantPrices] = useState<Map<number, Map<number, number>>>(new Map());
  const [bulkPct, setBulkPct] = useState("20");
  const [priceMode, setPriceMode] = useState<"pct" | "fixed">("pct");
  const [fixedValue, setFixedValue] = useState("");
  const [rounding, setRounding] = useState<Rounding>("none");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { fetch("/api/categories").then((r) => r.json()).then(setCats).catch(() => {}); }, []);

  // When entering the price stage, seed a default price for any product without one,
  // and load which selected products have variants so they can be priced per-variant.
  // Modo costos: al entrar al paso 3, traer la config de precios y el costUsd
  // actual de cada producto seleccionado (editable si falta).
  useEffect(() => {
    if (!isCosts || stage !== 2) return;
    fetch("/api/pricing/config").then((r) => r.json()).then(setPricingCfg).catch(() => {});
    (async () => {
      const next = new Map<number, { current: number | null; edited: string }>();
      for (const id of selected.keys()) {
        if (baseCosts.has(id)) { next.set(id, baseCosts.get(id)!); continue; }
        try {
          const p = await (await fetch(`/api/products/${id}`)).json();
          next.set(id, { current: p.costUsd ?? null, edited: p.costUsd != null ? String(p.costUsd) : "" });
        } catch { next.set(id, { current: null, edited: "" }); }
      }
      setBaseCosts(next);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCosts, stage, selected]);

  useEffect(() => {
    if (isCosts || stage !== 2) return;
    setPrices((prev) => {
      const next = new Map(prev);
      selected.forEach((p) => { if (!next.has(p.id)) next.set(p.id, Math.round(p.price * 0.8)); });
      [...next.keys()].forEach((id) => { if (!selected.has(id)) next.delete(id); });
      return next;
    });
    const ids = [...selected.keys()];
    if (!ids.length) { setVariantMeta(new Map()); return; }
    fetch("/api/products/variants", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids }) })
      .then((r) => r.json())
      .then((data: Record<string, VariantInfo[]>) => {
        const meta = new Map<number, VariantInfo[]>();
        for (const [pid, vs] of Object.entries(data)) if (selected.has(Number(pid))) meta.set(Number(pid), vs);
        setVariantMeta(meta);
        // Seed each variant's price (20% off its own base) if not set yet.
        setVariantPrices((prev) => {
          const nextVp = new Map(prev);
          for (const [pid, vs] of meta) {
            const m = new Map(nextVp.get(pid) ?? []);
            for (const v of vs) if (!m.has(v.id)) m.set(v.id, Math.round(v.price * 0.8));
            nextVp.set(pid, m);
          }
          for (const pid of [...nextVp.keys()]) if (!meta.has(pid)) nextVp.delete(pid);
          return nextVp;
        });
      })
      .catch(() => {});
  }, [stage, selected]);

  function applyMethod() {
    const pct = parseFloat(bulkPct);
    const fixed = parseFloat(fixedValue.replace(/\./g, "").replace(",", "."));
    const priceFor = (base: number) => priceMode === "pct"
      ? roundEnding(Math.max(0, base * (1 - pct / 100)), rounding)
      : roundEnding(Math.max(0, fixed), rounding);
    if (priceMode === "pct" ? isNaN(pct) : isNaN(fixed)) return;

    setPrices(() => { const next = new Map<number, number>(); selected.forEach((p) => next.set(p.id, priceFor(p.price))); return next; });
    // Shortcut: the same rule fills every variant from its own base price.
    setVariantPrices(() => {
      const next = new Map<number, Map<number, number>>();
      for (const [pid, vs] of variantMeta) { const m = new Map<number, number>(); vs.forEach((v) => m.set(v.id, priceFor(v.price))); next.set(pid, m); }
      return next;
    });
  }

  // Apply just the price-ending rounding to the current prices.
  function applyRoundingOnly() {
    setPrices((prev) => { const next = new Map<number, number>(); selected.forEach((p) => next.set(p.id, roundEnding(prev.get(p.id) ?? p.price, rounding))); return next; });
    setVariantPrices((prev) => {
      const next = new Map<number, Map<number, number>>();
      for (const [pid, vs] of variantMeta) { const cur = prev.get(pid); const m = new Map<number, number>(); vs.forEach((v) => m.set(v.id, roundEnding(cur?.get(v.id) ?? v.price, rounding))); next.set(pid, m); }
      return next;
    });
  }

  function setVariantPrice(pid: number, vid: number, value: string) {
    const n = parseFloat(value.replace(/\./g, "").replace(",", "."));
    setVariantPrices((prev) => {
      const next = new Map(prev);
      const m = new Map(next.get(pid) ?? []);
      m.set(vid, isNaN(n) ? 0 : n);
      next.set(pid, m);
      return next;
    });
  }

  const canNext = stage === 0 ? name.trim().length > 0 && selected.size > 0 : true;
  // Modo costos: no se puede crear hasta que cada producto tenga su costo promocional.
  const costsReady = !isCosts || [...selected.keys()].every((id) => {
    const c = parseFloat((promoCosts.get(id) ?? "").replace(",", "."));
    return !isNaN(c) && c > 0;
  });

  async function create() {
    setCreating(true); setError("");
    try {
      let addCategoryId: number | null = null;
      if (catMode === "existing" && existingCatId) addCategoryId = Number(existingCatId);
      if (catMode === "new" && newCatName.trim()) {
        const res = await fetch("/api/categories", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: newCatName.trim(), parentTnId: newCatParent || null }),
        });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || "No se pudo crear la categoría");
        addCategoryId = d.id;
      }

      // Modo costos: persistir primero los costUsd cargados/corregidos desde acá
      // (la campaña es también la puerta de entrada para completar costos).
      if (isCosts) {
        for (const [id, bc] of baseCosts) {
          const v = bc.edited.trim() === "" ? null : parseFloat(bc.edited.replace(",", "."));
          if (v != null && !isNaN(v) && v !== bc.current) {
            await fetch(`/api/products/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ costUsd: v }) });
          }
        }
      }

      const res = await fetch("/api/campaigns", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name, mode, scope: "products", productIds: [...selected.keys()],
          addTag: tag.trim() || undefined, addCategoryId,
          startDate: start ? start.toISOString() : undefined,
          endDate: end ? end.toISOString() : undefined,
          items: [...selected.keys()].map((id) => {
            if (isCosts) {
              const c = parseFloat((promoCosts.get(id) ?? "").replace(",", "."));
              return { productId: id, promoPrice: 0, promoCostUsd: isNaN(c) ? null : c };
            }
            const vm = variantMeta.get(id);
            const vp = variantPrices.get(id);
            return {
              productId: id,
              promoPrice: prices.get(id) ?? selected.get(id)!.price,
              // Per-variant prices for multi-variant products.
              ...(vm && vp ? { variantPrices: vm.map((v) => ({ variantId: v.id, campaignPrice: vp.get(v.id) ?? v.price })) } : {}),
            };
          }),
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Error");
      onCreated();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error");
    } finally { setCreating(false); }
  }

  return (
    <div onClick={onClose} className="anim-in" style={{ position: "fixed", inset: 0, zIndex: isMobile ? 400 : 60, background: "rgba(17,24,39,0.40)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: isMobile ? 0 : "40px 24px" }}>
      <div onClick={(e) => e.stopPropagation()} className="anim-modal" style={{ width: "100%", maxWidth: isMobile ? "none" : 860, height: isMobile ? "100dvh" : "calc(100dvh - 80px)", background: "var(--color-surface)", borderRadius: isMobile ? 0 : "var(--radius-modal)", boxShadow: "var(--shadow-float)", display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* Header + stepper */}
        <div style={{ padding: isMobile ? "16px 16px" : "20px 28px", borderBottom: "1px solid var(--color-divider)", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div style={{ fontSize: "1.125rem", fontWeight: 600, letterSpacing: "-0.02em" }}>
              Nueva campaña {isCosts && <span className="pill pill-neutral" style={{ marginLeft: 6, verticalAlign: "middle" }}>por costos</span>}
            </div>
            <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 9, border: "none", background: "var(--color-surface-2)", cursor: "pointer", color: "var(--color-muted)" }}>✕</button>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {stages.map((s, i) => (
              <div key={s} style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                <span style={{ width: 24, height: 24, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.75rem", fontWeight: 700, background: i <= stage ? "var(--color-brand)" : "var(--color-surface-2)", color: i <= stage ? "#fff" : "var(--color-subtle)" }}>{i + 1}</span>
                {/* On mobile only the active stage shows its label (keeps the stepper from overflowing). */}
                {(!isMobile || i === stage) && (
                  <span style={{ fontSize: "0.8125rem", fontWeight: i === stage ? 600 : 400, color: i === stage ? "var(--color-ink)" : "var(--color-subtle)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s}</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: isMobile ? "18px 16px" : "24px 28px" }}>
          {stage === 0 && (
            <StageIdentity
              name={name} setName={setName} selected={selected} setSelected={setSelected}
              tag={tag} setTag={setTag}
              cats={cats} catMode={catMode} setCatMode={setCatMode}
              existingCatId={existingCatId} setExistingCatId={setExistingCatId}
              newCatName={newCatName} setNewCatName={setNewCatName} newCatParent={newCatParent} setNewCatParent={setNewCatParent}
            />
          )}
          {stage === 1 && <StageSchedule start={start} end={end} setStart={setStart} setEnd={setEnd} />}
          {stage === 2 && !isCosts && (
            <StagePrices selected={selected} prices={prices} setPrices={setPrices} variantMeta={variantMeta} variantPrices={variantPrices} setVariantPrice={setVariantPrice} bulkPct={bulkPct} setBulkPct={setBulkPct} applyMethod={applyMethod} applyRoundingOnly={applyRoundingOnly} priceMode={priceMode} setPriceMode={setPriceMode} fixedValue={fixedValue} setFixedValue={setFixedValue} rounding={rounding} setRounding={setRounding} />
          )}
          {stage === 2 && isCosts && (
            <StageCosts selected={selected} promoCosts={promoCosts} setPromoCosts={setPromoCosts} baseCosts={baseCosts} setBaseCosts={setBaseCosts} cfg={pricingCfg} />
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: isMobile ? "12px 16px" : "16px 28px", borderTop: "1px solid var(--color-divider)", flexShrink: 0, display: "flex", alignItems: "center", gap: 10 }}>
          {error && <span style={{ flex: 1, fontSize: "0.8125rem", color: "var(--color-danger)" }}>{error}</span>}
          {!error && <span style={{ flex: 1, fontSize: "0.8125rem", color: "var(--color-subtle)" }}>{selected.size} productos seleccionados</span>}
          {stage > 0 && <button className="btn-secondary" onClick={() => setStage(stage - 1)}>Atrás</button>}
          {stage < 2
            ? <button className="btn-primary" onClick={() => setStage(stage + 1)} disabled={!canNext}>Siguiente</button>
            : <button className="btn-primary" onClick={create} disabled={creating || !costsReady} title={!costsReady ? "Cargá el costo promocional de todos los productos" : undefined}>{creating ? "Creando..." : "Crear campaña"}</button>}
        </div>
      </div>
    </div>
  );
}

/* ── Stage 1 ─────────────────────────────── */
function StageIdentity(props: {
  name: string; setName: (v: string) => void;
  selected: Map<number, Sel>; setSelected: (m: Map<number, Sel>) => void;
  tag: string; setTag: (v: string) => void;
  cats: Cat[]; catMode: "none" | "existing" | "new"; setCatMode: (m: "none" | "existing" | "new") => void;
  existingCatId: string; setExistingCatId: (v: string) => void;
  newCatName: string; setNewCatName: (v: string) => void;
  newCatParent: string; setNewCatParent: (v: string) => void;
}) {
  const { name, setName, selected, setSelected, tag, setTag, cats, catMode, setCatMode, existingCatId, setExistingCatId, newCatName, setNewCatName, newCatParent, setNewCatParent } = props;
  const [q, setQ] = useState("");
  const [products, setProducts] = useState<GridProduct[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchPage = useCallback((pg: number, append: boolean) => {
    setLoading(true);
    fetch(`/api/products/search?q=${encodeURIComponent(q)}&page=${pg}`).then((r) => r.json()).then((d) => {
      setProducts((prev) => append ? [...prev, ...d.products] : d.products);
      setHasMore(d.hasMore); setPage(pg);
    }).finally(() => setLoading(false));
  }, [q]);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => fetchPage(1, false), 250);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [fetchPage]);

  function toggle(p: GridProduct) {
    const next = new Map(selected);
    if (next.has(p.id)) next.delete(p.id);
    else next.set(p.id, { id: p.id, name: p.name, imageUrl: p.imageUrl, price: p.price });
    setSelected(next);
  }

  // Root categories for the parent selector; sorted flat list for the existing selector.
  const flat = [...cats].sort((a, b) => a.name.localeCompare(b.name));

  // Depth-ordered nested list so the collection tree is visible in the "existing" selector.
  const nested: { cat: Cat; depth: number }[] = (() => {
    const childrenOf = new Map<string, Cat[]>();
    for (const c of cats) {
      const p = c.parentTnId && c.parentTnId !== "0" ? c.parentTnId : "";
      if (!childrenOf.has(p)) childrenOf.set(p, []);
      childrenOf.get(p)!.push(c);
    }
    const out: { cat: Cat; depth: number }[] = [];
    const walk = (parentId: string, depth: number) => {
      for (const c of (childrenOf.get(parentId) || []).slice().sort((a, b) => a.name.localeCompare(b.name, "es"))) {
        if (!c.name) { walk(c.tiendaNubeId, depth); continue; } // skip nameless rows, keep their children
        out.push({ cat: c, depth });
        walk(c.tiendaNubeId, depth + 1);
      }
    };
    walk("", 0);
    return out;
  })();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <label style={lbl}>Nombre de la campaña</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ofertas de Verano" style={{ marginTop: 6 }} />
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <label style={lbl}>Etiqueta (opcional)</label>
          <input className="input" value={tag} onChange={(e) => setTag(e.target.value)} placeholder="verano-2026" style={{ marginTop: 6 }} />
        </div>
        <div style={{ flex: 1, minWidth: 220 }}>
          <label style={lbl}>Colección (opcional)</label>
          <div style={{ display: "flex", gap: 4, marginTop: 6, marginBottom: 8, background: "var(--color-surface-2)", borderRadius: "var(--radius-control)", padding: 3 }}>
            {([["none", "Ninguna"], ["existing", "Existente"], ["new", "Nueva"]] as const).map(([m, label]) => (
              <button key={m} onClick={() => setCatMode(m)} style={{ flex: 1, padding: "6px 8px", borderRadius: 9, border: "none", cursor: "pointer", fontSize: "0.75rem", fontWeight: catMode === m ? 600 : 500, background: catMode === m ? "var(--color-surface)" : "transparent", color: catMode === m ? "var(--color-brand)" : "var(--color-subtle)", boxShadow: catMode === m ? "var(--shadow-card)" : "none" }}>{label}</button>
            ))}
          </div>
          {catMode === "existing" && (
            <select className="input" value={existingCatId} onChange={(e) => setExistingCatId(e.target.value)}>
              <option value="">Seleccionar colección...</option>
              {nested.map(({ cat: c, depth }) => <option key={c.id} value={c.id}>{`${"  ".repeat(depth)}${depth > 0 ? "└ " : ""}${c.name} (${c.count})`}</option>)}
            </select>
          )}
          {catMode === "new" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <input className="input" value={newCatName} onChange={(e) => setNewCatName(e.target.value)} placeholder="Nombre de la nueva colección" />
              <select className="input" value={newCatParent} onChange={(e) => setNewCatParent(e.target.value)}>
                <option value="">Colección raíz (sin padre)</option>
                {flat.filter((c) => !c.parentTnId || c.parentTnId === "0").map((c) => (
                  <option key={c.id} value={c.tiendaNubeId}>Subcategoría de: {c.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Product grid */}
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <label style={lbl}>Productos ({selected.size} seleccionados)</label>
        </div>
        <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre o SKU..." style={{ marginBottom: 12 }} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 10 }}>
          {products.map((p) => {
            const on = selected.has(p.id);
            return (
              <button key={p.id} onClick={() => toggle(p)} style={{ textAlign: "left", cursor: "pointer", padding: 0, overflow: "hidden", background: "var(--color-surface)", border: `2px solid ${on ? "var(--color-brand)" : "var(--color-border)"}`, borderRadius: 12, boxShadow: on ? "0 0 0 3px var(--color-brand-ring)" : "var(--shadow-card)" }}>
                <div style={{ position: "relative", aspectRatio: "1", background: "var(--color-surface-2)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                  {p.imageUrl
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={p.imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-faint)" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2" /></svg>}
                  <span style={{ position: "absolute", top: 6, right: 6, width: 20, height: 20, borderRadius: 6, border: `1.5px solid ${on ? "var(--color-brand)" : "rgba(255,255,255,0.9)"}`, background: on ? "var(--color-brand)" : "rgba(255,255,255,0.85)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: "0.6875rem", fontWeight: 700 }}>{on ? "✓" : ""}</span>
                </div>
                <div style={{ padding: "7px 9px" }}>
                  <div style={{ fontSize: "0.75rem", fontWeight: 500, color: "var(--color-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
                  <div style={{ fontSize: "0.6875rem", color: "var(--color-subtle)", fontVariantNumeric: "tabular-nums" }}>${p.price.toLocaleString("es-AR")}</div>
                </div>
              </button>
            );
          })}
        </div>
        {hasMore && <div style={{ textAlign: "center", marginTop: 14 }}><button className="btn-secondary" onClick={() => fetchPage(page + 1, true)} disabled={loading}>{loading ? "..." : "Cargar más"}</button></div>}
      </div>
    </div>
  );
}

/* ── Stage 2: calendar range ─────────────── */
function StageSchedule({ start, end, setStart, setEnd }: { start: Date | null; end: Date | null; setStart: (d: Date | null) => void; setEnd: (d: Date | null) => void }) {
  const [month, setMonth] = useState(startOfMonth(new Date()));

  function pick(d: Date) {
    if (!start || (start && end)) { setStart(d); setEnd(null); }
    else if (isBefore(d, start)) { setStart(d); }
    else { setEnd(d); }
  }

  const days = eachDayOfInterval({ start: startOfWeek(startOfMonth(month), { weekStartsOn: 1 }), end: endOfWeek(endOfMonth(month), { weekStartsOn: 1 }) });

  return (
    <div style={{ maxWidth: 420, margin: "0 auto" }}>
      <p style={{ fontSize: "0.875rem", color: "var(--color-muted)", textAlign: "center", marginBottom: 20 }}>
        Elegí la fecha de inicio y de fin. La campaña se activará y terminará sola en esas fechas. Podés dejarlo vacío para manejarla a mano.
      </p>
      <div className="card" style={{ padding: 18 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <button onClick={() => setMonth(addMonths(month, -1))} style={navBtn}>‹</button>
          <span style={{ fontSize: "0.9375rem", fontWeight: 600, textTransform: "capitalize" }}>{format(month, "MMMM yyyy", { locale: es })}</span>
          <button onClick={() => setMonth(addMonths(month, 1))} style={navBtn}>›</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 6 }}>
          {["L", "M", "M", "J", "V", "S", "D"].map((d, i) => <div key={i} style={{ textAlign: "center", fontSize: "0.6875rem", fontWeight: 600, color: "var(--color-subtle)" }}>{d}</div>)}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
          {days.map((d, i) => {
            const inMonth = isSameMonth(d, month);
            const isStart = start && isSameDay(d, start);
            const isEnd = end && isSameDay(d, end);
            const inRange = start && end && isWithinInterval(d, { start, end });
            const edge = isStart || isEnd;
            return (
              <button key={i} onClick={() => pick(d)} style={{
                aspectRatio: "1", border: "none", cursor: "pointer", borderRadius: 8,
                fontSize: "0.8125rem", fontWeight: edge ? 700 : 500,
                background: edge ? "var(--color-brand)" : inRange ? "var(--color-brand-light)" : "transparent",
                color: edge ? "#fff" : inMonth ? "var(--color-ink)" : "var(--color-faint)",
                fontVariantNumeric: "tabular-nums",
              }}>{format(d, "d")}</button>
            );
          })}
        </div>
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
        <div className="card" style={{ flex: 1, padding: "12px 14px" }}>
          <div style={{ fontSize: "0.6875rem", color: "var(--color-subtle)", fontWeight: 600, textTransform: "uppercase" }}>Inicio</div>
          <div style={{ fontSize: "0.9375rem", fontWeight: 600, marginTop: 2 }}>{start ? format(start, "d 'de' MMM", { locale: es }) : "—"}</div>
        </div>
        <div className="card" style={{ flex: 1, padding: "12px 14px" }}>
          <div style={{ fontSize: "0.6875rem", color: "var(--color-subtle)", fontWeight: 600, textTransform: "uppercase" }}>Fin</div>
          <div style={{ fontSize: "0.9375rem", fontWeight: 600, marginTop: 2 }}>{end ? format(end, "d 'de' MMM", { locale: es }) : "—"}</div>
        </div>
        {(start || end) && <button className="btn-secondary" onClick={() => { setStart(null); setEnd(null); }} style={{ alignSelf: "center" }}>Limpiar</button>}
      </div>
    </div>
  );
}

/* ── Stage 3: prices ─────────────────────── */
function StagePrices({ selected, prices, setPrices, variantMeta, variantPrices, setVariantPrice, bulkPct, setBulkPct, applyMethod, applyRoundingOnly, priceMode, setPriceMode, fixedValue, setFixedValue, rounding, setRounding }: {
  selected: Map<number, Sel>; prices: Map<number, number>; setPrices: (fn: (m: Map<number, number>) => Map<number, number>) => void;
  variantMeta: Map<number, VariantInfo[]>; variantPrices: Map<number, Map<number, number>>; setVariantPrice: (pid: number, vid: number, v: string) => void;
  bulkPct: string; setBulkPct: (v: string) => void; applyMethod: () => void; applyRoundingOnly: () => void;
  priceMode: "pct" | "fixed"; setPriceMode: (m: "pct" | "fixed") => void;
  fixedValue: string; setFixedValue: (v: string) => void;
  rounding: Rounding; setRounding: (r: Rounding) => void;
}) {
  function setP(id: number, v: string) {
    const n = parseFloat(v.replace(/\./g, "").replace(",", "."));
    setPrices((prev) => { const next = new Map(prev); next.set(id, isNaN(n) ? 0 : n); return next; });
  }
  return (
    <div>
      <div style={{ marginBottom: 16, padding: "14px", borderRadius: "var(--radius-control)", background: "var(--color-brand-light)", display: "flex", flexDirection: "column", gap: 12 }}>
        {/* Método: porcentaje o precio fijo */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 3, background: "var(--color-surface)", borderRadius: "var(--radius-control)", padding: 3 }}>
            {([["pct", "Descuento %"], ["fixed", "Precio fijo"]] as const).map(([m, label]) => (
              <button key={m} onClick={() => setPriceMode(m)} style={{ padding: "6px 12px", borderRadius: 9, border: "none", cursor: "pointer", fontSize: "0.75rem", fontWeight: priceMode === m ? 600 : 500, background: priceMode === m ? "var(--color-brand)" : "transparent", color: priceMode === m ? "#fff" : "var(--color-subtle)" }}>{label}</button>
            ))}
          </div>
          {priceMode === "pct" ? (
            <>
              <input className="input" type="number" value={bulkPct} onChange={(e) => setBulkPct(e.target.value)} style={{ width: 70, background: "var(--color-surface)" }} />
              <span style={{ fontSize: "0.8125rem", color: "var(--color-muted)", fontWeight: 500 }}>% a todos</span>
            </>
          ) : (
            <>
              <div style={{ position: "relative", width: 130 }}>
                <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: "0.8125rem", color: "var(--color-muted)", pointerEvents: "none" }}>$</span>
                <input className="input" value={fixedValue} onChange={(e) => setFixedValue(e.target.value)} placeholder="9990" style={{ width: "100%", background: "var(--color-surface)", paddingLeft: 20 }} />
              </div>
              <span style={{ fontSize: "0.8125rem", color: "var(--color-muted)", fontWeight: 500 }}>a todos</span>
            </>
          )}
          <button className="btn-primary" onClick={applyMethod} style={{ padding: "7px 14px", fontSize: "0.8125rem" }}>Aplicar</button>
        </div>
        {/* Redondeo / terminación */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: "0.8125rem", color: "var(--color-muted)", fontWeight: 500 }}>Terminación</span>
          <select className="input" value={rounding} onChange={(e) => setRounding(e.target.value as Rounding)} style={{ width: "auto", background: "var(--color-surface)", fontSize: "0.8125rem", padding: "7px 10px" }}>
            {ROUNDING_OPTS.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
          </select>
          {rounding !== "none" && <button className="btn-secondary" onClick={applyRoundingOnly} style={{ padding: "7px 12px", fontSize: "0.8125rem" }}>Redondear ahora</button>}
          <span style={{ marginLeft: "auto", fontSize: "0.75rem", color: "var(--color-subtle)" }}>El precio base no se toca — solo el promocional.</span>
        </div>
      </div>
      <div className="card" style={{ overflow: "hidden" }}>
        {[...selected.values()].map((p, i) => {
          const vs = variantMeta.get(p.id);
          const promo = prices.get(p.id) ?? p.price;
          const off = p.price > 0 ? Math.round((1 - promo / p.price) * 100) : 0;
          return (
            <div key={p.id} style={{ borderTop: i > 0 ? "1px solid var(--color-divider)" : "none" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px" }}>
                {p.imageUrl
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={p.imageUrl} alt="" style={{ width: 36, height: 36, borderRadius: 8, objectFit: "cover", flexShrink: 0 }} />
                  : <span style={{ width: 36, height: 36, borderRadius: 8, background: "var(--color-surface-2)", flexShrink: 0 }} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "0.8125rem", fontWeight: 500, color: "var(--color-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
                  <div style={{ fontSize: "0.6875rem", color: "var(--color-subtle)" }}>
                    {vs ? `${vs.length} variantes` : <>Base ${p.price.toLocaleString("es-AR")}{off > 0 && <span style={{ color: "var(--color-success)", fontWeight: 600 }}> · −{off}%</span>}</>}
                  </div>
                </div>
                {!vs && (
                  <div style={{ position: "relative", width: 120, flexShrink: 0 }}>
                    <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: "0.8125rem", color: "var(--color-muted)", pointerEvents: "none" }}>$</span>
                    <input className="input" value={promo} onChange={(e) => setP(p.id, e.target.value)} style={{ paddingLeft: 20, fontWeight: 600, fontVariantNumeric: "tabular-nums", padding: "8px 10px 8px 20px" }} />
                  </div>
                )}
              </div>

              {/* Per-variant prices */}
              {vs && vs.map((v) => {
                const vp = variantPrices.get(p.id)?.get(v.id) ?? v.price;
                const voff = v.price > 0 ? Math.round((1 - vp / v.price) * 100) : 0;
                return (
                  <div key={v.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 14px 7px 46px", background: "var(--color-surface-2)" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: "0.8125rem", color: "var(--color-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.label || "Variante"}</div>
                      <div style={{ fontSize: "0.6875rem", color: "var(--color-subtle)" }}>Base ${v.price.toLocaleString("es-AR")}{voff > 0 && <span style={{ color: "var(--color-success)", fontWeight: 600 }}> · −{voff}%</span>}</div>
                    </div>
                    <div style={{ position: "relative", width: 120, flexShrink: 0 }}>
                      <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: "0.8125rem", color: "var(--color-muted)", pointerEvents: "none" }}>$</span>
                      <input className="input" value={vp} onChange={(e) => setVariantPrice(p.id, v.id, e.target.value)} style={{ paddingLeft: 20, fontWeight: 600, fontVariantNumeric: "tabular-nums", padding: "7px 10px 7px 20px" }} />
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Stage 3 (modo costos): costo promocional USD por producto ── */
function StageCosts({ selected, promoCosts, setPromoCosts, baseCosts, setBaseCosts, cfg }: {
  selected: Map<number, Sel>;
  promoCosts: Map<number, string>; setPromoCosts: React.Dispatch<React.SetStateAction<Map<number, string>>>;
  baseCosts: Map<number, { current: number | null; edited: string }>;
  setBaseCosts: React.Dispatch<React.SetStateAction<Map<number, { current: number | null; edited: string }>>>;
  cfg: PricingConfig | null;
}) {
  const dollarMissing = cfg != null && !(cfg.dollar > 0);
  return (
    <div>
      <div style={{ marginBottom: 16, padding: "12px 14px", borderRadius: "var(--radius-control)", background: "var(--color-brand-light)", fontSize: "0.8125rem", color: "var(--color-muted)", lineHeight: 1.5 }}>
        Cargá el <b>costo promocional USD</b> de cada producto (la oferta del proveedor). El precio promocional lo
        calcula la <b>tabla de Precios</b> con tu ganancia de franja, y al terminar la campaña todo se limpia solo.
        {dollarMissing && <div style={{ color: "var(--color-danger)", fontWeight: 600, marginTop: 6 }}>⚠ No hay dólar cargado en Precios — el cálculo no puede correr. Configuralo primero.</div>}
      </div>
      <div className="card" style={{ overflow: "hidden" }}>
        {[...selected.values()].map((p, i) => {
          const bc = baseCosts.get(p.id);
          const costMissing = bc != null && bc.current == null;
          const raw = promoCosts.get(p.id) ?? "";
          const cost = parseFloat(raw.replace(",", "."));
          const computed = cfg && !isNaN(cost) && cost > 0
            ? priceForUsd(cost, isSecondary(p.name, cfg) ? "secondary" : "primary", cfg)
            : null;
          return (
            <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderTop: i > 0 ? "1px solid var(--color-divider)" : "none", flexWrap: "wrap" }}>
              {p.imageUrl
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={p.imageUrl} alt="" style={{ width: 36, height: 36, borderRadius: 8, objectFit: "cover", flexShrink: 0 }} />
                : <span style={{ width: 36, height: 36, borderRadius: 8, background: "var(--color-surface-2)", flexShrink: 0 }} />}
              <div style={{ flex: 1, minWidth: 160 }}>
                <div style={{ fontSize: "0.8125rem", fontWeight: 500, color: "var(--color-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
                <div style={{ fontSize: "0.6875rem", color: "var(--color-subtle)" }}>Base ${p.price.toLocaleString("es-AR")}</div>
              </div>
              {/* costUsd de lista: informativo; editable si falta o está mal */}
              <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: "0.625rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.03em", color: costMissing ? "var(--color-warning)" : "var(--color-subtle)" }}>
                {costMissing ? "Costo USD (falta)" : "Costo USD"}
                <div style={{ position: "relative", width: 96 }}>
                  <span style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", fontSize: "0.6875rem", color: "var(--color-faint)", pointerEvents: "none" }}>US$</span>
                  <input className="input" inputMode="decimal" value={bc?.edited ?? ""} placeholder="—"
                    onChange={(e) => setBaseCosts((prev) => { const n = new Map(prev); n.set(p.id, { current: bc?.current ?? null, edited: e.target.value }); return n; })}
                    style={{ paddingLeft: 32, padding: "6px 8px 6px 32px", fontSize: "0.8125rem", fontVariantNumeric: "tabular-nums", borderColor: costMissing ? "var(--color-warning)" : undefined }} />
                </div>
              </label>
              {/* costo promocional: el que setea esta campaña */}
              <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: "0.625rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.03em", color: "var(--color-brand)" }}>
                Costo USD Promo
                <div style={{ position: "relative", width: 96 }}>
                  <span style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", fontSize: "0.6875rem", color: "var(--color-faint)", pointerEvents: "none" }}>US$</span>
                  <input className="input" inputMode="decimal" value={raw} placeholder="0"
                    onChange={(e) => setPromoCosts((prev) => { const n = new Map(prev); n.set(p.id, e.target.value); return n; })}
                    style={{ paddingLeft: 32, padding: "6px 8px 6px 32px", fontSize: "0.8125rem", fontWeight: 600, fontVariantNumeric: "tabular-nums" }} />
                </div>
              </label>
              {/* precio resultante (solo lectura, lo manda la tabla) */}
              <div style={{ width: 110, textAlign: "right" }}>
                <div style={{ fontSize: "0.625rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.03em", color: "var(--color-subtle)" }}>Promo resultante</div>
                <div style={{ fontSize: "0.875rem", fontWeight: 700, fontVariantNumeric: "tabular-nums", color: computed != null ? "var(--color-success)" : "var(--color-faint)" }}>
                  {computed != null ? `$${computed.toLocaleString("es-AR")}` : "—"}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const lbl: React.CSSProperties = { fontSize: "0.8125rem", fontWeight: 500, color: "var(--color-muted)" };
const navBtn: React.CSSProperties = { width: 30, height: 30, borderRadius: 9, border: "1px solid var(--color-border)", background: "var(--color-surface)", cursor: "pointer", fontSize: "1.125rem", color: "var(--color-muted)", display: "flex", alignItems: "center", justifyContent: "center" };
