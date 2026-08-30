"use client";

import { useCallback, useMemo, useState, useTransition, Fragment } from "react";
import { useRouter } from "next/navigation";
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";
import { PRESETS, PRESET_LABEL, type Preset, type Granularity, type SeriesPoint, type TopProduct, type SourceSlice, type Totals, type Projection, type Insights, type Breakdowns, type BucketRow, type HeatCell, type FunnelData, type CampaignEffect } from "@/lib/metrics";

// Paleta para el desglose por canal — el resto del sistema es mono-brand.
const BRAND = "var(--color-brand)";
const SOURCE_COLORS: Record<string, string> = { tiendanube: "var(--color-chart-1)", local: "var(--color-chart-2)" };
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

// Título de sección: sentence-case, tamaño real e ink — no un eyebrow mayúsculas.
// A 17px/600 se ubica por encima de los títulos de tarjeta (15px) que contiene.
const H2: React.CSSProperties = { fontSize: "1.0625rem", fontWeight: 600, letterSpacing: "-0.01em", color: "var(--color-ink)", margin: "0 0 14px" };

export default function MetricsClient({
  preset, fromDay, toDay, granularity, current, previous, series, topProducts, bySource, projection, insights, breakdowns, heatmap, funnel, campaignEffects,
}: {
  preset: Preset; fromDay: string; toDay: string; granularity: Granularity;
  current: Totals; previous: Totals; series: SeriesPoint[]; topProducts: TopProduct[]; bySource: SourceSlice[];
  projection: Projection; insights: Insights; breakdowns: Breakdowns;
  heatmap: HeatCell[]; funnel: FunnelData; campaignEffects: CampaignEffect[];
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
    <div className="page-scroll" style={{ opacity: pending ? 0.6 : 1, transition: "opacity 0.15s" }}>
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
              <div style={{ fontSize: "0.6875rem", color: "var(--color-subtle)", marginTop: 4 }}>vs. período anterior</div>
            </div>
          ))}
        </div>

        {/* Proyección de cierre de mes (independiente del filtro) */}
        <ProjectionCard p={projection} />

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

            {/* Retención + plataforma/tipo/colección (Fase 3) */}
            <BreakdownsSection breakdowns={breakdowns} />

            {/* Cuándo se vende + embudo (Fase 4) */}
            <HeatmapSection cells={heatmap} />
            <FunnelSection funnel={funnel} />
          </>
        )}

        {/* Efectividad de campañas (Fase 4) — independiente del rango */}
        <CampaignEffectSection effects={campaignEffects} />

        {/* Insights y sugerencias de promos (Fase 2) */}
        <InsightsSection insights={insights} />
      </div>
    </div>
  );
}

function ProjectionCard({ p }: { p: Projection }) {
  const confColor = p.confidence === "alta" ? "var(--color-success)" : p.confidence === "media" ? "var(--color-warning)" : "var(--color-subtle)";
  const pct = Math.min(100, Math.round((p.daysElapsed / p.daysInMonth) * 100));
  return (
    <div className="anim-up delay-1" style={{ marginBottom: 28 }}>
      <h2 style={H2}>Proyección de cierre — {p.monthLabel}</h2>
      <div className="card" style={{ padding: "20px 22px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 20, alignItems: "center" }}>
        <div>
          <div style={{ fontSize: "0.8125rem", color: "var(--color-muted)", marginBottom: 6 }}>Facturación proyectada</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: "1.75rem", fontWeight: 700, letterSpacing: "-0.03em", color: "var(--color-ink)", fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
              {money(p.projectedRevenue)}
            </span>
            {p.deltaVsLastMonth != null && (
              <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: p.deltaVsLastMonth > 0 ? "var(--color-success)" : p.deltaVsLastMonth < 0 ? "var(--color-danger)" : "var(--color-subtle)" }}>
                {p.deltaVsLastMonth > 0 ? "▲" : p.deltaVsLastMonth < 0 ? "▼" : "→"} {Math.abs(p.deltaVsLastMonth)}% vs. mes pasado
              </span>
            )}
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--color-subtle)", marginTop: 6 }}>
            ~{num(p.projectedOrders)} pedidos · confianza <span style={{ color: confColor, fontWeight: 600 }}>{p.confidence}</span>
          </div>
        </div>
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", color: "var(--color-subtle)", marginBottom: 6 }}>
            <span>Va {money(p.mtdRevenue)} · {num(p.mtdOrders)} ped.</span>
            <span style={{ fontVariantNumeric: "tabular-nums" }}>día {Math.max(1, Math.ceil(p.daysElapsed))}/{p.daysInMonth}</span>
          </div>
          <div style={{ height: 8, borderRadius: 999, background: "var(--color-surface-2)", overflow: "hidden" }}>
            <div style={{ width: `${pct}%`, height: "100%", background: "var(--color-brand)", borderRadius: 999 }} />
          </div>
          <div style={{ fontSize: "0.6875rem", color: "var(--color-subtle)", marginTop: 6 }}>
            Estimado por ritmo de venta del mes. {p.confidence === "baja" && "Con pocos días transcurridos es solo orientativo."}
          </div>
        </div>
      </div>
    </div>
  );
}

