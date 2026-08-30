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

/**
 * Filas para Recharts sobre un eje temporal unificado (unión de todos los
 * timestamps). Cada serie aporta su valor vigente en cada tiempo, o null antes
 * de su primer dato / tras un limpiado (la línea corta con connectNulls=false).
 */
export function unifiedRows(sets: { key: string; bps: BP[] }[]): Record<string, number | null>[] {
  const times = [...new Set(sets.flatMap((s) => s.bps.map((b) => b.t)))].sort((a, b) => a - b);
  return times.map((t) => {
    const row: Record<string, number | null> = { t };
    for (const s of sets) row[s.key] = valueAt(s.bps, t);
    return row;
  });
}
