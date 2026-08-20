import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const PRIORITIES = ["baja", "media", "alta"];
const STATUSES = ["pending", "doing", "done"];

/** PUT: editar tarea (título, nota, fecha, prioridad, estado, asignado). Parcial. */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const data: {
    title?: string; note?: string | null; dueDate?: Date | null;
    priority?: string; status?: string; assigneeId?: number | null;
  } = {};
  if (typeof body.title === "string" && body.title.trim()) data.title = body.title.trim();
  if (body.note !== undefined) data.note = typeof body.note === "string" && body.note.trim() ? body.note.trim() : null;
  if (body.dueDate !== undefined) data.dueDate = body.dueDate ? new Date(body.dueDate) : null;
  if (PRIORITIES.includes(body.priority)) data.priority = body.priority;
  if (STATUSES.includes(body.status)) data.status = body.status;
  if (body.assigneeId !== undefined) data.assigneeId = body.assigneeId == null || isNaN(Number(body.assigneeId)) ? null : Number(body.assigneeId);

  const t = await prisma.task.update({
    where: { id: Number(id) },
    data,
    include: { assignee: { select: { id: true, name: true, color: true } } },
  });
  return NextResponse.json({ ...t, dueDate: t.dueDate ? t.dueDate.toISOString() : null });
}

/** DELETE: elimina la tarea. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await prisma.task.delete({ where: { id: Number(id) } });
  return NextResponse.json({ ok: true });
}
