import { prisma } from "./prisma";
import { Prisma } from "@prisma/client";

/**
 * Capa de datos para el sistema de métricas (/metrics).
 *
 * Todo se calcula del lado del servidor con agregaciones (GROUP BY / aggregate),
 * nunca trayendo filas crudas — la base es Turso y ya tuvimos blowouts de quota
 * por escanear tablas de más. Las fechas se agrupan en horario de Argentina
 * (UTC-3): orderedAt se guarda en UTC (+00:00), así que restamos 3 horas antes
 * de tomar el día/semana/mes, si no las ventas de la noche caen en el día equivocado.
 */

export const PRESETS = ["7d", "30d", "90d", "month", "year", "custom"] as const;
export type Preset = (typeof PRESETS)[number];

export const PRESET_LABEL: Record<Preset, string> = {
  "7d": "Últimos 7 días",
  "30d": "Últimos 30 días",
  "90d": "Últimos 90 días",
  month: "Este mes",
  year: "Este año",
  custom: "Personalizado",
};

const AR_OFFSET_MS = 3 * 60 * 60 * 1000; // Argentina = UTC-3

/** Instante UTC que corresponde a la medianoche AR del día (y, m, d). */
function arMidnight(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m, d, 3, 0, 0)); // 00:00 AR == 03:00 UTC
}

/** Partes de calendario AR (año/mes/día) de un instante dado. */
function arParts(date: Date) {
  const shifted = new Date(date.getTime() - AR_OFFSET_MS);
  return { y: shifted.getUTCFullYear(), m: shifted.getUTCMonth(), d: shifted.getUTCDate() };
}

export type Granularity = "day" | "week" | "month";

export type ResolvedRange = {
  preset: Preset;
  from: Date;        // inclusivo
  to: Date;          // exclusivo
  prevFrom: Date;    // ventana anterior de igual duración (para deltas)
  prevTo: Date;
  granularity: Granularity;
  /** YYYY-MM-DD en AR, para prellenar los inputs del filtro personalizado. */
  fromDay: string;
  toDay: string;     // último día incluido (to - 1 día)
};

