"use client";
import { useEffect, useMemo, useState } from "react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { fieldBreakpoints, windowPoints, unifiedSparse, paddedDomain, type Change } from "@/lib/priceSeries";

type Current = { price: number; promotionalPrice: number | null; costUsd: number | null; costUsdPromo: number | null };

const SERIES = [
  { key: "price", label: "Base", color: "var(--color-chart-1)", unit: "ars" as const },
  { key: "promotionalPrice", label: "Promo", color: "var(--color-success)", unit: "ars" as const },
  { key: "costUsd", label: "Costo USD", color: "var(--color-chart-2)", unit: "usd" as const },
  { key: "costUsdPromo", label: "Costo promo USD", color: "var(--color-chart-3)", unit: "usd" as const },
];
const KEYS = SERIES.map((s) => s.key);
const RANGES = [{ k: "1w", label: "1 sem", days: 7 }, { k: "1m", label: "1 mes", days: 30 }, { k: "3m", label: "3 meses", days: 90 }, { k: "1y", label: "1 año", days: 365 }, { k: "all", label: "Todo", days: 0 }];
const DAY = 86400000;

const arsShort = (n: number) => (Math.abs(n) >= 1000 ? `$${Math.round(n / 1000)}k` : `$${Math.round(n)}`);
const arsFull = (n: number) => `$${Math.round(n).toLocaleString("es-AR")}`;
const usdFull = (n: number) => `US$${n.toLocaleString("es-AR")}`;
const fmtDate = (t: number) => new Date(t).toLocaleDateString("es-AR", { day: "numeric", month: "short" });

