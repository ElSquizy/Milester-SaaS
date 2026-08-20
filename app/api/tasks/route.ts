import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

const PRIORITIES = ["baja", "media", "alta"];
const STATUSES = ["pending", "doing", "done"];

/** GET: tareas, con filtros opcionales ?assignee=id&status=&q=. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const assignee = url.searchParams.get("assignee");
  const status = url.searchParams.get("status") || "";
  const q = url.searchParams.get("q")?.trim() || "";

  const where: Prisma.TaskWhereInput = {
    ...(assignee ? { assigneeId: assignee === "none" ? null : Number(assignee) } : {}),
    ...(STATUSES.includes(status) ? { status } : {}),
    ...(q ? { title: { contains: q } } : {}),
  };
  const tasks = await prisma.task.findMany({
    where,
    include: { assignee: { select: { id: true, name: true, color: true } } },
    // Sin fecha al final; luego por vencimiento y prioridad; recientes primero.
    orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
  });
  return NextResponse.json(tasks.map((t) => ({ ...t, dueDate: t.dueDate ? t.dueDate.toISOString() : null })));
}

/** POST: crear tarea. Body { title, note?, dueDate?, priority?, assigneeId?, status? }. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) return NextResponse.json({ error: "Poné un título" }, { status: 400 });
  const t = await prisma.task.create({
    data: {
      title,
      note: typeof body.note === "string" && body.note.trim() ? body.note.trim() : null,
      dueDate: body.dueDate ? new Date(body.dueDate) : null,
      priority: PRIORITIES.includes(body.priority) ? body.priority : "media",
      status: STATUSES.includes(body.status) ? body.status : "pending",
      assigneeId: body.assigneeId != null && !isNaN(Number(body.assigneeId)) ? Number(body.assigneeId) : null,
    },
    include: { assignee: { select: { id: true, name: true, color: true } } },
  });
  return NextResponse.json({ ...t, dueDate: t.dueDate ? t.dueDate.toISOString() : null });
}