function ymd(date: Date): string {
  const { y, m, d } = arParts(date);
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Resuelve el preset (o rango custom) a instantes UTC + granularidad. */
export function resolveRange(preset: string | undefined, fromStr?: string, toStr?: string): ResolvedRange {
  const p: Preset = (PRESETS as readonly string[]).includes(preset || "") ? (preset as Preset) : "30d";
  const now = new Date();
  const { y, m, d } = arParts(now);

  let from: Date;
  let to: Date;

  if (p === "custom" && fromStr && toStr) {
    const [fy, fm, fd] = fromStr.split("-").map(Number);
    const [ty, tm, td] = toStr.split("-").map(Number);
    from = arMidnight(fy, fm - 1, fd);
    to = arMidnight(ty, tm - 1, td + 1); // inclusivo → sumamos un día para el límite exclusivo
  } else if (p === "month") {
    from = arMidnight(y, m, 1);
    to = arMidnight(y, m + 1, 1);
  } else if (p === "year") {
    from = arMidnight(y, 0, 1);
    to = arMidnight(y + 1, 0, 1);
  } else {
    const days = p === "7d" ? 7 : p === "90d" ? 90 : 30;
    to = arMidnight(y, m, d + 1);            // mañana AR (incluye el día de hoy completo)
    from = arMidnight(y, m, d - (days - 1)); // N días hacia atrás incluyendo hoy
  }

  // Guarda: si el custom viene al revés, lo damos vuelta.
  if (to.getTime() <= from.getTime()) {
    const tmp = from; from = to; to = new Date(tmp.getTime() + 24 * 60 * 60 * 1000);
  }

  const span = to.getTime() - from.getTime();
  const spanDays = span / (24 * 60 * 60 * 1000);
  const granularity: Granularity = spanDays <= 31 ? "day" : spanDays <= 180 ? "week" : "month";

  return {
    preset: p,
    from,
    to,
    prevFrom: new Date(from.getTime() - span),
    prevTo: from,
    granularity,
    fromDay: ymd(from),
    toDay: ymd(new Date(to.getTime() - 24 * 60 * 60 * 1000)),
  };
}

/** Fragmento SQL que agrupa orderedAt en el bucket AR según la granularidad. */
function bucketSql(g: Granularity): Prisma.Sql {
  if (g === "day") return Prisma.raw("date(orderedAt, '-3 hours')");
  if (g === "week") return Prisma.raw("strftime('%Y-W%W', orderedAt, '-3 hours')");
  return Prisma.raw("strftime('%Y-%m', orderedAt, '-3 hours')");
}

export type SeriesPoint = { bucket: string; revenue: number; orders: number };
export type TopProduct = { name: string; revenue: number; units: number };
export type SourceSlice = { source: string; revenue: number; orders: number };

export type Totals = { revenue: number; orders: number; units: number };

export type MetricsData = {
  range: ResolvedRange;
  current: Totals;
  previous: Totals;
  series: SeriesPoint[];
  topProducts: TopProduct[];
  bySource: SourceSlice[];
};

async function totals(from: Date, to: Date): Promise<Totals> {
  const [agg, unitsRow] = await Promise.all([
    prisma.order.aggregate({
      where: { status: { not: "cancelled" }, orderedAt: { gte: from, lt: to } },
      _sum: { total: true },
      _count: true,
    }),
    prisma.$queryRaw<Array<{ units: number | bigint }>>(Prisma.sql`
      SELECT CAST(COALESCE(SUM(oi.quantity), 0) AS INTEGER) AS units
      FROM "OrderItem" oi
      JOIN "Order" o ON o.id = oi.orderId
      WHERE o.status <> 'cancelled'
        AND datetime(o.orderedAt) >= datetime(${from.toISOString()})
        AND datetime(o.orderedAt) <  datetime(${to.toISOString()})`),
  ]);
  return {
    revenue: agg._sum.total ?? 0,
    orders: agg._count,
    units: Number(unitsRow[0]?.units ?? 0),
  };
}

/** Trae todo lo que la página de métricas necesita, en un puñado de queries agregadas. */
export async function getMetrics(range: ResolvedRange): Promise<MetricsData> {
  const { from, to, prevFrom, prevTo, granularity } = range;
  const fromIso = from.toISOString();
  const toIso = to.toISOString();
  const bucket = bucketSql(granularity);

  const [current, previous, seriesRaw, topRaw, bySourceRaw] = await Promise.all([
    totals(from, to),
    totals(prevFrom, prevTo),
    prisma.$queryRaw<Array<{ bucket: string; revenue: number; orders: number | bigint }>>(Prisma.sql`
      SELECT ${bucket} AS bucket,
             CAST(COALESCE(SUM(total), 0) AS REAL) AS revenue,
             COUNT(*) AS orders
      FROM "Order"
      WHERE status <> 'cancelled'
        AND datetime(orderedAt) >= datetime(${fromIso})
        AND datetime(orderedAt) <  datetime(${toIso})
      GROUP BY bucket
      ORDER BY bucket`),
    prisma.$queryRaw<Array<{ name: string; revenue: number; units: number | bigint }>>(Prisma.sql`
      SELECT oi.name AS name,
             CAST(COALESCE(SUM(oi.price * oi.quantity), 0) AS REAL) AS revenue,
             CAST(COALESCE(SUM(oi.quantity), 0) AS INTEGER) AS units
      FROM "OrderItem" oi
      JOIN "Order" o ON o.id = oi.orderId
      WHERE o.status <> 'cancelled'
        AND datetime(o.orderedAt) >= datetime(${fromIso})
        AND datetime(o.orderedAt) <  datetime(${toIso})
      GROUP BY oi.name
      ORDER BY revenue DESC
      LIMIT 8`),
    prisma.$queryRaw<Array<{ source: string; revenue: number; orders: number | bigint }>>(Prisma.sql`
      SELECT COALESCE(source, 'tiendanube') AS source,
             CAST(COALESCE(SUM(total), 0) AS REAL) AS revenue,
             COUNT(*) AS orders
      FROM "Order"
      WHERE status <> 'cancelled'
        AND datetime(orderedAt) >= datetime(${fromIso})
        AND datetime(orderedAt) <  datetime(${toIso})
      GROUP BY source`),
  ]);

  return {
    range,
    current,
    previous,
    series: seriesRaw.map((r) => ({ bucket: r.bucket, revenue: r.revenue, orders: Number(r.orders) })),
    topProducts: topRaw.map((r) => ({ name: r.name, revenue: r.revenue, units: Number(r.units) })),
    bySource: bySourceRaw.map((r) => ({ source: r.source, revenue: r.revenue, orders: Number(r.orders) })),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Fase 2 — Proyecciones e insights accionables
// ─────────────────────────────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;
const MONTH_NAMES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

export type Projection = {
  monthLabel: string;
  mtdRevenue: number;
  mtdOrders: number;
  daysElapsed: number;
  daysInMonth: number;
  projectedRevenue: number;
  projectedOrders: number;
  lastMonthRevenue: number;
  /** Proyección de cierre vs. total del mes anterior (%). null si no hay base. */
  deltaVsLastMonth: number | null;
  confidence: "alta" | "media" | "baja";
};

/**
 * Proyección de cierre del mes en curso por run-rate: extrapola lo facturado en
 * lo que va del mes al total de días. Es independiente del filtro de fechas —
 * siempre habla del mes actual. Con pocos días transcurridos la confianza es baja.
 */
export async function getProjection(): Promise<Projection> {
  const now = new Date();
  const { y, m } = arParts(now);
  const monthStart = arMidnight(y, m, 1);
  const monthEnd = arMidnight(y, m + 1, 1);
  const prevMonthStart = arMidnight(y, m - 1, 1);

  const [mtd, lastMonth] = await Promise.all([
    totals(monthStart, now),
    totals(prevMonthStart, monthStart),
  ]);

  const elapsed = Math.max((now.getTime() - monthStart.getTime()) / DAY_MS, 0.5);
  const daysInMonth = (monthEnd.getTime() - monthStart.getTime()) / DAY_MS;
  const factor = daysInMonth / elapsed;

  const projectedRevenue = mtd.revenue * factor;
  const projectedOrders = mtd.orders * factor;
  const deltaVsLastMonth = lastMonth.revenue > 0
    ? Math.round(((projectedRevenue - lastMonth.revenue) / lastMonth.revenue) * 1000) / 10
    : null;

  return {
    monthLabel: `${MONTH_NAMES[m]} ${y}`,
    mtdRevenue: mtd.revenue,
    mtdOrders: mtd.orders,
    daysElapsed: Math.round(elapsed * 10) / 10,
    daysInMonth,
    projectedRevenue,
    projectedOrders: Math.round(projectedOrders),
    lastMonthRevenue: lastMonth.revenue,
    deltaVsLastMonth,
    confidence: elapsed < 3 ? "baja" : elapsed < 10 ? "media" : "alta",
  };
}

export type PromoCandidate = { name: string; stock: number; price: number; frozenValue: number; lastSoldDays: number | null };
export type MovingProduct = { name: string; recent: number; prior: number; changePct: number | null };
export type WeekdayStat = { weekday: number; label: string; revenue: number; orders: number };

export type Insights = {
  /** Stock parado: candidatos naturales a una promo para liquidar. */
  promoCandidates: PromoCandidate[];
  /** Productos que se aceleran (últimos 30d vs. 30d previos). */
  risers: MovingProduct[];
  /** Productos que se enfrían — promo para reactivar. */
  fallers: MovingProduct[];
  /** Facturación promedio por día de semana (últimos 90d) + el más fuerte. */
  weekdays: WeekdayStat[];
  bestWeekday: WeekdayStat | null;
};

const WEEKDAY_LABEL = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

/**
 * Señales accionables derivadas de los datos existentes — la base para las
 * sugerencias de promos. Todo con reglas simples y explicables (nada de magia):
 * stock inmovilizado, productos que suben o bajan, y el día más fuerte.
 */
export async function getInsights(): Promise<Insights> {
  const now = new Date();
  const cut45 = new Date(now.getTime() - 45 * DAY_MS).toISOString();  // "estancado"
  const start60 = new Date(now.getTime() - 60 * DAY_MS).toISOString(); // ventana de tendencia
  const mid30 = new Date(now.getTime() - 30 * DAY_MS).toISOString();
  const from90 = new Date(now.getTime() - 90 * DAY_MS).toISOString();

  const [promoRaw, moversRaw, weekdayRaw] = await Promise.all([
    // Stock con capital inmovilizado y sin ventas recientes.
    prisma.$queryRaw<Array<{ name: string; stock: number; price: number; lastSoldAt: string | null }>>(Prisma.sql`
      SELECT name, stock, price, lastSoldAt
      FROM "Product"
      WHERE published = 1 AND infiniteStock = 0 AND stock > 0
        AND (lastSoldAt IS NULL OR datetime(lastSoldAt) < datetime(${cut45}))
      ORDER BY stock * price DESC
      LIMIT 6`),
    // Unidades por producto en dos ventanas de 30 días consecutivas.
    prisma.$queryRaw<Array<{ name: string; recent: number | bigint; prior: number | bigint }>>(Prisma.sql`
      SELECT oi.name AS name,
             CAST(SUM(CASE WHEN datetime(o.orderedAt) >= datetime(${mid30}) THEN oi.quantity ELSE 0 END) AS INTEGER) AS recent,
             CAST(SUM(CASE WHEN datetime(o.orderedAt) <  datetime(${mid30}) THEN oi.quantity ELSE 0 END) AS INTEGER) AS prior
      FROM "OrderItem" oi
      JOIN "Order" o ON o.id = oi.orderId
      WHERE o.status <> 'cancelled'
        AND datetime(o.orderedAt) >= datetime(${start60})
      GROUP BY oi.name
      HAVING recent + prior > 0`),
    // Facturación por día de semana (0=domingo) en los últimos 90 días.
    prisma.$queryRaw<Array<{ wd: string; revenue: number; orders: number | bigint }>>(Prisma.sql`
      SELECT strftime('%w', orderedAt, '-3 hours') AS wd,
             CAST(COALESCE(SUM(total), 0) AS REAL) AS revenue,
             COUNT(*) AS orders
      FROM "Order"
      WHERE status <> 'cancelled'
        AND datetime(orderedAt) >= datetime(${from90})
      GROUP BY wd`),
  ]);

  const promoCandidates: PromoCandidate[] = promoRaw.map((p) => ({
    name: p.name,
    stock: p.stock,
    price: p.price,
    frozenValue: Math.round(p.stock * p.price),
    lastSoldDays: p.lastSoldAt ? Math.round((now.getTime() - new Date(p.lastSoldAt).getTime()) / DAY_MS) : null,
  }));

  const movers: MovingProduct[] = moversRaw.map((r) => {
    const recent = Number(r.recent), prior = Number(r.prior);
    return { name: r.name, recent, prior, changePct: prior > 0 ? Math.round(((recent - prior) / prior) * 1000) / 10 : null };
  });
  // Suben: crecen respecto a la ventana previa (con base mínima para evitar ruido).
  const risers = movers
    .filter((m) => m.prior >= 2 && m.recent > m.prior)
    .sort((a, b) => (b.changePct ?? 0) - (a.changePct ?? 0))
    .slice(0, 5);
  // Bajan: vendían y cayeron fuerte (o se apagaron).
  const fallers = movers
    .filter((m) => m.prior >= 3 && m.recent < m.prior)
    .sort((a, b) => (a.changePct ?? 0) - (b.changePct ?? 0))
    .slice(0, 5);

  const weekdays: WeekdayStat[] = Array.from({ length: 7 }, (_, i) => {
    const row = weekdayRaw.find((w) => Number(w.wd) === i);
    return { weekday: i, label: WEEKDAY_LABEL[i], revenue: row ? row.revenue : 0, orders: row ? Number(row.orders) : 0 };
  });
  const bestWeekday = weekdays.reduce<WeekdayStat | null>((best, w) => (!best || w.revenue > best.revenue ? w : best), null);

  return { promoCandidates, risers, fallers, weekdays, bestWeekday: bestWeekday && bestWeekday.revenue > 0 ? bestWeekday : null };
}
