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
