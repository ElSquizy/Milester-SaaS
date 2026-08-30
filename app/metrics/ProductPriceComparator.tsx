"use client";
import { useEffect, useMemo, useState } from "react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";

type Change = { field: string; oldValue: string | null; newValue: string | null; createdAt: string };
type Prod = { id: number; name: string };

const FIELDS = [
  { key: "price", label: "Precio base", unit: "ars" as const },
  { key: "promotionalPrice", label: "Precio promo", unit: "ars" as const },
  { key: "costUsd", label: "Costo USD", unit: "usd" as const },
  { key: "costUsdPromo", label: "Costo promo USD", unit: "usd" as const },
];
const FIELD_KEYS = FIELDS.map((f) => f.key);
const COLORS = ["var(--color-chart-1)", "var(--color-chart-2)", "var(--color-chart-3)", "var(--color-success)", "var(--color-danger)", "var(--color-info)"];
const MAX = 6;

const parseNum = (v: string | null): number | null => (v == null || v === "" || isNaN(Number(v)) ? null : Number(v));
const fmtDate = (t: number) => new Date(t).toLocaleDateString("es-AR", { day: "numeric", month: "short" });
const arsShort = (n: number) => (Math.abs(n) >= 1000 ? `$${Math.round(n / 1000)}k` : `$${Math.round(n)}`);
const fmtVal = (n: number, unit: "ars" | "usd") => (unit === "usd" ? `US$${n.toLocaleString("es-AR")}` : `$${Math.round(n).toLocaleString("es-AR")}`);

