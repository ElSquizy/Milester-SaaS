import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { holidaysInRange } from "@/lib/holidays";

/**
 * GET ?from=YYYY-MM-DD&to=YYYY-MM-DD (inclusive) → eventos del rango para el
 * calendario, de TODAS las fuentes, cada uno con su `day` (YYYY-MM-DD):
 *   - task           (Task.dueDate)          → verde
 *   - campaign-end   (Campaign.endDate)      → fin de oferta
 *   - campaign-start (Campaign.startDate)    → arranca campaña
 *   - launch / note  (CalendarEvent manual)  → lanzamiento / nota
 *   - holiday        (lib/holidays, AR)
 */
const AR_OFFSET = 3 * 60 * 60 * 1000;
const utcDay = (d: Date) => d.toISOString().slice(0, 10);              // fechas "de día" (dueDate, event.date) = UTC medianoche
const arDay = (d: Date) => new Date(d.getTime() - AR_OFFSET).toISOString().slice(0, 10); // timestamps reales (campañas) → día AR

export async function GET(req: Request) {
  const url = new URL(req.url);
  const from = url.searchParams.get("from") || "";
  const to = url.searchParams.get("to") || "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return NextResponse.json({ error: "Rango inválido" }, { status: 400 });
  }
  const fromDate = new Date(`${from}T00:00:00.000Z`);
  const toEnd = new Date(`${to}T00:00:00.000Z`);
  toEnd.setUTCDate(toEnd.getUTCDate() + 1); // exclusivo (to inclusive)

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

  type Ev = Record<string, unknown> & { day: string; type: string; title: string };
  const out: Ev[] = [];

  for (const t of tasks) {
    if (!t.dueDate) continue;
    out.push({
      day: utcDay(t.dueDate), type: "task", title: t.title,
      task: { ...t, dueDate: t.dueDate.toISOString() },
    });
  }
  for (const e of events) {
    out.push({ day: utcDay(e.date), type: e.type === "launch" ? "launch" : "note", title: e.title, id: e.id, note: e.note, date: utcDay(e.date) });
  }
  for (const c of campaigns) {
    if (c.endDate && c.endDate >= fromDate && c.endDate < toEnd) out.push({ day: arDay(c.endDate), type: "campaign-end", title: `Termina: ${c.name}`, campaignId: c.id });
    if (c.startDate && c.startDate >= fromDate && c.startDate < toEnd) out.push({ day: arDay(c.startDate), type: "campaign-start", title: `Arranca: ${c.name}`, campaignId: c.id });
  }
  for (const h of holidaysInRange(from, to)) {
    out.push({ day: h.date, type: "holiday", title: h.name });
  }

  return NextResponse.json({ events: out });
}
