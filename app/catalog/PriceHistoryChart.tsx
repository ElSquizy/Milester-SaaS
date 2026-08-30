"use client";
import { useEffect, useMemo, useState } from "react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { fieldBreakpoints, unifiedRows, type Change } from "@/lib/priceSeries";

type Current = { price: number; promotionalPrice: number | null; costUsd: number | null; costUsdPromo: number | null };

const SERIES = [
  { key: "price", label: "Base", color: "var(--color-chart-1)", unit: "ars" as const },
  { key: "promotionalPrice", label: "Promo", color: "var(--color-success)", unit: "ars" as const },
  { key: "costUsd", label: "Costo USD", color: "var(--color-chart-2)", unit: "usd" as const },
  { key: "costUsdPromo", label: "Costo promo USD", color: "var(--color-chart-3)", unit: "usd" as const },
];
const KEYS = SERIES.map((s) => s.key);
const arsShort = (n: number) => (Math.abs(n) >= 1000 ? `$${Math.round(n / 1000)}k` : `$${Math.round(n)}`);
const arsFull = (n: number) => `$${Math.round(n).toLocaleString("es-AR")}`;
const usdFull = (n: number) => `US$${n.toLocaleString("es-AR")}`;
const fmtDate = (t: number) => new Date(t).toLocaleDateString("es-AR", { day: "numeric", month: "short" });

export default function PriceHistoryChart({ productId, current }: { productId: number; current: Current }) {
  const [changes, setChanges] = useState<Change[]>([]);
  const [loading, setLoading] = useState(true);
  // Default: promo si tiene, si no base.
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

  // Reconstruye la trayectoria de cada precio (escalonada) sobre un eje temporal
  // unificado; los campos sin historial muestran solo el punto de hoy.
  const { rows, hasAny } = useMemo(() => {
    const sets = SERIES.map((s) => ({ key: s.key, bps: fieldBreakpoints(changes.filter((c) => c.field === s.key), current[s.key as keyof Current]) }));
    return { rows: unifiedRows(sets), hasAny: sets.some((s) => s.bps.length > 0) };
  }, [changes, current]);

  const activeSeries = SERIES.filter((s) => active[s.key]);
  const useArs = activeSeries.some((s) => s.unit === "ars");
  const useUsd = activeSeries.some((s) => s.unit === "usd");

  return (
    <div>
      {/* Toggles */}
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
        <div style={{ height: 200, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.8125rem", color: "var(--color-subtle)" }}>Cargando historial…</div>
      ) : !hasAny ? (
        <div style={{ height: 120, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", fontSize: "0.8125rem", color: "var(--color-subtle)", padding: "0 20px" }}>
          Todavía no hay historial de precios. Cada cambio que hagas a partir de ahora se irá registrando acá.
        </div>
      ) : activeSeries.length === 0 ? (
        <div style={{ height: 120, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.8125rem", color: "var(--color-subtle)" }}>Elegí al menos un precio para ver su evolución.</div>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={rows} margin={{ top: 6, right: 8, left: 4, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-divider)" vertical={false} />
            <XAxis dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]}
              tickFormatter={fmtDate} tick={{ fontSize: 11, fill: "var(--color-subtle)" }} tickLine={false} axisLine={{ stroke: "var(--color-border)" }} minTickGap={28} />
            {useArs && <YAxis yAxisId="ars" tick={{ fontSize: 11, fill: "var(--color-subtle)" }} tickLine={false} axisLine={false} width={46} tickFormatter={arsShort} />}
            {useUsd && <YAxis yAxisId="usd" orientation="right" tick={{ fontSize: 11, fill: "var(--color-chart-2)" }} tickLine={false} axisLine={false} width={40} tickFormatter={(v) => `US$${v}`} />}
            <Tooltip content={<PriceTooltip />} />
            {activeSeries.map((s) => (
              <Line key={s.key} yAxisId={s.unit} type="stepAfter" dataKey={s.key} name={s.label}
                stroke={s.color} strokeWidth={2} dot={{ r: 2, fill: s.color }} activeDot={{ r: 4 }} connectNulls={false} isAnimationActive={false} />
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
