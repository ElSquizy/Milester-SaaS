import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** PUT: editar turno (fecha, horas, nota, empleado). */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const data: { employeeId?: number; date?: Date; start?: string; end?: string; note?: string | null } = {};
  if (body.employeeId != null && !isNaN(Number(body.employeeId))) data.employeeId = Number(body.employeeId);
  if (typeof body.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date)) data.date = new Date(`${body.date}T00:00:00.000Z`);
  if (typeof body.start === "string" && HHMM.test(body.start)) data.start = body.start;
  if (typeof body.end === "string" && HHMM.test(body.end)) data.end = body.end;
  if (body.note !== undefined) data.note = typeof body.note === "string" && body.note.trim() ? body.note.trim() : null;

  const s = await prisma.shift.update({
    where: { id: Number(id) },
    data,
    include: { employee: { select: { id: true, name: true, color: true, active: true } } },
  });
  return NextResponse.json({ ...s, day: s.date.toISOString().slice(0, 10), date: undefined });
}

/** DELETE: elimina el turno. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await prisma.shift.delete({ where: { id: Number(id) } });
  return NextResponse.json({ ok: true });
}
