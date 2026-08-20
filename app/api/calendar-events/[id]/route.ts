import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/** PUT: editar un evento manual (título, fecha, tipo, nota). */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const data: { title?: string; date?: Date; type?: string; note?: string | null } = {};
  if (typeof body.title === "string" && body.title.trim()) data.title = body.title.trim();
  if (typeof body.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date)) data.date = new Date(`${body.date}T00:00:00.000Z`);
  if (body.type === "launch" || body.type === "note") data.type = body.type;
  if (body.note !== undefined) data.note = typeof body.note === "string" && body.note.trim() ? body.note.trim() : null;
  const e = await prisma.calendarEvent.update({ where: { id: Number(id) }, data });
  return NextResponse.json({ ...e, date: e.date.toISOString().slice(0, 10) });
}

/** DELETE: elimina el evento manual. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await prisma.calendarEvent.delete({ where: { id: Number(id) } });
  return NextResponse.json({ ok: true });
}
