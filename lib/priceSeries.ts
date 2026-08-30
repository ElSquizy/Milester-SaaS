/**
 * Reconstrucción del historial de precios a partir del changelog, para la tabla
 * "planilla versionada" (catálogo + editor avanzado).
 *
 * El changelog es ruidoso: procesos automáticos (campañas, módulo de precios,
 * re-sync) registran cambios redundantes, `oldValue` desactualizados y
 * oscilaciones de milisegundos (None→X→None→Y). Por eso NO se lee crudo: se
 * mantiene un estado corriente del valor real y se muestra un momento solo
 * cuando el precio cambia de verdad (cambio neto por guardado).
 */
export type Change = { field: string; oldValue: string | null; newValue: string | null; createdAt: string };

export const PRICE_FIELDS = ["price", "promotionalPrice", "costUsd", "costUsdPromo"] as const;
export type PriceField = (typeof PRICE_FIELDS)[number];

const parse = (v: string | null): number | null => (v == null || v === "" || isNaN(Number(v)) ? null : Number(v));

/** Variación porcentual from→to (null si no aplica: sin base, sin cambio, o algún null). */
export function pctChange(from: number | null, to: number | null): number | null {
  if (from == null || to == null || from <= 0 || from === to) return null;
  return Math.round(((to - from) / from) * 100);
}

export type Moment = {
  t: number;
  now?: boolean;                                                              // fila "Ahora"
  values: Record<string, number | null>;                                     // estado real de los 4 precios en ese momento
  changed: Record<string, { from: number | null; to: number | null; pct: number | null }>; // qué cambió (neto) + %
};

const WINDOW = 60000; // cambios encadenados dentro de 60s = un mismo guardado

/**
 * Momentos de precio (lo más nuevo primero), con la fila "Ahora" arriba.
 * Cada momento = un guardado donde AL MENOS un precio cambió de verdad; los
 * valores neteados por guardado, sin duplicados ni oscilaciones intermedias.
 */
export function priceMoments(changes: Change[], current: Record<string, number | null>): Moment[] {
  const asc = changes
    .filter((c) => (PRICE_FIELDS as readonly string[]).includes(c.field))
    .map((c) => ({ ...c, t: new Date(c.createdAt).getTime() }))
    .sort((a, b) => a.t - b.t);

  // Estado corriente del valor REAL de cada campo, sembrado con el primer
  // oldValue conocido (el resto de los oldValue del log no son confiables).
  const state: Record<string, number | null> = {};
  for (const f of PRICE_FIELDS) {
    const first = asc.find((c) => c.field === f);
    state[f] = first ? parse(first.oldValue) : (current[f] ?? null);
  }

  // Agrupar en guardados: un cambio se une al grupo si está dentro de 60s del anterior.
  type Group = { t: number; lastT: number; changes: typeof asc };
  const groups: Group[] = [];
  for (const c of asc) {
    const g = groups[groups.length - 1];
    if (g && c.t - g.lastT <= WINDOW) { g.changes.push(c); g.lastT = c.t; g.t = c.t; }
    else groups.push({ t: c.t, lastT: c.t, changes: [c] });
  }

  const momentsAsc: Moment[] = [];
  for (const g of groups) {
    const changed: Moment["changed"] = {};
    for (const f of PRICE_FIELDS) {
      const fch = g.changes.filter((c) => c.field === f);
      if (!fch.length) continue;
      const newV = parse(fch[fch.length - 1].newValue); // valor neto tras el guardado
      const oldV = state[f];
      if (newV !== oldV) { changed[f] = { from: oldV, to: newV, pct: pctChange(oldV, newV) }; state[f] = newV; }
    }
    if (Object.keys(changed).length) momentsAsc.push({ t: g.t, values: { ...state }, changed });
  }

  return [{ t: Date.now(), now: true, values: { ...current }, changed: {} }, ...momentsAsc.reverse()];
}
