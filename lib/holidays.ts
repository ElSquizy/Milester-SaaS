/**
 * Feriados nacionales de Argentina (curados). Se muestran en el calendario de la
 * Agenda. Incluye los de fecha fija + Carnaval y Viernes Santo derivados de Pascua.
 * Los "puentes" turísticos (que se decretan cada año) no están: cargalos a mano
 * como evento si los necesitás. Extensible por año.
 */
const HOLIDAYS: Record<number, { date: string; name: string }[]> = {
  2026: [
    { date: "2026-01-01", name: "Año Nuevo" },
    { date: "2026-02-16", name: "Carnaval" },
    { date: "2026-02-17", name: "Carnaval" },
    { date: "2026-03-24", name: "Día de la Memoria" },
    { date: "2026-04-02", name: "Malvinas" },
    { date: "2026-04-03", name: "Viernes Santo" },
    { date: "2026-05-01", name: "Día del Trabajador" },
    { date: "2026-05-25", name: "Revolución de Mayo" },
    { date: "2026-06-20", name: "Paso a la Inmortalidad de Belgrano" },
    { date: "2026-07-09", name: "Día de la Independencia" },
    { date: "2026-08-17", name: "Paso a la Inmortalidad de San Martín" },
    { date: "2026-10-12", name: "Día del Respeto a la Diversidad Cultural" },
    { date: "2026-12-08", name: "Inmaculada Concepción" },
    { date: "2026-12-25", name: "Navidad" },
  ],
};

/** Feriados cuyo día (YYYY-MM-DD) cae en [from, to] inclusive. */
export function holidaysInRange(from: string, to: string): { date: string; name: string }[] {
  const out: { date: string; name: string }[] = [];
  const years = new Set([Number(from.slice(0, 4)), Number(to.slice(0, 4))]);
  for (const y of years) for (const h of HOLIDAYS[y] ?? []) if (h.date >= from && h.date <= to) out.push(h);
  return out;
}
