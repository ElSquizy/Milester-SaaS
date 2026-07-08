"use client";
import { useState, useEffect, useCallback, useRef } from "react";

type Row = { key: string; tiendaNubeId: string | null; values: string[]; price: string; promo: string; stock: string; sku: string };

const parseNum = (v: string) => {
  const n = parseFloat(v.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", "."));
  return isNaN(n) ? 0 : n;
};

/** Full variant manager: attributes, and per-variant values, price, stock (blank = ∞) and SKU. */
export default function VariantsManager({ productId }: { productId: number }) {
  const [attrs, setAttrs] = useState<string[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [deleted, setDeleted] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const keyer = useRef(0);
  const nextKey = () => `r${keyer.current++}`;
  // Snapshot of the last-saved state, to send only what actually changed.
  const orig = useRef<{ attrs: string[]; byTn: Map<string, { values: string[]; price: number; promo: number | null; stock: number | null; sku: string }> }>({ attrs: [], byTn: new Map() });

  type TNV = { tiendaNubeId: string | null; values: string[]; price: number; promotionalPrice: number | null; stock: number | null; sku: string | null };
  const hydrate = useCallback((d: { attributes?: string[]; variants?: TNV[] }) => {
    const a = d.attributes || [];
    const vs = d.variants || [];
    setAttrs(a);
    setRows(vs.map((v) => ({
      key: nextKey(), tiendaNubeId: v.tiendaNubeId, values: v.values || [],
      price: String(v.price), promo: v.promotionalPrice == null ? "" : String(v.promotionalPrice), stock: v.stock == null ? "" : String(v.stock), sku: v.sku || "",
    })));
    setDeleted([]);
    orig.current = {
      attrs: a,
      byTn: new Map(vs.filter((v) => v.tiendaNubeId).map((v) => [v.tiendaNubeId!, { values: v.values || [], price: v.price, promo: v.promotionalPrice ?? null, stock: v.stock, sku: v.sku || "" }])),
    };
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/products/${productId}/variants`).then((r) => r.json()).then(hydrate).finally(() => setLoading(false));
  }, [productId, hydrate]);

  useEffect(() => { load(); }, [load]);

  // Keep each row's values array the same length as attrs.
  const pad = (vals: string[]) => attrs.map((_, i) => vals[i] ?? "");

  function setAttr(i: number, val: string) { setAttrs((a) => a.map((x, k) => (k === i ? val : x))); }
  function addAttr() { setAttrs((a) => [...a, ""]); setRows((rs) => rs.map((r) => ({ ...r, values: [...r.values, ""] }))); }
  function removeAttr(i: number) {
    setAttrs((a) => a.filter((_, k) => k !== i));
    setRows((rs) => rs.map((r) => ({ ...r, values: r.values.filter((_, k) => k !== i) })));
  }

  function setRow(key: string, patch: Partial<Row>) { setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r))); }
  function setValue(key: string, i: number, val: string) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, values: r.values.map((v, k) => (k === i ? val : v)) } : r)));
  }
  function addRow() {
    setRows((rs) => [...rs, { key: nextKey(), tiendaNubeId: null, values: attrs.map(() => ""), price: rs[0]?.price || "0", promo: "", stock: "", sku: "" }]);
  }
  function removeRow(key: string) {
    setRows((rs) => {
      const r = rs.find((x) => x.key === key);
      if (r?.tiendaNubeId) setDeleted((d) => [...d, r.tiendaNubeId!]);
      return rs.filter((x) => x.key !== key);
    });
  }

  function toPayload(r: Row) {
    return {
      tiendaNubeId: r.tiendaNubeId,
      values: pad(r.values),
      price: parseNum(r.price),
      promotionalPrice: r.promo.trim() === "" ? null : parseNum(r.promo),
      stock: r.stock.trim() === "" ? null : Math.round(parseNum(r.stock)),
      sku: r.sku.trim() || null,
    };
  }

  async function save() {
    if (rows.length === 0) { setMsg({ ok: false, text: "Debe quedar al menos una variante" }); return; }
    const attributesChanged = JSON.stringify(attrs) !== JSON.stringify(orig.current.attrs);
    // Only send new or changed variants (unless attributes changed — then all values must update).
    const changed = (r: Row) => {
      const p = toPayload(r);
      if (!r.tiendaNubeId) return true;
      const o = orig.current.byTn.get(r.tiendaNubeId);
      if (!o) return true;
      return o.price !== p.price || (o.promo ?? null) !== p.promotionalPrice || (o.stock ?? null) !== p.stock || (o.sku || null) !== p.sku
        || JSON.stringify(o.values) !== JSON.stringify(p.values);
    };
    const toSend = (attributesChanged ? rows : rows.filter(changed)).map(toPayload);

    if (toSend.length === 0 && deleted.length === 0 && !attributesChanged) { setMsg({ ok: true, text: "No hay cambios" }); return; }

    setSaving(true); setMsg(null);
    try {
      const res = await fetch(`/api/products/${productId}/variants`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attributes: attrs, attributesChanged, deleted, variants: toSend }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(typeof d.error === "string" ? d.error : "Error");
      hydrate(d);
      setMsg({ ok: true, text: "Variantes guardadas y sincronizadas" });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message.slice(0, 160) : "Error" });
    } finally { setSaving(false); }
  }

  const inp: React.CSSProperties = { padding: "6px 8px", fontSize: "0.8125rem", width: "100%" };

  return (
    <div style={{ borderTop: "1px solid var(--color-divider)", paddingTop: 20, display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: "0.75rem", fontWeight: 600, letterSpacing: "0.03em", textTransform: "uppercase", color: "var(--color-subtle)" }}>Variantes</div>
          <div style={{ fontSize: "0.75rem", color: "var(--color-faint)", marginTop: 2 }}>Precio, stock (vacío = ∞) y SKU por variante. Se guardan en Tienda Nube al aplicar.</div>
        </div>
        <button className="btn-secondary" onClick={addRow} style={{ padding: "6px 12px", fontSize: "0.8125rem", whiteSpace: "nowrap" }}>+ Variante</button>
      </div>

      {/* Attributes */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: "0.75rem", color: "var(--color-subtle)", fontWeight: 500 }}>Atributos:</span>
        {attrs.map((a, i) => (
          <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "var(--color-surface-2)", borderRadius: "var(--radius-pill)", padding: "2px 4px 2px 10px" }}>
            <input value={a} onChange={(e) => setAttr(i, e.target.value)} placeholder="Atributo"
              style={{ border: "none", background: "transparent", outline: "none", fontSize: "0.75rem", width: `${Math.max(6, a.length + 2)}ch`, color: "var(--color-ink)", fontWeight: 500 }} />
            <button onClick={() => removeAttr(i)} title="Quitar atributo" style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--color-faint)", fontSize: "0.875rem", lineHeight: 1 }}>×</button>
          </span>
        ))}
        <button onClick={addAttr} style={{ border: "1px dashed var(--color-border)", background: "transparent", borderRadius: "var(--radius-pill)", padding: "3px 10px", fontSize: "0.75rem", color: "var(--color-muted)", cursor: "pointer" }}>+ atributo</button>
      </div>

      {loading ? (
        <div style={{ padding: "20px", textAlign: "center", fontSize: "0.8125rem", color: "var(--color-subtle)" }}>Cargando variantes…</div>
      ) : (
        <div style={{ border: "1px solid var(--color-border)", borderRadius: "var(--radius-control)", overflow: "hidden", maxHeight: 320, overflowY: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8125rem" }}>
            <thead>
              <tr style={{ background: "var(--color-surface-2)" }}>
                {attrs.map((a, i) => <th key={i} style={vth}>{a || `Atributo ${i + 1}`}</th>)}
                <th style={{ ...vth, textAlign: "right", width: 88 }}>Precio</th>
                <th style={{ ...vth, textAlign: "right", width: 88 }}>Promo</th>
                <th style={{ ...vth, textAlign: "right", width: 70 }}>Stock</th>
                <th style={{ ...vth, width: 110 }}>SKU</th>
                <th style={{ ...vth, width: 34 }} />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={attrs.length + 5} style={{ padding: 18, textAlign: "center", color: "var(--color-subtle)" }}>Sin variantes. Agregá una con “+ Variante”.</td></tr>
              ) : rows.map((r) => (
                <tr key={r.key} style={{ borderTop: "1px solid var(--color-divider)" }}>
                  {attrs.map((_, i) => (
                    <td key={i} style={vtd}><input className="input" value={r.values[i] ?? ""} onChange={(e) => setValue(r.key, i, e.target.value)} placeholder="—" style={inp} /></td>
                  ))}
                  <td style={vtd}><input className="input" value={r.price} onChange={(e) => setRow(r.key, { price: e.target.value })} style={{ ...inp, textAlign: "right", fontVariantNumeric: "tabular-nums" }} /></td>
                  <td style={vtd}><input className="input" value={r.promo} onChange={(e) => setRow(r.key, { promo: e.target.value })} placeholder="—" title="Precio promocional (vacío = sin oferta)" style={{ ...inp, textAlign: "right", fontVariantNumeric: "tabular-nums", color: r.promo.trim() === "" ? "var(--color-faint)" : (parseNum(r.promo) < parseNum(r.price) ? "var(--color-success)" : "var(--color-warning)"), fontWeight: 600 }} /></td>
                  <td style={vtd}><input className="input" value={r.stock} onChange={(e) => setRow(r.key, { stock: e.target.value })} placeholder="∞" style={{ ...inp, textAlign: "right", fontVariantNumeric: "tabular-nums" }} /></td>
                  <td style={vtd}><input className="input" value={r.sku} onChange={(e) => setRow(r.key, { sku: e.target.value })} placeholder="—" style={{ ...inp, fontFamily: "var(--font-mono), monospace", fontSize: "0.75rem" }} /></td>
                  <td style={{ ...vtd, textAlign: "center" }}>
                    <button onClick={() => removeRow(r.key)} title="Eliminar variante" disabled={rows.length === 1}
                      style={{ border: "none", background: "transparent", cursor: rows.length === 1 ? "default" : "pointer", color: rows.length === 1 ? "var(--color-faint)" : "var(--color-danger)", padding: 4 }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {msg && <span style={{ flex: 1, fontSize: "0.8125rem", color: msg.ok ? "var(--color-success)" : "var(--color-danger)" }}>{msg.ok ? "✓ " : "✕ "}{msg.text}</span>}
        {!msg && <span style={{ flex: 1, fontSize: "0.75rem", color: "var(--color-subtle)" }}>{rows.length} {rows.length === 1 ? "variante" : "variantes"}{deleted.length ? ` · ${deleted.length} a eliminar` : ""}</span>}
        <button className="btn-primary" onClick={save} disabled={saving} style={{ whiteSpace: "nowrap" }}>{saving ? "Guardando…" : "Guardar variantes"}</button>
      </div>
    </div>
  );
}

const vth: React.CSSProperties = { padding: "8px 8px", fontSize: "0.6875rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.03em", color: "var(--color-subtle)", textAlign: "left", whiteSpace: "nowrap" };
const vtd: React.CSSProperties = { padding: "4px 6px", verticalAlign: "middle" };
