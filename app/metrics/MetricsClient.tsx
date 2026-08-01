"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";
import { PRESETS, PRESET_LABEL, type Preset, type Granularity, type SeriesPoint, type TopProduct, type SourceSlice, type Totals } from "@/lib/metrics";

// Paleta para el desglose por canal — el resto del sistema es mono-brand.
const BRAND = "var(--color-brand)";
const SOURCE_COLORS: Record<string, string> = { tiendanube: "#2563EB", local: "#8B5CF6" };
const SOURCE_LABEL: Record<string, string> = { tiendanube: "Tienda web", local: "Carga manual" };

const money = (n: number) => `$${Math.round(n).toLocaleString("es-AR")}`;
const num = (n: number) => n.toLocaleString("es-AR");
function moneyShort(n: number) {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${Math.round(n / 1_000)}k`;
  return `$${Math.round(n)}`;
}

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
function formatBucket(bucket: string, g: Granularity): string {
  if (g === "month") {
    const [y, m] = bucket.split("-").map(Number);
    return `${MONTHS[(m ?? 1) - 1]} ${String(y).slice(2)}`;
  }
  if (g === "week") {
    const w = bucket.split("-W")[1];
    return `sem ${w}`;
  }
  const [, m, d] = bucket.split("-").map(Number);
  return `${d} ${MONTHS[(m ?? 1) - 1]}`;
}

function delta(cur: number, prev: number): number | null {
  if (prev <= 0) return null;
  return Math.round(((cur - prev) / prev) * 1000) / 10;
}

const H2: React.CSSProperties = { fontSize: "0.6875rem", fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--color-subtle)", margin: "0 0 12px" };

export default function MetricsClient({
  preset, fromDay, toDay, granularity, current, previous, series, topProducts, bySource,
}: {
  preset: Preset; fromDay: string; toDay: string; granularity: Granularity;
  current: Totals; previous: Totals; series: SeriesPoint[]; topProducts: TopProduct[]; bySource: SourceSlice[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [metric, setMetric] = useState<"revenue" | "orders">("revenue");

  const applyPreset = useCallback((p: Preset) => {
    startTransition(() => router.push(`/metrics?range=${p}`));
  }, [router]);

  const applyCustom = useCallback((from: string, to: string) => {
    if (!from || !to) return;
    startTransition(() => router.push(`/metrics?range=custom&from=${from}&to=${to}`));
  }, [router]);

  const ticketCur = current.orders ? current.revenue / current.orders : 0;
  const ticketPrev = previous.orders ? previous.revenue / previous.orders : 0;

  const kpis = [
    { label: "Facturación", value: money(current.revenue), delta: delta(current.revenue, previous.revenue) },
    { label: "Pedidos", value: num(current.orders), delta: delta(current.orders, previous.orders) },
    { label: "Ticket promedio", value: money(ticketCur), delta: delta(ticketCur, ticketPrev) },
    { label: "Unidades vendidas", value: num(current.units), delta: delta(current.units, previous.units) },
  ];

  const chartData = useMemo(
    () => series.map((s) => ({ ...s, label: formatBucket(s.bucket, granularity) })),
    [series, granularity],
  );
  const sourceData = useMemo(
    () => bySource.filter((s) => s.revenue > 0).map((s) => ({ ...s, label: SOURCE_LABEL[s.source] ?? s.source })),
    [bySource],
  );

  const empty = current.orders === 0;

  return (
    <div style={{ padding: "48px 48px 80px", overflowY: "auto", height: "100dvh", opacity: pending ? 0.6 : 1, transition: "opacity 0.15s" }}>
      <div style={{ maxWidth: 980, margin: "0 auto" }}>

        {/* Header */}
        <div className="anim-up" style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 600, letterSpacing: "-0.02em", margin: 0, color: "var(--color-ink)", lineHeight: 1.1 }}>
            Métricas
          </h1>
          <p style={{ fontSize: "0.875rem", color: "var(--color-subtle)", margin: "6px 0 0" }}>
            Rendimiento de ventas · {PRESET_LABEL[preset]}
          </p>
        </div>

        {/* Filtros de fecha */}
        <div className="anim-up" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginBottom: 28 }}>
          {PRESETS.filter((p) => p !== "custom").map((p) => (
            <button
              key={p}
              onClick={() => applyPreset(p)}
              style={{
                padding: "7px 14px", borderRadius: "var(--radius-pill)", cursor: "pointer",
                fontSize: "0.8125rem", fontWeight: 600,
                border: "1px solid " + (preset === p ? "var(--color-brand)" : "var(--color-border)"),
                background: preset === p ? "var(--color-brand)" : "var(--color-surface)",
                color: preset === p ? "var(--color-brand-ink)" : "var(--color-muted)",
                transition: "all 0.12s",
              }}
            >
              {PRESET_LABEL[p]}
            </button>
          ))}
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: "auto" }}>
            <input
              type="date" defaultValue={fromDay} max={toDay}
              onChange={(e) => applyCustom(e.target.value, toDay)}
              aria-label="Desde"
              style={{ padding: "6px 10px", borderRadius: "var(--radius-input)", border: "1px solid " + (preset === "custom" ? "var(--color-brand)" : "var(--color-border)"), background: "var(--color-surface)", color: "var(--color-ink)", fontSize: "0.8125rem" }}
            />
            <span style={{ color: "var(--color-subtle)", fontSize: "0.8125rem" }}>→</span>
            <input
              type="date" defaultValue={toDay} min={fromDay}
              onChange={(e) => applyCustom(fromDay, e.target.value)}
              aria-label="Hasta"
              style={{ padding: "6px 10px", borderRadius: "var(--radius-input)", border: "1px solid " + (preset === "custom" ? "var(--color-brand)" : "var(--color-border)"), background: "var(--color-surface)", color: "var(--color-ink)", fontSize: "0.8125rem" }}
            />
          </div>
        </div>

        {/* KPIs */}
        <div className="anim-up delay-1" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12, marginBottom: 28 }}>
          {kpis.map((k) => (
            <div key={k.label} className="card" style={{ padding: "18px 20px" }}>
              <div style={{ fontSize: "0.8125rem", color: "var(--color-muted)", marginBottom: 6 }}>{k.label}</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: "1.5rem", fontWeight: 700, letterSpacing: "-0.03em", color: "var(--color-ink)", fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
                  {k.value}
                </span>
                {k.delta != null && (
                  <span style={{
                    fontSize: "0.8125rem", fontWeight: 600, fontVariantNumeric: "tabular-nums",
                    color: k.delta > 0 ? "var(--color-success)" : k.delta < 0 ? "var(--color-danger)" : "var(--color-subtle)",
                  }}>
                    {k.delta > 0 ? "▲" : k.delta < 0 ? "▼" : "→"} {Math.abs(k.delta)}%
                  </span>
                )}
              </div>
              <div style={{ fontSize: "0.6875rem", color: "var(--color-faint)", marginTop: 4 }}>vs. período anterior</div>
            </div>
          ))}
        </div>

        {empty ? (
          <div className="card anim-up delay-2" style={{ padding: "56px 24px", textAlign: "center" }}>
            <div style={{ fontSize: "0.9375rem", fontWeight: 600, color: "var(--color-ink)", marginBottom: 4 }}>Sin ventas en este período</div>
            <div style={{ fontSize: "0.8125rem", color: "var(--color-muted)" }}>Probá con un rango de fechas más amplio.</div>
          </div>
        ) : (
          <>
            {/* Serie temporal */}
            <div className="anim-up delay-2" style={{ marginBottom: 28 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <h2 style={{ ...H2, margin: 0 }}>Evolución</h2>
                <div style={{ display: "flex", gap: 4, background: "var(--color-surface-2)", padding: 3, borderRadius: "var(--radius-pill)" }}>
                  {(["revenue", "orders"] as const).map((m) => (
                    <button key={m} onClick={() => setMetric(m)}
                      style={{
                        padding: "5px 12px", borderRadius: "var(--radius-pill)", cursor: "pointer",
                        fontSize: "0.75rem", fontWeight: 600, border: "none",
                        background: metric === m ? "var(--color-surface)" : "transparent",
                        color: metric === m ? "var(--color-ink)" : "var(--color-subtle)",
                        boxShadow: metric === m ? "var(--shadow-card)" : "none",
                      }}>
                      {m === "revenue" ? "Facturación" : "Pedidos"}
                    </button>
                  ))}
                </div>
              </div>
              <div className="card" style={{ padding: "20px 16px 12px" }}>
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={chartData} margin={{ top: 4, right: 8, left: 4, bottom: 0 }}>
                    <defs>
                      <linearGradient id="fillRev" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={BRAND} stopOpacity={0.22} />
                        <stop offset="100%" stopColor={BRAND} stopOpacity={0.01} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-divider)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--color-subtle)" }} tickLine={false} axisLine={{ stroke: "var(--color-border)" }} minTickGap={16} />
                    <YAxis tick={{ fontSize: 11, fill: "var(--color-subtle)" }} tickLine={false} axisLine={false} width={48}
                      tickFormatter={(v) => (metric === "revenue" ? moneyShort(v) : num(v))} />
                    <Tooltip content={<ChartTooltip metric={metric} />} cursor={{ stroke: "var(--color-faint)", strokeWidth: 1 }} />
                    <Area type="monotone" dataKey={metric} stroke={BRAND} strokeWidth={2}
                      fill={metric === "revenue" ? "url(#fillRev)" : "none"}
                      dot={false} activeDot={{ r: 4, fill: BRAND }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Top productos + canal */}
            <div className="anim-up delay-3" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 18 }}>
              <div>
                <h2 style={H2}>Top productos (por facturación)</h2>
                <div className="card" style={{ padding: "16px 12px 8px" }}>
                  {topProducts.length === 0 ? (
                    <Empty />
                  ) : (
                    <ResponsiveContainer width="100%" height={Math.max(180, topProducts.length * 34)}>
                      <BarChart data={topProducts} layout="vertical" margin={{ top: 0, right: 12, left: 4, bottom: 0 }}>
                        <XAxis type="number" hide tickFormatter={moneyShort} />
                        <YAxis type="category" dataKey="name" width={140} tick={<TruncatedTick />} tickLine={false} axisLine={false} />
                        <Tooltip content={<ChartTooltip metric="revenue" nameKey="name" />} cursor={{ fill: "var(--color-surface-2)" }} />
                        <Bar dataKey="revenue" fill={BRAND} radius={[0, 5, 5, 0]} barSize={16} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

              <div>
                <h2 style={H2}>Por canal de venta</h2>
                <div className="card" style={{ padding: "16px", display: "flex", alignItems: "center", gap: 16, minHeight: 200 }}>
                  {sourceData.length === 0 ? (
                    <Empty />
                  ) : (
                    <>
                      <ResponsiveContainer width="50%" height={168}>
                        <PieChart>
                          <Pie data={sourceData} dataKey="revenue" nameKey="label" cx="50%" cy="50%" innerRadius={44} outerRadius={68} paddingAngle={2} strokeWidth={0}>
                            {sourceData.map((s) => <Cell key={s.source} fill={SOURCE_COLORS[s.source] ?? "var(--color-faint)"} />)}
                          </Pie>
                          <Tooltip content={<ChartTooltip metric="revenue" nameKey="label" />} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 12 }}>
                        {sourceData.map((s) => {
                          const totalRev = sourceData.reduce((a, b) => a + b.revenue, 0);
                          const pct = totalRev ? Math.round((s.revenue / totalRev) * 100) : 0;
                          return (
                            <div key={s.source} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span style={{ width: 10, height: 10, borderRadius: 3, background: SOURCE_COLORS[s.source] ?? "var(--color-faint)", flexShrink: 0 }} />
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--color-ink)" }}>{s.label} · {pct}%</div>
                                <div style={{ fontSize: "0.75rem", color: "var(--color-subtle)", fontVariantNumeric: "tabular-nums" }}>{money(s.revenue)} · {num(s.orders)} ped.</div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Empty() {
  return <div style={{ padding: "40px 12px", textAlign: "center", fontSize: "0.8125rem", color: "var(--color-subtle)", width: "100%" }}>Sin datos en este período.</div>;
}

// Eje Y de categorías: recorta nombres largos de producto.
function TruncatedTick({ x, y, payload }: { x?: number; y?: number; payload?: { value: string } }) {
  const label = payload?.value ?? "";
  const short = label.length > 20 ? label.slice(0, 19) + "…" : label;
  return (
    <text x={x} y={y} dy={4} textAnchor="end" fontSize={11} fill="var(--color-muted)">{short}</text>
  );
}

type TooltipProps = {
  active?: boolean;
  payload?: Array<{ payload: Record<string, unknown>; value: number }>;
  label?: string;
  metric: "revenue" | "orders";
  nameKey?: string;
};
function ChartTooltip({ active, payload, label, metric, nameKey }: TooltipProps) {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  const title = nameKey ? String(p.payload[nameKey] ?? "") : label;
  const val = metric === "revenue" ? money(Number(p.value)) : `${num(Number(p.value))} pedidos`;
  return (
    <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-control)", boxShadow: "var(--shadow-dropdown)", padding: "8px 12px" }}>
      <div style={{ fontSize: "0.75rem", color: "var(--color-subtle)", marginBottom: 2 }}>{title}</div>
      <div style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--color-ink)", fontVariantNumeric: "tabular-nums" }}>{val}</div>
    </div>
  );
}
