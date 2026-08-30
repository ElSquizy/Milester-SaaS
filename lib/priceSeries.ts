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
 * Puntos de una serie DENTRO de una ventana [from, to], para una línea suave:
 * un punto de "entrada" con el precio vigente al inicio de la ventana (aunque el
 * último cambio haya sido antes), los cambios reales dentro de la ventana, y el
 * valor actual al final. Solo puntos reales (sin escalones), para interpolar.
 */
export function windowPoints(bps: BP[], from: number, to: number): BP[] {
  const pts: BP[] = [];
  const vFrom = valueAt(bps, from);
  if (vFrom != null) pts.push({ t: from, v: vFrom });
  for (const b of bps) if (b.t > from && b.t < to && b.v != null) pts.push({ t: b.t, v: b.v });
  const vTo = valueAt(bps, to);
  if (vTo != null) pts.push({ t: to, v: vTo });
  return pts;
}

/**
 * Filas para Recharts a partir de conjuntos de puntos dispersos: cada serie
 * aporta su valor solo en los timestamps donde tiene un punto; en el resto va
 * null y la curva lo puentea (connectNulls) para verse suave.
 */
export function unifiedSparse(sets: { key: string; pts: BP[] }[]): Record<string, number | null>[] {
  const times = [...new Set(sets.flatMap((s) => s.pts.map((p) => p.t)))].sort((a, b) => a - b);
  const maps = sets.map((s) => [s.key, new Map(s.pts.map((p) => [p.t, p.v] as const))] as const);
  return times.map((t) => {
    const row: Record<string, number | null> = { t };
    for (const [key, m] of maps) row[key] = m.has(t) ? m.get(t)! : null;
    return row;
  });
}

/** Dominio [min, max] con ~12% de aire arriba y abajo, para que la línea no se corte. */
export function paddedDomain(values: number[]): [number, number] | undefined {
  if (!values.length) return undefined;
  const min = Math.min(...values), max = Math.max(...values);
  if (min === max) { const p = Math.abs(min) * 0.1 || 1; return [Math.max(0, min - p), max + p]; }
  const pad = (max - min) * 0.12;
  return [Math.max(0, min - pad), max + pad];
}
