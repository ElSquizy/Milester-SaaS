/**
 * Reconstrucción de series de precios a partir del changelog, para los gráficos
 * de historial (catálogo) y de comparación (métricas).
 *
 * Modelo: el precio es una función escalonada. Cada cambio registra el valor que
 * pasó a tener (`newValue`) en su timestamp; `newValue = null` significa que el
 * precio se limpió (p. ej. se sacó la oferta) → la línea debe cortar ahí.
 */
export type Change = { field: string; oldValue: string | null; newValue: string | null; createdAt: string };
export type BP = { t: number; v: number | null };

const parseNum = (v: string | null): number | null => (v == null || v === "" || isNaN(Number(v)) ? null : Number(v));

/**
 * Breakpoints de UN campo. El "valor previo" al primer cambio se ancla 1 ms
 * antes (no en el mismo instante) para que la transición inicial se vea sin
 * colisionar con el primer valor nuevo. No se inventa historia hacia atrás.
 * Si `current` se pasa, extiende la última meseta hasta hoy (salvo que el último
 * valor sea null: ahí la línea termina en el momento en que se limpió).
 */
export function fieldBreakpoints(changes: Change[], current?: number | null): BP[] {
  const cs = changes.slice().sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
  if (!cs.length) return current != null ? [{ t: Date.now(), v: current }] : [];

  const bps: BP[] = [];
  const t0 = new Date(cs[0].createdAt).getTime();
  const old0 = parseNum(cs[0].oldValue);
  if (old0 != null) bps.push({ t: t0 - 1, v: old0 });
  for (const c of cs) bps.push({ t: new Date(c.createdAt).getTime(), v: parseNum(c.newValue) });

  const lastV = parseNum(cs[cs.length - 1].newValue);
  if (lastV != null) bps.push({ t: Date.now(), v: current !== undefined ? current : lastV });
  return bps;
}

/** Valor vigente en `t`: el último breakpoint con t ≤ pedido (puede ser null = sin dato/limpiado). */
export function valueAt(bps: BP[], t: number): number | null {
  let v: number | null = null;
  let found = false;
  for (const b of bps) { if (b.t <= t) { v = b.v; found = true; } else break; }
  return found ? v : null;
}

export const PRICE_FIELDS = ["price", "promotionalPrice", "costUsd", "costUsdPromo"] as const;
export type PriceField = (typeof PRICE_FIELDS)[number];

/** Variación porcentual from→to (null si no aplica: sin base, sin cambio, o algún null). */
export function pctChange(from: number | null, to: number | null): number | null {
  if (from == null || to == null || from <= 0 || from === to) return null;
  return Math.round(((to - from) / from) * 100);
}

export type Moment = {
  t: number;
  now?: boolean;                                                              // fila "Ahora"
  values: Record<string, number | null>;                                     // estado de los 4 precios
  changed: Record<string, { from: number | null; to: number | null; pct: number | null }>; // qué se movió + %
};

/**
 * "Planilla versionada": la fila "Ahora" (estado actual) arriba, y debajo un
 * momento por cada guardado de precios (cambios dentro de 60s = un mismo save),
 * lo más nuevo primero. Cada momento trae el estado completo de los 4 precios y
 * cuáles cambiaron con su %.
 */
export function priceMoments(changes: Change[], current: Record<string, number | null>): Moment[] {
  const bps: Record<string, BP[]> = {};
  for (const f of PRICE_FIELDS) bps[f] = fieldBreakpoints(changes.filter((c) => c.field === f));

  const priceChanges = changes
    .filter((c) => (PRICE_FIELDS as readonly string[]).includes(c.field))
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)); // desc

  const parse = (v: string | null) => (v == null || v === "" || isNaN(Number(v)) ? null : Number(v));
  const WINDOW = 60000;
  const moments: Moment[] = [];
  for (const c of priceChanges) {
    const t = new Date(c.createdAt).getTime();
    let m = moments[moments.length - 1];
    if (!m || Math.abs(m.t - t) > WINDOW) { m = { t, values: {}, changed: {} }; moments.push(m); }
    const from = parse(c.oldValue), to = parse(c.newValue);
    m.changed[c.field] = { from, to, pct: pctChange(from, to) };
  }
  for (const m of moments) for (const f of PRICE_FIELDS) m.values[f] = valueAt(bps[f], m.t);

  return [{ t: Date.now(), now: true, values: { ...current }, changed: {} }, ...moments];
}
