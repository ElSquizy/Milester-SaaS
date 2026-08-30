"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { fieldBreakpoints, windowPoints, unifiedSparse, paddedDomain, type Change } from "@/lib/priceSeries";

type Prod = { id: number; name: string };

const FIELDS = [
  { key: "price", label: "Precio base", unit: "ars" as const },
  { key: "promotionalPrice", label: "Precio promo", unit: "ars" as const },
  { key: "costUsd", label: "Costo USD", unit: "usd" as const },
  { key: "costUsdPromo", label: "Costo promo USD", unit: "usd" as const },
];
const FIELD_KEYS = FIELDS.map((f) => f.key);
const RANGES = [{ k: "1w", label: "1 sem", days: 7 }, { k: "1m", label: "1 mes", days: 30 }, { k: "3m", label: "3 meses", days: 90 }, { k: "1y", label: "1 año", days: 365 }, { k: "all", label: "Todo", days: 0 }];
const COLORS = ["var(--color-chart-1)", "var(--color-chart-2)", "var(--color-chart-3)", "var(--color-success)", "var(--color-danger)", "var(--color-info)"];
const MAX = 6;
const DAY = 86400000;

const fmtDate = (t: number) => new Date(t).toLocaleDateString("es-AR", { day: "numeric", month: "short" });
const arsShort = (n: number) => (Math.abs(n) >= 1000 ? `$${Math.round(n / 1000)}k` : `$${Math.round(n)}`);
const fmtVal = (n: number, unit: "ars" | "usd") => (unit === "usd" ? `US$${n.toLocaleString("es-AR")}` : `$${Math.round(n).toLocaleString("es-AR")}`);

export default function ProductPriceComparator() {
  const [selected, setSelected] = useState<Prod[]>([]);
  const [hist, setHist] = useState<Record<number, Change[]>>({});
  const [fieldKey, setFieldKey] = useState("promotionalPrice");
  const [range, setRange] = useState("3m");
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Prod[]>([]);
  const [openList, setOpenList] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  const field = FIELDS.find((f) => f.key === fieldKey)!;

  useEffect(() => {
    if (!openList) return;
    const onDown = (e: MouseEvent) => { if (searchRef.current && !searchRef.current.contains(e.target as Node)) setOpenList(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpenList(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [openList]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (!q.trim()) { setResults([]); return; }
      fetch(`/api/products/search?q=${encodeURIComponent(q.trim())}`).then((r) => r.json())
        .then((d) => setResults((d.products || []).slice(0, 8).map((p: Prod) => ({ id: p.id, name: p.name }))))
        .catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

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

  const { rows, series, xDomain, domain, anyInWindow } = useMemo(() => {
    const now = Date.now();
    const days = RANGES.find((r) => r.k === range)?.days ?? 90;
    const from = days ? now - days * DAY : -Infinity;

    const sets = selected.map((p, i) => {
      const bps = fieldBreakpoints((hist[p.id] || []).filter((c) => c.field === fieldKey));
      return { ...p, color: COLORS[i % COLORS.length], bps, pts: windowPoints(bps, from, now), hasData: bps.length > 0 };
    });
    const drawn = sets.filter((s) => s.pts.length > 0);
    const rows = unifiedSparse(drawn.map((s) => ({ key: `p${s.id}`, pts: s.pts })));
    const vals = drawn.flatMap((s) => s.pts.map((pt) => pt.v!));
    return {
      rows,
      series: sets,
      xDomain: (days ? [from, now] : ["dataMin", "dataMax"]) as [number | string, number | string],
      domain: paddedDomain(vals),
      anyInWindow: drawn.length > 0,
    };
  }, [selected, hist, fieldKey, range]);

  return (
    <div className="anim-up delay-3" style={{ marginTop: 40 }}>
      <h2 style={{ fontSize: "1.0625rem", fontWeight: 600, letterSpacing: "-0.01em", color: "var(--color-ink)", margin: "0 0 4px" }}>Comparar precios de productos</h2>
      <p style={{ fontSize: "0.8125rem", color: "var(--color-subtle)", margin: "0 0 16px" }}>Elegí productos y un tipo de precio para ver su evolución lado a lado.</p>

      <div className="card" style={{ padding: "18px 20px" }}>
        {/* Tipo de precio + rango */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
          <div style={{ display: "flex", gap: 4, background: "var(--color-surface-2)", padding: 3, borderRadius: "var(--radius-pill)", flexWrap: "wrap" }}>
            {FIELDS.map((f) => (
              <button key={f.key} onClick={() => setFieldKey(f.key)} aria-pressed={fieldKey === f.key}
                style={{ padding: "5px 12px", borderRadius: "var(--radius-pill)", cursor: "pointer", fontSize: "0.75rem", fontWeight: 600, border: "none",
                  background: fieldKey === f.key ? "var(--color-surface)" : "transparent", color: fieldKey === f.key ? "var(--color-ink)" : "var(--color-subtle)",
                  boxShadow: fieldKey === f.key ? "var(--shadow-card)" : "none" }}>
                {f.label}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 3, background: "var(--color-surface-2)", padding: 3, borderRadius: "var(--radius-pill)", marginLeft: "auto" }}>
            {RANGES.map((r) => (
              <button key={r.k} onClick={() => setRange(r.k)} aria-pressed={range === r.k}
                style={{ padding: "5px 10px", borderRadius: "var(--radius-pill)", cursor: "pointer", fontSize: "0.6875rem", fontWeight: 600, border: "none",
                  background: range === r.k ? "var(--color-surface)" : "transparent", color: range === r.k ? "var(--color-ink)" : "var(--color-subtle)",
                  boxShadow: range === r.k ? "var(--shadow-card)" : "none" }}>
                {r.label}
              </button>
            ))}
          </div>
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
            <div ref={searchRef} style={{ position: "relative" }}>
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
          ) : !anyInWindow ? (
            <div style={{ height: 160, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", fontSize: "0.8125rem", color: "var(--color-subtle)", padding: "0 20px" }}>Ningún producto tiene historial de {field.label.toLowerCase()} en este rango.</div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={rows} margin={{ top: 10, right: 8, left: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-divider)" vertical={false} />
                <XAxis dataKey="t" type="number" scale="time" domain={xDomain} tickFormatter={fmtDate}
                  tick={{ fontSize: 11, fill: "var(--color-subtle)" }} tickLine={false} axisLine={{ stroke: "var(--color-border)" }} minTickGap={28} />
                <YAxis domain={domain} tick={{ fontSize: 11, fill: "var(--color-subtle)" }} tickLine={false} axisLine={false} width={46}
                  tickFormatter={(v) => (field.unit === "usd" ? `US$${v}` : arsShort(v))} />
                <Tooltip content={<CmpTooltip series={series} unit={field.unit} />} cursor={{ stroke: "var(--color-faint)", strokeWidth: 1 }} />
                {series.filter((s) => s.pts.length > 0).map((p) => (
                  <Line key={p.id} type="monotone" dataKey={`p${p.id}`} name={p.name} stroke={p.color} strokeWidth={2} dot={{ r: 2.5, fill: p.color, strokeWidth: 0 }} activeDot={{ r: 4 }} connectNulls isAnimationActive={false} />
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