const PLAT_COLOR: Record<string, string> = { PS5: "var(--color-chart-1)", PS4: "var(--color-chart-2)", Otro: "var(--color-faint)" };

function BreakdownsSection({ breakdowns }: { breakdowns: Breakdowns }) {
  const { retention, platforms, types, categories } = breakdowns;
  const totalCust = retention.newCustomers + retention.returningCustomers;
  const retPct = totalCust ? Math.round((retention.returningCustomers / totalCust) * 100) : 0;

  return (
    <div className="anim-up delay-3" style={{ marginTop: 40 }}>
      <h2 style={H2}>Clientes y catálogo</h2>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 18 }}>
        {/* Retención: nuevos vs recurrentes */}
        <div className="card" style={{ padding: "18px 20px" }}>
          <div style={{ fontSize: "0.9375rem", fontWeight: 600, color: "var(--color-ink)", marginBottom: 3 }}>Nuevos vs. recurrentes</div>
          <div style={{ fontSize: "0.75rem", color: "var(--color-subtle)", marginBottom: 14 }}>Clientes que compraron en el período.</div>
          {totalCust === 0 ? <div style={{ fontSize: "0.8125rem", color: "var(--color-subtle)" }}>Sin clientes en el período.</div> : (
            <>
              <div style={{ display: "flex", height: 10, borderRadius: 999, overflow: "hidden", marginBottom: 12 }}>
                <div style={{ width: `${100 - retPct}%`, background: "var(--color-info)" }} />
                <div style={{ width: `${retPct}%`, background: "var(--color-success)" }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <Legend color="var(--color-info)" label="Nuevos" value={num(retention.newCustomers)} />
                <Legend color="var(--color-success)" label={`Recurrentes · ${retPct}%`} value={num(retention.returningCustomers)} right />
              </div>
            </>
          )}
        </div>

        {/* Plataforma */}
        <BreakdownBars title="Por plataforma" hint="Facturación por consola (PS5 / PS4)." rows={platforms} colorOf={(k) => PLAT_COLOR[k] ?? "var(--color-brand)"} />

        {/* Tipo de cuenta */}
        <BreakdownBars title="Por tipo" hint="Primaria vs. secundaria (según el nombre del producto)." rows={types} colorOf={(k) => (k === "Secundaria" ? "var(--color-chart-2)" : k === "Primaria" ? "var(--color-chart-1)" : "var(--color-faint)")} />

        {/* Colección */}
        <BreakdownBars title="Por colección" hint="Top colecciones por facturación (colección principal del producto)." rows={categories} colorOf={() => "var(--color-brand)"} />
      </div>
    </div>
  );
}

function Legend({ color, label, value, right }: { color: string; label: string; value: string; right?: boolean }) {
  return (
    <div style={{ textAlign: right ? "right" : "left" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: right ? "flex-end" : "flex-start" }}>
        <span style={{ width: 9, height: 9, borderRadius: 3, background: color }} />
        <span style={{ fontSize: "0.75rem", color: "var(--color-subtle)" }}>{label}</span>
      </div>
      <div style={{ fontSize: "1.125rem", fontWeight: 700, color: "var(--color-ink)", fontVariantNumeric: "tabular-nums", marginTop: 2 }}>{value}</div>
    </div>
  );
}