export default function PriceHistoryChart({ productId, current }: { productId: number; current: Current }) {
  const [changes, setChanges] = useState<Change[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState("3m");
  const [active, setActive] = useState<Record<string, boolean>>(() => ({
    price: current.promotionalPrice == null,
    promotionalPrice: current.promotionalPrice != null,
    costUsd: false,
    costUsdPromo: false,
  }));

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(`/api/changelog?productId=${productId}`).then((r) => r.json())
      .then((d: { logs?: Change[] }) => { if (alive) setChanges((d.logs || []).filter((c) => KEYS.includes(c.field))); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [productId]);

  const { rows, xDomain, domArs, domUsd, useArs, useUsd, hasHistory, hasInWindow } = useMemo(() => {
    const now = Date.now();
    const days = RANGES.find((r) => r.k === range)?.days ?? 90;
    const from = days ? now - days * DAY : -Infinity;

    const sets = SERIES.map((s) => {
      const bps = fieldBreakpoints(changes.filter((c) => c.field === s.key), current[s.key as keyof Current]);
      return { ...s, bps, pts: windowPoints(bps, from, now) };
    });
    const activeSets = sets.filter((s) => active[s.key]);
    const rows = unifiedSparse(activeSets.map((s) => ({ key: s.key, pts: s.pts })));

    const arsVals = activeSets.filter((s) => s.unit === "ars").flatMap((s) => s.pts.map((p) => p.v!));
    const usdVals = activeSets.filter((s) => s.unit === "usd").flatMap((s) => s.pts.map((p) => p.v!));
    return {
      rows,
      xDomain: (days ? [from, now] : ["dataMin", "dataMax"]) as [number | string, number | string],
      domArs: paddedDomain(arsVals), domUsd: paddedDomain(usdVals),
      useArs: arsVals.length > 0, useUsd: usdVals.length > 0,
      hasHistory: sets.some((s) => s.bps.length > 0),
      hasInWindow: activeSets.some((s) => s.pts.length > 0),
    };
  }, [changes, current, active, range]);

  const activeSeries = SERIES.filter((s) => active[s.key]);

  return (
    <div>
      {/* Rango temporal */}
      <div style={{ display: "flex", gap: 3, background: "var(--color-surface-2)", padding: 3, borderRadius: "var(--radius-pill)", marginBottom: 10, width: "fit-content" }}>
        {RANGES.map((r) => (
          <button key={r.k} onClick={() => setRange(r.k)} aria-pressed={range === r.k}
            style={{ padding: "4px 10px", borderRadius: "var(--radius-pill)", cursor: "pointer", fontSize: "0.6875rem", fontWeight: 600, border: "none",
              background: range === r.k ? "var(--color-surface)" : "transparent", color: range === r.k ? "var(--color-ink)" : "var(--color-subtle)",
              boxShadow: range === r.k ? "var(--shadow-card)" : "none" }}>
            {r.label}
          </button>
        ))}
      </div>

      {/* Toggles de precio */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        {SERIES.map((s) => {
          const on = active[s.key];
          const has = current[s.key as keyof Current] != null || changes.some((c) => c.field === s.key);
          return (
            <button key={s.key} onClick={() => setActive((a) => ({ ...a, [s.key]: !a[s.key] }))}
              aria-pressed={on} disabled={!has} title={has ? "" : "Sin dato para este precio"}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: "var(--radius-pill)",
                fontSize: "0.75rem", fontWeight: 600, cursor: has ? "pointer" : "not-allowed", opacity: has ? 1 : 0.45,
                border: `1px solid ${on ? s.color : "var(--color-border)"}`,
                background: on ? `color-mix(in srgb, ${s.color} 12%, var(--color-surface))` : "var(--color-surface)",
                color: on ? "var(--color-ink)" : "var(--color-muted)",
              }}>
              <span style={{ width: 9, height: 9, borderRadius: "50%", background: s.color }} />
              {s.label}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div style={{ height: 220, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.8125rem", color: "var(--color-subtle)" }}>Cargando historial…</div>
      ) : !hasHistory ? (
        <div style={{ height: 120, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", fontSize: "0.8125rem", color: "var(--color-subtle)", padding: "0 20px" }}>
          Todavía no hay historial de precios. Cada cambio que hagas a partir de ahora se irá registrando acá.
        </div>
      ) : activeSeries.length === 0 ? (
        <div style={{ height: 120, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.8125rem", color: "var(--color-subtle)" }}>Elegí al menos un precio para ver su evolución.</div>
      ) : !hasInWindow ? (
        <div style={{ height: 120, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.8125rem", color: "var(--color-subtle)" }}>Sin datos en este rango. Probá con una ventana más amplia.</div>
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={rows} margin={{ top: 10, right: 8, left: 4, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-divider)" vertical={false} />
            <XAxis dataKey="t" type="number" scale="time" domain={xDomain} tickFormatter={fmtDate}
              tick={{ fontSize: 11, fill: "var(--color-subtle)" }} tickLine={false} axisLine={{ stroke: "var(--color-border)" }} minTickGap={28} />
            {useArs && <YAxis yAxisId="ars" domain={domArs} tick={{ fontSize: 11, fill: "var(--color-subtle)" }} tickLine={false} axisLine={false} width={46} tickFormatter={arsShort} />}
            {useUsd && <YAxis yAxisId="usd" orientation="right" domain={domUsd} tick={{ fontSize: 11, fill: "var(--color-chart-2)" }} tickLine={false} axisLine={false} width={40} tickFormatter={(v) => `US$${v}`} />}
            <Tooltip content={<PriceTooltip />} cursor={{ stroke: "var(--color-faint)", strokeWidth: 1 }} />
            {activeSeries.map((s) => (
              <Line key={s.key} yAxisId={s.unit} type="monotone" dataKey={s.key} name={s.label}
                stroke={s.color} strokeWidth={2} dot={{ r: 2.5, fill: s.color, strokeWidth: 0 }} activeDot={{ r: 4 }} connectNulls isAnimationActive={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

type TipProps = { active?: boolean; label?: number; payload?: Array<{ dataKey: string; value: number; color: string; name: string }> };
function PriceTooltip({ active, label, payload }: TipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-control)", boxShadow: "var(--shadow-dropdown)", padding: "8px 12px" }}>
      <div style={{ fontSize: "0.75rem", color: "var(--color-subtle)", marginBottom: 4 }}>{label != null ? fmtDate(label) : ""}</div>
      {payload.map((p) => {
        const s = SERIES.find((x) => x.key === p.dataKey);
        return (
          <div key={p.dataKey} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.8125rem" }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: p.color }} />
            <span style={{ color: "var(--color-muted)" }}>{p.name}</span>
            <span style={{ marginLeft: "auto", fontWeight: 700, color: "var(--color-ink)", fontVariantNumeric: "tabular-nums" }}>
              {s?.unit === "usd" ? usdFull(p.value) : arsFull(p.value)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
