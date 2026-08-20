import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** GET ?from=YYYY-MM-DD&to=YYYY-MM-DD (inclusive) → turnos del rango con su empleado y `day`. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const from = url.searchParams.get("from") || "";
  const to = url.searchParams.get("to") || "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return NextResponse.json({ error: "Rango inválido" }, { status: 400 });
  }
  const fromDate = new Date(`${from}T00:00:00.000Z`);
  const toEnd = new Date(`${to}T00:00:00.000Z`);
  toEnd.setUTCDate(toEnd.getUTCDate() + 1);

  const shifts = await prisma.shift.findMany({
    where: { date: { gte: fromDate, lt: toEnd } },
    include: { employee: { select: { id: true, name: true, color: true, active: true } } },
    orderBy: [{ date: "asc" }, { start: "asc" }],
  });
  return NextResponse.json(shifts.map((s) => ({ ...s, day: s.date.toISOString().slice(0, 10), date: undefined })));
}

/** POST: crear turno. Body { employeeId, date: YYYY-MM-DD, start, end, note? }. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const employeeId = Number(body.employeeId);
  const date = typeof body.date === "string" ? body.date : "";
  const start = typeof body.start === "string" ? body.start : "";
  const end = typeof body.end === "string" ? body.end : "";
  if (!employeeId || isNaN(employeeId)) return NextResponse.json({ error: "Elegí un empleado" }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: "Fecha inválida" }, { status: 400 });
  if (!HHMM.test(start) || !HHMM.test(end)) return NextResponse.json({ error: "Horas inválidas (HH:MM)" }, { status: 400 });

  const s = await prisma.shift.create({
    data: {
      employeeId,
      date: new Date(`${date}T00:00:00.000Z`),
      start, end,
      note: typeof body.note === "string" && body.note.trim() ? body.note.trim() : null,
    },
    include: { employee: { select: { id: true, name: true, color: true, active: true } } },
  });
  return NextResponse.json({ ...s, day: s.date.toISOString().slice(0, 10), date: undefined });
}