function BreakdownBars({ title, hint, rows, colorOf }: { title: string; hint: string; rows: BucketRow[]; colorOf: (k: string) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.revenue));
  return (
    <div className="card" style={{ padding: "18px 20px" }}>
      <div style={{ fontSize: "0.9375rem", fontWeight: 600, color: "var(--color-ink)", marginBottom: 3 }}>{title}</div>
      <div style={{ fontSize: "0.75rem", color: "var(--color-subtle)", marginBottom: 14, lineHeight: 1.4 }}>{hint}</div>
      {rows.length === 0 ? (
        <div style={{ fontSize: "0.8125rem", color: "var(--color-subtle)" }}>Sin datos en el período.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          {rows.map((r) => (
            <div key={r.key}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 3 }}>
                <span style={{ fontSize: "0.8125rem", color: "var(--color-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.key}</span>
                <span style={{ fontSize: "0.75rem", color: "var(--color-muted)", fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>{money(r.revenue)} · {num(r.units)}u</span>
              </div>
              <div style={{ height: 7, borderRadius: 999, background: "var(--color-surface-2)", overflow: "hidden" }}>
                <div style={{ width: `${Math.round((r.revenue / max) * 100)}%`, height: "100%", borderRadius: 999, background: colorOf(r.key) }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const WD_SHORT = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

function HeatmapSection({ cells }: { cells: HeatCell[] }) {
  const byKey = new Map(cells.map((c) => [`${c.weekday}:${c.hour}`, c]));
  const max = Math.max(1, ...cells.map((c) => c.orders));
  const total = cells.reduce((s, c) => s + c.orders, 0);
  if (total === 0) return null;
  // Horas con actividad para no dibujar 24 columnas muertas: min..max hora con ventas.
  const hoursWithData = cells.filter((c) => c.orders > 0).map((c) => c.hour);
  const minH = Math.min(...hoursWithData), maxH = Math.max(...hoursWithData);
  const hours = Array.from({ length: maxH - minH + 1 }, (_, i) => minH + i);

  return (
    <div className="anim-up delay-3" style={{ marginTop: 40 }}>
      <h2 style={H2}>Cuándo se vende · día × hora</h2>
      <div className="card" style={{ padding: "16px 18px", overflowX: "auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: `34px repeat(${hours.length}, 1fr)`, gap: 2, minWidth: hours.length * 22 + 34 }}>
          <div />
          {hours.map((h) => <div key={h} style={{ fontSize: "0.5625rem", color: "var(--color-subtle)", textAlign: "center", fontVariantNumeric: "tabular-nums" }}>{h}</div>)}
          {[1, 2, 3, 4, 5, 6, 0].map((wd) => (
            <Fragment key={wd}>
              <div style={{ fontSize: "0.625rem", color: "var(--color-subtle)", display: "flex", alignItems: "center" }}>{WD_SHORT[wd]}</div>
              {hours.map((h) => {
                const cell = byKey.get(`${wd}:${h}`);
                const o = cell?.orders ?? 0;
                const a = o === 0 ? 0 : 0.12 + 0.88 * (o / max);
                return (
                  <div key={h} title={`${WD_SHORT[wd]} ${h}:00 · ${num(o)} ventas · ${money(cell?.revenue ?? 0)}`}
                    style={{ aspectRatio: "1", minWidth: 18, borderRadius: 3, background: o === 0 ? "var(--color-surface-2)" : `color-mix(in srgb, var(--color-brand) ${Math.round(a * 100)}%, transparent)` }} />
                );
              })}
            </Fragment>
          ))}
        </div>
        <div style={{ fontSize: "0.6875rem", color: "var(--color-subtle)", marginTop: 10 }}>Intensidad = cantidad de ventas (horario AR). Pasá el cursor para ver el detalle.</div>
      </div>
    </div>
  );
}

const STATUS_LABEL: Record<string, string> = { open: "Abiertas", closed: "Cerradas", cancelled: "Canceladas" };
const STATUS_COLOR: Record<string, string> = { open: "var(--color-warning)", closed: "var(--color-success)", cancelled: "var(--color-danger)" };

function FunnelSection({ funnel }: { funnel: FunnelData }) {
  if (funnel.total === 0) return null;
  return (
    <div className="anim-up delay-3" style={{ marginTop: 28 }}>
      <h2 style={H2}>Estados y cancelación</h2>
      <div className="card" style={{ padding: "18px 20px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 20, alignItems: "center" }}>
        <div>
          <div style={{ fontSize: "0.8125rem", color: "var(--color-muted)", marginBottom: 6 }}>Tasa de cancelación</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span style={{ fontSize: "1.75rem", fontWeight: 700, color: funnel.cancelledPct > 15 ? "var(--color-danger)" : "var(--color-ink)", letterSpacing: "-0.03em", fontVariantNumeric: "tabular-nums" }}>{funnel.cancelledPct}%</span>
            <span style={{ fontSize: "0.8125rem", color: "var(--color-subtle)" }}>{num(funnel.cancelled)} de {num(funnel.total)} pedidos</span>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {funnel.byStatus.map((s) => {
            const pct = funnel.total ? Math.round((s.count / funnel.total) * 100) : 0;
            return (
              <div key={s.status}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", marginBottom: 3 }}>
                  <span style={{ color: "var(--color-ink)" }}>{STATUS_LABEL[s.status] ?? s.status}</span>
                  <span style={{ color: "var(--color-muted)", fontVariantNumeric: "tabular-nums" }}>{num(s.count)} · {pct}%</span>
                </div>
                <div style={{ height: 7, borderRadius: 999, background: "var(--color-surface-2)", overflow: "hidden" }}>
                  <div style={{ width: `${pct}%`, height: "100%", borderRadius: 999, background: STATUS_COLOR[s.status] ?? "var(--color-faint)" }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function CampaignEffectSection({ effects }: { effects: CampaignEffect[] }) {
  if (effects.length === 0) return null;
  const fmt = (iso: string) => new Date(iso).toLocaleDateString("es-AR", { day: "numeric", month: "short" });
  return (
    <div className="anim-up delay-3" style={{ marginTop: 40 }}>
      <h2 style={{ ...H2, marginBottom: 4 }}>Efectividad de campañas</h2>
      <p style={{ fontSize: "0.8125rem", color: "var(--color-subtle)", margin: "0 0 16px" }}>
        Facturación durante la campaña vs. una ventana de igual duración justo antes.
      </p>
      <div className="card" style={{ overflow: "hidden", padding: 0 }}>
        {effects.map((e, i) => (
          <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 18px", borderTop: i > 0 ? "1px solid var(--color-divider)" : "none", flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 160 }}>
              <div style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--color-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {e.name} {e.active && <span className="pill pill-info" style={{ fontSize: "0.5625rem", marginLeft: 4, verticalAlign: "middle" }}>ACTIVA</span>}
              </div>
              <div style={{ fontSize: "0.6875rem", color: "var(--color-subtle)" }}>{fmt(e.from)} → {e.active ? "en curso" : fmt(e.to)}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--color-ink)", fontVariantNumeric: "tabular-nums" }}>{money(e.revenueDuring)}</div>
              <div style={{ fontSize: "0.6875rem", color: "var(--color-subtle)" }}>durante · {num(e.ordersDuring)} ped.</div>
            </div>
            <div style={{ width: 92, textAlign: "right" }}>
              {e.liftPct == null
                ? <span style={{ fontSize: "0.75rem", color: "var(--color-subtle)" }}>sin base</span>
                : <span style={{ fontSize: "0.9375rem", fontWeight: 700, fontVariantNumeric: "tabular-nums", color: e.liftPct > 0 ? "var(--color-success)" : e.liftPct < 0 ? "var(--color-danger)" : "var(--color-subtle)" }}>
                    {e.liftPct > 0 ? "▲" : e.liftPct < 0 ? "▼" : "→"} {Math.abs(e.liftPct)}%
                  </span>}
              <div style={{ fontSize: "0.625rem", color: "var(--color-subtle)" }}>vs. antes</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function InsightsSection({ insights }: { insights: Insights }) {
  const { promoCandidates, risers, fallers, weekdays, bestWeekday } = insights;
  const maxWd = Math.max(1, ...weekdays.map((w) => w.revenue));
  const nothing = promoCandidates.length === 0 && risers.length === 0 && fallers.length === 0 && !bestWeekday;
  if (nothing) return null;

  return (
    <div className="anim-up delay-3" style={{ marginTop: 40 }}>
      <h2 style={{ ...H2, marginBottom: 4 }}>Sugerencias</h2>
      <p style={{ fontSize: "0.8125rem", color: "var(--color-subtle)", margin: "0 0 16px" }}>
        Señales de los últimos 30–90 días para decidir promos y reposición.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 18 }}>

        {/* Candidatos a promo */}
        {promoCandidates.length > 0 && (
          <InsightCard
            title="Candidatos a promo"
            hint="Stock con capital inmovilizado y sin ventas hace 45+ días."
          >
            {promoCandidates.map((p, i) => (
              <Row key={i}
                name={p.name}
                sub={`${num(p.stock)} u. · ${p.lastSoldDays == null ? "nunca vendido" : `hace ${p.lastSoldDays} d`}`}
                right={money(p.frozenValue)} rightSub="inmovilizado" tone="warning" />
            ))}
          </InsightCard>
        )}

        {/* En baja — reactivar */}
        {fallers.length > 0 && (
          <InsightCard title="Se están enfriando" hint="Cayeron vs. los 30 días previos — una promo puede reactivarlos.">
            {fallers.map((m, i) => (
              <Row key={i} name={m.name} sub={`${num(m.prior)} → ${num(m.recent)} u.`}
                right={m.changePct == null ? "—" : `${m.changePct}%`} rightSub="30d" tone="danger" />
            ))}
          </InsightCard>
        )}

        {/* En alza — asegurar stock */}
        {risers.length > 0 && (
          <InsightCard title="Vienen creciendo" hint="Suben vs. los 30 días previos — asegurá stock.">
            {risers.map((m, i) => (
              <Row key={i} name={m.name} sub={`${num(m.prior)} → ${num(m.recent)} u.`}
                right={m.changePct == null ? "▲" : `+${m.changePct}%`} rightSub="30d" tone="success" />
            ))}
          </InsightCard>
        )}

        {/* Mejor día */}
        {bestWeekday && (
          <InsightCard title="Día más fuerte" hint={`Facturación por día de semana (últimos 90 días). ${bestWeekday.label} es el mejor: buen momento para lanzar promos.`}>
            <div style={{ display: "flex", flexDirection: "column", gap: 7, padding: "4px 2px" }}>
              {weekdays.map((w) => (
                <div key={w.weekday} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 34, fontSize: "0.6875rem", color: "var(--color-subtle)", flexShrink: 0 }}>{w.label.slice(0, 3)}</span>
                  <div style={{ flex: 1, height: 8, background: "var(--color-surface-2)", borderRadius: 999, overflow: "hidden" }}>
                    <div style={{ width: `${Math.round((w.revenue / maxWd) * 100)}%`, height: "100%", borderRadius: 999, background: w.weekday === bestWeekday.weekday ? "var(--color-brand)" : "var(--color-faint)" }} />
                  </div>
                  <span style={{ width: 52, textAlign: "right", fontSize: "0.6875rem", color: "var(--color-muted)", fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>{moneyShort(w.revenue)}</span>
                </div>
              ))}
            </div>
          </InsightCard>
        )}
      </div>
    </div>
  );
}

function InsightCard({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="card" style={{ padding: "18px 20px" }}>
      <div style={{ fontSize: "0.9375rem", fontWeight: 600, color: "var(--color-ink)", marginBottom: 3 }}>{title}</div>
      <div style={{ fontSize: "0.75rem", color: "var(--color-subtle)", marginBottom: 14, lineHeight: 1.4 }}>{hint}</div>
      <div style={{ display: "flex", flexDirection: "column" }}>{children}</div>
    </div>
  );
}

function Row({ name, sub, right, rightSub, tone }: { name: string; sub: string; right: string; rightSub: string; tone: "success" | "danger" | "warning" }) {
  const color = tone === "success" ? "var(--color-success)" : tone === "danger" ? "var(--color-danger)" : "var(--color-warning)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: "1px solid var(--color-divider)" }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: "0.8125rem", fontWeight: 500, color: "var(--color-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</div>
        <div style={{ fontSize: "0.6875rem", color: "var(--color-subtle)", marginTop: 1, fontVariantNumeric: "tabular-nums" }}>{sub}</div>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div style={{ fontSize: "0.8125rem", fontWeight: 700, color, fontVariantNumeric: "tabular-nums" }}>{right}</div>
        <div style={{ fontSize: "0.625rem", color: "var(--color-subtle)" }}>{rightSub}</div>
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
