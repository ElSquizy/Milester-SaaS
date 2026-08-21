import { prisma } from "./prisma";
import { holidaysInRange } from "./holidays";

/**
 * Agregación del calendario de la Agenda (compartida por /api/calendar y el Inicio).
 * Junta tareas, eventos manuales, campañas (inicio/fin) y feriados AR, cada uno con
 * su `day` (YYYY-MM-DD).
 */
const AR_OFFSET = 3 * 60 * 60 * 1000;
const utcDay = (d: Date) => d.toISOString().slice(0, 10);            // fechas "de día" (dueDate, event.date) = UTC medianoche
const arDay = (d: Date) => new Date(d.getTime() - AR_OFFSET).toISOString().slice(0, 10); // timestamps reales (campañas) → día AR

export type CalEvent = {
  day: string;
  type: "task" | "campaign-end" | "campaign-start" | "launch" | "note" | "holiday";
  title: string;
  id?: number; note?: string | null; date?: string; campaignId?: number;
  task?: unknown;
};

/** Eventos de todas las fuentes cuyo día cae en [from, to] (YYYY-MM-DD inclusive). */
export async function getCalendarEvents(from: string, to: string): Promise<CalEvent[]> {
  const fromDate = new Date(`${from}T00:00:00.000Z`);
  const toEnd = new Date(`${to}T00:00:00.000Z`);
  toEnd.setUTCDate(toEnd.getUTCDate() + 1);

  const [tasks, events, campaigns] = await Promise.all([
    prisma.task.findMany({
      where: { dueDate: { gte: fromDate, lt: toEnd } },
      include: { assignee: { select: { id: true, name: true, color: true } } },
    }),
    prisma.calendarEvent.findMany({ where: { date: { gte: fromDate, lt: toEnd } } }),
    prisma.campaign.findMany({
      where: { OR: [{ endDate: { gte: fromDate, lt: toEnd } }, { startDate: { gte: fromDate, lt: toEnd } }] },
      select: { id: true, name: true, startDate: true, endDate: true, status: true },
    }),
  ]);

  const out: CalEvent[] = [];
  for (const t of tasks) {
    if (!t.dueDate) continue;
    out.push({ day: utcDay(t.dueDate), type: "task", title: t.title, task: { ...t, dueDate: t.dueDate.toISOString() } });
  }
  for (const e of events) {
    out.push({ day: utcDay(e.date), type: e.type === "launch" ? "launch" : "note", title: e.title, id: e.id, note: e.note, date: utcDay(e.date) });
  }
  for (const c of campaigns) {
    if (c.endDate && c.endDate >= fromDate && c.endDate < toEnd) out.push({ day: arDay(c.endDate), type: "campaign-end", title: `Termina: ${c.name}`, campaignId: c.id });
    if (c.startDate && c.startDate >= fromDate && c.startDate < toEnd) out.push({ day: arDay(c.startDate), type: "campaign-start", title: `Arranca: ${c.name}`, campaignId: c.id });
  }
  for (const h of holidaysInRange(from, to)) out.push({ day: h.date, type: "holiday", title: h.name });

  return out;
}

/** Turnos de hoy (día AR) con su empleado, para "quién trabaja hoy". */
export async function getTodayShifts() {
  const today = new Date(Date.now() - AR_OFFSET).toISOString().slice(0, 10);
  const start = new Date(`${today}T00:00:00.000Z`);
  const end = new Date(start); end.setUTCDate(end.getUTCDate() + 1);
  const shifts = await prisma.shift.findMany({
    where: { date: { gte: start, lt: end } },
    include: { employee: { select: { id: true, name: true, color: true } } },
    orderBy: { start: "asc" },
  });
  return shifts.map((s) => ({ id: s.id, start: s.start, end: s.end, note: s.note, employee: s.employee }));
}
