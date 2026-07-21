"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import ProductGridModal from "./ProductGridModal";
import { useIsMobile } from "@/components/useIsMobile";

export type PickedProduct = { id: number; name: string; imageUrl: string | null; price: number };
type SearchResult = { id: number; name: string; sku: string | null; price: number; imageUrl: string | null; categoryName: string | null };

/** Searchable multi-select of products (for the "productos específicos" scope). */
export function ProductPicker({ picked, onChange }: { picked: PickedProduct[]; onChange: (p: PickedProduct[]) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pickedIds = new Set(picked.map((p) => p.id));

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      fetch(`/api/products/search?q=${encodeURIComponent(q)}`).then((r) => r.json()).then(setResults).catch(() => setResults([]));
    }, 250);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [q]);

  function add(r: SearchResult) {
    if (!pickedIds.has(r.id)) onChange([...picked, { id: r.id, name: r.name, imageUrl: r.imageUrl, price: r.price }]);
  }

  return (
    <div>
      {picked.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
          {picked.map((p) => (
            <span key={p.id} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 9px", borderRadius: "var(--radius-pill)", background: "var(--color-surface-2)", fontSize: "0.75rem", color: "var(--color-ink)", fontWeight: 500 }}>
              {p.name.slice(0, 28)}
              <button onClick={() => onChange(picked.filter((x) => x.id !== p.id))} style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--color-faint)", padding: 0, fontSize: "1rem", lineHeight: 1 }}>×</button>
            </span>
          ))}
        </div>
      )}
      <input className="input" value={q} onFocus={() => setOpen(true)} onChange={(e) => { setQ(e.target.value); setOpen(true); }} placeholder="Buscar productos para agregar..." />
      {open && results.length > 0 && (
        <div className="menu" style={{ marginTop: 6, maxHeight: 220, overflowY: "auto" }}>
          {results.map((r) => (
            <div key={r.id} className="menu-item" onClick={() => add(r)} style={{ opacity: pickedIds.has(r.id) ? 0.45 : 1 }}>
              {r.imageUrl
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={r.imageUrl} alt="" style={{ width: 24, height: 24, borderRadius: 6, objectFit: "cover", flexShrink: 0 }} />
                : <span style={{ width: 24, height: 24, borderRadius: 6, background: "var(--color-surface-2)", flexShrink: 0 }} />}
              <span style={{ flex: 1, fontSize: "0.8125rem", color: "var(--color-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</span>
              <span style={{ fontSize: "0.75rem", color: "var(--color-subtle)", fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>${r.price.toLocaleString("es-AR")}</span>
              {pickedIds.has(r.id) && <span style={{ fontSize: "0.75rem", color: "var(--color-success)" }}>✓</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

type VariantPrice = { variantId: number; campaignPrice: number };
type Item = { productId: number; name: string; imageUrl: string | null; sku: string | null; basePrice: number; promoPrice: number; variantPrices: VariantPrice[] };
type VariantInfo = { id: number; label: string; price: number; promotionalPrice: number | null };

/**
 * Editable product/price list for a campaign. Works for drafts (edit → Activar) and for
 * ACTIVE campaigns (edit products + prices → Guardar cambios, applied live). You can add
 * products (grid), remove them, and edit each promo price.
 */
export function ItemsPanel({ campaignId, status, categories, categoryTree, onClose, onApplied }: {
  campaignId: number; status: string; categories: string[]; categoryTree?: { name: string; tnId: string; parentTnId: string | null }[]; onClose: () => void; onApplied: () => void;
}) {
  const isMobile = useIsMobile();
  const [items, setItems] = useState<Item[]>([]);
  const [originalIds, setOriginalIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [gridOpen, setGridOpen] = useState(false);
  // Multi-variant support: variantMeta lists a product's variants; variantPrices
  // holds the per-variant campaign price being edited.
  const [variantMeta, setVariantMeta] = useState<Map<number, VariantInfo[]>>(new Map());
  const [variantPrices, setVariantPrices] = useState<Map<number, Map<number, number>>>(new Map());
  const isActive = status === "active";

  const load = useCallback(() => {
    fetch(`/api/campaigns/${campaignId}/items`).then((r) => r.json()).then((d: Item[]) => {
      setItems(d); setOriginalIds(new Set(d.map((i) => i.productId))); setLoading(false);
    });
  }, [campaignId]);
  useEffect(() => { load(); }, [load]);

  // Fetch variant metadata for the current items; seed per-variant prices from
  // the stored campaign values, falling back to each variant's base price.
  useEffect(() => {
    const ids = items.map((i) => i.productId);
    if (ids.length === 0) { setVariantMeta(new Map()); return; }
    fetch("/api/products/variants", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids }) })
      .then((r) => r.json())
      .then((data: Record<string, VariantInfo[]>) => {
        const meta = new Map<number, VariantInfo[]>();
        for (const [pid, vs] of Object.entries(data)) meta.set(Number(pid), vs);
        setVariantMeta(meta);
        setVariantPrices((prev) => {
          const next = new Map(prev);
          for (const [pid, vs] of meta) {
            if (next.has(pid)) continue; // don't clobber in-progress edits
            const stored = new Map((items.find((i) => i.productId === pid)?.variantPrices ?? []).map((v) => [v.variantId, v.campaignPrice]));
            const m = new Map<number, number>();
            vs.forEach((v) => m.set(v.id, stored.get(v.id) ?? v.price));
            next.set(pid, m);
          }
          return next;
        });
      })
      .catch(() => setVariantMeta(new Map()));
    // Seed only when the set of item ids changes (add/remove), not on every price keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.map((i) => i.productId).join(",")]);

  function setPromo(productId: number, val: string) {
    const n = parseFloat(val.replace(/\./g, "").replace(",", "."));
    setItems((prev) => prev.map((i) => i.productId === productId ? { ...i, promoPrice: isNaN(n) ? 0 : n } : i));
  }
  function setVariantPrice(pid: number, vid: number, val: string) {
    const n = parseFloat(val.replace(/\./g, "").replace(",", "."));
    setVariantPrices((prev) => {
      const next = new Map(prev);
      const m = new Map(next.get(pid) ?? []);
      m.set(vid, isNaN(n) ? 0 : n);
      next.set(pid, m);
      return next;
    });
  }
  function removeItem(productId: number) {
    setItems((prev) => prev.filter((i) => i.productId !== productId));
  }
  function applyGrid(picked: PickedProduct[]) {
    setGridOpen(false);
    setItems((prev) => {
      const byId = new Map(prev.map((i) => [i.productId, i]));
      return picked.map((p) => byId.get(p.id) ?? { productId: p.id, name: p.name, imageUrl: p.imageUrl, sku: null, basePrice: p.price, promoPrice: p.price, variantPrices: [] });
    });
  }

  async function persist() {
    const currentIds = new Set(items.map((i) => i.productId));
    const addIds = items.filter((i) => !originalIds.has(i.productId)).map((i) => i.productId);
    const removeIds = [...originalIds].filter((id) => !currentIds.has(id));
    await fetch(`/api/campaigns/${campaignId}/items`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        addIds, removeIds,
        prices: items.map((i) => {
          const vs = variantMeta.get(i.productId);
          const vp = variantPrices.get(i.productId);
          // For multi-variant products the product-level promo mirrors the first
          // (lowest-id) variant — the one the outbound sync makes follow the product.
          const promoPrice = vs && vp && vs.length ? (vp.get(vs[0].id) ?? vs[0].price) : i.promoPrice;
          return {
            productId: i.productId,
            promoPrice,
            ...(vs && vp ? { variantPrices: vs.map((v) => ({ variantId: v.id, campaignPrice: vp.get(v.id) ?? v.price })) } : {}),
          };
        }),
      }),
    });
  }

  async function saveActive() {
    setBusy(true); setError("");
    try { await persist(); onApplied(); }
    catch (e) { setError(e instanceof Error ? e.message : "Error"); } finally { setBusy(false); }
  }
  async function activate() {
    setBusy(true); setError("");
    try {
      await persist();
      const res = await fetch(`/api/campaigns/${campaignId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "apply" }) });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Error"); }
      onApplied();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Error"); } finally { setBusy(false); }
  }
  async function saveDraft() {
    setBusy(true);
    try { await persist(); onClose(); } finally { setBusy(false); }
  }

  return (
    <>
      <div onClick={onClose} className="anim-in" style={{ position: "fixed", inset: 0, background: "rgba(17,24,39,0.16)", zIndex: isMobile ? 400 : 40 }} />
      <div className={isMobile ? "anim-in" : "anim-panel"} style={{
        position: "fixed",
        ...(isMobile
          ? { inset: 0, width: "100%", maxWidth: "none", borderRadius: 0, zIndex: 410 }
          : { top: 14, right: 14, bottom: 14, width: 480, maxWidth: "calc(100vw - 28px)", borderRadius: "var(--radius-card)", zIndex: 50, border: "1px solid var(--color-border)" }),
        background: "var(--color-surface)", boxShadow: "var(--shadow-float)",
        display: "flex", flexDirection: "column", overflow: "hidden",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 20px", borderBottom: "1px solid var(--color-divider)", flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: "0.9375rem", fontWeight: 600 }}>{isActive ? "Editar campaña activa" : "Precios de la campaña"}</div>
            <div style={{ fontSize: "0.75rem", color: "var(--color-subtle)", marginTop: 1 }}>
              {items.length} productos · agregá, quitá o editá el precio promocional
            </div>
          </div>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 9, border: "none", background: "var(--color-surface-2)", cursor: "pointer", color: "var(--color-muted)" }}>✕</button>
        </div>

        <div style={{ padding: "10px 12px 0" }}>
          <button className="btn-secondary" onClick={() => setGridOpen(true)} style={{ width: "100%", justifyContent: "center" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            Agregar / quitar productos
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "8px 12px" }}>
          {loading ? (
            <div style={{ padding: 24, textAlign: "center", color: "var(--color-subtle)", fontSize: "0.875rem" }}>Cargando...</div>
          ) : items.length === 0 ? (
            <div style={{ padding: 24, textAlign: "center", color: "var(--color-subtle)", fontSize: "0.875rem" }}>Sin productos. Agregá con el botón de arriba.</div>
          ) : items.map((it) => {
            const vs = variantMeta.get(it.productId);
            const off = it.basePrice > 0 ? Math.round((1 - it.promoPrice / it.basePrice) * 100) : 0;
            return (
              <div key={it.productId} style={{ borderBottom: "1px solid var(--color-divider)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 8px" }}>
                  {it.imageUrl
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={it.imageUrl} alt="" style={{ width: 34, height: 34, borderRadius: 8, objectFit: "cover", flexShrink: 0 }} />
                    : <span style={{ width: 34, height: 34, borderRadius: 8, background: "var(--color-surface-2)", flexShrink: 0 }} />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "0.8125rem", fontWeight: 500, color: "var(--color-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.name}</div>
                    <div style={{ fontSize: "0.6875rem", color: "var(--color-subtle)" }}>
                      {vs && vs.length ? `${vs.length} variantes` : <>Base ${it.basePrice.toLocaleString("es-AR")}{off > 0 && <span style={{ color: "var(--color-success)", fontWeight: 600 }}> · −{off}%</span>}</>}
                    </div>
                  </div>
                  {!(vs && vs.length) && (
                    <div style={{ position: "relative", width: 100, flexShrink: 0 }}>
                      <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: "0.8125rem", color: "var(--color-muted)", pointerEvents: "none" }}>$</span>
                      <input className="input" value={it.promoPrice} onChange={(e) => setPromo(it.productId, e.target.value)} style={{ paddingLeft: 20, fontVariantNumeric: "tabular-nums", fontWeight: 600, padding: "7px 10px 7px 20px" }} />
                    </div>
                  )}
                  <button onClick={() => removeItem(it.productId)} title="Quitar de la campaña" style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--color-faint)", flexShrink: 0, padding: 4 }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                  </button>
                </div>

                {/* Per-variant prices */}
                {vs && vs.map((v) => {
                  const vp = variantPrices.get(it.productId)?.get(v.id) ?? v.price;
                  const voff = v.price > 0 ? Math.round((1 - vp / v.price) * 100) : 0;
                  return (
                    <div key={v.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 8px 7px 44px", background: "var(--color-surface-2)" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: "0.8125rem", color: "var(--color-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.label || "Variante"}</div>
                        <div style={{ fontSize: "0.6875rem", color: "var(--color-subtle)" }}>Base ${v.price.toLocaleString("es-AR")}{voff > 0 && <span style={{ color: "var(--color-success)", fontWeight: 600 }}> · −{voff}%</span>}</div>
                      </div>
                      <div style={{ position: "relative", width: 100, flexShrink: 0 }}>
                        <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: "0.8125rem", color: "var(--color-muted)", pointerEvents: "none" }}>$</span>
                        <input className="input" value={vp} onChange={(e) => setVariantPrice(it.productId, v.id, e.target.value)} style={{ paddingLeft: 20, fontVariantNumeric: "tabular-nums", fontWeight: 600, padding: "7px 10px 7px 20px" }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>

        <div style={{ padding: "14px 20px", borderTop: "1px solid var(--color-divider)", flexShrink: 0, display: "flex", alignItems: "center", gap: 10 }}>
          {error && <span style={{ flex: 1, fontSize: "0.8125rem", color: "var(--color-danger)" }}>{error}</span>}
          {!error && <span style={{ flex: 1, fontSize: "0.75rem", color: "var(--color-subtle)" }}>El precio base no se toca — solo el promocional.</span>}
          {isActive ? (
            <button className="btn-primary" onClick={saveActive} disabled={busy || items.length === 0}>{busy ? "..." : "Guardar cambios"}</button>
          ) : (
            <>
              <button className="btn-secondary" onClick={saveDraft} disabled={busy}>Guardar borrador</button>
              <button className="btn-primary" onClick={activate} disabled={busy || items.length === 0}>{busy ? "..." : "Activar campaña"}</button>
            </>
          )}
        </div>
      </div>

      {gridOpen && (
        <ProductGridModal
          initial={items.map((i) => ({ id: i.productId, name: i.name, imageUrl: i.imageUrl, price: i.basePrice }))}
          categories={categories}
          categoryTree={categoryTree}
          allowEmpty
          confirmLabel="Confirmar"
          title="Productos de la campaña"
          onConfirm={applyGrid}
          onClose={() => setGridOpen(false)}
        />
      )}
    </>
  );
}
