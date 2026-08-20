import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/** PUT: editar empleado (nombre, rol, color, activo). */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const data: { name?: string; role?: string | null; color?: string; active?: boolean } = {};
  if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim();
  if (body.role !== undefined) data.role = typeof body.role === "string" && body.role.trim() ? body.role.trim() : null;
  if (typeof body.color === "string" && body.color) data.color = body.color;
  if (typeof body.active === "boolean") data.active = body.active;
  const e = await prisma.employee.update({ where: { id: Number(id) }, data });
  return NextResponse.json(e);
}

/** DELETE: elimina el empleado. Sus tareas quedan sin asignar (assigneeId → null). */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await prisma.employee.delete({ where: { id: Number(id) } });
  return NextResponse.json({ ok: true });
}