export default function ProductPriceComparator() {
  const [selected, setSelected] = useState<Prod[]>([]);
  const [hist, setHist] = useState<Record<number, Change[]>>({});
  const [fieldKey, setFieldKey] = useState("promotionalPrice");
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Prod[]>([]);
  const [openList, setOpenList] = useState(false);

  const field = FIELDS.find((f) => f.key === fieldKey)!;

  // Búsqueda de productos (debounce).
  useEffect(() => {
    const t = setTimeout(() => {
      if (!q.trim()) { setResults([]); return; }
      fetch(`/api/products/search?q=${encodeURIComponent(q.trim())}`).then((r) => r.json())
        .then((d) => setResults((d.products || []).slice(0, 8).map((p: Prod) => ({ id: p.id, name: p.name }))))
        .catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  // Trae el changelog de los productos recién agregados.
  useEffect(() => {
    const missing = selected.filter((p) => !(p.id in hist));
    if (!missing.length) return;
    let alive = true;
    Promise.all(missing.map((p) => fetch(`/api/changelog?productId=${p.id}`).then((r) => r.json())
      .then((d: { logs?: Change[] }) => [p.id, (d.logs || []).filter((c) => FIELD_KEYS.includes(c.field))] as const)))
      .then((entries) => { if (alive) setHist((h) => ({ ...h, ...Object.fromEntries(entries) })); });
    return () => { alive = false; };
  }, [selected]); // eslint-disable-line react-hooks/exhaustive-deps

  function add(p: Prod) {
    if (selected.length >= MAX || selected.some((s) => s.id === p.id)) return;
    setSelected((s) => [...s, p]); setQ(""); setResults([]); setOpenList(false);
  }
  const remove = (id: number) => setSelected((s) => s.filter((p) => p.id !== id));

  // Reconstruye la serie del campo elegido para cada producto (escalonada).
  const { rows, series } = useMemo(() => {
    const now = Date.now();
    const bpByProduct: Record<number, { t: number; v: number }[]> = {};
    const allTimes: number[] = [now];
    // tMin global entre los productos con historia del campo.
    let tMin = now;
    const csByP: Record<number, Change[]> = {};
    for (const p of selected) {
      const cs = (hist[p.id] || []).filter((c) => c.field === fieldKey).sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
      csByP[p.id] = cs;
      if (cs.length) tMin = Math.min(tMin, new Date(cs[0].createdAt).getTime());
    }
    for (const p of selected) {
      const cs = csByP[p.id]; const bps: { t: number; v: number }[] = [];
      if (cs.length) {
        const old0 = parseNum(cs[0].oldValue);
        if (old0 != null) bps.push({ t: tMin, v: old0 });
        let last: number | null = old0;
        for (const c of cs) { const nv = parseNum(c.newValue); if (nv != null) { bps.push({ t: new Date(c.createdAt).getTime(), v: nv }); last = nv; } allTimes.push(new Date(c.createdAt).getTime()); }
        if (last != null) bps.push({ t: now, v: last });
      }
      bpByProduct[p.id] = bps;
    }
    const times = Array.from(new Set(allTimes)).sort((a, b) => a - b);
    const valueAt = (bps: { t: number; v: number }[], t: number): number | null => {
      let v: number | null = null;
      for (const b of bps) { if (b.t <= t) v = b.v; else break; }
      return v;
    };
    const rows = times.map((t) => {
      const row: Record<string, number | null> = { t };
      for (const p of selected) row[`p${p.id}`] = valueAt(bpByProduct[p.id], t);
      return row;
    });
    const series = selected.map((p, i) => ({ ...p, color: COLORS[i % COLORS.length], hasData: bpByProduct[p.id].length > 0 }));
    return { rows, series };
  }, [selected, hist, fieldKey]);

  const anyData = series.some((s) => s.hasData);

  return (
    <div className="anim-up delay-3" style={{ marginTop: 40 }}>
      <h2 style={{ fontSize: "1.0625rem", fontWeight: 600, letterSpacing: "-0.01em", color: "var(--color-ink)", margin: "0 0 4px" }}>Comparar precios de productos</h2>
      <p style={{ fontSize: "0.8125rem", color: "var(--color-subtle)", margin: "0 0 16px" }}>Elegí productos y un tipo de precio para ver su evolución lado a lado.</p>

      <div className="card" style={{ padding: "18px 20px" }}>
        {/* Selector de campo */}
        <div style={{ display: "flex", gap: 4, background: "var(--color-surface-2)", padding: 3, borderRadius: "var(--radius-pill)", marginBottom: 14, width: "fit-content", flexWrap: "wrap" }}>
          {FIELDS.map((f) => (
            <button key={f.key} onClick={() => setFieldKey(f.key)} aria-pressed={fieldKey === f.key}
              style={{ padding: "5px 12px", borderRadius: "var(--radius-pill)", cursor: "pointer", fontSize: "0.75rem", fontWeight: 600, border: "none",
                background: fieldKey === f.key ? "var(--color-surface)" : "transparent", color: fieldKey === f.key ? "var(--color-ink)" : "var(--color-subtle)",
                boxShadow: fieldKey === f.key ? "var(--shadow-card)" : "none" }}>
              {f.label}
            </button>
          ))}
        </div>

        {/* Buscador + chips */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 4 }}>
          {series.map((p) => (
            <span key={p.id} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 8px 4px 10px", borderRadius: "var(--radius-pill)", background: "var(--color-surface-2)", fontSize: "0.8125rem" }}>
              <span style={{ width: 9, height: 9, borderRadius: "50%", background: p.color }} />
              <span style={{ color: "var(--color-ink)", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
              {!p.hasData && <span style={{ fontSize: "0.625rem", color: "var(--color-subtle)" }}>(sin datos)</span>}
              <button onClick={() => remove(p.id)} aria-label={`Quitar ${p.name}`} style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--color-subtle)", padding: 0, fontSize: "0.875rem", lineHeight: 1 }}>✕</button>
            </span>
          ))}
          {selected.length < MAX && (
            <div style={{ position: "relative" }}>
              <input value={q} onChange={(e) => { setQ(e.target.value); setOpenList(true); }} onFocus={() => setOpenList(true)}
                placeholder="+ Agregar producto…" aria-label="Buscar producto para comparar"
                className="input" style={{ width: 200, padding: "6px 11px", fontSize: "0.8125rem" }} />
              {openList && results.length > 0 && (
                <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 20, minWidth: 260, maxHeight: 240, overflowY: "auto", background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-control)", boxShadow: "var(--shadow-dropdown)", padding: 4 }}>
                  {results.map((p) => (
                    <button key={p.id} onClick={() => add(p)} disabled={selected.some((s) => s.id === p.id)}
                      style={{ display: "block", width: "100%", textAlign: "left", border: "none", background: "transparent", cursor: "pointer", padding: "7px 9px", borderRadius: 7, fontSize: "0.8125rem", color: "var(--color-ink)", opacity: selected.some((s) => s.id === p.id) ? 0.4 : 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                      className="product-row-link">
                      {p.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Gráfico */}
        <div style={{ marginTop: 16 }}>
          {selected.length === 0 ? (
            <div style={{ height: 160, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.8125rem", color: "var(--color-subtle)" }}>Agregá productos para comparar sus precios.</div>
          ) : !anyData ? (
            <div style={{ height: 160, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", fontSize: "0.8125rem", color: "var(--color-subtle)", padding: "0 20px" }}>Ninguno de los productos tiene historial de {field.label.toLowerCase()} todavía.</div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={rows} margin={{ top: 6, right: 8, left: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-divider)" vertical={false} />
                <XAxis dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]} tickFormatter={fmtDate}
                  tick={{ fontSize: 11, fill: "var(--color-subtle)" }} tickLine={false} axisLine={{ stroke: "var(--color-border)" }} minTickGap={28} />
                <YAxis tick={{ fontSize: 11, fill: "var(--color-subtle)" }} tickLine={false} axisLine={false} width={46}
                  tickFormatter={(v) => (field.unit === "usd" ? `US$${v}` : arsShort(v))} />
                <Tooltip content={<CmpTooltip series={series} unit={field.unit} />} />
                {series.filter((s) => s.hasData).map((p) => (
                  <Line key={p.id} type="stepAfter" dataKey={`p${p.id}`} name={p.name} stroke={p.color} strokeWidth={2} dot={false} activeDot={{ r: 4 }} connectNulls isAnimationActive={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}

type TipProps = { active?: boolean; label?: number; payload?: Array<{ dataKey: string; value: number; color: string }>; series: Array<{ id: number; name: string; color: string }>; unit: "ars" | "usd" };
function CmpTooltip({ active, label, payload, series, unit }: TipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-control)", boxShadow: "var(--shadow-dropdown)", padding: "8px 12px", maxWidth: 260 }}>
      <div style={{ fontSize: "0.75rem", color: "var(--color-subtle)", marginBottom: 4 }}>{label != null ? fmtDate(label) : ""}</div>
      {payload.map((p) => {
        const s = series.find((x) => `p${x.id}` === p.dataKey);
        return (
          <div key={p.dataKey} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.8125rem" }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: p.color, flexShrink: 0 }} />
            <span style={{ color: "var(--color-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s?.name}</span>
            <span style={{ marginLeft: "auto", fontWeight: 700, color: "var(--color-ink)", fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>{fmtVal(p.value, unit)}</span>
          </div>
        );
      })}
    </div>
  );
}
